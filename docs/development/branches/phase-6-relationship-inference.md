# Phase 6: Relationship Inference & Case Reconstruction

**Status:** IN PROGRESS — Slice 6A.2 Complete  
**Branch:** `phase-6-relationship-inference`  
**Dependencies:** Phase 6.1 (Riksdagen API Migration — corpus backfill)  
**Last Updated:** 2026-02-12

---

## Approved Architecture Decisions (2026-02-11)

1. **`processes` as canonical root** — No parallel `legislative_cases` table. Extend existing `processes` semantics. Revisit only if explicit product need emerges.
2. **Deterministic-first execution** — Reference resolution → confidence/rules layer → AI inference (last resort).
3. **M2M linkage model** — No rigid single-FK columns. All document membership via join table with role + evidence.

---

## Execution Plan

### Phase 6A: Deterministic Graph (No AI)

| Slice | Description | Status | Notes |
|-------|-------------|--------|-------|
| 6A.1 | Reference resolution: Bet. pattern, HTML decode, full pass | ✅ DONE | 84 → 2,157 resolved (31.7%) |
| 6A.2 | Corpus backfill: Bet. H5–H7+HD sessions → re-resolve refs | ✅ DONE | +1,292 docs, 2,181 → 2,807 resolved (37.1%) |
| 6A.3 | Process linkage: cluster orphan documents into processes | 🔲 TODO | ~5,200 orphan docs |
| 6A.4 | `document_relationships` M2M schema + migration | 🔲 TODO | Needs approval |

### Phase 6B: AI Inference (Gaps Only)

| Slice | Description | Status | Notes |
|-------|-------------|--------|-------|
| 6B.1 | Case Reconstruction Agent (shared entities, ministry matching) | 🔲 TODO | Only for unresolvable-by-rules links |

---

## Slice 6A.1 Results (2026-02-11)

### Before/After

| Metric | Before | After |
|--------|--------|-------|
| Total references | 6,801 | 6,801 |
| Resolved | 84 (1.2%) | 2,157 (31.7%) |
| Unresolved | 6,717 | 4,644 |
| **New resolutions** | — | **2,073** |

### Resolved by Evidence Type

| Evidence Type | Count |
|---------------|-------|
| prop_pattern | 1,025 |
| bet_pattern | 923 |
| dir_pattern | 171 |
| sou_pattern | 38 |

### Remaining Unresolved — Categorized

| Category | Count | Resolution Path |
|----------|-------|-----------------|
| **Motions (Mot.)** | **2,820** | **Phase 7 — deferred (see below)** |
| Bet. not in corpus (H5–H7, HD) | 1,278 | 6A.2 — backfill H5–H7+HD sessions |
| SOU not in corpus | 171 | 6A.2 — mostly 2025 SOUs pending ingest |
| Prop not in corpus | 136 | 6A.2 — pre-2015 or very recent |
| Dir not in corpus | 78 | 6A.2 — outside current backfill window |
| Title-only / unparseable (non-Mot.) | 126 | Phase 6B (AI) — no doc number pattern |
| HTML-encoded title-only | 19 | Phase 6B (AI) |
| Ministry dossier | 11 | Not a document type we track |
| Ds not in corpus | 3 | Departementsserie not yet tracked |
| FPM not in corpus | 2 | Faktapromemoria not yet tracked |

### Known Gap: Parliamentary Motions (Deferred to Phase 7)

**Decision date:** 2026-02-12 | **Approved by:** Max, Lovable, Codex

2,820 unresolved references (60.7% of all unresolved) target parliamentary motions (`Mot. YYYY/YY:NNNN`). These are individual MP proposals — a fundamentally different document class from government bills, SOUs, and committee reports.

**Why deferred:**
- ~60,000+ motions available via `doktyp=mot` in Riksdagen API — massive corpus expansion
- No clear product demand yet for motion-level tracking
- Motions are processed by committees and referenced in committee reports (already tracked)
- Ingesting motions without product context risks data bloat without user value

**Future scope (Phase 7):** If product priorities demand motion tracking (e.g., "which MPs supported/opposed this SOU?"), create a scoped ingestion plan for `doktyp=mot` with clear success criteria.

---

## Slice 6A.2 Results (2026-02-12)

### Corpus Backfill

| Session | RM Code | Documents Added | Cross-Refs Created |
|---------|---------|-----------------|-------------------|
| 2017/18 | H5 | 454 | ~200 |
| 2018/19 | H6 | 334 | ~150 |
| 2019/20 | H7 | 373 | ~170 |
| 2025/26 | HD | 131 | ~240 |
| **Total** | — | **1,292** | **759** |

Committee report corpus: 1,850 → 3,142 (+69%)

### Reference Resolution — Before/After

| Metric | Before 6A.2 | After 6A.2 |
|--------|-------------|------------|
| Total references | 6,801 | 7,566 (+759 from backfill) |
| Resolved | 2,181 (32.1%) | 2,807 (37.1%) |
| Unresolved | 4,620 | 4,759 |
| **New resolutions** | — | **626** |

