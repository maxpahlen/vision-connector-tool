# Phase 5.2: Proposition Slice — Detailed Plan

**Created:** 2025-12-03  
**Updated:** 2025-12-04  
**Status:** ✅ Pilot Validation Complete — Ready for Scaling  
**Depends on:** Phase 5.1 (Timeline Agent v2.1 ✅)

---

## Implementation Status

### Completed Components

| Component | Status | Notes |
|-----------|--------|-------|
| `scrape-proposition-index` v5.2.3 | ✅ Done | JSON API pagination, in-page deduplication |
| `genvag-classifier.ts` | ✅ Done | Link classification for document references |
| Timeline Agent v2.2 event types | ✅ Done | Added proposition-specific event types |
| Metadata Agent v2.2 | ✅ Done | Document-type-aware, proposition minister extraction |
| `process-stage-machine.ts` | ✅ Done | Added 'enacted' stage |
| `PropositionScraperTest.tsx` | ✅ Done | Admin UI test component |
| `PropositionTextExtractorTest.tsx` | ✅ Done | Text extraction + process setup |
| `PropositionAgentTest.tsx` | ✅ Done | Agent pilot testing UI |
| Admin page integration | ✅ Done | Tabbed interface in AdminScraper.tsx |
| Task queue update to v2 | ✅ Done | `process-task-queue` calls `agent-timeline-v2` |

### Pilot Validation Checklist

- [x] Proposition text extraction pilot (3 docs)
  - Pilot docs: `Prop. 2025/26:36`, `Prop. 2025/26:48`, `Prop. 2025/26:42`
  - Result: All 3 have `has_pdf = true` and `has_text = true` ✅
  
- [x] Proposition Timeline pilot (3 docs)
  - Result: All 3 have ≥1 timeline event (proposition_submitted, law_enacted) ✅
  - Confidence: High for all events ✅
  
- [x] Proposition Metadata pilot (initial run)
  - Issue found: Ministers labeled as "utredare" ❌
  
- [x] Fix proposition minister role classification
  - Metadata Agent v2.2 now doc-type-aware ✅
  
- [x] Re-run Metadata Agent pilot (corrected)
  - Result: Ministers correctly identified with Swedish titles ✅
  - No duplicate explosion ✅
  
- [x] UI fix for minister count display
  - Filter updated to include `statsråd`, `departementschef` ✅

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
| `law_enacted` | Law comes into effect | High if exact date |

### 1.3 Entities to Extract

| Entity Type | Description | Example |
|-------------|-------------|---------|
| `person` (minister) | Government actors who signed | "Carl-Oskar Bohlin (försvarsminister)" |
| `committee` | Referenced committee | "Utredningen om..." |
| `organization` | Consulted stakeholders | "Sveriges Kommuner och Regioner" |

**Critical Note:** For propositions, ministers are extracted with their exact Swedish titles (justitieminister, försvarsminister, etc.), NOT with SOU-style roles (utredare).

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

| `committee_type` value | Swedish terms | Description |
|------------------------|---------------|-------------|
| `main_committee` | Kommitté, huvudkommitté | Main investigation body |
| `subcommittee` | Arbetsgrupp, delutredning | Working group under main |
| `expert_group` | Sakkunniggrupp, referensgrupp | Expert advisory group |
| `secretariat` | Sekretariatet | Administrative support |

### 2.3 Updated Deadline Type Classification

| `deadline_type` value | Description |
|-----------------------|-------------|
| `remiss_deadline` | Consultation response deadline |
| `interim_report` | Partial report deadline |
| `final_report` | Final report deadline |
| `partial_report` | Other partial deliverable |
| `milestone` | Non-report milestone |
| `unspecified_deadline` | Fallback when unclear |

---

## 3. Metadata Agent v2.2 for Propositions

### 3.1 Document-Type-Aware Extraction

The Metadata Agent v2.2 now detects `doc_type` and uses appropriate prompts:

**For Propositions:**
- Extracts ministers and political office holders
- Looks for signature blocks, "Förord", ministerial introductions
- Role field contains exact Swedish title (e.g., "justitieminister")
- Does NOT use "utredare" or committee-style roles

**For SOUs/Directives:**
- Extracts lead investigators (utredare, särskild utredare)
- Extracts committee names
- Does NOT extract ministers

### 3.2 Required Citation Fields

Every extracted entity MUST include:
- `source_page`: Page number in PDF
- `source_excerpt`: 50-500 char exact quote
- `source_document_id`: Link to source document

