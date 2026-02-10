# Phase 5.6: Remissvar Content Insights

## Phase Status

| Step | Description | Status |
|------|-------------|--------|
| 5.6.1 | Schema updates (extraction_status, raw_content, extracted_at) | ✅ COMPLETE |
| 5.6.2 | process-remissvar-pdf edge function | ✅ COMPLETE |
| 5.6.3 | Keyword-based stance detection (with negation + section-scoping) | ✅ APPROVED |
| 5.6.4 | NLP Analysis Pipeline (LLM-based) | 🔲 Deferred |

> **Status:** IN PROGRESS (Phase 5.6.3 Approved, Ready for Implementation)  
> **Owner:** Lovable (Architectural Authority)  
> **Created:** 2026-01-20  
> **Last Updated:** 2026-01-27

## Objective

Enable content-based analysis of remissvar by extracting PDF text and building a foundation for NLP-driven insights using **structural guidance from SB PM 2021:1**.

---

## Current Extraction Status (2026-01-26)

| Status | Count | Percentage | Notes |
|--------|-------|------------|-------|
| **ok** | ~467 | ~14% | Successfully extracted, avg ~9,000 chars |
| **error** | 8 | 0.2% | Scanned/image PDFs without text layer |
| **not_started** | ~2,949 | ~86% | Awaiting batch processing |
| **Total** | 3,424 | 100% | All remissvar PDFs |

### Error Analysis

All 8 extraction errors are **scanned/image-based PDFs** that lack a text layer. This is a **format limitation**, not a pipeline bug.

| Remissvar | Organization | File Size | Error Type |
|-----------|--------------|-----------|------------|
| SOU 2024:78 response | SMHI | 4.0 MB | parse_failed (empty text) |
| SOU 2024:78 response | Uppsala universitet | 645 KB | parse_failed (empty text) |
| SOU 2024:92 response | Sametinget | 867 KB | parse_failed (empty text) |
| SOU 2024:92 response | Sametinget | 718 KB | parse_failed (empty text) |
| SOU 2024:92 response | Sametinget | 434 KB | parse_failed (empty text) |
| SOU 2024:96 response | Sametinget | 1.2 MB | parse_failed (empty text) |
| SOU 2024:96 response | Sametinget | 689 KB | parse_failed (empty text) |
| SOU 2024:96 response | Sametinget | 543 KB | parse_failed (empty text) |

**Root Cause:** These PDFs are scanned documents or image-based files. The `pdf-parse` library extracts text from the PDF text layer, but these files have no text layer—only embedded images.

**Evidence:** File sizes (434 KB to 4 MB) confirm they are not empty. The content exists as images, not extractable text.

**Resolution Path:** Future phase could add OCR capability (e.g., Tesseract.js, Google Vision API) to extract text from scanned documents. Current error rate (0.2%) is acceptable.

---

## Source Documents

| Document | Purpose |
|----------|---------|
| `docs/development/PHASE_5.6_REMISSVAR_TEXT_EXTRACTION_GUIDANCE.md` | Swedish stance keywords, structural anchors |
| SB PM 2021:1 "Svara på remiss" | Official remissvar format guidance |
| `docs/development/branches/phase-5.5-cross-document-insights.md` | Pre-drafted schema (deferred items) |

---

## Sub-Phases

### Phase 5.6.1: Database Schema Deployment

**Status:** ✅ COMPLETE (2026-01-21)  
**Risk:** NONE (additive columns only)

Added extraction infrastructure columns to `remiss_responses`:

```sql
ALTER TABLE remiss_responses 
  ADD COLUMN IF NOT EXISTS extraction_status TEXT DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS raw_content TEXT,
  ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_remiss_responses_extraction_status 
  ON remiss_responses(extraction_status);
```

**Extraction Status Values:**
- `not_started` — Default, never processed
- `pending` — Queued for extraction
- `ok` — Successfully extracted
- `error` — Extraction failed (check `metadata.extraction_error`)
- `skipped` — Intentionally skipped (non-PDF, empty)

---

### Phase 5.6.2: PDF Text Extraction Pipeline

**Status:** ✅ COMPLETE (2026-01-26)  
**Dependencies:** Phase 5.6.1

#### Edge Function: `process-remissvar-pdf`

Extracts text from remissvar PDFs using shared infrastructure:

**Input:**
```json
{
  "response_id": "uuid",       // Optional: single response
  "remiss_id": "uuid",         // Optional: all responses for a remiss
  "limit": 50,                 // Default batch size
  "dry_run": false             // Preview mode
}
```

**Output:**
```json
{
  "processed": 10,
  "extracted": 9,
  "skipped": 0,
  "errors": [{ "response_id": "uuid", "error": "message" }],
  "details": [{ "response_id": "uuid", "filename": "...", "text_length": 8500, "page_count": 12, "extraction_status": "ok" }]
}
```

**Reuse Strategy:**
- `_shared/pdf-extractor.ts` — getPdfExtractorConfig(), extractTextFromPdf()
- `_shared/text-utils.ts` — sanitizeText() for PostgreSQL compatibility
- Pagination pattern from `get-participation-metrics`

