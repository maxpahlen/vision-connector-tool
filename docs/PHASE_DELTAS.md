# Phase Deltas

## 2026-02-13: Slice 6A.5 — Direct Corpus Match + Title-Embedded Extraction

**Status:** ✅ DONE

### Changes
- Enhanced `resolve-document-references` with direct `doc_number` lookup before regex extraction
- Catches raw Riksdagen codes (e.g., `H501JuU27`) already in corpus
- Title-embedded patterns (e.g., `"Title, SOU 2025:113"`) now extracted by existing regex

### Results
- **+683 new resolutions** (636 direct_match, 36 dir_pattern, 11 sou_pattern)
- Resolution rate: 37.1% → **45.5%** (2,807 → 3,443 of 7,566)
- Document relationships: 2,152 → **2,788** (+636)
- Remaining unresolved: 4,123 (3,527 extraction failures, 549 corpus gaps)
- True AI-addressable scope: ~565 non-motion title-only refs

### Files Modified
- `supabase/functions/resolve-document-references/index.ts` — Added direct match step
- `docs/development/branches/phase-6-relationship-inference.md` — 6A.5 results added

---

## 2026-02-13: Phase 6A COMPLETE — Deterministic Graph Closed

**Status:** ✅ COMPLETE — All 6A slices done, 6B.1 next

### 6A.4b Hotfix: Reverse Classification Rules

**Problem:** 54 of 112 `references` fallback rows were misclassified due to missing reverse lookup rules (`sou|directive`, `proposition|sou`).

**Fix:** Added reverse rules to `backfill-document-relationships/index.ts`, re-ran idempotently, deleted 54 stale `references` duplicates.

**Final `document_relationships` breakdown (2,152 rows):**

| Type | Count | Confidence |
|---|---|---|
| `committee_report_to_proposition` | 1,496 | 0.95 |
| `proposition_to_committee_report` | 525 | 0.95 |
| `references` (legitimate same-type) | 58 | 0.80 |
| `directive_to_sou` | 55 | 0.90 |
| `remiss_to_sou` | 15 | 0.85 |
| `sou_to_proposition` | 3 | 0.90 |

**Remaining 58 `references`:** 54 directive↔directive (tilläggsdirektiv), 2 sou↔sou, 2 edge cases. All verified legitimate — no missing rules.

**Decision:** `directive_to_directive` enum deferred (no schema churn without downstream need).

### Files Changed

- `supabase/functions/backfill-document-relationships/index.ts` — Added reverse rules
- `docs/development/branches/phase-6-relationship-inference.md` — 6A status → COMPLETE
- `docs/DECISION_LOG.md` — 6A.4b entry updated with hotfix
- `docs/PHASE_DELTAS.md` — This entry

---

## 2026-02-12: Slice 6A.2 Corpus Backfill — COMPLETE

**Status:** ✅ COMPLETE — 1,292 committee reports backfilled, resolver converged at 37.1%

### Results

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Committee reports | 1,850 | 3,142 | +1,292 |
| Total references | 6,801 | 7,566 | +759 |
| Resolved references | 2,181 | 2,807 | +626 |
| Resolution rate | 32.1% | 37.1% | +5.0pp |
| Total documents | 5,497 | 6,790 | +1,292 |

### Sessions Backfilled

- H5 (2017/18): 454 docs
- H6 (2018/19): 334 docs
- H7 (2019/20): 373 docs
- HD (2025/26): 131 docs

### Remaining Unresolved (4,759)

- ~4,163 extraction-failed (motions + free-text titles → Phase 7 / 6B)
- ~549 extracted-but-no-corpus-match (pre-2015, 2025+ SOUs, Ds, FPM)
- 1 Bet. edge case

### Next Steps

- 6A.3: Process linkage (cluster orphan docs into processes)
- 6A.4: `document_relationships` M2M schema

---

## 2026-02-12: Phase 6A.2 Scope Decisions

**Status:** ✅ APPROVED — Motions deferred, backfill range set

### Decisions

1. **Motions (Mot.) deferred to Phase 7** — 2,820 unresolved refs (60.7%) are parliamentary motions. Not ingested now; documented as known gap. Future `doktyp=mot` plan scoped for Phase 7 if product need emerges.
2. **Committee report backfill: H5–H7 + HD (2017–2026)** — Covers sessions missing from corpus that account for ~1,278 unresolved Bet. references. H3–H4 (2013–2017) deferred.
3. **Title-matching heuristic rejected** — Only ~50 addressable free-text titles; high false-positive risk. Not worth implementing.

### Refined Unresolved Reference Breakdown (post-6A.1)

| Category | Count | Path |
|----------|-------|------|
| Motions (Mot.) | 2,820 | Phase 7 |
| Bet. not in corpus | 1,278 | 6A.2 backfill |
| SOU/Prop/Dir not in corpus | 385 | 6A.2 corpus growth |
| Title-only (non-Mot.) | 126 | Phase 6B (AI) |
| Other (dossiers, Ds, FPM, HTML) | 35 | Out of scope |

---

## 2026-02-10: Admin UI Phase A Cleanup — COMPLETE

**Status:** ✅ COMPLETE — Workflow-based tab architecture implemented

### Summary

Restructured Admin UI from 9 phase/source-based tabs to 6 workflow-based tabs: Dashboard, Scraping, Extraction, Agents, Monitoring, System. Added run-order guidance cards to each workflow tab.

### Changes

| Action | Component | Destination |
|--------|-----------|-------------|
| Kept | ValidationDashboard | Dashboard tab |
| Moved | All scrapers | Scraping tab |
| Moved | All text extractors | Extraction tab |
| Moved | All AI agents + entity linking | Agents tab |
| Moved | TaskQueueMonitor, ProcessList, DocumentList | Monitoring tab |
| Moved | StateMachineTest | System tab |
| Archived | 10 legacy components | `src/components/admin/_archive/` |

### Archived Components

- PropositionScraperTest.tsx (superseded by PropositionRiksdagenScraperTest)
- DirectiveMetadataScraper.tsx (superseded by DirectiveRiksdagenScraperTest)
- PropositionTextExtractorTest.tsx (superseded by BatchTextExtractor)
- PropositionBatchProcessor.tsx (superseded by BatchTextExtractor)
- RemissScraperTest.tsx (superseded by RemissIndexScraperTest)
- SouUrlRepairTool.tsx (one-time repair, no longer needed)
- SouLagstiftningskedjaScraper.tsx (superseded by head-detective agent)
- IntegrationTest.tsx (unused)
- ScraperTest.tsx (unused)
- TimelineAgentTest.tsx (v1, superseded by TimelineAgentV2Test)

### Files Modified

- `src/pages/AdminScraper.tsx` — Rewritten with 6-tab workflow architecture
- `src/components/admin/_archive/` — 10 components archived
- `docs/verification/LOVABLE_ADMIN_UI_CLEANUP_PLAN_2026-02-10.md` — Execution log updated

---

## 2026-02-10: Phase 1.2 — `process-directive-text` Edge Function Created

**Status:** ✅ COMPLETE — Function deployed, ready for batch execution

### Summary

Created `process-directive-text` edge function to extract text content for 127 Riksdagen-sourced directives that lack `pdf_url`. Uses the `.text` endpoint (dot format, not slash) confirmed via existing `scrape-laws/index.ts`.

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `.text` endpoint (not `/text`) | Confirmed correct format from working `scrape-laws` code |
| `stripHtmlTags()` inline | `.text` returns HTML-formatted content unlike laws which skip HTML entirely |
| Client-side source filter | PostgREST JSONB filtering can be unreliable; filter `metadata.source = 'riksdagen'` in code |
| Shared `sanitizeText()` reuse | Consistent text cleaning across all extraction pipelines |

### Files Created/Modified

