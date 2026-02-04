# Fix Execution Report

**Date:** 2026-02-04  
**Message Type:** EXECUTION PLAN | Phase: APPROVAL  
**Prepared By:** Lovable (Architectural Authority)  
**Approval Status:** ✅ APPROVED by Maximilian (2026-02-04)

---

## Audit Summary (All Three Reports)

### Audit 1: Documentation Sanity Audit
**File:** `docs/verification/LOVABLE_DOCS_SANITY_AUDIT_2026-01-30.md`

| Finding Category | Count |
|-----------------|-------|
| Docs requiring UPDATE | 8 |
| Docs to ARCHIVE | 12 |
| Doc-vs-Reality conflicts | 6 |
| Undocumented features | 7 |

### Audit 2: DB + Pipeline Sanity Audit
**File:** `docs/verification/LOVABLE_DB_PIPELINE_SANITY_AUDIT_2026-01-30.md`

| Pipeline | Status | Issues |
|----------|--------|--------|
| SOUs | ✅ HEALTHY | None |
| Propositions | ❌ CRITICAL | 92% missing raw_content (116/126) |
| Directives | ❌ CRITICAL | 69% missing raw_content, 31% missing lifecycle_stage |
| Committee Reports | ⚠️ MINOR | 1 doc missing raw_content (HC01FiU1) |
| Laws | ✅ HEALTHY | None |
| Remiss Documents | ✅ HEALTHY | None |
| Remissvar | ✅ HEALTHY | 98.4% extracted |
| Entities | ✅ HEALTHY | 100% linked |
| Timeline Events | ✅ HEALTHY | 1,050 events, 0 missing fields |
| Document References | ⚠️ MODERATE | 7.8% resolution rate |

### Audit 3: Codebase Alignment Audit
**File:** `docs/verification/LOVABLE_CODEBASE_ALIGNMENT_AUDIT_2026-01-30.md`

| Category | Count | Status |
|----------|-------|--------|
| Total code items verified | 66 | 100% match |
| Orphan code (undocumented) | 13 | See detailed list below |
| Superseded components | 4 | Archive first, then delete |
| Doc metrics outdated | 4 | P0 fix |

#### Orphan Code Breakdown (13 items)

| # | Code File | Category | Recommendation |
|---|-----------|----------|----------------|
| 1 | `supabase/functions/scrape-sou-metadata/` | Legacy scraper | EVALUATE if still needed |
| 2 | `supabase/functions/scrape-directive-metadata/` | Legacy scraper | ARCHIVE (superseded by Riksdagen) |
| 3 | `supabase/functions/test-org-matcher/` | Test utility | KEEP (documented in AGENT_RUNBOOK) |
| 4 | `supabase/functions/test-stage-machine/` | Test utility | KEEP (documented in AGENT_RUNBOOK) |
| 5 | `src/components/admin/PropositionScraperTest.tsx` | Superseded UI | ARCHIVE then DELETE |
| 6 | `src/components/admin/DirectiveMetadataScraper.tsx` | Superseded UI | ARCHIVE then DELETE |
| 7 | `src/components/admin/PropositionBatchProcessor.tsx` | Undocumented | ADD DOCS |
| 8 | `src/components/admin/PropositionTextExtractorTest.tsx` | Undocumented | ADD DOCS |
| 9 | `src/components/admin/ValidationDashboard.tsx` | Undocumented | ADD DOCS |
| 10 | `src/components/admin/SouUrlRepairTool.tsx` | Undocumented | ADD DOCS |
| 11 | `src/components/admin/SouLagstiftningskedjaScraper.tsx` | Undocumented | ADD DOCS |
| 12 | `src/hooks/useDocuments.ts` | Undocumented | ADD DOCS |
| 13 | `src/hooks/useDocumentCount.ts` | Undocumented | ADD DOCS |

---

## Decisions from Maximilian (2026-02-04)

### Q1: Priority — Propositions or Directives first?
**Decision:** ✅ **Propositions first**  
Rationale: 92% missing vs 69%, and propositions are central to legislative graph linking.

### Q2: Document reference resolution target?
**Decision:** ✅ **Staged targets**
- Short-term: 20–30% after corpus expansion + resolver re-run
- Long-term: 50%+ once historical corpus grows

### Q3: DELETE or ARCHIVE superseded components?
**Decision:** ✅ **Archive first, then delete after confirmation**  
The 4 superseded items will be archived to `docs/archive/superseded-code/` with notes before deletion.

