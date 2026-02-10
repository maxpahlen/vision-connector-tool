# System-Wide Surgical Rebuild - December 2025

## Overview

This document outlines the surgical repair performed on December 12, 2025 to address critical data quality issues across the SOU, Proposition, and Process pipelines.

**Philosophy**: Precise deletion and rebuild of specific corrupted zones rather than full database wipe.

---

## 🔴 CRITICAL FIXES COMPLETED

### 1. "Kontaktuppgifter" Process Corruption

**Problem**: ~110 processes were created with placeholder title "Kontaktuppgifter" and `main_document_id = NULL` due to a scraper bug in `scrape-sou-index` that failed to find valid SOU URLs.

**Root Cause**: Lines 91-100 in `scrape-sou-index` accepted any regeringen.se link without validating for actual SOU pages (`/statens-offentliga-utredningar/`).

**Fix Applied**:
```sql
-- First delete dependent agent_tasks
DELETE FROM agent_tasks
WHERE process_id IN (
  SELECT id FROM processes 
  WHERE title = 'Kontaktuppgifter' AND main_document_id IS NULL
);

-- Then delete corrupted processes
DELETE FROM processes
WHERE title = 'Kontaktuppgifter'
  AND main_document_id IS NULL;
```

**Result**: All corrupted processes removed. Future scraping will use `isValidSouUrl()` validation.

---

### 2. Blocked Metadata Extraction Tasks

**Problem**: 192+ `agent-metadata` tasks stuck in 'pending' status since Dec 10-11, 2025.

**Root Cause**: `process-task-queue` function was not being invoked (no cron job, no manual trigger).

**Fix Applied**:
- Deployed `process-task-queue` edge function
- Triggered batch processing: `POST /process-task-queue { "task_type": "metadata_extraction", "limit": 50 }`

**Result**: Tasks now processing. Monitor via:
```sql
SELECT COUNT(*) FROM agent_tasks
WHERE status = 'pending' AND task_type = 'metadata_extraction';
```

---

### 3. Self-Referencing Document References

**Problem**: 29 `document_references` rows where `source_document_id = target_document_id`.

**Root Cause**: Lagstiftningskedja extraction incorrectly linking documents to themselves.

**Fix Applied**:
```sql
DELETE FROM document_references
WHERE source_document_id = target_document_id;
```

**Result**: 0 self-references remaining.

---

### 4. Contaminated/Placeholder Entities

**Problem**: Entities containing directive prefixes or placeholder names.

**Fix Applied**:
```sql
DELETE FROM entities
WHERE name ILIKE 'kommittédirektiv%'
   OR name IN ('Särskild utredare', 'utredare')
   OR (name = 'Socialtjänstministern' AND role = 'särskild_utredare');
```

**Result**: 0 placeholder entities remaining.

---

## 🟠 DOC_NUMBER RESOLUTION FIX

### Problem

`extractDocNumber()` in `genvag-classifier.ts` was producing full titles instead of clean document numbers:

❌ `Dir. 2023:171 Tilläggsdirektiv till Kommittén...`  
✅ `Dir. 2023:171`

### Fix Applied

Updated regex patterns in `supabase/functions/_shared/genvag-classifier.ts`:

```typescript
export function extractDocNumber(urlOrText: string): string | null {
  // SOU pattern - extracts "SOU 2024:93" from "SOU 2024:93 Något titel..."
  const souMatch = urlOrText.match(/sou[.\s-]?(\d{4})[.:\s-]?(\d+)/i);
  if (souMatch) return `SOU ${souMatch[1]}:${souMatch[2]}`;

  // Directive pattern - extracts "Dir. 2023:171" from "Dir. 2023:171 Tilläggsdirektiv..."
  const dirMatch = urlOrText.match(/dir\.?\s?(\d{4})[.:\s-]?(\d+)/i);
  if (dirMatch) return `Dir. ${dirMatch[1]}:${dirMatch[2]}`;

  // Proposition pattern
  const propMatch = urlOrText.match(/prop\.?\s?(\d{4})[\/.-]?(\d{2})[.:\s-]?(\d+)/i);
  if (propMatch) return `Prop. ${propMatch[1]}/${propMatch[2]}:${propMatch[3]}`;

  // Ds (Departementsserie) pattern
  const dsMatch = urlOrText.match(/ds[.\s-]?(\d{4})[.:\s-]?(\d+)/i);
  if (dsMatch) return `Ds ${dsMatch[1]}:${dsMatch[2]}`;

  return null;
}
```

### Post-Fix Action Required

Run document reference re-resolution to improve resolution rate from current 14.8%:
```
POST /functions/resolve-document-references { "force": true }
```

---

## 📊 BEFORE/AFTER METRICS

| Metric | Before | After |
|--------|--------|-------|
| "Kontaktuppgifter" processes | ~110 | 0 |
| Self-referencing doc_refs | 29 | 0 |
| Placeholder entities | 6+ | 0 |
| Pending metadata tasks | 196 | Processing... |
| Document reference resolution | 14.8% | Pending re-resolution |

---

## 📋 DATA HEALTH SUMMARY (Post-Rebuild)

| Doc Type | Total | With Text | With URL |
|----------|-------|-----------|----------|
| directive | 93 | 93 | 93 |
| proposition | 100 | 98 | 100 |
| sou | 114 | 102 | 114 |

**Notes**:
- 12 SOUs missing `raw_content` (need re-extraction or URL repair)
- 2 Propositions without text are Excel files (correctly skipped)

---

## 🔮 REMAINING WORK

### High Priority
1. **Re-resolve document references** - Run batch job with fixed `extractDocNumber()` to improve from 14.8% resolution
2. **Gap-fill missing SOUs** - 12 SOUs missing text content need URL repair or re-scraping
3. **Complete metadata task backlog** - Monitor until all 192+ tasks complete

### Medium Priority
4. **Consolidate shared modules** - Extract `extractMinistry()`, `parseSwedishDate()` into `_shared/`
5. **Add scraper validation** - Prevent future "Kontaktuppgifter" corruption via URL validation

### Low Priority
6. **Change detection** - Monitor regeringen.se for updated Lagstiftningskedja links
7. **Remiss coverage expansion** - Currently only 6/114 SOUs have linked remiss documents

---

## 🛡️ PREVENTION MEASURES

### Scraper Validation
```typescript
// Always validate URLs before accepting
function isValidSouUrl(url: string): boolean {
  return url.includes('/statens-offentliga-utredningar/') && 
         !url.includes('/kommittedirektiv/') &&
         !url.includes('/proposition/');
}
```

### Document Reference Integrity
```typescript
// Reject self-references at insertion time
if (sourceDocId === targetDocId) {
  console.warn(`Skipping self-reference for document ${sourceDocId}`);
  continue;
}
```

### Clean Doc Number Extraction
```typescript
// Always extract canonical form, never full titles
const docNum = extractDocNumber(rawText);
// Returns: "Dir. 2023:171", not "Dir. 2023:171 Tilläggsdirektiv..."
```

---

## ✅ SUCCESS CRITERIA STATUS

| Criteria | Status |
|----------|--------|
| "Kontaktuppgifter" processes removed | ✅ Complete |
| Metadata task backlog cleared | ⏳ In Progress |
| SOU scraper yields correct count | 🔍 Needs Verification |
| Doc reference resolution > 60% | ⏳ Pending Re-resolution |
| No self-references or placeholder entities | ✅ Complete |
| Shared module consolidation | 📋 Optional/Deferred |

---

*Last Updated: December 12, 2025*