- `supabase/functions/process-directive-text/index.ts` — NEW edge function
- `supabase/config.toml` — Added function entry
- `docs/verification/LOVABLE_FIXES_EXECUTION_REPORT_2026-02-04.md` — Phase 1.2 status updated
- `docs/PHASE_DELTAS.md` — This entry

### Next Steps

1. Max triggers batch extraction: `{ "limit": 20 }` (start small, verify output quality)
2. Verify success criteria: `SELECT COUNT(*) FROM documents WHERE doc_type = 'directive' AND raw_content IS NULL AND metadata->>'source' = 'riksdagen';`

---

## 2026-01-30: Phase 6 Riksdagen API Migration — Progress Update

**Status:** IN PROGRESS — Pilot scrapers complete, extraction verified

### Summary

Phase 6 migrates Propositions and Directives ingestion from regeringen.se HTML scraping to the riksdagen.se Open Data API. Today completed kommittébeteckning extraction fix and verified committee report PDF extraction pipeline.

### Completed Today

| Component | Status | Details |
|-----------|--------|---------|
| Kommittébeteckning Fix | ✅ COMPLETE | Extraction now uses `tempbeteckning` → `dokuppgift` → `subtitel` fallback chain |
| Committee Report Extraction | ✅ PILOT COMPLETE | 3 docs extracted (129, 48, 144 pages) via PDF extractor |
| CONTEXT_PRIORITY.md | ✅ UPDATED | Reflects current Phase 6 status |

### Kommittébeteckning Extraction Fix

**Problem:** Directives scraped from riksdagen.se returned `null` for kommittébeteckning (committee designation).

**Root Cause:** The API stores committee designations in `tempbeteckning` field, not `dokuppgift.kommittebeteckning` as initially assumed.

**Solution:** Updated `extractKommittebeteckning()` with fallback chain:

```typescript
// 1. Primary: tempbeteckning field (e.g., "I 2020:01")
const tempbet = status.dokumentstatus.dokument.tempbeteckning;
if (tempbet?.trim()) return tempbet.trim();

// 2. Fallback: dokuppgift.kommittebeteckning
const uppgifter = normalizeArray(status.dokumentstatus.dokuppgift?.uppgift);
const kommitte = uppgifter.find(u => u.kod === "kommittebeteckning");
if (kommitte?.text) return kommitte.text;

// 3. Fallback: Parse from subtitel (e.g., "kommittébeteckning: I 2020:01")
const subtitel = status.dokumentstatus.dokument.subtitel;
const match = subtitel?.match(/kommitt[eé]beteckning:\s*([A-Za-zÅÄÖåäö]+\s*\d{4}:\d+)/i);
return match ? match[1].trim() : null;
```

**Validation:** 2020 session tested — 5/5 tilläggsdirektiv correctly extracted kommittébeteckning.

### Committee Report PDF Extraction

**Pipeline:** Riksdagen PDF URL → PDF Extractor Service (Vercel) → Database

**Pilot Results:**

| Document | Pages | Characters | Status |
|----------|-------|------------|--------|
| HC01MJU14 | 129 | 355,004 | ✅ ok |
| HC01JuU10 | 48 | 106,032 | ✅ ok |
| HC01FöU4 | 144 | 399,392 | ✅ ok |

**Prerequisite:** PDF extractor service redeployed to Vercel with `data.riksdagen.se` in domain allowlist.

### Phase 6 Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| 6.1 Propositions Scraper | ✅ PILOT COMPLETE | 10 docs ingested |
| 6.2 Directives Scraper | ✅ PILOT COMPLETE | 10 docs ingested, kommittébeteckning fixed |
| Committee Report Extraction | ✅ PILOT COMPLETE | 3 docs extracted |
| Historical Backfill Props | 🔲 PENDING | 31,598 available |
| Historical Backfill Dirs | 🔲 PENDING | 6,361 available |
| Batch Committee Extraction | 🔲 PENDING | 330 remaining |

### Files Changed

- `supabase/functions/scrape-directives-riksdagen/index.ts` — Kommittébeteckning fallback chain
- `docs/CONTEXT_PRIORITY.md` — Phase 6 status update
- `docs/PHASE_DELTAS.md` — This entry

### Next Steps

1. Run batch extraction on remaining 330 committee reports
2. Historical backfill: 2024/25 propositions (full session)
3. Historical backfill: 2020+ directives (kommittébeteckning validation)
4. Update branch doc: `phase-6-riksdagen-api-migration.md`

---

## 2026-01-28: Phase 5.4 Committee Reports + Laws — COMPLETE

**Status:** ✅ COMPLETE — All scrapers operational, data validated

### Final Metrics

| Data Type | Count | Details |
|-----------|-------|---------|
| Committee Reports | 333 | All with PDF URLs, riksmöte 2024/25 |
| Laws (SFS) | 161 | All with extracted text, year 2024 |
| Document References | 221 | `recommends` type (betänkande → proposition) |
| Timeline Events | 327 | `parliament_decision` events |
| Missing Metadata | 0 | ✅ All records healthy |

### Bug Fixed: `refs.filter is not a function`

**Root Cause:** Riksdagen API returns a single object (not array) when there's only one `referens`, `aktivitet`, or `bilaga` entry. The code assumed arrays.

**Fix:** Added `Array.isArray()` guards to all extraction functions:
```typescript
const rawRefs = status.dokumentstatus.dokreferens?.referens;
const refs = rawRefs == null ? [] : Array.isArray(rawRefs) ? rawRefs : [rawRefs];
```

### Reliability Improvements

- Browser-like fetch headers (`User-Agent`, `Accept`, `Accept-Language`, `Connection: keep-alive`)
- Exponential backoff with jitter (5 retries, 3s-24s delays)
- Connection resets classified as `503 upstream_unavailable`
- Initial 1s delay before first upstream request

### Laws Text Backfill Feature

Added "Backfill Text" button to Laws scraper UI to re-fetch `raw_content` for existing laws where extraction initially failed.

### Files Changed

- `supabase/functions/scrape-committee-reports/index.ts` — Array guards, resilience
- `supabase/functions/scrape-laws/index.ts` — Backfill mode, text extraction headers
- `src/components/admin/LawsScraperTest.tsx` — Backfill UI
- `docs/development/SCRAPER_KNOWN_ISSUES.md`
- `docs/development/branches/phase-5.4-committee-reports-laws.md`

---

## 2026-01-27: Phase 5.4 Research — riksdagen.se API Patterns

**Status:** RESEARCH COMPLETE — Implementation done

### Summary

Researched riksdagen.se Open Data API for Committee Reports (betänkanden) and Laws (SFS).

### Key Findings

| Aspect | Committee Reports | Laws (SFS) |
|--------|------------------|------------|
| Query param | `doktyp=bet` | `doktyp=sfs` |
| Session format | `rm=2024/25` | `rm=2024` |
| Volume (sample) | 333 docs (2024/25) | 161 docs (2024) |
| dok_id format | `HC01SkU18` | `sfs-2024-1373` |
| PDF available | Yes, via `dokumentstatus` | Text via URL |

### API Structure

**Base URL:** `https://data.riksdagen.se/dokumentlista/?doktyp={type}&rm={session}&utformat=json`

**Document Status:** `https://data.riksdagen.se/dokumentstatus/{dok_id}.json`

### Files Created

- `docs/development/branches/phase-5.4-committee-reports-laws.md`

---

## 2026-01-27: Phase 5.6.3 Stance Detection — COMPLETE

**Status:** COMPLETE — Keyword-based stance detection deployed and validated

### Summary

Implemented Swedish keyword-based stance detection for remissvar documents using SB PM 2021:1 guidance.

### Implementation

- Edge function: `analyze-remissvar-stance`
- Keywords: Swedish stance terms (instämmer, tillstyrker, avstyrker, etc.)
- Outputs: `stance_summary` (support/oppose/mixed/neutral), `stance_signals` (JSONB)
- Admin UI: Batch controls with live distribution chart

### Validation