### Q4: Execute all 5 phases or prioritize?
**Decision:** ✅ **Prioritize Phase 1 + Phase 3 first**  
Rationale: Phase 1 removes critical data gaps; Phase 3 fixes documentation drift. Then proceed to Phase 2/4/5.

---

## Fix Plan (5 Phases)

### Phase 1: Critical Data Gaps (DB/Pipeline Fixes) — **PRIORITY**

**Goal:** Zero critical missing fields where data should exist.

#### 1.1 Propositions: 116/126 Missing raw_content — **FIRST PRIORITY**

| Action | Owner | Dependency | Status |
|--------|-------|------------|--------|
| Create `process-proposition-pdf` edge function (reuse pdf-extractor.ts pattern) | Lovable | None | 🔲 TODO |
| Add admin UI for batch proposition extraction | Lovable | 1.1.1 | 🔲 TODO |
| Run extraction on 116 propositions with pdf_url | Max (trigger) | 1.1.1-2 | 🔲 TODO |
| Verify 0 missing raw_content where PDF exists | Lovable | 1.1.3 | 🔲 TODO |

**Root Cause:** Riksdagen API text endpoint returns empty for most propositions. PDF extraction is the reliable path.

**Success Criteria:** 
```sql
SELECT COUNT(*) FROM documents 
WHERE doc_type = 'proposition' 
AND raw_content IS NULL 
AND pdf_url IS NOT NULL;
-- Expected: 0
```

#### 1.2 Directives: 127/183 Missing raw_content

| Action | Owner | Dependency | Status |
|--------|-------|------------|--------|
| Create `process-directive-pdf` edge function | Lovable | None | 🔲 TODO |
| Add admin UI for batch directive extraction | Lovable | 1.2.1 | 🔲 TODO |
| Run extraction on directives with pdf_url | Max (trigger) | 1.2.1-2 | 🔲 TODO |
| Verify improved extraction coverage | Lovable | 1.2.3 | 🔲 TODO |

**Note:** Some directives may not have PDFs (text-only from Riksdagen API). These are expected gaps.

**Success Criteria:**
```sql
SELECT COUNT(*) FROM documents 
WHERE doc_type = 'directive' 
AND raw_content IS NULL 
AND pdf_url IS NOT NULL;
-- Expected: 0 (or near-zero)
```

#### 1.3 Directives: 56 Missing lifecycle_stage

| Action | Owner | Dependency | Status |
|--------|-------|------------|--------|
| Run SQL migration to backfill lifecycle_stage | Lovable | Approval | ✅ DONE (2026-02-04) |
| Update scraper to set lifecycle_stage on insert | Lovable | 1.3.1 | ✅ Already implemented |
| Verify 0 NULL lifecycle_stage for directives | Lovable | 1.3.1 | ✅ VERIFIED |

**Migration SQL (EXECUTED):**
```sql
UPDATE documents 
SET lifecycle_stage = 'directive' 
WHERE doc_type = 'directive' 
AND lifecycle_stage IS NULL;
```

**Success Criteria (VERIFIED):**
```sql
SELECT COUNT(*) FROM documents 
WHERE doc_type = 'directive' AND lifecycle_stage IS NULL;
-- Result: 0 ✅
```

#### 1.4 Committee Reports: 1 Missing raw_content (HC01FiU1)

| Action | Owner | Dependency | Status |
|--------|-------|------------|--------|
| Re-run PDF extraction for HC01FiU1 | Max (trigger) | None | 🔲 TODO |
| Verify raw_content populated | Lovable | 1.4.1 | 🔲 TODO |

**Manual extraction:**
- Document: HC01FiU1 - "Statens budget 2025 – Rambeslutet"
- PDF URL: `https://data.riksdagen.se/fil/D89EEB2D-7961-4D1A-BA8E-ABFCACDE9667`

**Success Criteria:**
```sql
SELECT LENGTH(raw_content) > 0 FROM documents WHERE doc_number = 'HC01FiU1';
-- Expected: true
```

---

### Phase 2: Reference Resolution Improvement

**Goal:** Materially improve document reference resolution rate (currently 7.8%).

| Action | Owner | Dependency | Status |
|--------|-------|------------|--------|
| Analyze unresolved references for corpus gaps | Lovable | None | 🔲 TODO |
| Expand corpus (prioritize most-referenced documents) | Max (decision) | 2.1 | 🔲 TODO |
| Re-run `resolve-document-references` edge function | Max (trigger) | 2.2 | 🔲 TODO |
| Report new resolution rate | Lovable | 2.3 | 🔲 TODO |

