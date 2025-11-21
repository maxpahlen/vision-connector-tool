# Phase 3: Multi-Agent AI System

**Status:** Planning  
**Branch:** `phase-3-multi-agent-ai`  
**Started:** 2025-11-21  
**Dependencies:** Phase 2 (SOU Scraper & PDF Extraction)

---

## Goal and Scope

Build a multi-agent AI system that extracts structured, citation-backed intelligence from SOU documents using OpenAI's API. The system must provide forensic-grade traceability with page numbers and source excerpts for every extracted fact.

### Core Objectives

1. **Orchestrated AI Analysis**: Head Detective agent coordinates specialist agents
2. **Timeline Extraction**: Extract dates and events with precise citations
3. **Metadata Extraction**: Identify people, agencies, and relationships with sources
4. **Citation-First Architecture**: Every extracted fact must include page + excerpt
5. **Deterministic Process Staging**: Use state machine, not LLM intuition
6. **Extensible Design**: Easy to add new specialist agents in future phases

### Success Criteria

- [ ] All extracted data includes `source_page` and `source_excerpt`
- [ ] Process stages determined by state machine logic, not LLM guesses
- [ ] Agents communicate only via database (blackboard pattern)
- [ ] Head Detective successfully orchestrates timeline and metadata agents
- [ ] Structured `output_data` enables audit trail for all agent actions
- [ ] System can process 10+ SOUs end-to-end without manual intervention

---

## Out of Scope (Phase 3)

- External scrapers for regeringen.se or Riksdagen data (Phase 4+)
- Advanced NLP (sentiment, impact analysis) - Phase 6
- User-facing search and visualization - Phase 4
- Remiss period tracking from external sources
- Multi-document cross-referencing
- Real-time processing (will use cron-based batch processing)

---

## Architecture Overview

### Blackboard Pattern

All agents operate on shared database state:

```
┌─────────────────────────────────────────────────────────┐
│                   SHARED DATABASE                        │
│  • documents (raw_content)                               │
│  • processes (stage, explanation)                        │
│  • timeline_events (with citations)                      │
│  • entities (people, agencies)                           │
│  • relations (entity-document links)                     │
│  • agent_tasks (coordination layer)                      │
└─────────────────────────────────────────────────────────┘
         ▲          ▲          ▲          ▲
         │          │          │          │
    ┌────┴───┐  ┌───┴────┐  ┌─┴──────┐  ┌┴─────────┐
    │  Head  │  │Timeline│  │Metadata│  │  Future  │
    │Detective│  │ Agent  │  │ Agent  │  │  Agents  │
    └────────┘  └────────┘  └────────┘  └──────────┘
```

**Key Principle:** No direct agent-to-agent communication. All coordination via `agent_tasks` table.

---

## OpenAI Integration

### Shared Client Pattern

**File:** `supabase/functions/_shared/openai-client.ts`

```typescript
import OpenAI from 'openai';

export const DEFAULT_MODEL = 'gpt-4.1'; // Stable, reasoning-capable

export const getOpenAIClient = () => {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  return new OpenAI({ apiKey });
};

// Centralized completion wrapper for consistent behavior
export const createCompletion = async (params: {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
  model?: string;
  temperature?: number;
}) => {
  const client = getOpenAIClient();
  return await client.chat.completions.create({
    model: params.model || DEFAULT_MODEL,
    messages: params.messages,
    tools: params.tools,
    tool_choice: params.tools ? 'auto' : undefined,
    temperature: params.temperature ?? 0.2, // Low for determinism
  });
};
```

### Benefits of Shared Client

1. **Central model configuration** - change model once, affects all agents
2. **Consistent parameters** - temperature, safety settings
3. **Future telemetry** - add logging/monitoring in one place
4. **Compliance ready** - single point for audit trails

### Model Strategy

- **Default:** `gpt-4.1` (strong reasoning, stable)
- **Future:** Per-agent overrides (e.g., timeline on cheaper model)
- **Constraints:** Never use models without tool calling support

---

## Citation-First Principle (NON-NEGOTIABLE)