- Live batch of 50 processed successfully
- Distribution: 23 Support, 19 Neutral, 5 Mixed, 3 Oppose
- `analysis_status = 'ok'` for all processed

---

## 2026-01-27: Phase 5.6.4 AI Stance Classification — Paginated Accumulation Fix

**Status:** COMPLETE — Windowing bug root cause identified and fixed

### Problem: "No responses to classify" despite 1,018 pending

The Admin UI showed ~1,018 pending AI classification items, but running the classifier returned "No eligible responses found" or processed only 1 item when batch size was 10-20.

### Root Cause: Deterministic Windowing Bug

The edge function fetched candidates ordered by `created_at ASC` with a fixed overfetch factor (`limit * 3`). However:

| Finding | Value |
|---------|-------|
| First 60 candidates | 60/60 were neutral WITH keywords (ineligible) |
| First eligible row | Position 62 in ordered dataset |
| Batch size 20 | Fetches 60 candidates → 0 eligible |
| Batch size 10 | Fetches 30 candidates → 0 eligible |

**Eligibility rules (client-side):**
- `stance_summary = 'mixed'` (always eligible)
- OR `stance_summary = 'neutral'` with `keywords_found.length = 0`
- AND `metadata.ai_review` is null

The ineligible neutral rows (with keywords_found > 0) formed a blocking prefix that the fixed overfetch factor couldn't bridge.

### Prior Attempts (and why they failed)

| Attempt | Change | Result |
|---------|--------|--------|
| Remove `.is("metadata->ai_review", null)` | Removed PostgREST nested JSONB filter | Fixed one bug, but didn't address windowing |
| Add stance_summary prefilter | Added `.in("stance_summary", ["neutral","mixed"])` | Reduced candidate pool but still hit blocking prefix |
| Increase overfetch to `limit * 3` | Fetched 3x requested limit | Still insufficient when eligible starts at row 62+ |

### Solution: Paginated Accumulation Loop

Replaced fixed overfetch with a pagination loop:

```typescript
const MAX_PAGES = 10;
const PAGE_SIZE = 100;

while (eligibleResponses.length < effectiveLimit && page < MAX_PAGES) {
  const candidates = await fetchPage(page * PAGE_SIZE, PAGE_SIZE);
  for (const row of candidates) {
    if (isEligible(row)) eligibleResponses.push(row);
    else skippedIneligible++;
    if (eligibleResponses.length >= effectiveLimit) break;
  }
  page++;
}
```

**Constants:**
- `MAX_PAGES = 10` — Hard cap to prevent runaway scans
- `PAGE_SIZE = 100` — Candidates per page
- `maxScanned = 1000` — Total rows scanned before stopping

### Telemetry Added

Response now includes visibility into the scanning process:

```json
{
  "telemetry": {
    "scanned_total": 100,
    "eligible_found": 10,
    "skipped_ineligible": 62,
    "pages_fetched": 1
  }
}
```

### Validation Results

Dry-run with `limit=5`:
- Scanned: 100 candidates
- Skipped: 62 ineligible (neutral with keywords)
- Found: 5 eligible
- Pages: 1

### Files Changed

- `supabase/functions/classify-stance-ai/index.ts` — Pagination loop + telemetry
- `supabase/functions/classify-stance-ai/index.test.ts` — Unit test outline (7 tests)

### Future Improvement (Medium-term)

Add `keywords_found_count INTEGER` column to `remiss_responses` (computed during analysis step) to make eligibility fully indexable at the database level, eliminating client-side filtering entirely.

---

## 2026-01-27: Phase 5.6.3 Plan Approved with Corrections

**Status:** APPROVED — Ready for implementation

### Key Corrections Applied (per Max feedback)

| Area | Original | Corrected |
|------|----------|-----------|
| **State transitions** | Implicit dependency | Explicit: `extraction_status = ok` → eligible for `analysis_status` |
| **Negation patterns** | Not included | Added: `inte tillstyrker`, `kan inte stödja`, `inte instämmer` → classified as opposition |
| **Section-scoping** | Flat text matching | Keywords in "Sammanfattning"/"Ställningstaganden" receive 2x weight |
| **UI performance** | `raw_content` in entity lists | Excerpt/on-demand fetch only; no full text in lists |
| **Success criteria** | "Keyword detection >50%" | Removed arbitrary threshold; `neutral` is valid, not failure |

### Implementation Components

1. **Schema:** Add `stance_summary`, `stance_signals`, `analysis_status`, `analyzed_at` to `remiss_responses`
2. **Shared module:** `_shared/stance-analyzer.ts` with negation patterns + section weighting
3. **Edge function:** `analyze-remissvar-stance` (only processes `extraction_status = ok`)
4. **Admin UI:** `RemissvarStanceAnalyzerTest.tsx` with batch controls
5. **Entity page:** Stance summary card + badges (no raw_content rendering)

### Files Modified
- `docs/development/branches/phase-5.6-content-insights.md` — Full plan update

---

## 2026-01-26: Phase 5.6.2 Extraction Pipeline Validation + Error Analysis

**Status:** Extraction pipeline validated, error analysis complete.

### Extraction Progress

| Status | Count | Percentage |
|--------|-------|------------|
| ok | ~467 | ~14% |
| error | 8 | 0.2% |
| not_started | ~2,949 | ~86% |

### Error Analysis: Scanned PDFs (Known Limitation)

All 8 extraction errors are **scanned/image-based PDFs** without a text layer:

| Organization | Count | File Size Range |
|--------------|-------|-----------------|
| Sametinget | 5 | 434 KB - 1.2 MB |
| SMHI | 1 | 4.0 MB |
| Uppsala universitet | 1 | 645 KB |
| Other | 1 | ~700 KB |

**Root Cause:** PDFs are scanned documents (images embedded in PDF wrapper). The `pdf-parse` library cannot extract text from images—it requires a text layer.

**Resolution Path:** Future phase could add OCR (Tesseract.js, Google Vision API). Current 0.2% error rate is acceptable.

### Admin UI Improvements

- **Pagination fix:** Stats now fetch all rows (cursor-based pagination beyond 1000-row limit)
- **Multi-batch execution:** Run 1-100 sequential batches with configurable count
- **Auto-shutdown:** 2-second delay between batches allows edge function to restart
- **Stop button:** Interrupt ongoing batch processing

### Files Modified
- `src/components/admin/RemissvarTextExtractorTest.tsx` — Pagination + multi-batch UI
- `docs/development/branches/phase-5.6-content-insights.md` — Error analysis, status update

---

## 2026-01-21: Phase 5.6.2 process-remissvar-pdf Edge Function Deployed

**Phase 5.6.2 Complete:** Remissvar PDF text extraction edge function created and deployed.

### New Edge Function
- `supabase/functions/process-remissvar-pdf/index.ts`

### Features
- Extracts text from `remiss_responses` PDFs using shared `pdf-extractor.ts`
- Sanitizes extracted text via `text-utils.ts`
- Updates `extraction_status`, `raw_content`, `extracted_at` columns
- Supports `response_id`, `remiss_id`, `limit`, and `dry_run` parameters
- Skip logic for non-PDF files with proper status tracking

### API Contract
```typescript
// Input
{ response_id?: string, remiss_id?: string, limit?: number, dry_run?: boolean }

// Output
{ processed: number, extracted: number, skipped: number, errors: [], details: [] }
```

### Files Created/Modified
- `supabase/functions/process-remissvar-pdf/index.ts` — New edge function
- `supabase/config.toml` — Added function config
- `docs/development/branches/phase-5.6-content-insights.md` — Updated status

---

## 2026-01-21: Phase 5.6.1 Schema Deployed

**Phase 5.6.1 Complete:** Remissvar extraction infrastructure added.

### Schema Changes
- `remiss_responses.extraction_status` — TEXT, default 'not_started'
- `remiss_responses.raw_content` — TEXT for extracted PDF text
- `remiss_responses.extracted_at` — TIMESTAMPTZ
- Index: `idx_remiss_responses_extraction_status`