**Current State:**
- 1,083 total references
- 84 resolved (7.8%)
- 999 unresolved with target_doc_number

**Success Criteria:**
- Short-term: Resolution rate > 20–30%
- Long-term: Resolution rate > 50%
- Clear documentation of why remaining references cannot be resolved

---

### Phase 3: Documentation Corrections — **PRIORITY**

**Goal:** All planning docs reflect current reality.

#### 3.1 PRODUCT_ROADMAP.md Updates

| Field | Old Value | New Value | Status |
|-------|-----------|-----------|--------|
| Total documents | 127 | 863 | ✅ DONE |
| Timeline events | 723 | 1,050 | ✅ DONE |
| Document references | 587 | 1,083 | ✅ DONE |
| Entities | 1,473 | 1,760 | ✅ DONE |
| Phase 5.4 status | "Next" | ✅ COMPLETE | ✅ DONE |
| Phase 5.6.2 stats | ~467 (14%) | 3,366 (98.4%) | ✅ DONE |
| Phase 5.6.3 status | "PLANNING" | ✅ COMPLETE | ✅ DONE |

#### 3.2 Other Doc Updates

| File | Update Required | Status |
|------|-----------------|--------|
| `phase-5.6-content-insights.md` | Update extraction stats to 98.4% | 🔲 TODO |
| `PHASE_5_IMPLEMENTATION_PLAN.md` | Mark Phase 5.4, 5.5, 5.6 complete | 🔲 TODO |
| `testing/README.md` | Mark Test Group 5 complete | 🔲 TODO |
| `operations/AGENT_RUNBOOK.md` | Update with current patterns | 🔲 TODO |

#### 3.3 Add Missing Documentation

| Missing Feature | Add To | Status |
|-----------------|--------|--------|
| Committee Report PDF extraction | PRODUCT_ROADMAP.md | 🔲 TODO |
| Riksdagen proposition scraper | PRODUCT_ROADMAP.md | 🔲 TODO |
| Riksdagen directive scraper | PRODUCT_ROADMAP.md | 🔲 TODO |
| ValidationDashboard tool | AGENT_RUNBOOK.md | 🔲 TODO |
| SouUrlRepairTool | AGENT_RUNBOOK.md | 🔲 TODO |
| SouLagstiftningskedjaScraper | AGENT_RUNBOOK.md | 🔲 TODO |
| PropositionBatchProcessor | AGENT_RUNBOOK.md | 🔲 TODO |

**Success Criteria:**
- All 6 conflicts from Doc Audit resolved
- PRODUCT_ROADMAP metrics match database

---

### Phase 4: Documentation Reorganization

**Goal:** Clean, navigable doc structure with historical items archived.

#### 4.1 Create Archive Structure

```
docs/archive/
├── branches/           # Completed phase branch plans
├── summaries/          # Phase completion summaries
├── audits/             # Historical audits
├── reset-events/       # DB reset documentation
└── superseded-code/    # Archived superseded components (notes only)
```

#### 4.2 Move Historical Documents

| File | Destination | Status |
|------|-------------|--------|
| `phase-2-sou-scraper.md` | `docs/archive/branches/` | 🔲 TODO |
| `phase-3-multi-agent-ai.md` | `docs/archive/branches/` | 🔲 TODO |
| `phase-4-search-and-discovery.md` | `docs/archive/branches/` | 🔲 TODO |
| `PHASE_2_COMPLETION_SUMMARY.md` | `docs/archive/summaries/` | 🔲 TODO |
| `PHASE_3_REFINEMENT_SUMMARY.md` | `docs/archive/summaries/` | 🔲 TODO |
| `PHASE_4.1_COMPLETION_SUMMARY.md` | `docs/archive/summaries/` | 🔲 TODO |
| `PHASE_4.2_COMPLETION_SUMMARY.md` | `docs/archive/summaries/` | 🔲 TODO |
| `PHASE_4.3_COMPLETION_SUMMARY.md` | `docs/archive/summaries/` | 🔲 TODO |
| `PHASE_5.2_COMPLETION_SUMMARY.md` | `docs/archive/summaries/` | 🔲 TODO |
| `PHASE_DATABASE_RESET_DEC2025.md` | `docs/archive/reset-events/` | 🔲 TODO |
| `PHASE_SYSTEM_REBUILD_DEC2025.md` | `docs/archive/reset-events/` | 🔲 TODO |
| `ENTITY_LINKING_AUDIT_2026-01-15.md` | `docs/archive/audits/` | 🔲 TODO |

#### 4.3 Create Doc Index

