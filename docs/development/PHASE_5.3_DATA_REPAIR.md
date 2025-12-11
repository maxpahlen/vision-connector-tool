# Phase 5.3 Data Repair - SOU URL Contamination Fix

## Summary

This document records the repair of a critical data quality issue where **14 SOUs (20% of total)** had incorrect `url` fields pointing to directive or proposition pages instead of their actual SOU pages on regeringen.se.

## Issue Discovered

**Date:** 2025-12-11

### Root Cause

The `scrape-sou-index` function in `supabase/functions/scrape-sou-index/index.ts` had overly permissive URL selection logic:

```typescript
// OLD CODE - Bug
for (const link of links) {
  const href = (link as Element).getAttribute('href') || '';
  if (href.includes('regeringen.se')) {
    regeringenUrl = href.startsWith('http') ? href : `https://www.regeringen.se${href}`;
    break; // Took FIRST match, which was often a directive URL
  }
}
```

This caused the scraper to accept the **first** regeringen.se link found, which on sou.gov.se inquiry pages was often a directive URL rather than the SOU page.

## Affected Documents

| doc_number | Original (Wrong) URL | Correct URL |
|------------|----------------------|-------------|
| SOU 2020:60 | `/proposition/2025/11/prop.-20252652` | TBD - needs manual lookup |
| SOU 2024:55 | `/kommittedirektiv/2023/06/dir.-202385` | TBD |
| SOU 2024:90 | `/kommittedirektiv/2023/06/dir.-202387` | TBD |
| SOU 2024:98 | `/kommittedirektiv/2023/06/dir.-202378` | TBD |
| SOU 2025:3 | `/kommittedirektiv/2023/06/dir.-202381` | TBD |
| SOU 2025:7 | `/kommittedirektiv/2025/07/dir.-202575` | TBD |
| SOU 2025:37 | `/kommittedirektiv/2022/07/Dir.-2022102` | TBD |
| SOU 2025:44 | `/kommittedirektiv/2024/03/dir.-202430` | TBD |
| SOU 2025:72 | `/kommittedirektiv/2023/11/dir.-2023153` | TBD |
| SOU 2025:88 | `/kommittedirektiv/2023/06/dir.-202378` | TBD |
| SOU 2025:104 | `/kommittedirektiv/2025/07/dir.-202575` | TBD |
| SOU 2025:105 | `/kommittedirektiv/2025/03/dir.-202532` | TBD |
| SOU 2025:106 | `/kommittedirektiv/2025/03/dir.-202533` | TBD |
| SOU 2025:113 | `/kommittedirektiv/2024/03/dir.-202430` | TBD |

## Impact

The wrong URLs caused cascading data quality issues:

1. **Wrong PDF downloaded** - Directive PDF instead of SOU PDF
2. **Wrong raw_content** - Directive text instead of SOU text
3. **Wrong Lagstiftningskedja links** - Links from directive page, not SOU page
4. **Missing remiss links** - Remiss links are typically only on SOU pages
5. **Contaminated entities** - Metadata Agent extracted directive-related entities
6. **Contaminated timeline events** - Timeline Agent created events from directive content

## Fixes Applied

### 1. Scraper Logic Fix (`scrape-sou-index/index.ts`)

Added URL validation to only accept valid SOU URLs:

```typescript
// NEW CODE - Fixed
function isValidSouUrl(url: string): boolean {
  return url.includes('/statens-offentliga-utredningar/') &&
         !url.includes('/kommittedirektiv/') &&
         !url.includes('/proposition/');
}

// Now prioritizes valid SOU URLs and logs warnings for directive-only results
```

### 2. Data Cleanup

Deleted contaminated downstream data:
- **Entities** - Deleted entities linked to affected SOUs
- **Document References** - Deleted references from affected SOUs

### 3. Document Reset

Reset affected documents to allow re-scraping:
- `url` → NULL
- `pdf_url` → NULL  
- `raw_content` → NULL
- `updated_at` → NOW()

### 4. Guardrail in `process-sou-pdf`

Added contamination detection that warns when SOU document text starts with "Dir." or "Direktiv":

```typescript
if (document?.doc_type === 'sou') {
  const textPreview = finalText.substring(0, 100).trim();
  if (textPreview.toLowerCase().startsWith('dir.')) {
    console.warn(`[DATA_CONTAMINATION] SOU document ${docNumber} contains directive text.`);
    // Sets pdf_text_status: 'contamination_warning'
  }
}
```

## Re-scraping Required

After this fix, the following manual steps are required:

### Step 1: Find Correct URLs

For each affected SOU, manually search regeringen.se:
```
site:regeringen.se/rattsliga-dokument/statens-offentliga-utredningar "SOU 2025:105"
```

### Step 2: Update URLs

For SOUs with valid pages on regeringen.se, update manually:
```sql
UPDATE documents 
SET url = 'https://www.regeringen.se/rattsliga-dokument/statens-offentliga-utredningar/...'
WHERE doc_number = 'SOU 2025:105';
```

### Step 3: Re-run Scrapers

1. **`scrape-regeringen-document`** - Fetch correct PDF, metadata, Lagstiftningskedja
2. **`process-sou-pdf`** - Extract raw_content from correct PDF
3. **`scrape-sou-remiss`** - Discover remiss links
4. **`agent-metadata`** - Regenerate clean entities

## Validation Queries

Run these after re-scraping to confirm fix:

```sql
-- ✅ No SOUs should have directive URLs
SELECT COUNT(*) FROM documents 
WHERE doc_type = 'sou' AND url LIKE '%kommittedirektiv%';
-- Expected: 0

-- ✅ No SOUs should have proposition URLs (except cross-references)
SELECT COUNT(*) FROM documents 
WHERE doc_type = 'sou' AND url LIKE '%/proposition/%';
-- Expected: 0

-- ✅ No SOUs should have directive raw content
SELECT COUNT(*) FROM documents 
WHERE doc_type = 'sou' AND raw_content ILIKE 'dir.%';
-- Expected: 0

-- ✅ Remiss references should be restored (if applicable)
SELECT COUNT(*) FROM document_references 
WHERE target_url LIKE '%/remisser/%';
```

## Known Limitations

Some affected SOUs may not yet have pages on regeringen.se:
- Very recent SOUs may not be published yet
- Some interim reports (delbetänkanden) may only exist as directive references

For these cases, the `url` field will remain NULL until the page is published.

## Prevention Measures

1. **Strict URL validation** in `scrape-sou-index` ensures only valid SOU URLs are stored
2. **Contamination detection** in `process-sou-pdf` warns when SOU text appears to be directive content
3. **Logging** added for cases where no valid SOU URL found (directive-only results)

## Timeline

- **2025-12-11 (Discovery)**: Issue identified during Phase 5.3 remiss discovery diagnostics
- **2025-12-11 (Fix Applied)**: Scraper patched, data cleaned, guardrails added
- **TBD (Re-scrape)**: Manual URL correction and re-scraping of affected documents

---

*Document created as part of Phase 5.3 Remiss + Remissvar implementation.*