Every extracted fact MUST include:

1. **Page number** (`source_page: integer`)
2. **Source excerpt** (`source_excerpt: text`, 50-200 chars)

### Enforcement Mechanisms

#### 1. Tool Schemas

All agent tools require these fields:

```typescript
// Example: Timeline Agent tool
{
  name: "add_timeline_event",
  parameters: {
    type: "object",
    properties: {
      process_id: { type: "string" },
      event_type: { type: "string", enum: [...] },
      event_date: { type: "string", format: "date" },
      description: { type: "string" },
      source_page: { type: "integer", description: "PDF page number" },
      source_excerpt: { 
        type: "string", 
        description: "Direct quote, 50-200 chars" 
      }
    },
    required: ["process_id", "event_type", "event_date", "source_page", "source_excerpt"]
  }
}
```

#### 2. Database Constraints

```sql
ALTER TABLE timeline_events 
  ALTER COLUMN source_page SET NOT NULL,
  ALTER COLUMN source_excerpt SET NOT NULL;

-- For entities/relations, store in metadata JSONB
```

#### 3. Agent Prompts

All agent system prompts must include:

> **Citation Policy:**  
> Never invent data. Only extract information if you can cite:
> - The specific page number in the PDF
> - A direct quote or excerpt (50-200 characters)
>
> If you cannot find a citation, do not create the event/entity.

---

## Process Stage State Machine

Process lifecycle is **deterministic**, not LLM-driven.

### State Machine Module

**File:** `supabase/functions/_shared/process-stage-machine.ts`

```typescript
export type ProcessStage = 
  | 'directive' 
  | 'writing' 
  | 'published' 
  | 'remiss' 
  | 'proposition' 
  | 'law';

export interface ProcessEvidence {
  hasDirective: boolean;
  hasSou: boolean;
  hasSouPublishedEvent: boolean;
  hasRemissEvents: boolean;
  hasProposition: boolean;
  hasLaw: boolean;
}

export interface StageResult {
  stage: ProcessStage;
  explanation: string;
}

export const computeProcessStage = (evidence: ProcessEvidence): StageResult => {
  // Pure function - no side effects, no LLM calls
  
  if (evidence.hasLaw) {
    return {
      stage: 'law',
      explanation: 'Law enacted and in force'
    };
  }
  
  if (evidence.hasProposition) {
    return {
      stage: 'proposition',
      explanation: 'Government proposition submitted to Riksdagen'
    };
  }
  
  if (evidence.hasRemissEvents) {
    return {
      stage: 'remiss',
      explanation: 'SOU in remiss phase for stakeholder review'
    };
  }
  
  if (evidence.hasSou && evidence.hasSouPublishedEvent) {
    return {
      stage: 'published',
      explanation: 'SOU published and available for review'
    };
  }
  
  if (evidence.hasSou) {
    return {
      stage: 'writing',
      explanation: 'SOU document received but not yet confirmed as published'
    };
  }
  
  if (evidence.hasDirective) {
    return {
      stage: 'directive',
      explanation: 'Directive issued, committee work in progress'
    };
  }
  
  return {
    stage: 'directive',
    explanation: 'Process initiated, awaiting detailed information'
  };
};
```

### Usage by Head Detective

```typescript
// Gather evidence from database
const evidence = await gatherProcessEvidence(processId);

// Compute stage deterministically
const { stage, explanation } = computeProcessStage(evidence);

// Update database
await supabase
  .from('processes')
  .update({ current_stage: stage, stage_explanation: explanation })
  .eq('id', processId);
```

**No LLM involvement** in stage determination.

---

## Agent Specifications

### 1. Head Detective Agent

**Edge Function:** `supabase/functions/agent-head-detective/index.ts`

#### Responsibilities

1. **Read pending tasks** where `agent_name = 'head_detective'`
2. **Analyze document** content (from `documents.raw_content`)
3. **Delegate to specialists:**
   - Create `timeline_extraction` task
   - Create `metadata_extraction` task