### Resolver Pass Breakdown

| Pass | Batch | Resolved | By Evidence |
|------|-------|----------|-------------|
| Pass 1 | 5,000 | 561 | 514 prop, 36 dir, 11 sou |
| Pass 2 | 4,871 | 159 | 112 prop, 36 dir, 11 sou |
| **Total** | — | **720** | — |

Note: 720 newly resolved but total only increased by 626 from pre-6A.2 baseline (2,181) because some references were resolved in the earlier partial pass.

### Remaining Unresolved — Categorized (post-6A.2)

| Category | Count | Resolution Path |
|----------|-------|-----------------|
| Extraction failed (titles, free text) | 4,163 | Phase 6B (AI) or out of scope |
| Prop not in corpus | 251 | Pre-2015 or very recent |
| SOU not in corpus | 236 | Mostly 2025+ pending ingest |
| Dir not in corpus | 43 | Outside current window |
| Dossier numbers | 11 | Not tracked |
| Ds / FPM | 8 | Not tracked |
| Bet. not in corpus | 1 | Likely edge case |

**Key insight:** The remaining 4,163 "extraction failed" references are overwhelmingly parliamentary motions (Mot.) and free-text titles without extractable doc number patterns — aligned with the Phase 7 deferral decision.

---

## Goal

Build a **deterministic-first document graph** that reconstructs legislative cases using evidence from existing cross-references, then augment with AI inference only for remaining gaps.

**Key Principle:** All relationships must be **evidence-based** — cite shared entities, dates, or explicit references as justification.

---

## Scope

### In Scope

#### 1. Deterministic Reference Resolution (6A.1–6A.2)
- Extract and normalize document numbers from `target_doc_number` fields
- Convert between naming conventions (Bet. → Riksdagen session codes)
- Match against existing documents corpus
- Re-run as corpus grows to resolve more references

#### 2. Process Linkage (6A.3)
- Use resolved references to link orphan documents to existing processes
- Create new processes where document clusters emerge
- Maintain `process_documents` M2M linkage

#### 3. Document Relationships Schema (6A.4)
- M2M `document_relationships` table (source_id, target_id, type, confidence, evidence)
- No rigid single-FK columns
- Evidence-typed links (explicit_reference, shared_entity, directive_number_match, etc.)

#### 4. Case Reconstruction Agent (6B.1)
- AI inference for remaining ambiguous links only
- Shared entity analysis, ministry matching, date proximity
- Confidence scoring with manual review for uncertain links

### Out of Scope

- ❌ Predictive analytics (Phase 7)
- ❌ Stakeholder influence scoring (Phase 7)
- ❌ Natural language queries (Phase 7)
- ❌ New `legislative_cases` table (use `processes` instead)

---

## Technical Approach

### Document Relationships Schema (Phase 6A.4 — Pending Approval)

```sql
CREATE TABLE document_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID NOT NULL REFERENCES documents(id),
  target_document_id UUID NOT NULL REFERENCES documents(id),
  relationship_type TEXT NOT NULL, -- 'leads_to', 'responds_to', 'implements', 'amends'
  confidence_score NUMERIC(3,2) NOT NULL, -- 0.00 to 1.00
  evidence_type TEXT NOT NULL, -- 'explicit_reference', 'shared_entity', 'directive_number_match'
  evidence_details JSONB, -- { "reference_id": "...", "shared_entities": [...] }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_document_id, target_document_id, relationship_type)
);
```

### Resolve-Document-References Function

**File:** `supabase/functions/resolve-document-references/index.ts`

Enhanced patterns:
- `SOU YYYY:NN`, `Dir. YYYY:NN`, `Prop. YYYY/YY:NN`, `Ds YYYY:NN`
- `Bet. YYYY/YY:CommNN` → Riksdagen session code conversion
- `FPM YYYY/YY:NN`, Ministry dossier numbers
- Title+DocNumber combos (e.g., "Title, SOU 2025:113" → "SOU 2025:113")
- HTML entity decoding (including double-encoded `&amp;#xF6;`)
- Paginated fetch + batched parallel updates

---

## Success Criteria

- [x] Deterministic resolution achieves 30%+ resolution rate (achieved: 37.1% after 6A.2)
- [ ] Process linkage reduces orphan documents by 50%+
- [ ] All resolved links are 100% accurate (spot-validated ✓)
- [ ] AI agent only handles cases that deterministic methods cannot resolve
- [ ] No speculative relationships (citation-first principle maintained)

---

## Related Documentation

- [Phase 6.1: Riksdagen API Migration](./phase-6-riksdagen-api-migration.md)
- [Phase 7: Advanced Insights](./phase-7-advanced-insights.md)
- [Product Roadmap](../PRODUCT_ROADMAP.md)
- [Decision Log](../../DECISION_LOG.md) — 2026-02-11 entry
