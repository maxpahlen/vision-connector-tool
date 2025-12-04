# Phase 5.2: Proposition Slice — Detailed Plan

**Created:** 2025-12-03  
**Updated:** 2025-12-04  
**Status:** Pilot Implementation In Progress  
**Depends on:** Phase 5.1 (Timeline Agent v2.1 ✅)

---

## Implementation Status

### Completed Components

| Component | Status | Notes |
|-----------|--------|-------|
| `scrape-proposition-index` v5.2.3 | ✅ Done | JSON API pagination, in-page deduplication |
| `genvag-classifier.ts` | ✅ Done | Link classification for document references |
| Timeline Agent v2.2 event types | ✅ Done | Added proposition-specific event types |
| `process-stage-machine.ts` | ✅ Done | Added 'enacted' stage |
| `PropositionScraperTest.tsx` | ✅ Done | Admin UI test component |
| `PropositionTextExtractorTest.tsx` | ✅ Done | Text extraction + process setup |
| `PropositionAgentTest.tsx` | ✅ Done | Agent pilot testing UI |
| Admin page integration | ✅ Done | All components in AdminScraper.tsx |
| Task queue update to v2 | ✅ Done | `process-task-queue` calls `agent-timeline-v2` |

### Pilot Validation Checklist

- [ ] Proposition text extraction pilot (3 docs)
  - Pilot docs: `Prop. 2025/26:36`, `Prop. 2025/26:48`, `Prop. 2025/26:42`
  - Expected: All 3 have `has_pdf = true` and `has_text = true`
  
- [ ] Proposition Timeline/Metadata pilot (3 docs)
  - Expected per doc: ≥1 timeline event (ideally `proposition_published`)
  - Expected per doc: ≥1 minister entity with citation (50-500 chars excerpt)
  - No duplicate explosion

### Pending After Pilot

- [ ] Run scraper on remaining propositions
- [ ] Full batch text extraction
- [ ] Full batch agent processing
- [ ] Complete PHASE_5.2_COMPLETION_SUMMARY.md

---

## Known Limitations

1. **Budget propositions not yet tested** — `Prop. 2025/26:1` excluded from pilot (too large/atypical)
2. **`Prop. 2025/26:52` missing pdf_url** — Still awaiting backfill or manual fix
3. **Propositions get independent processes** — Case-level merging deferred to Phase 6
4. **JSON API rate limits** — May hit Cloudflare protection on high-volume scraping

---

## Overview

This phase implements end-to-end ingestion, parsing, and discovery for Swedish Government Propositions (propositioner).