4. **Wait for completion** (on next run, check if delegate tasks are done)
5. **Update process stage** using state machine
6. **Mark own task complete** with structured summary

#### Tool Definitions

```typescript
const headDetectiveTools = [
  {
    type: "function",
    function: {
      name: "delegate_to_timeline_agent",
      description: "Assign timeline extraction task for dates in SOU",
      parameters: {
        type: "object",
        properties: {
          process_id: { type: "string" },
          document_id: { type: "string" },
          focus_areas: {
            type: "array",
            items: { type: "string" },
            description: "Sections to analyze: 'directive reference', 'committee formation', etc."
          }
        },
        required: ["process_id", "document_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delegate_to_metadata_agent",
      description: "Assign actor/entity extraction task",
      parameters: {
        type: "object",
        properties: {
          process_id: { type: "string" },
          document_id: { type: "string" }
        },
        required: ["process_id", "document_id"]
      }
    }
  }
];
```

#### Output Data Structure

```typescript
interface HeadDetectiveOutput {
  analysis_summary: string;
  delegated_tasks: {
    timeline_task_id: string;
    metadata_task_id: string;
  };
  stage_update?: {
    previous_stage: string;
    new_stage: string;
    reasoning: string;
  };
  completed_at: string;
}
```

#### Cron Schedule

```sql
SELECT cron.schedule(
  'run-head-detective',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT net.http_post(
    url := 'https://oxwizikytcdevwkjaegq.supabase.co/functions/v1/process-task-queue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer [ANON_KEY]"}'::jsonb,
    body := '{"taskType": "head_detective_analysis", "maxTasks": 5}'::jsonb
  ) as request_id;
  $$
);
```

---

### 2. Timeline Agent

**Edge Function:** `supabase/functions/agent-timeline/index.ts`

#### Scope (v1: SOU-Only Data)

**CAN Extract from SOUs:**
- Publication date (from metadata)
- Directive reference and date
- Committee formation date
- Report submission date
- Any dates explicitly mentioned in text

**CANNOT Extract (requires external scrapers):**
- Remiss start/end dates (regeringen.se)
- Proposition dates (Riksdagen)
- Law enactment dates (Riksdagen)

#### Tool Definitions

```typescript
const timelineTools = [
  {
    type: "function",
    function: {
      name: "add_timeline_event",
      description: "Add timeline event with citation",
      parameters: {
        type: "object",
        properties: {
          process_id: { type: "string" },
          event_type: {
            type: "string",
            enum: [
              "directive_issued",
              "committee_formed",
              "sou_published",
              "report_submitted"
            ]
          },
          event_date: { type: "string", format: "date" },
          description: { type: "string" },
          source_page: {
            type: "integer",
            description: "Page in PDF where info found"
          },
          source_excerpt: {
            type: "string",
            description: "Direct quote, 50-200 chars"
          },
          actors: {
            type: "array",
            items: { type: "string" },
            description: "People/agencies involved (optional)"
          }
        },
        required: ["process_id", "event_type", "event_date", "source_page", "source_excerpt"]
      }
    }
  }
];
```

#### Output Data Structure

```typescript
interface TimelineAgentOutput {
  events_created: number;
  event_ids: string[];
  skipped_sections: string[];
  uncertainties: string[];
  completed_at: string;
}
```

#### System Prompt Guidelines

```
You are a Timeline Extraction Agent analyzing Swedish government reports (SOUs).

CITATION POLICY:
- Only extract events if you can cite page number + direct quote
- Never invent dates or events
- If uncertain, note in output but do not create event

SCOPE:
- Extract dates mentioned IN the SOU document itself
- Do NOT speculate about future events (remiss, propositions)
- Focus on: directive dates, committee formation, publication

OUTPUT:
- Be explicit about sections you skipped (e.g., "Annexes not analyzed")
- List any ambiguities (e.g., "Date format unclear on p.12")
```

---

### 3. Metadata Agent

**Edge Function:** `supabase/functions/agent-metadata/index.ts`

#### Extraction Targets