### Extraction Status Values
- `not_started` — Default, never processed
- `pending` — Queued for extraction
- `ok` — Successfully extracted
- `error` — Extraction failed
- `skipped` — Intentionally skipped (non-PDF, empty)

### Next Steps
- Phase 5.6.2: Build `process-remissvar-pdf` edge function
- Admin UI: `RemissvarTextExtractorTest.tsx`

---

## 2026-01-21: Ministry Single Source of Truth Fix

**Architectural Decision:** `documents.ministry` is now the single source of truth for all ministry data.

### Problem Solved
- `/document/:id` showed correct ministry (from `documents.ministry`)
- `/process/:id` showed "Okänt departement" (from stale `processes.ministry`)
- `/insights/velocity` showed "Okänt departement" (only looked for `directive` role)

### Solution Implemented
1. **ProcessDetail.tsx:** Derives ministry from linked documents via `process_documents` with priority: directive > sou > proposition
2. **get-velocity-metrics edge function:** Extended to query `directive`, `main_sou`, and `sou` roles with priority-based selection

### Files Modified
- `src/pages/ProcessDetail.tsx` — Added `derivedMinistry` useMemo
- `supabase/functions/get-velocity-metrics/index.ts` — Extended ministry lookup
- `docs/PHASE_DELTAS.md` — This entry

---

## 2026-01-21: Ministry Single Source of Truth Fix

**Objective:** Establish `documents.ministry` as the canonical source for ministry data across all pages

**Problem:**
- `/document/:id` displayed correct ministry (read from `documents.ministry`)
- `/process/:id` displayed "Okänt departement" (read from stale `processes.ministry`)
- `/insights/velocity` missed processes without `directive` role but with `main_sou`

**Solution - Normalization (derive at query time):**

**Frontend (`src/pages/ProcessDetail.tsx`):**
- Added `useMemo` hook to derive ministry from linked documents
- Priority chain: `directive.ministry` → `sou.ministry` → `proposition.ministry` → `null`
- Removed dependency on `processes.ministry`

**Backend (`supabase/functions/get-velocity-metrics/index.ts`):**
- Expanded `process_documents` query to include roles: `directive`, `main_sou`, `sou`
- Implemented priority-based selection (directive=1, main_sou=2, sou=3)
- Fallback chain: document ministry → `processes.ministry` → "Okänt departement"

**Architectural Decision:**
- `documents.ministry` is the single source of truth
- All consumers derive ministry via `process_documents` joins
- `processes.ministry` is legacy; not updated, only used as last fallback

**Files Modified:**
- `src/pages/ProcessDetail.tsx` - derive ministry from documents
- `supabase/functions/get-velocity-metrics/index.ts` - multi-role priority lookup

**Status:** COMPLETE

---

## 2026-01-20: Phase 5.5.4 Velocity Dashboard Bug Fix

**Objective:** Fix "Okänt departement" bug in Velocity Dashboard

**Root Cause:**
- `processes.ministry` field was almost entirely NULL (1/127 populated)
- `documents` table had correct ministry data for 56 directives

**Solution:**
- Modified `get-velocity-metrics` edge function to source ministry from directive documents
- Lookup chain: `timeline_events.source_url` → `documents.ministry` (where doc_type='directive')
- Fallback: `processes.ministry` → "Okänt departement"

**UI Changes:**
- Renamed dashboard title from "Processens Hastighet" to "Remissperioder"
- Clarified description to "Tid från direktiv utfärdat till remissdeadline"

**Files Modified:**
- `supabase/functions/get-velocity-metrics/index.ts`
- `src/pages/VelocityDashboard.tsx`
- `docs/development/branches/phase-5.5-cross-document-insights.md`

**Status:** Phase 5.5.4 now COMPLETE

---

## 2026-01-20: Phase 5.5.3 Participation Dashboard MVP ✅ COMPLETE

**Objective**: Deliver minimal, reliable participation metrics dashboard

### Scope

**In Scope:**
- Fix 1000-row aggregation bug via edge function pagination
- Entity page remiss participation display
- Uninvited response visibility metric
- Participation rate formula clarity in UI
- Dashboard navigation entry in Header
- Organization search/filter
- Breadcrumb navigation fix

**Explicitly Out of Scope (Phase 5.6+):**
- Ministry filter, export functionality
- Response content extraction pipeline, NLP/sentiment analysis
- Longitudinal trend analysis

### Implementation Summary

| Task | Status | Details |
|------|--------|---------|
| Edge function pagination | ✅ | `get-participation-metrics` fetches all rows via pagination loop |
| Entity participation display | ✅ | Remissvar + Inbjudningar sections on org entity pages |
| Uninvited responses | ✅ | "Oinbjudna svar" column with tooltip explanation |
| Formula clarity | ✅ | Tooltips: "Svarsfrekvens = Svar / Inbjudningar × 100%" |
| Navigation entry | ✅ | "Insikter" link added to Header |
| Organization search | ✅ | Case-insensitive filter with debounce |
| Breadcrumb fix | ✅ | `navigate(-1)` for browser history navigation |

### Critical Bug Fixed

**Problem:** Edge function used direct Supabase queries limited to 1000 rows, causing:
- Total responses: 1000 (actual: 3424)
- Total invites: 1000 (actual: 4321)
- Per-org counts: Truncated

**Solution:** Implemented pagination loop in edge function:
```typescript
while (true) {
  const { data } = await supabase
    .from("remiss_responses")
    .range(offset, offset + pageSize - 1);
  if (!data || data.length === 0) break;
  allResponses.push(...data);
  offset += pageSize;
}
```

### Validation Results

| Metric | Before Fix | After Fix | DB Truth |
|--------|------------|-----------|----------|
| Total Responses | 1000 | 3424 | 3424 ✅ |
| Total Invites | 1000 | 4321 | 4321 ✅ |
| SKR Responses | ? | 38 | 38 ✅ |
| SKR Invites | ? | 42 | 42 ✅ |

### Files Changed

- `supabase/functions/get-participation-metrics/index.ts` — New edge function with pagination
- `src/hooks/useParticipationMetrics.ts` — Invoke edge function instead of direct queries
- `src/pages/ParticipationDashboard.tsx` — Uninvited column, tooltips, search filter, Swedish strings
- `src/pages/EntityDetail.tsx` — Remissvar + Inbjudningar sections for organizations
- `src/pages/DocumentDetail.tsx` — Breadcrumb navigation fix
- `src/components/layout/Header.tsx` — "Insikter" navigation link

### Remaining Items (Non-blocking)

- English UI strings in `DocumentDetail.tsx` (minor i18n issue, separate task)

---

## 2026-01-20: Phase 5.5.4 Velocity Dashboard 🔧 NEEDS DEBUGGING

**Objective**: Display process velocity metrics by ministry

### Implementation Status

**Built:**
- Edge function `get-velocity-metrics` with pagination
- Route `/insights/velocity`
- Hook `useVelocityMetrics.ts`
- Ministry velocity comparison table

**Bug Reported:**
- Bug identified by Max on 2026-01-20
- Status: NEEDS DEBUGGING (not blocking other work)
- Specific issue: TBD (requires investigation)

### Files Changed

- `supabase/functions/get-velocity-metrics/index.ts` — New edge function
- `src/hooks/useVelocityMetrics.ts` — New hook
- `src/pages/VelocityDashboard.tsx` — New page
- `src/App.tsx` — Route added

### Next Steps

- Debug velocity metrics calculation
- Verify edge function returns correct data
- Phase 5.6: Response Content Insights (requires PDF extraction pipeline)

---

## 2026-01-19: Phase 5.5.2 Directive-SOU Linking ✅ COMPLETE

**Objective**: Create explicit directive → SOU relationships by parsing citations

### Results

