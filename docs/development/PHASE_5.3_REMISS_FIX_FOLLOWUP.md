# Phase 5.3 Remiss Link Fix - Follow-up Improvements

## Completed ✅

### 1. Schema Migration
- Added `target_url TEXT` column to `document_references` table
- Created index `idx_doc_refs_target_url` for efficient lookups
- Created partial index `idx_doc_refs_remiss_urls` for remiss-specific queries

### 2. Scraper Update (`scrape-regeringen-document/index.ts`)
- Now stores `ref.url` in `target_url` column during reference insertion
- Prefers parsed `targetDocNumber` over raw `anchorText` for `target_doc_number`

### 3. Remiss Scraper Update (`scrape-sou-remiss/index.ts`)
- Phase A now queries `target_url` column directly with `LIKE '%/remisser/%'`
- Falls back to text-based matching on `target_doc_number` if needed
- Maintains backward compatibility with legacy data

---

## Required: Backfill Existing References

**Action Required**: Re-run the SOU Lagstiftningskedja scraper to populate `target_url` for existing references.

### Steps:
1. Go to Admin → Scraper page
2. Use "Batch Re-Scrape" section in SOU Lagstiftningskedja Scraper component
3. Process all 72 SOUs in batches (recommended batch size: 10)
4. Verify with validation queries below

### Validation Queries:
```sql
-- Count valid remiss links now stored
SELECT COUNT(*) FROM document_references WHERE target_url LIKE '%/remisser/%';

-- Example: verify remiss reference for SOU 2025:39
SELECT target_url, target_doc_number
FROM document_references dr
JOIN documents d ON dr.source_document_id = d.id
WHERE d.doc_number = 'SOU 2025:39';

-- Check remiss discovery after running scrape-sou-remiss
SELECT 
  d.doc_number,
  rd.remiss_page_url,
  rd.status,
  rd.remissvar_count
FROM remiss_documents rd
JOIN documents d ON rd.parent_document_id = d.id
ORDER BY rd.created_at DESC;
```

---

## Follow-up Improvements (Future Work)

### A) Unify DocumentReference Types Across Codebase

**Status**: TODO
**Priority**: Low

Ensure all TypeScript interfaces include `target_url`:

```typescript
type DocumentReference = {
  target_doc_number: string;
  target_document_id: string | null;
  target_url: string | null;          // ✅ Add this
  reference_type: string;
  confidence: string;
  source_excerpt: string;
  source_page: number | null;
};
```

Files to update:
- Any manual TS type declarations (if they exist outside generated types)
- Frontend components displaying document references

### B) Multi-SOU Remiss Relationships (Optional)

**Status**: DEFERRED to Phase 6
**Priority**: Low

Some remiss pages cover multiple SOUs:
> "Remiss av SOU 2024:93 och SOU 2024:94"

Future implementation could:
- Detect when two or more SOUs reference the same remiss_page_url
- Add synthetic `reference_type = 'shared_remiss'` links between SOUs
- Enable graph exploration of related investigations

### C) URL Validation Before Insert ✅

**Status**: IMPLEMENTED

The `isValidRemissUrl()` function validates URLs before storage:

```typescript
function isValidRemissUrl(url: string): boolean {
  const datePathPattern = /\/remisser\/\d{4}\/\d{2}\//;
  return datePathPattern.test(url);
}
```

This is applied in:
- `scrape-sou-remiss/index.ts` Phase A lookup
- `scrape-sou-remiss/index.ts` Phase B page scrape

---

## Success Criteria

Mark this task complete when:

1. ✅ `target_url` added to `document_references` (schema + types)
2. ✅ Scraper inserts it correctly during reference extraction
3. ✅ Remiss scraper Phase A discovers remiss documents using `target_url`
4. ⏳ Re-scrape of SOUs completes and `target_url` is populated for past data
5. ⏳ Validation queries pass and at least 10+ remiss pages are found
6. ✅ Follow-up improvements documented

---

## Changelog

- **2024-12-11**: Initial implementation
  - Added `target_url` column via migration
  - Updated `scrape-regeringen-document` to store URLs
  - Updated `scrape-sou-remiss` Phase A to query by URL
  - Created this follow-up documentation