#### Admin UI Component: `RemissvarTextExtractorTest.tsx`

Features:
- Real-time counts by `extraction_status` (with pagination for >1000 rows)
- Batch size selector (10, 25, 50, 100)
- **Multi-batch execution** with configurable batch count (1, 5, 10, 25, 50, 100)
- 2-second delay between batches to allow edge function shutdown
- Stop button for interrupting batch processing
- Sample text preview for verification
- Error log display

---

### Phase 5.6.3: Keyword-Based Stance Detection

**Status:** APPROVED (2026-01-27)  
**Dependencies:** Phase 5.6.2 complete with `extraction_status = 'ok'`

#### State Transition Model

Analysis **only runs** on responses where `extraction_status = 'ok'`. Clear dependency chain:

```
extraction_status: not_started → ok/error/skipped
                        ↓
                   (if ok)
                        ↓
analysis_status:   not_started → ok/error/skipped
```

**Analysis Status Values:**
- `not_started` — Default, never analyzed (only eligible if `extraction_status = 'ok'`)
- `ok` — Successfully analyzed, stance determined
- `error` — Analysis failed (logged to metadata)
- `skipped` — Intentionally skipped (text too short, non-Swedish)

#### Schema Extension

```sql
ALTER TABLE remiss_responses 
  ADD COLUMN IF NOT EXISTS stance_summary TEXT,
  ADD COLUMN IF NOT EXISTS stance_signals JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_remiss_responses_analysis_status 
  ON remiss_responses(analysis_status);
```

| Column | Type | Purpose |
|--------|------|---------|
| `stance_summary` | TEXT | Overall stance: support, oppose, conditional, neutral, mixed |
| `stance_signals` | JSONB | Detailed match data: counts, keywords found, section context |
| `analysis_status` | TEXT | Processing state (dependent on extraction_status = ok) |
| `analyzed_at` | TIMESTAMPTZ | Timestamp of analysis completion |

#### Stance Detection Keywords (Swedish) — With Negation Patterns

| Position | Keywords | Negation Patterns |
|----------|----------|-------------------|
| **Support** | `instämmer`, `tillstyrker`, `välkomnar`, `stödjer`, `ställer sig positiv` | — |
| **Opposition** | `motsätter`, `avstyrker`, `avråder`, `invänder`, `ställer sig kritisk` | `inte tillstyrker`, `kan inte stödja`, `inte instämmer` |
| **Conditional** | `med förbehåll`, `under förutsättning`, `i huvudsak positiv`, `villkorat` | — |
| **No Opinion** | `inga synpunkter`, `avstår`, `lämnar inget att erinra`, `ingen erinran` | — |

**Negation Handling:**
- Patterns like `inte tillstyrker` or `kan inte stödja` are classified as **opposition**
- Negation patterns are checked **before** positive patterns to avoid false positives

#### Section-Scoping (SB PM 2021:1 Guidance)

Keywords found in high-priority sections receive **2x weight**:

| Section | Detection Pattern | Weight Multiplier |
|---------|-------------------|-------------------|
| Sammanfattning | `/sammanfattning/i` in heading/first 500 chars | 2.0 |
| Ställningstaganden | `/ställningstagande/i` section header | 2.0 |
| Body text | All other content | 1.0 |

**Implementation:** Extract section boundaries first, then apply weighted keyword matching.

#### Stance Classification Logic

| Condition | Classification |
|-----------|----------------|
| Only `no_opinion` keywords | `neutral` |
| `support` > `oppose` × 2 (weighted) | `support` |
| `oppose` > `support` × 2 (weighted) | `oppose` |
| `conditional` >= both | `conditional` |
| Both `support` AND `oppose` present | `mixed` |
| No keywords found | `neutral` |

**Important:** `neutral` is a **valid output**, not a failure. Many responses legitimately have no opinion or use non-standard phrasing.

#### Shared Module: `_shared/stance-analyzer.ts`

```typescript
export interface StanceSignals {
  support_count: number;
  oppose_count: number;
  conditional_count: number;
  no_opinion_count: number;
  keywords_found: string[];
  section_context: 'summary' | 'stance' | 'body';
  word_count: number;
}

export type StanceSummary = 'support' | 'oppose' | 'conditional' | 'neutral' | 'mixed';
```

#### Edge Function: `analyze-remissvar-stance`

**Query Filter (enforces state dependency):**
```sql
SELECT * FROM remiss_responses
WHERE extraction_status = 'ok'
  AND analysis_status = 'not_started'
LIMIT :limit
```

**Output:**
```json
{
  "processed": 50,
  "analyzed": 48,
  "skipped": 2,
  "summary": { "support": 12, "oppose": 8, "conditional": 15, "neutral": 10, "mixed": 3 }
}
```

#### Admin UI: `RemissvarStanceAnalyzerTest.tsx`