**Final Link Count:** 8 directive→SOU links (5 `fulfills` + 3 `cites`)

| # | Directive | SOU | Type | Semantic |
|---|-----------|-----|------|----------|
| 1 | Dir. 2025:103 | SOU 2024:78 | fulfills | ✅ Strong |
| 2 | Dir. 2025:105 | SOU 2024:88 | fulfills | ✅ Strong |
| 3 | Dir. 2025:31 | SOU 2024:87 | cites | Reclassified (weak) |
| 4 | Dir. 2025:51 | SOU 2025:1 | fulfills | ✅ Strong |
| 5 | Dir. 2025:60 | SOU 2025:20 | fulfills | ✅ Strong |
| 6 | Dir. 2025:64 | SOU 2025:12 | cites | Reclassified (weak) |
| 7 | Dir. 2025:77 | SOU 2025:8 | fulfills | ✅ Strong |
| 8 | Dir. 2025:82 | SOU 2025:46 | cites | Reclassified (weak) |

**Why Low Yield (8 from 126 documents)?**
- Corpus contains only Dir. 2025:XX (108 directives) and 18 SOUs
- Legislative chains span 2-4 years; SOUs cite 2021-2024 directives (not in corpus)
- All 8 valid pairs where BOTH documents exist were linked

### Files Changed
- `docs/development/branches/phase-5.5-cross-document-insights.md` — Phase 5.5.2 section updated with full results
- Database: 8 `document_references` rows created (5 fulfills, 3 cites)

### Next Steps
- Phase 5.5.3: Minimal Insights MVP (participation dashboard, velocity metrics)

---

## 2026-01-19: Phase 5.5.1 Reference Resolution ✅ COMPLETE

**Objective**: Resolve existing document references within corpus

### Results
- **Before:** 587 references, 74 resolved (12.6%)
- **After:** 587 references, 76 resolved (12.9%)
- **Net gain:** 2 newly resolved references

Resolution limited by corpus size, not logic. 446 references point to documents outside corpus (SOUs from 2021-2023, older propositions).

---

## 2026-01-15: Phase 2.7.10 Entity Deduplication & Quality Fixes ✅ COMPLETE

**Objective**: Address data quality issues from Entity Linking Audit

### Accomplishments

1. **Fixed possessive 's' stripping** (`organization-matcher.ts`):
   - Expanded `KEEP_TRAILING_S` exception list with 40+ entries
   - Covers English words (access, friends, defenders, systems, etc.)
   - Covers Swedish agency endings (*analys, *fastighets)
   - Covers company names (Bofors, Siemens, Mercedes)

2. **Repaired truncated entities** (17 total):
   - 3 renamed directly (BAE Systems Bofors, EURENCO Bofors, FLIR Systems)
   - 14 merged (references moved to correct entity, duplicates deleted)
   - Examples: Hi3G Acces → Hi3G Access AB, Trafikanaly → Trafikanalys

3. **Linked all invitees to entities**:
   - 4,321 invitees → 100% linked
   - All high confidence matches
   - 99.98% exact match (similarity = 1.0)
   - Enables "invited vs responded" analytics

### Final Metrics

| Metric | Before | After |
|--------|--------|-------|
| Duplicate entity groups | 45 | 0 |
| Truncated entities | 17 | 0 |
| Invitees linked | 0% | 100% |
| Responses linked | 99.91% | 99.91% |
| Total org entities | ~1,500 | 1,473 |

### Files Changed
- `supabase/functions/_shared/organization-matcher.ts` - KEEP_TRAILING_S expansion
- `supabase/functions/link-invitee-entities/index.ts` - New edge function
- `src/components/admin/RemissEntityLinkerTest.tsx` - Link Invitees UI tab
- `docs/development/ENTITY_DEDUPLICATION_PLAN.md` - Marked complete
- Database: 14 orphaned entities deleted, 3 renamed

---

## 2026-01-15: Phase 2.7.9.4 Abbreviation & Stem Matching

---

## 2026-01-15: Phase 2.7.9.3 Entity Cache Pagination Fix

**Problem**: Entity cache in `organization-matcher.ts` was limited to 1000 entities due to Supabase's default row limit, causing entities beyond row 1000 (like "Teracom AB" at row 1224) to be invisible to the matcher.

**Root Cause**: Supabase has a hard 1000-row default limit on queries. Neither `.limit(5000)` nor `.range(0, 4999)` bypasses this limit with a single query.

**Fix Applied** (`organization-matcher.ts` lines 315-347):
1. Implemented pagination loop with `PAGE_SIZE = 1000`
2. Fetches entities page-by-page using `.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)`
3. Concatenates pages until `pageData.length < PAGE_SIZE`
4. Logs page count for verification

**Result**: 
- Cache now loads all 1430 organization entities (2 pages)
- "Teracom" and "Teracom AB" now both match with `high` confidence

**Verified**:
```sql
SELECT id, responding_organization, match_confidence, entity_id 
FROM remiss_responses WHERE responding_organization ILIKE '%teracom%'
-- Both entries now linked to entity_id: db00b96d-... with match_confidence: high
```

---

## 2026-01-15: Phase 2.7.9.2 Hyphen-Space DB Lookup Fix

**Problem**: Hyphen normalization in `calculateSimilarity` was working, but DB exact-match lookup still failed because `ILIKE` doesn't normalize "Dals Eds kommun" to match "Dals-Eds kommun".

**Root Cause**: The exact match query at line 262-267 used `.ilike('name', normalizedName)` which does a literal case-insensitive match but doesn't treat space/hyphen as equivalent.

**Fix Applied** (`organization-matcher.ts` lines 278-302):
1. Added second lookup stage using wildcard pattern: `normalizedName.replace(/[\s-]+/g, '%')`
2. Pattern converts "Dals Eds kommun" → "Dals%Eds%kommun" which matches "Dals-Eds kommun"
3. Added verification check to ensure pattern match is truly equivalent (strips both space/hyphen and compares)

**Result**: "Dals Eds kommun" now correctly matches "Dals-Eds kommun" with `confidence: high`.

**Verified**:
```sql
SELECT entity_id, entity_name, match_confidence FROM remiss_responses 
WHERE normalized_org_name = 'Dals Eds kommun'
-- entity_id: 30e2ba87-..., entity_name: Dals-Eds kommun, match_confidence: high
```

---

## 2026-01-15: Phase 2.7.9.1 Hyphen Normalization Fix + Unit Tests

**Problem**: "Dals Eds kommun" still matching "Munkedals kommun" instead of "Dals-Eds kommun" due to missing `.toLowerCase()` in similarity comparison.

**Fixes Applied**:

1. **Case-insensitive normalization** (`organization-matcher.ts`):
   - Added `.toLowerCase()` to `normalizeForComparison()` in `calculateSimilarity`
   - Now applies BEFORE all comparisons (exact match, substring, bigram)

2. **Debug logging** for normalized strings:
   - Logs both normalized inputs to verify correct comparison

3. **Unit tests** (`organization-matcher.test.ts` - NEW):
   - Hyphen vs space normalization (Dals-Eds regression test)
   - Case insensitivity
   - Substring ratio gating (Teracom vs false positives)
   - Possessive 's' exceptions (Nitus)

4. **Exported `calculateSimilarity`** for testability

**Files Changed**:
- `supabase/functions/_shared/organization-matcher.ts`
- `supabase/functions/_shared/organization-matcher.test.ts` (new)
- `docs/PHASE_DELTAS.md`

**Safety Guard**: Defense-in-depth guard at line 201-206 in `link-remissvar-entities/index.ts` already prevents overwriting linked rows.

---

## 2026-01-14: Phase 2.7.9 Matcher Refinements + Pending Review Mode (EXECUTION)

**Problem**: After Phase 2.7.7 deployment, verification revealed:
- Rows with `medium`/`low` confidence weren't being reprocessed when matcher improved
- Possessive 's' stripping too aggressive ("Nitus" → "Nitu")
- Need visibility into substring matching path for debugging