- **Utredare** (lead investigator): Usually in "Uppdraget" or "Kommittén"
- **Sekretariat members**: Committee composition section
- **Expert group members**: If listed
- **Ministry**: Responsible department
- **Reference groups**: If mentioned

#### Tool Definitions

```typescript
const metadataTools = [
  {
    type: "function",
    function: {
      name: "create_entity_and_relation",
      description: "Create entity and link to document with citation",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            enum: ["person", "agency", "ministry"]
          },
          name: { type: "string" },
          role: {
            type: "string",
            enum: [
              "utredare",
              "sekretariat",
              "expert",
              "ministry_responsible"
            ]
          },
          document_id: { type: "string" },
          source_page: { type: "integer" },
          source_excerpt: { type: "string" }
        },
        required: ["entity_type", "name", "role", "document_id", "source_page"]
      }
    }
  }
];
```

#### Deduplication Logic

```typescript
// Check if entity exists
const existingEntity = await supabase
  .from('entities')
  .select('id')
  .eq('entity_type', entity_type)
  .eq('name', name)
  .maybeSingle();

let entityId: string;

if (existingEntity) {
  entityId = existingEntity.id;
} else {
  // Create new entity
  const { data } = await supabase
    .from('entities')
    .insert({ entity_type, name, role })
    .select('id')
    .single();
  entityId = data.id;
}

// Create relation (always, even if entity exists)
await supabase.from('relations').insert({
  source_id: entityId,
  source_type: 'entity',
  target_id: document_id,
  target_type: 'document',
  relation_type: determineRelationType(role), // 'led_by', 'authored_by', etc.
  metadata: { source_page, source_excerpt }
});
```

#### Output Data Structure

```typescript
interface MetadataAgentOutput {
  entities_created: number;
  entities_linked: number;
  relations_created: number;
  skipped_sections: string[];
  completed_at: string;
}
```

---

## Data Model Usage

### Tables Modified/Read by Each Agent

| Table | Head Detective | Timeline Agent | Metadata Agent |
|-------|----------------|----------------|----------------|
| `agent_tasks` | Read/Write (own + delegates) | Read/Write (own) | Read/Write (own) |
| `documents` | Read (`raw_content`) | Read (`raw_content`) | Read (`raw_content`) |
| `processes` | Read/Write (stage updates) | Read | Read |
| `timeline_events` | Read (for stage logic) | Write | - |
| `entities` | Read (for stage logic) | - | Write |
| `relations` | Read | - | Write |

### Task Type Registry

```typescript
// _shared/task-types.ts
export const TASK_TYPES = {
  HEAD_DETECTIVE: 'head_detective_analysis',
  TIMELINE_EXTRACTION: 'timeline_extraction',
  METADATA_EXTRACTION: 'metadata_extraction',
  // Future:
  // IMPACT_ANALYSIS: 'impact_analysis',
  // COMPLIANCE_CHECK: 'compliance_check',
} as const;

export type TaskType = typeof TASK_TYPES[keyof typeof TASK_TYPES];
```

---

## Logging & Transparency

### Agent Output Data Standards

All agents must write structured `output_data` on completion:

```typescript
interface AgentOutputBase {
  agent_version: string; // e.g., "1.0.0"
  model_used: string;
  completed_at: string;
  processing_time_ms: number;
}

// Timeline Agent
interface TimelineOutput extends AgentOutputBase {
  events_created: number;
  event_ids: string[];
  skipped_sections: string[];
  uncertainties: string[];
}

// Metadata Agent
interface MetadataOutput extends AgentOutputBase {
  entities_created: number;
  entities_linked: number;
  relations_created: number;
  skipped_sections: string[];
}

// Head Detective
interface HeadDetectiveOutput extends AgentOutputBase {
  analysis_summary: string;
  delegated_tasks: {
    timeline_task_id: string;
    metadata_task_id: string;
  };
  stage_update?: {
    previous_stage: string;
    new_stage: string;
  };
}
```

### Audit Trail Requirements

1. **Task lifecycle tracking**
   - `created_at`, `started_at`, `completed_at` timestamps
   - `status` transitions logged