### Core Principles
- Walking skeleton first
- One document type at a time
- No big-bang ingestion
- Forensic correctness > features
- No speculative inference (that's Phase 6)

---

## 1. Scope

### 1.1 Document Types to Ingest

| Document Type | Example | Source |
|---------------|---------|--------|
| **Proposition** | Prop. 2024/25:123 | regeringen.se/rattsliga-dokument/proposition/ |
| **Bilaga** (attachments) | BIL, KOM | Attached to propositions |

### 1.2 Timeline Events to Extract

| Event Type | Description | Confidence Rules |
|------------|-------------|------------------|
| `proposition_submitted` | Proposition submitted to Riksdagen | High if exact date |
| `proposition_referred_to_riksdagen` | Formal referral date | High if exact date |
| `proposition_published` | Publication date on regeringen.se | High |
| `government_decision_date` | "Beslut vid regeringssammanträde..." | High if exact date |
| `impact_analysis_date` | Konsekvensanalys date | Medium/High |
| Existing deadline types | `remiss_period_end`, etc. | As per v2.1 |

### 1.3 Entities to Extract

| Entity Type | Description | Example |
|-------------|-------------|---------|
| `person` (minister) | Government actors who signed | "Justitieminister Gunnar Strömmer" |
| `committee` | Referenced committee | "Utredningen om..." |
| `organization` | Consulted stakeholders | "Sveriges Kommuner och Regioner" |

### 1.4 References to Create

From "Lagstiftningskedja" links on proposition pages:

| Reference Type | Source Pattern | Target |
|----------------|----------------|--------|
| `based_on` | Link to SOU | SOU document |
| `cites` | Link to directive | Directive document |
| `responds_to` | Link to remissvar | Remissvar document |
| `related` | Other links | Various |

---

## 2. Timeline Agent v2.2 Enhancements

### 2.1 New Event Types for Propositions

Add to `EVENT_TYPES`:
```typescript
const EVENT_TYPES = [
  // Existing
  'sou_published',
  'directive_issued',
  'committee_formed',
  'remiss_period_start',
  'remiss_period_end',
  // New for propositions
  'proposition_submitted',
  'proposition_referred_to_riksdagen',
  'proposition_published',
  'government_decision_date',
  'impact_analysis_date',
  'law_enacted'
] as const;
```

### 2.2 Updated Committee Type Classification

When extracting `committee_formed` events, classify the committee type:

| `committee_type` value | Swedish terms | Description |
|------------------------|---------------|-------------|
| `main_committee` | Kommitté, huvudkommitté | Main investigation body |
| `subcommittee` | Arbetsgrupp, delutredning | Working group under main |
| `expert_group` | Sakkunniggrupp, referensgrupp | Expert advisory group |
| `secretariat` | Sekretariatet | Administrative support |

**Metadata structure:**
```json
{
  "committee_event_kind": "lead_investigator_appointed",
  "committee_type": "main_committee",
  "role": "särskild utredare",
  "person_name": "Erik Tiberg"
}
```

### 2.3 Updated Deadline Type Classification

When extracting deadline events, use these `deadline_type` values:

| `deadline_type` value | Description |
|-----------------------|-------------|
| `remiss_deadline` | Consultation response deadline |
| `interim_report` | Partial report deadline |
| `final_report` | Final report deadline |
| `partial_report` | Other partial deliverable |
| `milestone` | Non-report milestone |
| `unspecified_deadline` | Fallback when unclear |

**Metadata structure:**
```json
{
  "deadline_type": "interim_report",
  "deadline_kind": "interim_report",
  "deadline_index": 1,
  "deadline_label": "Delredovisning"
}
```

---

## 3. Metadata Agent v2.2 for Propositions

### 3.1 Entity Extraction Rules

| Entity Type | Extraction Trigger | Validation |
|-------------|-------------------|------------|
| Minister | "Statsrådet", "Minister", signature block | Must have real name |
| Referenced legislation | "SFS 20XX:XXX", chapter + paragraph | Must be complete reference |
| Amended laws | "Ändring av...", "upphävs" | Must cite specific law |
| Stakeholders | "Remissinstanser", "Yttranden från" | Must be real org name |
| Budget impact | "Budgeteffekt", "Kostnad", "SEK" | Must have numeric value |

### 3.2 Required Citation Fields

Every extracted entity MUST include:
- `source_page`: Page number in PDF
- `source_excerpt`: 50-500 char exact quote
- `source_document_id`: Link to source proposition

### 3.3 Structured Metadata for Propositions

```typescript
interface PropositionMetadata {
  // Budget impacts
  budget_impact?: {
    amount_sek?: number;
    multi_year?: boolean;
    years_affected?: number[];
  };
  
  // Legislative references
  amended_laws?: Array<{
    sfs_number: string;  // e.g., "SFS 2010:800"
    chapter?: string;
    paragraph?: string;
  }>;
  
  // Committee reference
  source_committee?: {
    name: string;
    doc_number?: string;  // e.g., "SOU 2024:50"
  };
}
```

---

## 4. Proposition Scraper

### 4.1 Scraper: `scrape-proposition-index`

**Source:** https://www.regeringen.se/rattsliga-dokument/proposition/

**API Endpoint:** `https://www.regeringen.se/Filter/GetFilteredItems?preFilteredCategories=1329&page=N`

**Fields to extract:**
| Field | Source | Example |
|-------|--------|---------|
| `title` | Page title | "Stärkt skydd för Sveriges säkerhet" |
| `doc_number` | Prop. YYYY/YY:XXX | "Prop. 2024/25:123" |
| `url` | Page URL | https://www.regeringen.se/... |
| `pdf_url` | PDF link | https://www.regeringen.se/.../prop-2024-25-123.pdf |
| `ministry` | "Ansvarigt departement" | "Justitiedepartementet" |
| `publication_date` | "Publicerad" | 2025-03-15 |
| `lifecycle_stage` | Set to | `proposition` |
| `doc_type` | Set to | `proposition` |

### 4.2 Lagstiftningskedja Link Extraction

For each proposition page, find "Lagstiftningskedja" section and extract:

```typescript
interface GenvagLink {
  url: string;
  anchor_text: string;
  reference_type: 'based_on' | 'cites' | 'responds_to' | 'amends' | 'related';
  target_doc_number?: string;  // Extracted from URL or text
}
```

**Classification rules:**
| Pattern | Reference Type |
|---------|----------------|
| `/statens-offentliga-utredningar/` | `based_on` |
| `/kommittedirektiv/` | `cites` |
| `/remisser/` → svar | `responds_to` |
| "ändring", "ändringar" | `amends` |
| Default | `related` |

---

## 5. Head Detective v3 Updates

### 5.1 Proposition Handling

```typescript
// In head-detective/index.ts
if (document.doc_type === 'proposition') {
  // 1. Dispatch Timeline Agent v2.2
  await dispatchTask({
    task_type: 'timeline_extraction',
    agent_name: 'timeline-v2',
    document_id: document.id,
    process_id: process.id
  });
  
  // 2. Dispatch Metadata Agent v2.2
  await dispatchTask({
    task_type: 'metadata_extraction',
    agent_name: 'metadata-v2',
    document_id: document.id,
    process_id: process.id
  });
  
  // 3. Process Genvägar links (new)
  await dispatchTask({
    task_type: 'genvagar_processing',
    agent_name: 'genvagar-classifier',
    document_id: document.id
  });
}
```

### 5.2 Process Stage Updates

When proposition is processed, update process stage:
- If proposition submitted → stage = `proposition`
- If law enacted → stage = `enacted`

---

## 6. Validation Plan

### 6.1 Pilot Sample (3 docs)

Selected propositions spanning different ministries:
- `Prop. 2025/26:36` — Försvarsdepartementet
- `Prop. 2025/26:48` — Justitiedepartementet  
- `Prop. 2025/26:42` — Finansdepartementet

### 6.2 Success Criteria

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Text extraction | 3/3 | All pilot docs have `raw_content` |
| Process created | 3/3 | Each has linked process with `current_stage='proposition'` |
| Timeline events | ≥1 per doc | At least one event type extracted |
| Minister entities | ≥1 per doc | With valid citation (50-500 char excerpt) |
| No duplicates | 0 | Re-run produces same count |

### 6.3 Regression Tests

- [ ] Existing SOUs still process correctly
- [ ] Timeline Agent v2.1 behavior unchanged for directives/SOUs
- [ ] Entity deduplication works across doc types
- [ ] Search returns propositions correctly
- [ ] Performance < 500ms for search

---

## 7. Implementation Steps

### Step 1: Update Timeline Agent Prompt ✅
Add committee_type and deadline_type clarifications

### Step 2: Create Proposition Scraper ✅
- [x] `scrape-proposition-index/index.ts`
- [x] JSON API pagination
- [x] PDF URL extraction via pdf-scorer
- [x] Lagstiftningskedja section parsing

### Step 3: Create Genvägar Classifier ✅
- [x] `_shared/genvag-classifier.ts`
- [x] URL pattern matching
- [x] Reference type classification
- [x] Document resolution logic

### Step 4: Create Admin UI Components ✅
- [x] `PropositionScraperTest.tsx`
- [x] `PropositionTextExtractorTest.tsx`
- [x] `PropositionAgentTest.tsx`

### Step 5: Run Pilot (In Progress)
- [ ] Extract text for 3 pilot docs
- [ ] Create processes for 3 pilot docs
- [ ] Run Timeline Agent v2.2
- [ ] Run Metadata Agent v2.2
- [ ] Verify results

### Step 6: Scale to Full Dataset
- [ ] Extract text for all propositions
- [ ] Run agents on all propositions
- [ ] Document final results

---

## 8. Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/scrape-proposition-index/index.ts` | Created | Proposition scraper |
| `supabase/functions/_shared/genvag-classifier.ts` | Created | Link classifier |
| `supabase/functions/agent-timeline-v2/index.ts` | Modified | Added proposition events |
| `supabase/functions/process-task-queue/index.ts` | Modified | Calls agent-timeline-v2 |
| `src/components/admin/PropositionScraperTest.tsx` | Created | Scraper test UI |
| `src/components/admin/PropositionTextExtractorTest.tsx` | Created | Text extraction UI |
| `src/components/admin/PropositionAgentTest.tsx` | Created | Agent pilot test UI |
| `src/pages/AdminScraper.tsx` | Modified | Added new components |

---

## Related Documentation

- [Phase 5 Implementation Plan](./PHASE_5_IMPLEMENTATION_PLAN.md)
- [Phase 5 Branch Plan](./branches/phase-5-legislative-graph-expansion.md)
- [Phase 5 Test Plan](../testing/phase-5-test-plan.md)
- [Phase 5.2 Implementation Log](./PHASE_5.2_IMPLEMENTATION_LOG.md)