**Fixes Applied**:

1. **New Reprocess Mode** (`link-remissvar-entities/index.ts`):
   - Added `reprocess_mode='pending_review'` that includes `medium`, `low`, and `unmatched`
   - Allows improved matcher to re-evaluate previously-processed rows

2. **Possessive 's' Stripping Refinement** (`organization-matcher.ts`):
   - Increased minimum length from 4 to 6 chars (protects "Nitus")
   - Expanded exception list with Latin/proper names

3. **Debug Logging** (`organization-matcher.ts`):
   - Added explicit logging in `calculateSimilarity()` for substring matching path
   - Shows ratio, token boundary check result, and final decision

4. **UI Updates** (`EntityMatchApprovalQueue.tsx`):
   - Added "Re-match Pending Review" button
   - Updated stats to show distinct `unprocessed` bucket
   - Updated `handleReprocess` type signature

**Files Changed**:
- `supabase/functions/_shared/organization-matcher.ts`
- `supabase/functions/link-remissvar-entities/index.ts`
- `src/components/admin/EntityMatchApprovalQueue.tsx`
- `docs/PHASE_DELTAS.md`

**Verification Steps**:
1. Click "Re-match Pending Review" button
2. Check edge function logs for substring matching debug output
3. Verify Dals Eds kommun → Dals-Eds kommun (high confidence)
4. Verify Teracom → Teracom AB (high confidence)
5. Verify Nitus stays as "Nitus" (not stripped)

---

## 2026-01-14: Phase 2.7.7 Entity Matching Algorithm Fixes + Reprocess UI (EXECUTION)

**Problem**: Critical false positives in entity matching algorithm caused incorrect links:
- "Dals Eds kommun" → matched to "Munkedals kommun" (wrong)
- "Hyres och arrendenämnden i Stockholm" → matched to "Hyres- och arrendenämnden i Malmö" (wrong)
- "Nätverket för kommunala lärcentra, Nitus" → matched to "Kommunal" (wrong)

Additionally: "RFSL", "Vinnovas", "Teracom" not matching despite entities existing.

**Root Causes**:
1. **Greedy substring bonus**: Any substring match got 0.8+ score, even "kommunal" inside "kommunala"
2. **No hyphen/space normalization**: "Dals-Eds" vs "Dals Eds" treated as different
3. **Possessive 's' stripping used vowel heuristic**: Failed for "Vinnovas" (vowel+s)
4. **Trailing parenthetical abbreviations not stripped**: "(RFSL)" not removed

**Fixes Applied**:

1. **Guarded Substring Matching** (`organization-matcher.ts`):
   - Added length ratio guard: substring bonus only if `shorter.length / longer.length >= 0.5`
   - Added token boundary check: OR if shorter is a complete word (`\b...\b`) in longer
   - Added `escapeRegex()` helper for safe regex construction
   - Prevents: "kommunal" → "kommunala" (partial word, ratio 0.13)
   - Allows: "Teracom" → "Teracom AB" (ratio 0.7, complete token)

2. **Hyphen/Space Normalization** (`calculateSimilarity`):
   - Added `normalizeForComparison()` that replaces `-` with ` ` before comparison
   - "Dals-Eds kommun" now equals "Dals Eds kommun" (score 1.0)

3. **Possessive 's' Stripping** (`normalizeOrganizationName`):
   - Changed from vowel heuristic to explicit exceptions list
   - `KEEP_TRAILING_S = ['borås', 'vitrysslands', 'ledarnas', 'tidningarnas', 'ukrainas', 'försvarsmaktens']`
   - Default: strip trailing 's' unless in exception list
   - "Vinnovas" → "Vinnova" (stripped)

4. **Parenthetical Abbreviation Stripping** (`normalizeOrganizationName`):
   - Added: `normalized.replace(/\s*\([A-ZÄÖÅ]{2,6}\)\s*$/, '')`
   - "Riksförbundet... (RFSL)" → "Riksförbundet..."

5. **Explicit 'unmatched' Confidence** (`link-remissvar-entities/index.ts`):
   - Changed from `match_confidence = null` to `match_confidence = 'unmatched'` for processed-but-no-match
   - Distinguishes: NULL = never processed, 'unmatched' = processed but no match

6. **Reprocess UI Buttons** (`EntityMatchApprovalQueue.tsx`):
   - Added "Run Matcher (Unprocessed)" button → calls linker with `reprocess_mode: 'unlinked'`
   - Added "Reprocess Rejected" button → calls linker with `reprocess_mode: 'unmatched_and_rejected'`
   - Added 'unmatched' stat counter in header (6 columns now)
   - Added `Play` icon import

**Files Changed**:
- `supabase/functions/_shared/organization-matcher.ts` - Algorithm fixes
- `supabase/functions/link-remissvar-entities/index.ts` - Explicit 'unmatched' confidence
- `src/components/admin/EntityMatchApprovalQueue.tsx` - Reprocess UI + stats

**Expected Outcomes After Reprocessing**:
- "Dals Eds kommun" → matches "Dals-Eds kommun" (high confidence)
- "Hyres och arrendenämnden i Stockholm" → matches Stockholm variant (high)
- "Nätverket för kommunala lärcentra, Nitus" → NO match to "Kommunal" (correct)
- "Vinnovas" → matches "Vinnova" (high)
- "Teracom" → matches "Teracom AB" (high)
- RFSL long name → matches RFSL entity (high)

---

## 2026-01-14: Phase 2.7.6 Enhanced Normalizer + Create Entity UI (EXECUTION)

**Goals**:
1. Improve automated linking by stripping file/attachment suffixes
2. Add "Create Entity" UI for uninvited respondents

**Normalizer Enhancements** (`organization-matcher.ts`):
- **Suffix stripping**: `bilaga`, `bilaga till remissvar`, `bilaga 1`, `svar`, `AB`
- **Prefix stripping**: `Bilaga`, `Övrigt yttrande`, `Yttrande från`
- **Possessive 's' handling**: `Vinnovas` → `Vinnova` (with consonant check)
- **Hyphen canonicalization**: `Patent och registreringsverket` → `Patent- och registreringsverket`
- **Removed 120-char length limit**: Long org names are valid (e.g., RFSL)

**UI Enhancements** (`EntityMatchApprovalQueue.tsx`):
- Added "Create Entity" button (blue +) for items with no suggested match
- Dialog to create new organization entity with editable name
- New "Created" stat counter in the header
- Entity is created with `source: uninvited_respondent` metadata
- Response is linked with `match_confidence: 'created'`
- Fixed approval queue fetch to include `match_confidence = NULL` items (PostgREST `not.in` excludes NULL; now uses explicit `OR`).

**RLS Policy** (migration):
- Added `INSERT` and `UPDATE` policies on `entities` table for admins

**Files Changed**:
- `supabase/functions/_shared/organization-matcher.ts` - Enhanced normalizer
- `src/components/admin/EntityMatchApprovalQueue.tsx` - Create Entity UI + dialog
- Database migration for entities RLS policies

---

## 2026-01-14: Phase 2.7.5 Linker Query Filter Fix + DB Reset (EXECUTION)

**Problem**: Entity linker processing only 10 of 800 records despite limit=800

**Root Cause**:
- Query filter only excluded `approved` rows (77 records)
- In-loop guard skipped all `entity_id IS NOT NULL` rows (3,349 records)
- Result: fetched 800 already-linked rows, skipped 790 in loop

**Fixes Applied**:
1. **Aligned query filter with in-loop guard** - Now excludes `entity_id IS NOT NULL` at query level unless `force_relink=true`
2. **Database reset** - Cleared all linking data (entity_id, match_confidence, normalized_org_name, metadata suggestions) for fresh start

**Files Changed**:
- `supabase/functions/link-remissvar-entities/index.ts` - Fixed query filter logic (lines 116-131)

