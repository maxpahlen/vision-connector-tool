# Phase 5.2: Proposition Slice — Detailed Plan

**Created:** 2025-12-03  
**Updated:** 2025-12-03  
**Status:** Implementation In Progress  
**Depends on:** Phase 5.1 (Timeline Agent v2.1 ✅)

---

## Implementation Status

### Completed Components

| Component | Status | Notes |
|-----------|--------|-------|
| `scrape-proposition-index` v5.2 | ✅ Done | Updated with correct URL, pagination, Lagstiftningskedja extraction |
| `genvag-classifier.ts` | ✅ Done | Link classification for document references |
| Timeline Agent v2.2 event types | ✅ Done | Added proposition-specific event types |
| `process-stage-machine.ts` | ✅ Done | Added 'enacted' stage |
| `PropositionScraperTest.tsx` | ✅ Done | Admin UI test component |
| Admin page integration | ✅ Done | Added to AdminScraper.tsx |

### Pending Validation

- [ ] Run scraper on 10 propositions
- [ ] Validate Lagstiftningskedja link extraction
- [ ] Verify document_references creation
- [ ] Test Timeline Agent v2.2 on propositions
- [ ] Complete PHASE_5.2_COMPLETION_SUMMARY.md

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
| **Proposition** | Prop. 2024/25:123 | regeringen.se/propositioner |
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

From "Genvägar" links on proposition pages:

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

**Source:** https://www.regeringen.se/propositioner/

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

### 4.2 Genvägar Link Extraction

For each proposition page, find "Genvägar" section and extract:

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

### 6.1 Test Sample

Select 10 propositions spanning different ministries and years:
- 2 from Justitiedepartementet
- 2 from Finansdepartementet
- 2 from Socialdepartementet
- 4 from other departments

### 6.2 Success Criteria

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Scraper success rate | 100% | All 10 propositions ingested |
| Timeline events | ≥1 per doc | At least publication or decision date |
| Entity extraction | ≥1 minister per doc | No placeholders |
| Genvägar links | 80%+ classified | Correct reference_type |
| Citation coverage | 95%+ | source_page + source_excerpt |
| No duplicates | 0 | Re-run produces same count |

### 6.3 Regression Tests

- [ ] Existing SOUs still process correctly
- [ ] Timeline Agent v2.1 behavior unchanged for directives/SOUs
- [ ] Entity deduplication works across doc types
- [ ] Search returns propositions correctly
- [ ] Performance < 500ms for search

---

## 7. Implementation Steps

### Step 1: Update Timeline Agent Prompt
Add committee_type and deadline_type clarifications (done as part of this plan)

### Step 2: Create Proposition Scraper
- [ ] `scrape-proposition-index/index.ts`
- [ ] Pagination handling
- [ ] PDF URL extraction
- [ ] Genvägar section parsing

### Step 3: Create Genvägar Classifier
- [ ] `_shared/genvag-classifier.ts`
- [ ] URL pattern matching
- [ ] Reference type classification
- [ ] Document resolution logic

### Step 4: Update Head Detective
- [ ] Handle `doc_type = 'proposition'`
- [ ] Dispatch to Timeline Agent v2.2
- [ ] Dispatch to Metadata Agent v2.2
- [ ] Trigger Genvägar processing

### Step 5: Validate on 10 Samples
- [ ] Run full pipeline
- [ ] Review extracted events
- [ ] Review extracted entities
- [ ] Review created references
- [ ] Check for regressions

### Step 6: Document Results
- [ ] Update PHASE_5.2_COMPLETION_SUMMARY.md
- [ ] Update test tracking docs
- [ ] Record any issues found

---

## 8. Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/scrape-proposition-index/index.ts` | Create | Proposition scraper |
| `supabase/functions/_shared/genvag-classifier.ts` | Create | Link classifier |
| `supabase/functions/agent-timeline-v2/index.ts` | Modify | Add proposition events |
| `supabase/functions/agent-metadata/index.ts` | Modify | Add proposition entities |
| `supabase/functions/agent-head-detective/index.ts` | Modify | Handle propositions |
| `src/components/admin/PropositionScraperTest.tsx` | Create | Admin UI test component |

---

## 9. Approval Checkpoint

Before implementation begins, confirm:

- [ ] Phase 5.2 scope is approved
- [ ] Timeline Agent v2.2 event types are correct
- [ ] Metadata Agent v2.2 entity rules are correct
- [ ] Genvägar classification rules are approved
- [ ] Test sample selection is approved

---

## Related Documentation

- [Phase 5 Implementation Plan](./PHASE_5_IMPLEMENTATION_PLAN.md)
- [Phase 5 Branch Plan](./branches/phase-5-legislative-graph-expansion.md)
- [Phase 5 Test Plan](../testing/phase-5-test-plan.md)
