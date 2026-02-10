

# Phase 1.2: Create `process-directive-text` Edge Function

## Summary

Create a new edge function to extract text content for 127 Riksdagen-sourced directives that lack `pdf_url`. The function fetches HTML-formatted text from the Riksdagen API text endpoint and sanitizes it for storage.

## Critical Finding: Endpoint Format

The user's concern is **confirmed**. The correct Riksdagen text endpoint format uses a **dot**, not a slash:

```text
CORRECT:  https://data.riksdagen.se/dokument/{dok_id}.text
WRONG:    https://data.riksdagen.se/dokument/{dok_id}/text
```

Evidence: `scrape-laws/index.ts` line 85 uses `.text` and is already working in production.

## Implementation Plan

### 1. Create `supabase/functions/process-directive-text/index.ts`

A new edge function modeled after the `scrape-laws` backfill pattern (`handleBackfill` in `scrape-laws/index.ts` lines 125-178). Key behaviors:

- **Query**: `documents` where `doc_type = 'directive'`, `raw_content IS NULL`, and `metadata->>'source' = 'riksdagen'` (excludes the 56 regeringen directives that already have PDF-extracted content)
- **Fetch**: `https://data.riksdagen.se/dokument/{riksdagen_id}.text` using the same `fetchWithRetry` pattern and `FETCH_HEADERS` as existing scrapers
- **Sanitize**: Reuse shared `sanitizeText()` from `_shared/text-utils.ts`, plus strip HTML tags (the `.text` endpoint returns HTML-formatted content -- the laws scraper handles this by checking for `<!DOCTYPE`/`<html` prefixes and skipping those, but directive text responses may be partial HTML that needs tag stripping)
- **Guard**: Skip responses starting with `<!DOCTYPE` or `<html` (redirect pages), and responses shorter than 50 chars
- **Update**: Set `raw_content`, `processed_at`, and update `metadata` with extraction status fields
- **Parameters**: `limit` (default 10), `dry_run` (default false), `document_id` (optional single-doc mode)
- **Rate limiting**: 500ms delay between requests, 1000ms initial delay, same retry/backoff logic

### 2. Add HTML tag stripping utility

Add a `stripHtmlTags` function to the edge function (or to `_shared/text-utils.ts`) since the `.text` endpoint may return content with HTML markup that needs cleaning. The laws scraper skips HTML responses entirely, but directive text responses are expected to contain useful content wrapped in HTML.

### 3. Update `supabase/config.toml`

Add entry for the new function:
```toml
[functions.process-directive-text]
verify_jwt = false
```

### 4. Update documentation

- `docs/verification/LOVABLE_FIXES_EXECUTION_REPORT_2026-02-04.md`: Mark Phase 1.2 `process-directive-text` as DONE, note the `.text` endpoint format correction
- `docs/development/PHASE_DELTAS.md`: Log the new function creation

### Technical Details

**Data flow:**
```text
Query DB (127 riksdagen directives with NULL raw_content)
  -> For each: fetch {RIKSDAGEN_API}/dokument/{riksdagen_id}.text
  -> Strip HTML tags
  -> sanitizeText() (null bytes, line normalization, Unicode NFC)
  -> Guard: skip if < 50 chars or is redirect page
  -> UPDATE documents SET raw_content, processed_at, metadata
```

**Key reuse from existing codebase:**
- `fetchWithRetry` pattern from `scrape-laws/index.ts`
- `sanitizeText` from `_shared/text-utils.ts`
- `corsHeaders` + response helpers from `_shared/http-utils.ts`
- Same `FETCH_HEADERS` User-Agent string as all other scrapers

**Success criteria:**
```sql
SELECT COUNT(*) FROM documents 
WHERE doc_type = 'directive' 
AND raw_content IS NULL 
AND metadata->>'source' = 'riksdagen';
-- Expected: 0 (after batch run)
```

### Files to create/modify

| File | Action |
|------|--------|
| `supabase/functions/process-directive-text/index.ts` | CREATE |
| `supabase/config.toml` | ADD entry |
| `docs/verification/LOVABLE_FIXES_EXECUTION_REPORT_2026-02-04.md` | UPDATE Phase 1.2 |
| `docs/development/PHASE_DELTAS.md` | LOG change |

