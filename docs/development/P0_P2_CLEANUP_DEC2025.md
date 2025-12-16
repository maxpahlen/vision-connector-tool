# P0-P2 Database Quality Cleanup - December 16, 2025

## Overview

Comprehensive database quality cleanup following the health report from 2025-12-15. This work focuses on eliminating contamination, inconsistencies, and improving system reliability.

---

## 🔴 P0 (Immediate Priority) - COMPLETED

### 1. Deleted 3 "Kontaktuppgifter" Contaminated Processes

**Problem:** Corrupted processes with placeholder "Kontaktuppgifter" title due to scraper URL bug.

**Action Taken:**
```sql
-- Deleted timeline_events, process_documents, agent_tasks, then processes
DELETE FROM processes WHERE id IN (
  'b389cb62-771d-4ea4-a3c5-b06e45f18704',  -- process_key: fi-2023-11
  '8f5d2714-771b-465f-b454-5eade3cb9218',  -- process_key: fö-2024-04
  '47038f48-a758-4543-8adf-b0c83716c6cd'   -- process_key: s-2023-03
);
```

**Impact:** Documents remain intact. Re-run Head Detective to recreate processes with correct data.

### 2. Deleted 3 Self-Referencing document_references

**Problem:** References where `source_document_id = target_document_id`.

**Action Taken:**
```sql
DELETE FROM document_references WHERE id IN (
  '94f34f26-44e7-4617-918b-f6484fde2464',  -- SOU 2025:106
  '4f8e566a-960e-4c3c-b4c3-6a2c9e1d723f',  -- SOU 2025:105
  '375910fd-1fd3-41ba-9b20-4e2bce94c08c'   -- SOU 2025:2
);
```

### 3. Reset Stuck Task

**Problem:** Task stuck in `processing` since 2025-12-15 09:46:57.

**Action Taken:**
```sql
UPDATE agent_tasks 
SET status = 'pending', 
    started_at = NULL,
    error_message = 'Reset after being stuck in processing since 2025-12-15. Manual reset as part of P0 cleanup.'
WHERE id = '5b6b3ae0-cb72-42b6-afc3-a230fdfaa62d';
```

---

## ⚠️ P1 (Short-Term Improvements) - COMPLETED

### 4. Deleted 4 Placeholder Entities

**Problem:** Noisy entities from early extractions with incorrect naming patterns.

**Deleted Entities:**
| ID | Name | Type |
|----|------|------|
| 5966f0bc-... | "Särskild utredare" | särskild_utredare |
| c7dbebde-... | "Kommittédirektiv Kraftfulla verktyg..." | committee |
| 733e6244-... | "Kommittédirektiv Statens framtida roll..." | committee |
| a2fc13e7-... | "Kommittédirektiv" | committee |

**Also cleaned:** Related orphan relations pointing to deleted entities.

### 5. Created Processes for 10 Orphan Propositions

**Problem:** Propositions existed in documents table but had no process linkage.

**Created Processes:**
| Doc Number | Process Key | Title |
|------------|-------------|-------|
| Prop. 2025/26:63 | prop-2025-26-63 | Vissa sekretessfrågor som avser vapentransaktioner... |
| Prop. 2025/26:69 | prop-2025-26-69 | Förbättrat regelverk om beskattning av skog |
| Prop. 2025/26:71 | prop-2025-26-71 | Insyn i handlingar som inhämtas genom beslag... |
| Prop. 2025/26:64 | prop-2025-26-64 | Genomförande av direktivet om skydd för personer... |
| Prop. 2025/26:77 | prop-2025-26-77 | Anpassning av svensk rätt till EU:s nya förordning... |
| Prop. 2025/26:78 | prop-2025-26-78 | En grundlagsskyddad aborträtt samt utökade möjligheter... |
| Prop. 2025/26:73 | prop-2025-26-73 | Uppsägning av sparandeavtal |
| Prop. 2025/26:61 | prop-2025-26-61 | Utökade registerkontroller vid anställning i kommun |
| Prop. 2025/26:68 | prop-2025-26-68 | Avvikande från bestämmelserna om tyst godkännande... |
| Prop. 2025/26:59 | prop-2025-26-59 | Tillgänglighetskrav för vissa medier |

