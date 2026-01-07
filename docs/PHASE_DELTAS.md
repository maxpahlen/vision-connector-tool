# Phase Deltas

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
