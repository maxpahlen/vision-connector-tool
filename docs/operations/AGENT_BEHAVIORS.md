# Agent Behaviors & Limitations

**Version:** 2.0  
**Last Updated:** 2026-02-10  
**Audience:** Developers, QA Engineers, Codex

---

## Overview

Comprehensive reference for all agent behaviors, capabilities, limitations, and expected I/O. Use this when debugging issues or planning enhancements.

---

## Table of Contents

1. [Head Detective Agent](#head-detective-agent)
2. [Timeline Agent v2](#timeline-agent-v2)
3. [Metadata Agent](#metadata-agent)
4. [Remiss & Stance Agents](#remiss--stance-agents)
5. [Shared Behaviors](#shared-behaviors)
6. [Known Limitations (Current)](#known-limitations-current)
7. [Deprecated Assumptions Removed](#deprecated-assumptions-removed)

---

## Head Detective Agent

**File:** `supabase/functions/agent-head-detective/index.ts`  
**Version:** v2  
**Purpose:** Multi-agent orchestrator

### Capabilities

- Finds candidate processes (has SOU with `raw_content`)
- Creates/reuses `timeline_extraction` and `metadata_extraction` tasks (no duplicates)
- Waits for both agents (polls every 3s, timeout 120s)
- Updates process stage via `computeProcessStage()` state machine (evidence-based only)
- Reports detailed metrics in `output_data`

### Does NOT Do

- No direct extraction (only delegates)
- No speculation or inference of missing data
- No SOU discovery (assumes SOUs already ingested)
- No retry of failed agent tasks

### Current Behavior Notes

- Sequential agent wait (Timeline first, then Metadata) — not truly parallel
- Single SOU per process (`main_document_id` only)
- Idempotent: re-runs reuse existing completed tasks
- Batch mode processes all candidates; single mode filters by `process_id`

### Input/Output

**Input:** `{ process_id?, batch_mode?, task_id? }`  
**Output:** `{ success, summary: { processes_analyzed, tasks_created/reused, stages_updated, ... }, details: [...] }`

---

## Timeline Agent v2

**File:** `supabase/functions/agent-timeline-v2/index.ts`  
**Version:** v2  
**Purpose:** Extract timeline events from SOUs with citations

### Capabilities

- Extracts `sou_published` event from first 5000 chars of `raw_content`
- Date normalization (partial dates → 1st of month)
- Page estimation (2000 chars/page, defaults to page 1)
- Actor extraction (ministries, government bodies)
- Updates task status and records output

### Does NOT Do

- No multi-event extraction (only `sou_published`)
- No deep content scan (front matter only)
- No date guessing — skips if no clear date found
- No duplicate detection (relies on Head Detective)

### Current Behavior Notes

- Uses OpenAI with strict tool schema for structured extraction
- Task marked `completed` even when no date found (not `failed`)
- Partial dates like "december 2024" → "2024-12-01" with logged warning

### Input/Output

**Input:** `{ document_id, process_id, task_id? }`  
**Output:** `{ success, event: { id, event_type, event_date, source_page, source_excerpt, actors } | null, skipped? }`

---

## Metadata Agent

**File:** `supabase/functions/agent-metadata/index.ts`  
**Version:** v1  
**Purpose:** Extract entities (people, committees) and relations with citations

### Capabilities

- Extracts lead investigators, committees from front matter
- Fuzzy deduplication (Levenshtein distance ≤ 3)
- Placeholder rejection via 50+ term stoplist
- Ministry misclassification prevention (names ending in "-departementet")
- Creates `led_by`, `conducted_by`, `related_to` relations with citations

### Does NOT Do

- No external stakeholder extraction
- No law/legislation references
- No ministry entity creation (stored in `processes.ministry` text field)
- No confidence scores (binary accept/reject)

### Current Behavior Notes

- Only extracts `person` and `committee` entity types
- Front matter bias — may miss entities mentioned only in body
- Fuzzy threshold of 3 edits may be too permissive for short names
- All entities rejected = task still `completed` (not `failed`)

### Input/Output

**Input:** `{ document_id, process_id, task_id? }`  
**Output:** `{ success, entities_reported, entities_created, entities_reused, relations_created, entity_breakdown }`

---

## Remiss & Stance Agents

### Remiss Entity Linkers

**Files:** `link-invitee-entities/index.ts`, `link-remissvar-entities/index.ts`

- Match organization names in `remiss_invitees` / `remiss_responses` to `entities` records
- Use `organization-matcher.ts` for fuzzy matching
- Create entity records for new organizations via `bootstrap-org-entities`

### Stance Analyzer (Keyword-based)

**File:** `analyze-remissvar-stance/index.ts`

- Keyword matching against curated stance keyword lists
- Produces `stance_signals` JSON and `stance_summary` text
- No AI — purely pattern-based

### Stance Classifier (AI)

**File:** `classify-stance-ai/index.ts`

- Uses OpenAI to classify remissvar stance when keyword analysis is inconclusive
- Operates on `raw_content` of remiss responses
- Produces structured stance classification

### Current Behavior Notes

- Entity linking depends on `bootstrap-org-entities` having seeded base organizations
- Stance keyword lists are managed via `stance_keyword_suggestions` table + admin UI
- AI stance classifier is supplementary — keyword analysis is primary

---

## Shared Behaviors

### Citation Requirements

All agents require:
- `source_page` (integer, > 0)
- `source_excerpt` (string, 50–200 chars, exact text from document)

### Error Handling

| Error Type | Code | Action |
|-----------|------|--------|
| Rate limit | 429 | Retry with exponential backoff (1s, 2s, 4s) |
| Timeout | — | Retry with backoff |
| API error | 500+ | Retry with backoff |
| Validation | 400 | Fail immediately, log |
| Auth | 401/403 | Fail immediately, critical alert |

Max 3 retries. Circuit breaker opens after 5 consecutive failures (60s timeout).

### Task Status Lifecycle

```
pending → running → completed
               ↓
             failed
```

Output always populated in `agent_tasks.output_data` for audit trail.

### Performance Tracking

All agents log: execution duration, token usage, API call count, error/retry counts, cost estimation.

---

## Known Limitations (Current)

1. **Sequential orchestration** — Head Detective waits for Timeline, then Metadata (not parallel)
2. **Single SOU per process** — only `main_document_id` processed
3. **Front matter only** — agents scan first 5000 chars; miss body-only content
4. **No retry on failure** — failed tasks require manual reset to `pending`
5. **Limited entity types** — only `person` and `committee`; no `organization` or `agency`
6. **No ministry entities** — ministries stored as text in `processes.ministry`
7. **Fuzzy match edge cases** — Levenshtein 3 may over-merge short names
8. **No confidence scores** — binary accept/reject for entities
9. **Partial date precision loss** — "early December" → December 1
10. **AI stance classifier** — supplementary only; no standalone accuracy metrics yet

---

## Deprecated Assumptions Removed

The following assumptions from v1 docs no longer apply:

1. ~~Timeline Agent v1 is the primary timeline extractor~~ → **v2 is active** (`agent-timeline-v2`)
2. ~~OpenAI costs ~$0.04/task~~ → Costs vary by model; refer to actual usage metrics
3. ~~Phase 3 refinement summary as future roadmap~~ → Archived; see `docs/development/PRODUCT_ROADMAP.md`
4. ~~Cron jobs configured via Supabase Dashboard~~ → Managed via Lovable Cloud
5. ~~Manual CLI deployment of edge functions~~ → Auto-deployed on git push
6. ~~Support contacts (Phase Lead / On-Call)~~ → Use governance workflow (Max/Lovable/Codex)
7. ~~Self-hosted LLM as scaling option~~ → Not in current planning horizon

---

## Testing References

- **Golden SOU test set:** `docs/testing/golden-sou-test-set.md`
- **Test utilities:** `test-org-matcher`, `test-stage-machine` (see `docs/operations/AGENT_RUNBOOK.md`)
- **Archived test campaigns:** `docs/archive/testing/`

---

## Future Enhancements

See `docs/development/PRODUCT_ROADMAP.md` for the canonical roadmap.

**Phase 6+ candidates:**
- Additional timeline event types (directive_issued, committee_formed)
- Ministry as entity type
- Deep content scanning (beyond front matter)
- Confidence scores for extractions
- Parallel agent orchestration