### 3.3 Role Vocabulary

**Proposition roles:**
- `justitieminister`, `försvarsminister`, `finansminister`, etc.
- `statsråd`
- `departementschef`
- `statssekreterare`

**SOU/Directive roles:**
- `utredare`
- `särskild_utredare`
- `committee`

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

Classification rules:
| Pattern | Reference Type |
|---------|----------------|
| `/statens-offentliga-utredningar/` | `based_on` |
| `/kommittedirektiv/` | `cites` |
| `/remisser/` → svar | `responds_to` |
| "ändring", "ändringar" | `amends` |
| Default | `related` |

---

## 5. Validation Results

### 5.1 Pilot Sample

| Proposition | Ministry | Text Length | Timeline Events | Ministers |
|-------------|----------|-------------|-----------------|-----------|
| Prop. 2025/26:36 | Försvarsdepartementet | ~91k | 2 | ✅ |
| Prop. 2025/26:48 | Justitiedepartementet | ~201k | 2 | ✅ |
| Prop. 2025/26:42 | Finansdepartementet | ~185k | 2 | ✅ |

### 5.2 Success Criteria (All Met ✅)

| Criterion | Target | Result |
|-----------|--------|--------|
| Text extraction | 3/3 | ✅ 3/3 |
| Process created | 3/3 | ✅ 3/3 |
| Timeline events | ≥1 per doc | ✅ 2 per doc |
| Minister entities | ≥1 per doc | ✅ Corrected |
| No duplicates | 0 | ✅ Verified |

### 5.3 Regression Tests

- [x] Existing SOUs still process correctly
- [x] Timeline Agent v2.1 behavior unchanged for directives/SOUs
- [x] Entity deduplication works across doc types
- [x] Search returns propositions correctly
- [x] Performance < 500ms for search

---

## 6. Implementation Steps

### Step 1: Update Timeline Agent Prompt ✅
Added committee_type and deadline_type clarifications

### Step 2: Create Proposition Scraper ✅
- [x] `scrape-proposition-index/index.ts`
- [x] JSON API pagination
- [x] PDF URL extraction via pdf-scorer
- [x] Lagstiftningskedja section parsing

### Step 3: Create Genvägar Classifier ✅
- [x] `_shared/genvag-classifier.ts`
- [x] URL pattern matching
- [x] Reference type classification

### Step 4: Create Admin UI Components ✅
- [x] `PropositionScraperTest.tsx`
- [x] `PropositionTextExtractorTest.tsx`
- [x] `PropositionAgentTest.tsx`

### Step 5: Run Pilot ✅
- [x] Extract text for 3 pilot docs
- [x] Create processes for 3 pilot docs
- [x] Run Timeline Agent v2.2
- [x] Run Metadata Agent v2.2 (initial)
- [x] Fix minister role classification
- [x] Re-run Metadata Agent v2.2 (corrected)
- [x] Fix UI minister count filter (statsråd, departementschef)
- [x] Verify results

### Step 6: Scale to Full Dataset (Pending)
- [ ] Extract text for all propositions
- [ ] Run agents on all propositions
- [ ] Document final results

---

## 7. Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/scrape-proposition-index/index.ts` | Created | Proposition scraper |
| `supabase/functions/_shared/genvag-classifier.ts` | Created | Link classifier |
| `supabase/functions/agent-timeline-v2/index.ts` | Modified | Added proposition events |
| `supabase/functions/agent-metadata/index.ts` | Modified | v2.2 doc-type-aware |
| `supabase/functions/process-task-queue/index.ts` | Modified | Calls agent-timeline-v2 |
| `src/components/admin/PropositionScraperTest.tsx` | Created | Scraper test UI |
| `src/components/admin/PropositionTextExtractorTest.tsx` | Created | Text extraction UI |
| `src/components/admin/PropositionAgentTest.tsx` | Created | Agent pilot test UI |
| `src/pages/AdminScraper.tsx` | Modified | Tabbed interface |

---

## Related Documentation

- [Phase 5 Implementation Plan](./PHASE_5_IMPLEMENTATION_PLAN.md)
- [Phase 5 Branch Plan](./branches/phase-5-legislative-graph-expansion.md)
- [Phase 5 Test Plan](../testing/phase-5-test-plan.md)
- [Phase 5.2 Implementation Log](./PHASE_5.2_IMPLEMENTATION_LOG.md)
