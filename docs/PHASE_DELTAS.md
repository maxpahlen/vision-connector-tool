# Phase Deltas

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