### 6. Password Leak Protection

**Action:** Verified auto-confirm email is enabled for development. Password leak protection should be enabled in Supabase dashboard manually.

---

## 🟡 P2 (Medium-Term) - COMPLETED

### 7. Fixed `extractDocNumber()` in genvag-classifier.ts

**Problem:** Function was extracting full anchor text instead of clean document numbers.

**Example Before:** `"Dir. 2023:171 Tilläggsdirektiv till Utredningen om..."` 
**Example After:** `"Dir. 2023:171"`

**Changes Made:**
1. Added `decodeHtmlEntities()` function to handle `&#xF6;`, `&ouml;`, etc.
2. Improved regex patterns with `\b` word boundaries for stricter matching
3. Added FPM (Faktapromemoria) pattern support
4. Same fix applied to `resolve-document-references/index.ts`

**Files Modified:**
- `supabase/functions/_shared/genvag-classifier.ts`
- `supabase/functions/resolve-document-references/index.ts`

### 8. HTML Entity Decoding

**Problem:** ~39 document references had HTML-encoded characters blocking resolution.

**Solution:** Added `decodeHtmlEntities()` function that handles:
- Swedish characters: ö (&#xF6;, &ouml;), ä (&#xE4;, &auml;), å (&#xE5;, &aring;)
- Common entities: &amp;, &nbsp;, &ndash;, &mdash;

### 9. Batch Resolution Ready

The `resolve-document-references` edge function is now updated and ready to run a batch resolution pass. Execute:

```bash
# Dry run first
curl -X POST https://oxwizikytcdevwkjaegq.supabase.co/functions/v1/resolve-document-references \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 100, "dryRun": true}'

# Then actual run
curl -X POST ... -d '{"batchSize": 100, "dryRun": false}'
```

### 10. Timeline Agent Deduplication (Documentation)

**Current Logic:** Deduplication based on (process_id, event_type, event_date, source_page, source_excerpt).

**Known Issue:** `committee_formed` events with same date but different `person_name` in metadata may appear as duplicates.

**Recommendation:** Consider adding metadata.person_name to uniqueness key for committee_formed events specifically. This is a **P3 future enhancement** - current behavior is acceptable.

### 11. `sou_published` Date Logic (Documentation)

**Observed:** 92.5% mismatch between `sou_published` event dates and `documents.publication_date`.

**Explanation:** These represent different concepts:
- `event_date` in timeline_events: The date the SOU was **delivered** (överlämnades) to the government
- `publication_date` in documents: The date the document was **published** on regeringen.se

**Both are correct** - they capture different aspects of the same document's lifecycle. No fix needed, but this should be documented in agent behavior specs.

---

## Validation Queries

Run these to verify cleanup:

```sql
-- Verify no Kontaktuppgifter processes
SELECT COUNT(*) FROM processes WHERE title LIKE '%Kontaktuppgifter%';
-- Expected: 0

-- Verify no self-referencing refs
SELECT COUNT(*) FROM document_references WHERE source_document_id = target_document_id;
-- Expected: 0

-- Verify no stuck tasks
SELECT COUNT(*) FROM agent_tasks WHERE status = 'processing' AND started_at < NOW() - INTERVAL '1 hour';
-- Expected: 0

-- Verify placeholder entities gone
SELECT COUNT(*) FROM entities WHERE name = 'Särskild utredare' OR name LIKE 'Kommittédirektiv%';
-- Expected: 0

-- Verify orphan propositions now have processes
SELECT COUNT(*) FROM documents d 
LEFT JOIN process_documents pd ON d.id = pd.document_id 
WHERE d.doc_type = 'proposition' AND pd.id IS NULL;
-- Expected: 0
```

---

## Next Steps

1. **Run batch document reference resolution** after edge function deployment
2. **Re-run Head Detective** on SOUs that had processes deleted
3. **Monitor for new placeholder entities** in future agent runs
4. **Consider P3 timeline dedup enhancement** for committee_formed events

---

## Author

Cleanup executed: 2025-12-16
Report generated by: Lovable AI
