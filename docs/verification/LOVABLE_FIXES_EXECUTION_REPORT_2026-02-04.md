# Fix Execution Report

**Date:** 2026-02-04  
**Message Type:** APPROVAL REQUEST | Phase: APPROVAL  
**Prepared By:** Lovable (Architectural Authority)  
**Approval Required From:** Maximilian (Head Developer)

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
| Orphan code (undocumented) | 13 | Needs review |
| Superseded components | 4 | Archive candidates |
| Doc metrics outdated | 4 | P0 fix |

---

## Fix Plan (5 Phases)

### Phase 1: Critical Data Gaps (DB/Pipeline Fixes)

**Goal:** Zero critical missing fields where data should exist.

#### 1.1 Propositions: 116/126 Missing raw_content

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
| Run SQL migration to backfill lifecycle_stage | Lovable | Approval | 🔲 TODO |
| Update scraper to set lifecycle_stage on insert | Lovable | 1.3.1 | 🔲 TODO |
| Verify 0 NULL lifecycle_stage for directives | Lovable | 1.3.1 | 🔲 TODO |

**Migration SQL:**
```sql
UPDATE documents 
SET lifecycle_stage = 'directive' 
WHERE doc_type = 'directive' 
AND lifecycle_stage IS NULL;
```

**Success Criteria:**
```sql
SELECT COUNT(*) FROM documents 
WHERE doc_type = 'directive' AND lifecycle_stage IS NULL;
-- Expected: 0
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
- Resolution rate > 30% (or justified threshold based on corpus analysis)
- Clear documentation of why remaining references cannot be resolved

---

### Phase 3: Documentation Corrections

**Goal:** All planning docs reflect current reality.

#### 3.1 PRODUCT_ROADMAP.md Updates

| Field | Old Value | New Value | Status |
|-------|-----------|-----------|--------|
| Total documents | 127 | 863 | 🔲 TODO |
| Timeline events | 723 | 1,050 | 🔲 TODO |
| Document references | 587 | 1,083 | 🔲 TODO |
| Entities | 1,473 | 1,760 | 🔲 TODO |
| Phase 5.4 status | "Next" | ✅ COMPLETE | 🔲 TODO |
| Phase 5.6.2 stats | ~467 (14%) | 3,366 (98.4%) | 🔲 TODO |
| Phase 5.6.3 status | "PLANNING" | ✅ COMPLETE | 🔲 TODO |

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
└── reset-events/       # DB reset documentation
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

#### 5.1 Superseded Components (Decision Required)

| Component | Superseded By | Recommendation | Decision |
|-----------|---------------|----------------|----------|
| `PropositionScraperTest.tsx` | `PropositionRiksdagenScraperTest.tsx` | DELETE | 🔲 PENDING |
| `DirectiveMetadataScraper.tsx` | `DirectiveRiksdagenScraperTest.tsx` | DELETE | 🔲 PENDING |
| `scrape-sou-metadata/` | N/A (still used?) | EVALUATE | 🔲 PENDING |
| `scrape-directive-metadata/` | `scrape-directives-riksdagen/` | DELETE | 🔲 PENDING |

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
- All 4 superseded components reviewed and archived/deleted
- All 7 undocumented items now documented

---

## Execution Checklist

### Phase 1 Checklist (Critical)
- [ ] Create `process-proposition-pdf` edge function
- [ ] Create `process-directive-pdf` edge function
- [ ] Run lifecycle_stage backfill migration
- [ ] Re-extract HC01FiU1
- [ ] Verify all success criteria SQL queries pass

### Phase 2 Checklist (Moderate)
- [ ] Analyze reference corpus gaps
- [ ] Decide on corpus expansion strategy
- [ ] Re-run reference resolver
- [ ] Document new resolution rate

### Phase 3 Checklist (Documentation)
- [ ] Update PRODUCT_ROADMAP.md with all new metrics
- [ ] Update phase-5.6-content-insights.md
- [ ] Update PHASE_5_IMPLEMENTATION_PLAN.md
- [ ] Update testing/README.md

### Phase 4 Checklist (Reorganization)
- [ ] Create `docs/archive/` directory structure
- [ ] Move 12 historical documents
- [ ] Create `docs/DOC_INDEX.md`

### Phase 5 Checklist (Cleanup)
- [ ] Get Max decision on 4 superseded components
- [ ] Add docs for 7 undocumented items

---

## Approval Gates

| Phase | Can Start | Requires Approval |
|-------|-----------|-------------------|
| Phase 1.3 (migration) | Now | Yes - migration approval |
| Phase 1.1-1.2 (PDF extraction) | Now | Yes - new edge functions |
| Phase 2 | After Phase 1 | Yes - corpus expansion decision |
| Phase 3 | Now | No - doc updates only |
| Phase 4 | Now | No - file moves only |
| Phase 5 | Now | Yes - delete decisions |

---

## Sign-Off Required

| Role | Name | Action | Status |
|------|------|--------|--------|
| Head Developer | Maximilian | APPROVE plan | 🔲 PENDING |
| Architectural Authority | Lovable | Execute fixes | 🔲 PENDING |
| Execution Coder | Codex | Assist with code | 🔲 PENDING |

---

## Questions for Max

1. **Phase 1:** Should we prioritize propositions or directives for PDF extraction first?
2. **Phase 2:** What's the acceptable resolution rate target? (Currently 7.8%, suggest 30%+)
3. **Phase 5:** Confirm DELETE for the 4 superseded components?
4. **Scope:** Should we tackle all 5 phases in sequence, or prioritize P1+P3 first?

---

**Awaiting APPROVAL to proceed with execution.**