Features:
- Analysis progress stats (only shows responses with `extraction_status = 'ok'`)
- Stance distribution chart (support/oppose/mixed/neutral/conditional)
- Batch controls (reuse pattern from extraction UI)
- Sample keyword matches for verification

#### Entity Page Enhancement (Performance-Aware)

On organization entity pages (`/entity/:id`), show:
- **Stance Summary Card** — Aggregated stance distribution (no raw_content in list)
- **Response List** — Stance badge (color-coded), word count, organization name
- **Expandable "View Analysis"** — Fetches `stance_signals` on demand (not raw_content)

**Performance Rule:** Never render `raw_content` in lists. Use excerpts or on-demand fetch.

---

### Phase 5.6.4: NLP Analysis Pipeline (Future)

**Status:** Deferred until 5.6.3 validated

#### Planned Capabilities

| Capability | Approach | Model Requirement |
|------------|----------|-------------------|
| Sentiment scoring | LLM structured extraction | Lovable AI (Gemini) |
| Key argument extraction | Tool calling with schema | Lovable AI (Gemini) |
| Cross-response comparison | Embeddings + similarity | Consider pgvector |
| Trend detection | Aggregation over time | Batch processing |

---

## Success Criteria

### Phase 5.6.1 (Schema)
- [x] Columns deployed without data loss
- [x] Indexes created for query performance

### Phase 5.6.2 (Extraction)
- [ ] >90% of 3,424 responses successfully extracted
- [x] Error rate <5% (currently 0.2%)
- [x] Extraction time <30 seconds per PDF average
- [x] Admin UI shows extraction progress

### Phase 5.6.3 (Stance Detection)
- [ ] Analysis coverage >90% of extracted responses (`analysis_status = 'ok'`)
- [ ] Manual spot-check (10 random samples) matches expectation
- [ ] Entity pages display stance badges (no raw_content in lists)
- [ ] `neutral` classification treated as valid, not failure

**Note:** "Keyword detection >50%" is NOT a success metric. Many valid responses are `neutral` (no opinion) or use non-standard phrasing.

### Phase 5.6.4 (NLP - Future)
- [ ] Sentiment analysis accuracy >80% vs manual review
- [ ] Key arguments surfaced and verifiable

---

## Data Volume Estimates

| Metric | Estimate | Notes |
|--------|----------|-------|
| Total remissvar | 3,424 | All have PDF URLs |
| Avg PDF size | ~200 KB | Based on sample filenames |
| Avg text length | ~5,000 chars | Estimate from SOU patterns |
| Total extraction time | ~3-4 hours | At 3 sec/PDF |
| Storage increase | ~17 MB | 3,424 × 5,000 chars |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| PDF extraction failures | Use existing error handling from `process-sou-pdf`, store error in metadata |
| Rate limiting by regeringen.se | Add delay between requests (500ms), process in batches |
| Large PDFs causing timeouts | Existing extractor has 60s timeout, mark as `error` and continue |
| Low-value responses (empty, duplicates) | Skip responses <100 chars, flag potential duplicates |

---

## Files to Create/Modify

**New:**
- `supabase/functions/process-remissvar-pdf/index.ts` — Extraction edge function
- `src/components/admin/RemissvarTextExtractorTest.tsx` — Admin UI

**Modify:**
- `src/pages/EntityDetail.tsx` — Add response content section
- `docs/development/PRODUCT_ROADMAP.md` — Update phase status
- `docs/PHASE_DELTAS.md` — Log changes
- `docs/CONTEXT_PRIORITY.md` — Add Phase 5.6 docs

---

## Governance

- **Data Risk:** NONE for 5.6.1-5.6.3 (additive columns, no deletions)
- **Architectural Owner:** Lovable (database changes, edge functions)
- **Approval Required:** Max (scope) + Lovable (architecture) + Codex (execution)

---

## Recommended Execution Order

1. **Debug Phase 5.5.4** — Fix Velocity Dashboard bug first
2. **Phase 5.6.1** — Deploy schema (1 migration, 5 min)
3. **Phase 5.6.2** — Build extraction pipeline (edge function + admin UI, 2-3 hours)
4. **Run extraction** — Process all 3,424 remissvar (3-4 hours batch)
5. **Phase 5.6.3** — Build content MVP (keyword detection using Swedish stance terms, 2 hours)
6. **User feedback** — Erik reviews, validates usefulness
7. **Phase 5.6.4** — NLP pipeline (only if 5.6.3 validated)

---

## Approval Log

| Date | Decision | Approved By |
|------|----------|-------------|
| 2026-01-20 | Phase 5.6 concept brief created | Max, Lovable, Codex |
| 2026-01-27 | Phase 5.6.3 plan approved with corrections | Max |

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-01-20 | Initial concept brief created from guidance doc | Lovable |
| 2026-01-26 | Phase 5.6.2 marked complete, error analysis documented | Lovable |
| 2026-01-27 | Phase 5.6.3 plan refined: added state transitions, negation patterns, section-scoping, UI performance rules, revised success criteria per Max feedback | Lovable |