**DB Impact**:
- 3,424 rows reset to unlinked state
- All previous approvals/rejections cleared

**Verification**:
- Run linker with `reprocess_mode: 'all'`, `limit: 500` → should process all 500 rows

---

## 2026-01-14: Phase 2.7.4 Entity Linking Fixes (EXECUTION)

**Problem**: Three critical issues in entity linking:
1. **AP-fonden not matching**: Entities like "Första AP-fonden" existed but responses normalized to "Första AP fonden" (space vs hyphen) causing match failures
2. **Approvals overwritten**: Running linker in `reprocess_mode: 'all'` would overwrite manually approved links, setting them back to medium/low confidence
3. **Batch stuck on same records**: Repeated runs with same limit processed identical records due to lack of stable ordering and cursor pagination

**Root Causes Identified**:
1. No Unicode normalization (NFKC) and no AP-fonden canonicalization in `normalizeOrganizationName()`
2. Linker query didn't exclude `match_confidence = 'approved'` rows, and no in-loop guard for `entity_id IS NOT NULL`
3. Missing `.order('id')` and cursor (`after_id`) parameter for deterministic batch progression

**Fixes Applied**:
1. **AP-fonden normalization** (`organization-matcher.ts`):
   - Added `.normalize('NFKC')` at start of `normalizeOrganizationName()`
   - Added canonicalization: `\bAP[\s\u2013]+fonden\b` → `AP-fonden` (handles space and en-dash)
   
2. **Approval protection** (`link-remissvar-entities/index.ts`):
   - Query filter: `.is('entity_id', null)` unless `force_relink = true`
   - In-loop guard: Skip rows where `entity_id IS NOT NULL` and `force_relink = false`
   - Added `entity_id` to SELECT statement for guard check
   
3. **Cursor pagination** (`link-remissvar-entities/index.ts`):
   - Added `after_id` request parameter
   - Added `.order('id')` and `.gt('id', after_id)` to query
   - Response now includes `next_after_id` for subsequent batch calls

**Files Changed**:
- `supabase/functions/_shared/organization-matcher.ts` - NFKC + AP-fonden canonicalization
- `supabase/functions/link-remissvar-entities/index.ts` - approval protection + cursor + interface updates

**Expected Outcomes**:
- "Första AP fonden" → normalizes to "Första AP-fonden" → exact match → high confidence link
- Approved rows never modified by linker (unless `force_relink = true`)
- Consecutive batch runs process distinct records using cursor

**Verification**:
- Run linker with limit 50 including AP-fonden records → should link as high confidence
- Approve a match → run linker in 'all' mode → approved row stays intact
- Run multiple batches → each processes new rows (no repeats)

---

## 2026-01-09: Phase 2.7.3 Allow/Block List + Case Deduplication Fix (EXECUTION)

**Problem**: Gate 2 testing revealed:
1. Case-sensitive duplicates created during bootstrap (43 groups, 87 records, 6.2%)
2. Invalid short fragments ("Tre", "Sve") passing validation  
3. No mechanism for human review of ambiguous short names ("Krav")

**Fixes Applied**:
1. **New `entity_name_rules` table**: Allow/block list for short names with RLS policies
2. **Case-insensitive deduplication**: Changed `occurrenceCounts` map key from `normalized` to `normalized.toLowerCase()` while preserving `displayName` for storage
3. **Batch-loaded rules**: Single query at bootstrap start loads all allow/block rules into memory (performance optimization)
4. **Short-name validation**: Names ≤4 chars checked against allow/block list; mixed-case names not in allow list flagged for human review
5. **UI for human review**: Added flagged names table with Allow/Block buttons in Bootstrap tab

**Files Changed**:
- `supabase/migrations/XXXXXX_create_entity_name_rules.sql` - new table + RLS + seed data (Krav=allow, Tre=block, Sve=block)
- `supabase/functions/bootstrap-org-entities/index.ts` - case dedup fix, batch-load rules, flagging logic
- `src/components/admin/RemissEntityLinkerTest.tsx` - flagged names UI with approve/block actions

**Expected Outcomes**:
- Zero case duplicates in future bootstrap runs
- Blocked names rejected automatically
- Flagged short names displayed for human review
- Allow/block list persisted in DB for consistent future behavior

**Next Steps**:
- Run scoped reset SQL (delete Tre/Sve entities and invitees)
- Re-run Gate 1 (parser) → Gate 2 (bootstrap)
- Review flagged names in UI, approve/block as needed
- Deduplicate existing case variants (separate procedure)

---

## 2026-01-08: Phase 2.7.2 Entity Pipeline Nuclear Reset (EXECUTION)

**Problem**: Entity bootstrapping contaminated with boilerplate (677 invalid invitees, 31 bad entities). Root causes:
1. Supabase 1000-row query limit silently truncating results
2. `isBlockedPhrase()` not exported/applied in bootstrap
3. Fallback parser bypassing all filtering

**Fixes Applied**:
1. **Database Reset**: Unlinked entities from `remiss_responses`, deleted bootstrap entities, deleted all `remiss_invitees`, reset `remiss_documents` processing flags
2. **Numbered Pattern Whitelist**: Rewrote `parseRemissinstanserText()` to ONLY extract numbered entries (`/^\s*(\d+)\.\s+(.+)$/`)
3. **Removed Fallback Parser**: Deleted permissive fallback in `process-remissinstanser/index.ts` lines 130-139
4. **Exported `isBlockedPhrase()`**: Now applied in `bootstrap-org-entities` before normalization
5. **Fixed Query Limits**: Added `.range(0, 9999)` to all invitee/entity queries

**Files Changed**:
- `supabase/functions/_shared/organization-matcher.ts` - exported `isBlockedPhrase()`, whitelist parser
- `supabase/functions/process-remissinstanser/index.ts` - removed fallback, skip if no numbered orgs
- `supabase/functions/bootstrap-org-entities/index.ts` - import `isBlockedPhrase`, apply before normalize, fix query limits

**Expected Outcomes**:
- Zero boilerplate in invitees/entities
- ~1500+ valid organization entities
- 99% parse accuracy

---



**Task: Fix entity bootstrap limits, boilerplate leakage, and confidence strategy**

Root Cause Analysis (from DB audit 2026-01-07):
- Bootstrap limited to 500 entities (UI slider max) → missing 1,000+ legitimate orgs
- Linking limited to 50 responses → only 14% processed
- 25+ boilerplate entries leaked into entities table
- Low/medium confidence matches had high false positive rates
- `extractOrganization()` in remiss-parser.ts not applying title filtering

Fixes Applied:

**Database Cleanup:**
- Deleted boilerplate entities matching instruction patterns (e.g., "Myndigheter under regeringen...")

**Expanded BLOCKED_PHRASES** in `_shared/organization-matcher.ts`:
- Added 30+ new boilerplate patterns (instruction text, email patterns, title roles)
- Added all government department variants as headers (not invitees)

**Fixed extractOrganization()** in `_shared/remiss-parser.ts`:
- Added `isDocumentTitle()` check before processing link text
- Applied `normalizeOrganizationName()` for consistent cleaning
- Added file size suffix removal (e.g., "(pdf 294 kB)")

**Changed default confidence strategy** in `link-remissvar-entities`:
- Default `min_confidence` changed from 'low' to 'high'
- Medium/low matches now logged but `entity_id` set to null
- Prioritizes correctness over recall (uninvited orgs can respond - this is valid)

**Updated UI limits** in `RemissEntityLinkerTest.tsx`:
- Bootstrap slider: 10-500 → 100-3000 (default 2000)
- Linking limit: 50 → 5000

---

## 2026-01-07: Phase 2.7 Normalization & Bootstrap Fixes (EXECUTION)

## 2026-01-07: Shared PDF Extractor Utility (EXECUTION)

**Task: Refactor PDF extraction into shared utility to prevent pattern drift**

