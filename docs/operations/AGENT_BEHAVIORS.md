# Agent Behaviors & Limitations

**Version:** 1.0  
**Last Updated:** 2025-11-27  
**Audience:** Developers, QA Engineers

---

## Overview

This document provides comprehensive documentation of all agent behaviors, capabilities, limitations, and expected inputs/outputs. Use this as a reference when debugging issues or planning enhancements.

---

## Table of Contents

1. [Head Detective Agent](#head-detective-agent)
2. [Timeline Agent](#timeline-agent)
3. [Metadata Agent](#metadata-agent)
4. [Shared Behaviors](#shared-behaviors)

---

## Head Detective Agent

**File:** `supabase/functions/agent-head-detective/index.ts`  
**Version:** v2  
**Purpose:** Multi-agent orchestrator

### Capabilities

#### What Head Detective DOES:

1. **Process Discovery:**
   - Finds all processes with SOU documents that have `raw_content`
   - Filters by `process_id` if provided (single-process mode)
   - Returns candidate processes with SOU details

2. **Task Delegation:**
   - Creates `timeline_extraction` tasks for Timeline Agent
   - Creates `metadata_extraction` tasks for Metadata Agent
   - NEVER creates duplicate tasks (checks existing tasks first)
   - Reuses existing `pending` or `completed` tasks

3. **Agent Coordination:**
   - Waits for BOTH Timeline and Metadata agents to complete
   - Polls task status every 3 seconds
   - Timeout after 120 seconds (2 minutes)
   - Triggers task queue automatically after creating tasks

4. **Stage Updates:**
   - Calls `computeProcessStage()` state machine after agents complete
   - Updates process stage ONLY if evidence supports transition
   - Never guesses or infers—purely evidence-based
   - Updates `stage_explanation` with deterministic Swedish text

5. **Output Reporting:**
   - Provides detailed `output_data` with summary and per-process details
   - Includes metrics: tasks created/reused, stages updated, entities extracted
   - Tracks execution time and agent completion

#### What Head Detective DOES NOT DO:

1. **No Direct Extraction:**
   - Does not extract dates, entities, or relations directly
   - Only delegates to specialist agents

2. **No Speculation:**
   - Does not assume publication dates
   - Does not infer missing data
   - Does not guess entity names

3. **No Task Execution:**
   - Does not execute Timeline or Metadata tasks directly
   - Only creates tasks, waits for completion

4. **No SOU Discovery:**
   - Does not scrape regeringen.se for new SOUs
   - Assumes SOUs already exist in database (from Phase 2)

### Input Format

```json
{
  "process_id": "uuid-here",  // Optional, for single-process mode
  "batch_mode": true,         // Optional, process all candidates
  "task_id": "uuid-here"      // Optional, for task queue integration
}
```

### Output Format

```json
{
  "success": true,
  "agent": "Head Detective v2",
  "version": "2.0.0",
  "mode": "batch",
  "execution_time_ms": 4523,
  "summary": {
    "processes_analyzed": 1,
    "timeline_tasks_created": 1,
    "timeline_tasks_reused": 0,
    "metadata_tasks_created": 0,
    "metadata_tasks_reused": 1,
    "stages_updated": 0,
    "published_stages_updated": 0,
    "skipped_no_action": 1,
    "entities_extracted": 2
  },
  "details": [
    {
      "process_id": "uuid-here",
      "process_key": "ju-2023-04",
      "action": "skipped",
      "previous_stage": "published",
      "new_stage": null,
      "timeline_task_id": "uuid-here",
      "timeline_task_created": true,
      "metadata_task_id": "uuid-here",
      "metadata_task_created": false,
      "timeline_event_id": "uuid-here",
      "proof_page": 1,
      "sou_published_event_found": true,
      "entities_extracted": 2,
      "reason": "Stage already at published, no update needed"
    }
  ]
}
```

### Expected Behavior

#### Scenario 1: First-Time Processing

**Given:**
- Process has SOU document with `raw_content`
- No existing timeline tasks or events
- No existing metadata tasks or entities

**Expected:**
1. Create `timeline_extraction` task
2. Create `metadata_extraction` task
3. Trigger task queue
4. Wait for both tasks to complete (max 120s)
5. Gather evidence from both agents
6. Update process stage if evidence supports transition
7. Return success with task IDs and metrics

#### Scenario 2: Re-Run (Idempotent)

**Given:**
- Process already has timeline event
- Process already has entities
- Existing tasks in `completed` status

**Expected:**
1. Detect existing completed tasks
2. Reuse existing tasks (no duplicates)
3. Gather evidence from database
4. Confirm stage is still correct
5. Return success with `skipped_no_action`

#### Scenario 3: Timeout

**Given:**
- Task queue not running or overloaded
- Timeline or Metadata task stuck in `pending`

**Expected:**
1. Create tasks as normal
2. Trigger task queue
3. Wait for 120 seconds
4. Timeout with warning message
5. Tasks remain in `pending` for next task queue run
6. Return partial success with timeout note

### Known Limitations

1. **Sequential Agent Wait:**
   - Waits for Timeline Agent completion before checking Metadata Agent
   - Could be optimized for true parallel execution

2. **No Retry Logic:**
   - If agent task fails, Head Detective does not retry
   - Failed tasks must be manually reset to `pending`

3. **Single SOU per Process:**
   - Only processes one SOU document per process
   - If multiple SOUs linked, only `main_document_id` is used

4. **No Backfill:**
   - Does not retroactively process old SOUs
   - Only processes SOUs as they're discovered

### Error Scenarios

#### Error 1: No Candidate Processes Found

**Cause:** All processes either:
- Have no SOU documents
- Have no `raw_content` (PDF extraction failed)
- Already processed with timeline events

**Response:**
```json
{
  "success": true,
  "summary": {
    "processes_analyzed": 0,
    "skipped_no_action": 0
  },
  "message": "No candidate processes found"
}
```

#### Error 2: Task Timeout

**Cause:**
- Task queue not running
- Timeline or Metadata Agent taking > 120s

**Response:**
```json
{
  "success": true,
  "summary": { /* ... */ },
  "details": [{
    "reason": "Timeout waiting for agents (120s)"
  }]
}
```

#### Error 3: Database Error

**Cause:**
- Supabase connection issue
- RLS policy violation
- Database constraint error

**Response:**
```json
{
  "error": "Database error: [message]",
  "success": false
}
```

---

## Timeline Agent

**File:** `supabase/functions/agent-timeline/index.ts`  
**Version:** v1  
**Purpose:** Extract SOU publication dates with citations

### Capabilities

#### What Timeline Agent DOES:

1. **Date Extraction:**
   - Extracts `sou_published` event from SOU front matter
   - Uses first 5000 characters of `raw_content`
   - Calls OpenAI with strict tool schema
   - Requires forensic citation (page + excerpt)

2. **Date Normalization:**
   - Handles partial dates: "2024-12" → "2024-12-01"
   - Converts to PostgreSQL date format (YYYY-MM-DD)
   - Validates date is reasonable (not in distant future/past)

3. **Page Estimation:**
   - Estimates page number from character position
   - Conservative estimate: 2000 chars/page
   - Defaults to page 1 for front matter content

4. **Actor Extraction:**
   - Extracts actors from publication statement
   - Typically ministries or government bodies
   - Stored as JSONB array in `timeline_events.actors`

5. **Task Management:**
   - Updates `agent_tasks` status (started → completed)
   - Records `output_data` with extraction details
   - Marks task as failed if no evidence found

#### What Timeline Agent DOES NOT DO:

1. **No Multi-Event Extraction:**
   - Only extracts `sou_published` event
   - Does not extract directive dates, committee formed dates, etc.

2. **No Deep Content Scan:**
   - Only scans first 5000 characters
   - Does not analyze entire document

3. **No Date Guessing:**
   - If no clear date found, skips event creation
   - Does not infer dates from context

4. **No Duplicate Detection:**
   - Does not check for existing timeline events
   - Relies on Head Detective to prevent duplicates

### Input Format

```json
{
  "document_id": "uuid-here",
  "process_id": "uuid-here",
  "task_id": "uuid-here"  // Optional
}
```

### Output Format

**Success with Event:**
```json
{
  "success": true,
  "agent": "Timeline Agent v1",
  "document_id": "uuid-here",
  "process_id": "uuid-here",
  "event": {
    "id": "uuid-here",
    "event_type": "sou_published",
    "event_date": "2024-12-01",
    "source_page": 1,
    "source_excerpt": "Härmed överlämnas betänkandet...",
    "actors": ["Justitiedepartementet"]
  },
  "model_used": "gpt-4o",
  "processing_time_ms": 3542
}
```

**Success without Event:**
```json
{
  "success": true,
  "agent": "Timeline Agent v1",
  "document_id": "uuid-here",
  "process_id": "uuid-here",
  "event": null,
  "reason": "No clear publication date found in front matter",
  "skipped": true
}
```

### Expected Behavior

#### Scenario 1: Clear Publication Date

**Given:**
```
Härmed överlämnas betänkandet Effektivare gränsöverskridande 
inhämtning av elektroniska bevis (SOU 2024:85) till 
Justitiedepartementet. Utredningen överlämnades den 1 december 2024.
```

**Expected:**
1. OpenAI extracts date: "1 december 2024"
2. Normalize to: "2024-12-01"
3. Estimate page: 1
4. Extract excerpt: "Härmed överlämnas betänkandet... den 1 december 2024"
5. Create timeline event
6. Return success

#### Scenario 2: Partial Date

**Given:**
```
Betänkandet överlämnades i december 2024 till regeringen.
```

**Expected:**
1. OpenAI extracts date: "december 2024"
2. Normalize to: "2024-12-01"
3. Log warning: "Normalized partial date"
4. Create timeline event with medium confidence
5. Return success

#### Scenario 3: No Clear Date

**Given:**
```
Detta betänkande presenterar resultaten av utredningen.
```

**Expected:**
1. OpenAI returns no tool call
2. Log: "No clear publication date found"
3. Skip event creation
4. Mark task as completed (not failed)
5. Return success with `skipped: true`

### Known Limitations

1. **Front Matter Only:**
   - Only scans first 5000 characters
   - Misses publication dates buried in document body

2. **Single Event Type:**
   - Only extracts `sou_published` events
   - Cannot extract other timeline events yet

3. **Date Normalization:**
   - Partial dates always normalized to 1st of month
   - May lose precision ("early December" → "December 1")

4. **Page Estimation:**
   - Character-based estimation is rough
   - Actual page may differ from estimate

5. **No Duplicate Check:**
   - Does not verify if event already exists
   - Assumes Head Detective prevents duplicates

### Error Scenarios

#### Error 1: Missing Document Content

**Cause:** `raw_content` is NULL or empty

**Response:**
```json
{
  "error": "Document has no raw_content",
  "success": false
}
```

#### Error 2: OpenAI API Error

**Cause:** Rate limit, timeout, or API outage

**Response:**
```json
{
  "error": "OpenAI API error: [message]",
  "success": false
}
```

**Task Status:** `failed`  
**Error Message:** Stored in `agent_tasks.error_message`

#### Error 3: Invalid Date Format

**Cause:** OpenAI returns malformed date

**Response:**
- Date normalization fails
- Event creation skipped
- Task marked `completed` with warning

---

## Metadata Agent

**File:** `supabase/functions/agent-metadata/index.ts`  
**Version:** v1  
**Purpose:** Extract entities and relations with citations

### Capabilities

#### What Metadata Agent DOES:

1. **Entity Extraction:**
   - Extracts lead investigators (utredare, särskild utredare)
   - Extracts ministries (departement)
   - Extracts committee names (kommittén)
   - Requires forensic citation (page + excerpt)

2. **Entity Deduplication:**
   - Uses fuzzy matching (Levenshtein distance)
   - Threshold: 3 edits
   - Reuses existing entities when similar
   - Prevents duplicate person/ministry entries

3. **Placeholder Rejection:**
   - Rejects generic placeholders ("Utredaren", "Kommittén")
   - Uses stoplist with 50+ terms
   - Enhanced validation rules (minister titles, ministry endings)

4. **Ministry Detection:**
   - Identifies ministry names in text
   - Prevents misclassification as person names
   - Validates against role title patterns

5. **Relation Creation:**
   - Links entities to processes
   - Relation types: `led_by`, `conducted_by`, `related_to`
   - Includes citation (source_page, source_excerpt)

#### What Metadata Agent DOES NOT DO:

1. **No External Stakeholders:**
   - Does not extract remiss bodies
   - Does not extract referenced organizations

2. **No Impact Analysis:**
   - Does not extract affected sectors
   - Does not extract budget information

3. **No Law References:**
   - Does not extract referenced legislation
   - Does not extract legal framework

4. **No Ministry Creation:**
   - Does not create ministry entities (only person/committee)
   - Ministry names stored in `processes.ministry` field

### Input Format

```json
{
  "document_id": "uuid-here",
  "process_id": "uuid-here",
  "task_id": "uuid-here"  // Optional
}
```

### Output Format

```json
{
  "success": true,
  "agent": "Metadata Agent v1",
  "version": "1.0.0",
  "document_id": "uuid-here",
  "process_id": "uuid-here",
  "entities_reported": 3,
  "entities_created": 2,
  "entities_reused": 1,
  "relations_created": 3,
  "entity_breakdown": {
    "person": 2,
    "committee": 1
  },
  "model_used": "gpt-4o",
  "processing_time_ms": 4123
}
```

### Expected Behavior

#### Scenario 1: Lead Investigator Extraction

**Given:**
```
Anna Svensson utsågs till särskild utredare för denna utredning.
```

**Expected:**
1. OpenAI extracts entity:
   - name: "Anna Svensson"
   - role: "särskild_utredare"
   - source_page: 8
   - source_excerpt: "Anna Svensson utsågs till särskild utredare..."
2. Check for existing similar entities (fuzzy match)
3. If new, create entity
4. Create relation: process → led_by → entity
5. Return success with entity count

#### Scenario 2: Duplicate Entity (Fuzzy Match)

**Given:**
- Existing entity: "Anna Svensson" (id: abc-123)
- New extraction: "Anna Svenson" (typo)

**Expected:**
1. OpenAI extracts "Anna Svenson"
2. Fuzzy match: Levenshtein distance = 1 (< threshold 3)
3. Reuse existing entity (abc-123)
4. Create relation using existing entity
5. Log: "Reused existing entity"
6. Return success with reuse count

#### Scenario 3: Placeholder Rejection

**Given:**
```
Utredaren presenterade betänkandet till regeringen.
```

**Expected:**
1. OpenAI extracts "Utredaren"
2. Stoplist check: "utredaren" found
3. Skip entity creation (placeholder)
4. Log: "Rejected placeholder: utredaren"
5. Continue processing other entities

#### Scenario 4: Ministry Misclassification Prevention

**Given:**
```
Justitiedepartementet tillsatte utredningen.
```

**Expected:**
1. OpenAI attempts to extract "Justitiedepartementet" as person
2. Validation rule: name ends with "departementet"
3. Reject person entity
4. Log: "Rejected ministry name as person"
5. Update `processes.ministry` instead

### Known Limitations

1. **Ministry Entity Type:**
   - Ministries not created as entities
   - Stored in `processes.ministry` text field
   - No ministry-to-entity relations

2. **Limited Entity Types:**
   - Only person and committee
   - No organization, agency, or stakeholder types

3. **Front Matter Bias:**
   - Extracts primarily from front matter
   - May miss entities mentioned only in body

4. **Fuzzy Matching Edge Cases:**
   - May incorrectly match "Anna Svensson" and "Anna Svenson"
   - Threshold (3 edits) may be too permissive

5. **No Confidence Scores:**
   - Binary accept/reject decision
   - No entity confidence levels

### Error Scenarios

#### Error 1: No Entities Found

**Cause:** Document mentions no lead investigators or committees

**Response:**
```json
{
  "success": true,
  "entities_reported": 0,
  "entities_created": 0,
  "message": "No entities found in document"
}
```

**Not an error:** Task marked `completed`

#### Error 2: All Entities Rejected

**Cause:** All extracted entities are placeholders

**Response:**
```json
{
  "success": true,
  "entities_reported": 5,
  "entities_created": 0,
  "entities_rejected": 5,
  "message": "All entities rejected as placeholders"
}
```

#### Error 3: OpenAI API Error

**Cause:** Rate limit, timeout, or API outage

**Response:**
```json
{
  "error": "OpenAI API error: [message]",
  "success": false
}
```

**Task Status:** `failed`  
**Error Message:** Stored in `agent_tasks.error_message`

---

## Shared Behaviors

### Citation Requirements (All Agents)

**Mandatory Fields:**
- `source_page` (integer, > 0)
- `source_excerpt` (string, 50-200 chars)

**Validation:**
- Timeline events: CHECK constraint enforces both fields
- Entities: Nullable but recommended
- Relations: Nullable but recommended

**Excerpt Guidelines:**
- Quote exact text from document
- Preserve capitalization and punctuation
- Truncate with "..." if > 200 chars
- Include enough context for verification

### Error Handling (All Agents)

**Classification:**
- `RATE_LIMIT` (429) - Retry with backoff
- `TIMEOUT` - Retry with backoff
- `API_ERROR` (500+) - Retry with backoff
- `VALIDATION_ERROR` (400) - Don't retry, log and fail
- `AUTHENTICATION_ERROR` (401/403) - Don't retry, critical alert

**Retry Logic:**
- Max 3 retries
- Exponential backoff: 1s, 2s, 4s
- Only retry transient errors

**Circuit Breaker:**
- Opens after 5 consecutive failures
- 60-second timeout before retry
- Prevents cascading failures

### Performance Tracking (All Agents)

**Metrics Collected:**
- Execution duration (ms)
- Token usage (input + output)
- API call count
- Error count
- Retry count
- Success status

**Logging:**
- Performance summary logged after completion
- Cost estimation included
- Efficiency metrics (ms/token)

### Task Status Lifecycle (All Agents)

```
pending → running → completed
               ↓
             failed
```

**Status Transitions:**
1. `pending` - Task created, waiting for execution
2. `running` - Task picked up by task queue
3. `completed` - Task finished successfully
4. `failed` - Task encountered non-retryable error

**Output Data:**
- Always populated in `agent_tasks.output_data`
- Includes agent version, model, metrics
- Structured for audit trail

---

## Testing Guidelines

### Unit Testing

**What to Test:**
- Entity deduplication logic (fuzzy matching)
- Date normalization (partial dates)
- Placeholder rejection (stoplist)
- Page estimation (character position)

**Mock Data:**
- Use real SOU excerpts
- Include edge cases (typos, partial dates, placeholders)

### Integration Testing

**What to Test:**
- Head Detective → Timeline/Metadata orchestration
- Task queue execution
- Stage transitions based on evidence
- Idempotency (no duplicate tasks/events)

**Test Data:**
- Golden SOU set (docs/testing/golden-sou-test-set.md)
- 3 representative SOUs with expected outputs

### Manual Validation

**What to Verify:**
- Citations match PDF content
- Entities are real people/committees (not placeholders)
- Dates are accurate (not guessed)
- No duplicate entities in database

---

## Future Enhancements

See `docs/development/PHASE_3_REFINEMENT_SUMMARY.md` for detailed roadmap.

**High Priority:**
- Additional timeline events (directive_issued, committee_formed)
- External stakeholder extraction
- Ministry as entity type
- Confidence scores for extractions

**Medium Priority:**
- Deep content scanning (beyond front matter)
- Batch processing within agents
- Result caching for repeated queries

**Low Priority:**
- Multi-language support
- Sentiment analysis
- Impact sector classification
