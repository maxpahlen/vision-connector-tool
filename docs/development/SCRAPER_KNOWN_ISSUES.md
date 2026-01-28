# Scraper Known Issues

**Created:** 2025-12-09  
**Status:** Documented, Non-Blocking

---

## Issue 1: 19/20 Proposition Extraction Pattern

### Description

The proposition scraper (`scrape-proposition-index`) occasionally extracts 19 out of 20 items per page instead of the expected 20. This is inconsistent and non-deterministic.

### Observed Behavior

| Run | Page 1 | Page 2 | Page 3 | Notes |
|-----|--------|--------|--------|-------|
| Run 1 | 20/20 | 19/20 | 20/20 | 1 item skipped on page 2 |
| Run 2 | 19/20 | 20/20 | 19/20 | 2 items skipped total |
| Run 3 | 20/20 | 20/20 | 20/20 | Full extraction |

### Root Cause Analysis

The `parsePropositionListHtml` function in `scrape-proposition-index/index.ts` applies conservative filters that silently skip items:

1. **Link Filter:** Items without `/proposition/` in href are skipped
2. **Doc Number Filter:** Items not matching `Prop. YYYY/YY:XXX` pattern are skipped
3. **Duplicate Filter:** Same doc_number on same page is skipped

**Hypothesis:** Some proposition list items on regeringen.se have:
- Non-standard URL formats (e.g., `/rattsliga-dokument/proposition-X/` instead of `/proposition/`)
- Missing or malformed document numbers in anchor text
- Edge cases in Swedish date formatting

### Diagnostic Logging

The scraper logs skip statistics:

```typescript
extractionLog.push(`[Parse Stats] DOM items: ${domItems}, skipNoLink: ${skipNoLink}, ` +
  `skipNoDocNum: ${skipNoDocNum}, skipDuplicate: ${skipDuplicate}, parsed: ${parsed}`);
```

Sample logged examples for each skip category are captured (first 2 per category).

### Impact Assessment

| Factor | Assessment |
|--------|------------|
| Data Correctness | ✅ Not affected - only standard propositions ingested |
| Completeness | ⚠️ ~95-98% coverage per page |
| MVP Readiness | ✅ Sufficient for walking skeleton |
| User Experience | ✅ No visible impact |

### Why Not Fixed Now

1. **Conservative is correct:** Preferring to skip ambiguous items over incorrectly ingesting non-propositions
2. **Diminishing returns:** Hunting edge cases in HTML parsing for 1-2 items per page
3. **Alternative sources exist:** Riksdagen API could provide canonical proposition list in future
4. **Walking skeleton complete:** 100 propositions is sufficient for Phase 5.2 validation

### Future Resolution Options

1. **Enhance regex patterns** to handle alternative URL formats
2. **Add fallback parsing** for items that fail first-pass filters
3. **Use Riksdagen API** as authoritative source for proposition metadata
4. **Log and review** specific skipped items to identify patterns

---

## Issue 2: JSON API Pagination Dependency

### Description

Both the proposition scraper (`scrape-proposition-index`) and remiss scraper (`scrape-remiss-index`) use regeringen.se's internal JSON API (`/Filter/GetFilteredItems`) for pagination instead of HTML scraping. This API is undocumented and could change.

**Important:** URL-based pagination (e.g., `?p=` or `?page=`) does NOT work for server-side scraping. The pages are locked behind client-side JavaScript that triggers the Filter API.

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| API format changes | Low | High | Monitor for failures, fallback to HTML |
| Rate limiting | Medium | Low | Already implemented delays between pages |
| Cloudflare blocking | Low | Medium | User-agent headers in place |

### Scrapers Using This API

| Scraper | Endpoint | Category ID | Notes |
|---------|----------|-------------|-------|
| `scrape-proposition-index` | `/Filter/GetFilteredItems` | `1329` | Propositioner |
| `scrape-remiss-index` | `/Filter/GetFilteredItems` | `2099` | Remisser |

### Proposition Scraper Implementation

```typescript
const jsonUrl = `https://www.regeringen.se/Filter/GetFilteredItems?` +
  `lang=sv&filterType=Taxonomy&filterByType=FilterablePageBase&` +
  `preFilteredCategories=1329&rootPageReference=0&page=${page}`;
```

### Remiss Scraper Implementation

```typescript
const jsonUrl = `https://www.regeringen.se/Filter/GetFilteredItems?` +
  `lang=sv&filterType=Taxonomy&filterByType=FilterablePageBase&` +
  `preFilteredCategories=2099&rootPageReference=0&page=${page}&` +
  `displayLimited=True&displaySortedByRelevance=False`;
```

### Required Headers

Both scrapers use these headers to emulate browser AJAX calls:
- `X-Requested-With: XMLHttpRequest`
- `Referer: https://www.regeringen.se/<section>/`
- `Accept: application/json, text/html, */*`
- Browser-like `User-Agent`

---

## Issue 3: Non-PDF Primary Files

### Description

Some propositions have Excel or Word files as primary downloadable content instead of PDFs.

### Known Cases

| Proposition | Primary File Type | Handling |
|-------------|-------------------|----------|
| Prop. 2025/26:1 | Excel | `skipped_non_pdf` |
| Prop. 2025/26:2 | Excel | `skipped_non_pdf` |

### Resolution

Handled correctly via `pdf-scorer.ts` file type classification:
- `pdf_url` set to NULL
- `metadata.primary_file_type` set to actual type
- `metadata.pdf_text_status` set to `skipped_non_pdf`

No action needed - this is expected behavior for budget propositions.

---

## Monitoring Recommendations

1. **Periodic validation query:**
```sql
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE raw_content IS NOT NULL) as with_text,
  COUNT(*) FILTER (WHERE pdf_url IS NULL) as no_pdf
FROM documents WHERE doc_type = 'proposition';
```

2. **Check for new skipped_non_pdf:**
```sql
SELECT doc_number, metadata->>'primary_file_type' 
FROM documents 
WHERE doc_type = 'proposition' 
  AND (metadata->>'pdf_text_status') = 'skipped_non_pdf';
```

3. **Monitor scraper logs** for skip statistics during production runs.

---

## Issue 4: riksdagen.se Open Data API — intermittent connection resets

### Description

The riksdagen.se Open Data API (`https://data.riksdagen.se`) intermittently resets connections when called from backend functions, resulting in errors like:

`connection error: Connection reset by peer (os error 104)`

This has been observed on both:
- `dokumentlista` (listing)
- `dokumentstatus` / `dokument/*.text` (detail content)

### Impact Assessment

| Factor | Assessment |
|--------|------------|
| Data Correctness | ✅ Not affected |
| Completeness | ⚠️ Transient failures can reduce throughput |
| MVP Readiness | ✅ Acceptable with retries |
| User Experience | ⚠️ Admin test runs may need retry |

### Mitigation Implemented

1. Browser-like request headers (explicit `User-Agent`, `Accept`, `Accept-Language`)
2. Increased retries with exponential backoff and jitter
3. Initial delay before the first upstream request to avoid early handshake instability
4. Upstream errors are surfaced as `503 upstream_unavailable` (not `500`) to reflect transient availability issues

### Recommended Operator Workflow

If you hit a run of 503s:
1. Wait ~30–60 seconds
2. Retry the same batch (scrapers are idempotent via deduplication)