Create `docs/DOC_INDEX.md` listing all authoritative current docs.

**Success Criteria:**
- `docs/archive/` exists with organized subdirectories
- 12 historical docs moved
- Doc index created and accurate

---

### Phase 5: Codebase Alignment Cleanup

**Goal:** Zero undocumented/orphan code.

#### 5.1 Superseded Components (ARCHIVE FIRST)

| Component | Superseded By | Action | Status |
|-----------|---------------|--------|--------|
| `PropositionScraperTest.tsx` | `PropositionRiksdagenScraperTest.tsx` | ARCHIVE → DELETE | 🔲 TODO |
| `DirectiveMetadataScraper.tsx` | `DirectiveRiksdagenScraperTest.tsx` | ARCHIVE → DELETE | 🔲 TODO |
| `scrape-sou-metadata/` | N/A | EVALUATE if still used | 🔲 TODO |
| `scrape-directive-metadata/` | `scrape-directives-riksdagen/` | ARCHIVE → DELETE | 🔲 TODO |

#### 5.2 Undocumented Admin Tools (Add Docs)

| Tool | Location | Doc Target | Status |
|------|----------|------------|--------|
| ValidationDashboard | `src/components/admin/` | AGENT_RUNBOOK.md | 🔲 TODO |
| SouUrlRepairTool | `src/components/admin/` | AGENT_RUNBOOK.md | 🔲 TODO |
| SouLagstiftningskedjaScraper | `src/components/admin/` | AGENT_RUNBOOK.md | 🔲 TODO |
| PropositionBatchProcessor | `src/components/admin/` | AGENT_RUNBOOK.md | 🔲 TODO |
| PropositionTextExtractorTest | `src/components/admin/` | AGENT_RUNBOOK.md | 🔲 TODO |
| useDocuments hook | `src/hooks/` | README or inline | 🔲 TODO |
| useDocumentCount hook | `src/hooks/` | README or inline | 🔲 TODO |

**Success Criteria:**
- All 4 superseded components archived with notes
- All 7 undocumented items now documented

---

## Execution Order (Per Max's Decision)

| Order | Phase | Priority | Rationale |
|-------|-------|----------|-----------|
| 1 | Phase 1 | 🔴 HIGH | Critical data gaps |
| 2 | Phase 3 | 🔴 HIGH | Documentation drift |
| 3 | Phase 4 | 🟡 MEDIUM | Doc reorganization |
| 4 | Phase 2 | 🟡 MEDIUM | Reference resolution |
| 5 | Phase 5 | 🟢 LOW | Code cleanup |

---

## Execution Checklist

### Phase 1 Checklist (Critical) — START HERE
- [ ] Create `process-proposition-pdf` edge function
- [ ] Create `process-directive-pdf` edge function
- [ ] Run lifecycle_stage backfill migration
- [ ] Re-extract HC01FiU1
- [ ] Verify all success criteria SQL queries pass

### Phase 3 Checklist (Documentation) — PARALLEL WITH P1
- [ ] Update PRODUCT_ROADMAP.md with all new metrics
- [ ] Update phase-5.6-content-insights.md
- [ ] Update PHASE_5_IMPLEMENTATION_PLAN.md
- [ ] Update testing/README.md

### Phase 4 Checklist (Reorganization)
- [ ] Create `docs/archive/` directory structure
- [ ] Move 12 historical documents
- [ ] Create `docs/DOC_INDEX.md`

### Phase 2 Checklist (Moderate)
- [ ] Analyze reference corpus gaps
- [ ] Decide on corpus expansion strategy
- [ ] Re-run reference resolver
- [ ] Document new resolution rate

### Phase 5 Checklist (Cleanup)
- [ ] Archive 4 superseded components
- [ ] Add docs for 7 undocumented items
- [ ] Confirm deletion with Max

---

## Sign-Off

| Role | Name | Action | Status |
|------|------|--------|--------|
| Head Developer | Maximilian | APPROVE plan | ✅ AGREE (2026-02-04) |
| Architectural Authority | Lovable | Execute fixes | ✅ AGREE (2026-02-04) |
| Execution Coder | Codex | Assist with code | 🔲 PENDING (will review Phase 1 edge functions) |

---

## Next Steps

With Max's approval received, execution can begin:

1. **Immediate (Lovable):** Create `process-proposition-pdf` edge function
2. **Immediate (Lovable):** Run lifecycle_stage backfill migration
3. **Parallel (Lovable):** Update PRODUCT_ROADMAP.md with verified metrics

**Ready to execute Phase 1 + Phase 3.**