2. **Error transparency**
   - `error_message` must include:
     - Which document/process failed
     - Specific error type (API, parsing, validation)
     - Enough context to reproduce

3. **Agent honesty**
   - Prompts must instruct: "List what you skipped and why"
   - Uncertainties logged, not hidden

---

## Testing Strategy

### Unit Tests (Future)

- Test state machine logic independently
- Test OpenAI client wrapper (mock responses)
- Test citation validation

### Integration Tests

- **Scenario:** Process single SOU end-to-end
  - Verify all agents run
  - Check timeline events have citations
  - Verify entities created and linked
  - Confirm process stage updated correctly

- **Scenario:** Handle duplicate entities
  - Run metadata agent twice on same SOU
  - Verify entities not duplicated
  - Verify relations still created

### Manual Validation (Phase 3)

- Pick 3-5 real SOUs
- Run through system
- Manually verify:
  - ✓ All events have valid page numbers
  - ✓ Excerpts match PDF content
  - ✓ Process stage is correct
  - ✓ No hallucinated data

---

## Success Metrics

### Quantitative

- [ ] 95%+ of timeline events include valid citations
- [ ] 90%+ of entities have source page in metadata
- [ ] Process stage matches manual assessment in 90%+ cases
- [ ] <5% duplicate entities created
- [ ] Head Detective completes analysis within 2 runs (30 min)

### Qualitative

- [ ] Erik (or legal researcher) can click citation → PDF page
- [ ] Agent output data is readable and informative
- [ ] Errors are traceable to specific documents/pages
- [ ] System feels like a "forensic tool" not a black box

---

## Future Extensions (Phase 4+)

### Additional Agents (Placeholder)

- **Impact Agent**: Estimate affected sectors, stakeholders
- **Compliance Agent**: Check against legal frameworks
- **Summary Agent**: Generate executive summaries
- **Cross-Reference Agent**: Link related SOUs and propositions

### Enhanced Features

- Parallel processing (multiple documents simultaneously)
- Confidence scores for extracted facts
- User feedback loop (correct/dispute extractions)
- Multi-document reasoning (compare SOUs)

---

## Open Questions

1. **Rate limiting:** How to handle OpenAI rate limits gracefully?
   - Start with exponential backoff in shared client
   - Consider task priority system

2. **Long documents:** Some SOUs are 500+ pages. Strategy?
   - Phase 3: Process full document, may take multiple runs
   - Future: Chunking + relevance filtering

3. **Ambiguous dates:** How to handle "i början av 2023"?
   - Agents should log uncertainty, not guess
   - Could add confidence field in future

4. **Citation format:** Page-only sufficient for MVP?
   - Yes for Phase 3
   - Phase 4: Add section/paragraph for pixel-perfect links

---

## Implementation Phases

### Phase 3.1: Foundation (Week 1)
- OpenAI integration + shared client
- State machine implementation
- Database schema updates (NOT NULL constraints)

### Phase 3.2: Core Agents (Week 2)
- Head Detective implementation
- Timeline Agent implementation
- Metadata Agent implementation

### Phase 3.3: Integration & Testing (Week 3)
- Cron jobs setup
- End-to-end testing with real SOUs
- Citation validation
- Output data auditing

### Phase 3.4: Refinement (Week 4)
- Prompt optimization
- Error handling improvements
- Performance tuning
- Documentation for Phase 4 handoff

---

## Dependencies

**From Phase 2:**
- Scraper populates `documents.raw_content`
- PDF extraction provides text with page boundaries
- `process-task-queue` infrastructure

**External:**
- OpenAI API access (gpt-4.1 or similar)
- Supabase cron (pg_cron extension)

**Blocked By:**
- None (can start immediately)

**Blocks:**
- Phase 4 (search depends on extracted entities/events)
- Phase 5 (user features depend on timeline data)

---

## Notes

- **Critical:** Never compromise on citation requirements
- **Extensibility:** Design task system for easy agent additions
- **Transparency:** Audit trail is as important as extracted data
- **Determinism:** Use LLMs for extraction, not decision logic