Root Cause:
- `process-remissinstanser` had incorrect PDF extractor API call (wrong endpoint, wrong auth header)
- Caused 404 errors during Phase 2.7 testing

Created:
- `supabase/functions/_shared/pdf-extractor.ts`:
  - `PdfExtractionResult` interface (success, text, metadata, error, message)
  - `PdfExtractorConfig` interface (serviceUrl, apiKey)
  - `getPdfExtractorConfig()` — reads env vars, throws if missing
  - `extractTextFromPdf(config, pdfUrl, options?)` — consistent API call with structured error handling

Refactored:
- `process-sou-pdf/index.ts` — removed 70-line inline function, now imports shared utility
- `process-remissinstanser/index.ts` — replaced inline fetch with shared utility

Updated:
- `supabase/functions/_shared/README.md` — documented new `pdf-extractor.ts` module

Verified:
- ✅ `process-remissinstanser` with `dry_run=true` — 200 OK
- ✅ `process-sou-pdf` with real PDF URL — extracted 1,304,349 chars from 552 pages

---

## 2026-01-07: Phase 2.7 Remissinstanser & Entity Linking (EXECUTION)

**Task: Parse remissinstanser PDFs + link remissvar to entities**

Database Changes:
- Created `remiss_invitees` table (id, remiss_id, organization_name, entity_id, metadata)
- Added columns to `remiss_responses`: `entity_id`, `match_confidence`, `normalized_org_name`
- Added indexes for analytics queries

New Shared Utilities:
- `_shared/organization-matcher.ts`: `normalizeOrganizationName()`, `matchOrganization()`, `parseRemissinstanserText()`

New Edge Functions:
- `process-remissinstanser`: Parses remissinstanser PDFs → extracts invited organizations → inserts to `remiss_invitees`
- `link-remissvar-entities`: Matches `responding_organization` to entities with confidence scoring, optional entity creation

Admin UI:
- `RemissEntityLinkerTest.tsx`: Two-tab UI for (1) parsing remissinstanser, (2) linking entities with dry-run, confidence breakdown, and low-match review

---

## 2026-01-07: Phase 2.5.2 Swedish Date Parsing Fix (EXECUTION)

**Task: Fix Swedish Date → ISO Conversion**
- Added `parseSwedishDate()` export function to `remiss-parser.ts`
- Converts "17 oktober 2025" → "2025-10-17"
- Handles all Swedish month names, already-ISO dates pass through
- Updated `process-remiss-pages/index.ts` to use `parseSwedishDate()` before DB update
- Added `raw_deadline` to metadata for debugging

---

## 2026-01-07: Phase 2.5.1 Remissinstanser Detection Fix (EXECUTION)

**Task: Fix Remissinstanser PDF Detection**
- Enhanced `supabase/functions/_shared/remiss-parser.ts` with section-based detection
- Added header scanning for "Remissinstanser:" followed by PDF link (primary strategy)
- Added sibling-walk strategy as fallback for varied HTML structures
- Expanded URL selector to include `/contentassets/` pattern
- Added `remissinstanserUrls` set to prevent duplicate classification as remissvar
- Enhanced deadline patterns with "sista dag att svara" variant
- Added logging for section-based detection ("Found remissinstanser section header")

**UI Enhancement:**
- Added `reprocess_scraped` toggle in `ProcessRemissPagesTest.tsx`
- Allows re-scraping already-scraped remisser with improved parser
- Mutually exclusive with `retry_failed` toggle

**Edge Function Update:**
- Added `reprocess_scraped` parameter to `process-remiss-pages/index.ts`
- Queries `status='scraped'` when enabled (for parser improvements)

---

## 2026-01-07: Context Priority Doc Created

**Governance Enhancement**
- Created `docs/CONTEXT_PRIORITY.md` — canonical "read first" list for Codex context sync
- Lists 7 priority docs + 3 secondary context files
- Lovable-maintained, updated on governance/phase changes

---

## 2026-01-07: Phase 2.5 Implementation (EXECUTION)

**Task: Process Remiss Pages Infrastructure**
- Created `supabase/functions/_shared/remiss-parser.ts` with exported `parseRemissPage()`, `classifyFileType()`, `extractOrganization()`
- Created `supabase/functions/process-remiss-pages/index.ts` edge function
- Created `src/components/admin/ProcessRemissPagesTest.tsx` UI component
- Updated `scrape-sou-remiss/index.ts` to import from shared module
- Updated `supabase/config.toml` with new function entry
- Added `ProcessRemissPagesTest` to AdminScraper Remisser tab

**Verification Notes:**
- `extraction_log` format preserved exactly from original `parseRemissPage()`
- `scrape-sou-remiss` behavior unchanged (uses same parsing logic via import)
- Idempotency via `upsert` with `onConflict: 'remiss_id,file_url'`
- Status transitions: `discovered` → `scraped` | `failed`

---

## 2026-01-05: Remiss Index Scraper Contract Fix

**Task 4: Edge Function Contract Alignment**
- Fixed `scrape-remiss-index` response structure to flatten `matched`/`orphan` arrays at top level
- Renamed summary fields from `total_matched`/`total_orphan` to `matched`/`orphaned` 
- Converted property names from camelCase to snake_case (`remiss_url`, `publication_date`, etc.)
- Added `sou_references` and `dir_references` arrays to both matched and orphan items
- Added `inserted` and `skipped_duplicates` counters for non-dry-run feedback
- Added matching robustness: case-insensitive fallback query with `ilike`
- Added debug logging for extracted references and orphan SOU years

Chronological log of changes between syncs. Keep entries brief and bullet-based.

---

## Format

```
[DATE] – [PHASE X.Y] – [TITLE]

Changed:
- Item 1
- Item 2

DB Impact: None | Migration required | RLS updated

Pending:
- Item if any

Blocked:
None | #blocking-<reason>
```

---

## Log

### 2026-01-05 – Phase 5.3 – Task 3: Remiss Index Scraper UI (COMPLETE)

Changed:
- Updated `docs/development/branches/phase-5.3-remisser-remissvar.md` to clarify Scrape→Match is primary strategy
- Created `src/components/admin/RemissIndexScraperTest.tsx` for running `scrape-remiss-index`
- Added component to AdminScraper Remisser tab (positioned as primary tool)
- Updated tab description to reflect correct strategy

DB Impact: None

Pending:
- Execute scraper to populate remiss_documents

Blocked:
None

---

### 2026-01-05 – Phase 5.3 – Task 2: Entity Role Normalization (COMPLETE)

Changed:
- Normalized `särskild utredare` → `särskild_utredare` (7 entities)
- Preserved minister-specific roles: statsminister, finansminister, justitieminister, arbetsmarknadsminister, statsråd

DB Impact: Data updated (7 rows in entities table)

Pending:
None

Blocked:
None

---

### 2026-01-05 – Phase 5.3 – Task 1: Contaminated SOU Cleanup (COMPLETE)

Changed:
- Deleted document_references from SOU 2025:2, SOU 2025:105, SOU 2025:106
- Deleted entities linked to those 3 SOUs
- SOU 2025:2: DELETED (confirmed to be a directive, not an SOU)
- SOU 2025:105, SOU 2025:106: URLs verified, metadata reset for re-scraping

DB Impact: Data deleted and reset (irreversible, but data was contaminated)

Pending:
None

Blocked:
None

---

### 2026-01-05 – Phase 5.3 – Operating Agreement Adopted

Changed:
- Created `docs/WORKFLOW.md` (roles, phases, message discipline)
- Created `docs/DECISION_LOG.md` (decision tracking)
- Created `docs/CHECKLISTS.md` (verification checklists)
- Created `.github/pull_request_template.md` (PR guardrails)
- Created `docs/PHASE_DELTAS.md` (this file)

DB Impact: None

Pending:
- Codex confirmation of file access

Blocked:
None
