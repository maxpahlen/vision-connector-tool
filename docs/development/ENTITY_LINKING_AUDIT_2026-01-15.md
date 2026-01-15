# Remissinstanser & Entity Linking Audit Report
**Date:** 2026-01-15  
**Phase:** 2.7.9.4 (Post Abbreviation & Stem Matching)

---

## Executive Summary

| Metric | Value | Status |
|--------|-------|--------|
| Total organization entities | 1,533 | ⚠️ Contains duplicates |
| Remiss responses linked | 3,421 / 3,424 (99.9%) | ✅ Excellent |
| Remiss responses unlinked | 3 | ✅ (all are document titles, correctly rejected) |
| Invitees linked to entities | 0 / 4,321 (0%) | ⚠️ By design - invitees don't get entity_id |
| Case-duplicate entity groups | 45 | 🔴 Critical - needs deduplication |
| Entities with truncated names | 93 | 🟡 Medium - possessive 's' over-stripping |
| High-confidence matches | 3,324 (97.2%) | ✅ Excellent |
| Manually approved | 78 | ✅ Working |
| Manually created | 19 | ✅ Working |

---

## 1. Data Pipeline Overview

```
remissinstanser PDFs → parse → remiss_invitees (4,321 records)
                                      ↓
                         bootstrap-org-entities
                                      ↓
                           entities (1,533 orgs)
                                      ↓
                         link-remissvar-entities
                                      ↓
                    remiss_responses (3,424 records) → 99.9% linked
```

### Key Insight
The `remiss_invitees` table stores **invited organizations** parsed from remissinstanser PDFs, while `remiss_responses` stores **actual responses**. The linking happens to responses, not invitees. The `entity_id` column in `remiss_invitees` is **unused** (all NULL) - this is by design, not a bug.

---

## 2. Critical Issues

### 2.1 🔴 Case-Sensitive Duplicates (45 groups)

The entity bootstrap created duplicate entities due to case differences:

| Original Name Variants | Duplicate Count | Entity IDs |
|------------------------|-----------------|------------|
| BRIS / Barnens rätt i samhället | 6 entities | Multiple |
| Civil Rights Defenders / defenders | 2 entities | 2b7f3158... / 4133460b... |
| Rädda Barnen / barnen | 2 entities | 3e699b81... / e86983a3... |
| Sveriges Kommuner och Regioner | 3 entities (incl. SKR variant) | Multiple |
| Lantbrukarnas Riksförbund / riksförbund | 2 entities | 50ea4b3a... / 041b7cd6... |
| Statistiska Centralbyrån / centralbyrån | 2 entities | f8d5e543... / 62ee8bed... |
| ... (39 more groups) | | |

**Root Cause:** The bootstrap function normalizes names but creates entities using the **original** name from invitees. When "Rädda Barnen" and "Rädda barnen" appear in different PDFs, both get created.

**Impact:** 
- Entity consolidation is fragmented
- Analytics queries may undercount participation
- Future linking may pick wrong duplicate

### 2.2 🟡 Possessive 's' Over-Stripping (93 entities)

The normalizer strips trailing 's' from names > 6 chars, causing incorrect truncation:

| Original Name | Stored Name | Issue |
|---------------|-------------|-------|
| Hi3G Access AB | Hi3G Acces | Wrong |
| Civil Rights Defenders | Civil Rights Defender | Wrong |
| BAE Systems Bofors AB | BAE Systems Bofor | Wrong |
| Bodecker Partners | Bodecker Partner | Wrong |
| Friends | Friend | Wrong |
| Trafikanalys | Trafikanaly | Wrong (but also stored correctly!) |
| Expertgruppen för biståndsanalys | Expertgruppen för biståndsanaly | Wrong |
| Bonnier News AB | Bonnier New | Wrong |

**Root Cause:** The KEEP_TRAILING_S exception list in `organization-matcher.ts` doesn't include common English endings like `-ness`, `-less`, `-ers`, `-ors`, `-ess`, `-ous`.

**Impact:** Entity names are incorrect in the database, though matching still works because normalization is applied consistently.

---

## 3. Positive Findings

### 3.1 ✅ High Linking Success Rate (99.9%)

- **3,324 responses** matched with high confidence
- **78 responses** manually approved
- **19 responses** created new entities
- Only **3 responses** unlinked (all document titles, correctly rejected)

### 3.2 ✅ Consistent Entity Resolution

When the same `normalized_org_name` appears in multiple responses, it **always** links to the **same entity**. Query confirmed: 0 cases of same org name → different entities.

### 3.3 ✅ Variation Handling Works Well

The system correctly consolidates input variations:

| Entity | Input Variations Consolidated |
|--------|------------------------------|
| Länsstyrelsen i Stockholms län | 6 variations ("Stockholm", "Stockholms Län", etc.) |
| Sveriges Kommuner och Regioner | 5 variations (incl. typo "Sverigess") |
| Integritetsskyddsmyndigheten | 5 variations (IMY, Integritetskyddsmyndigheten, etc.) |
| Kungliga Tekniska högskolan | 5 variations (KTH, full name, etc.) |

### 3.4 ✅ Abbreviation Matching Working

After Phase 2.7.9.4 fixes:
- "WWF Sverige" → WWF (World Wide Fund for Nature) Sweden ✅
- "Svebio" → Svenska bioenergiföreningen ✅  
- "SCB" → Statistiska Centralbyrån ✅
- "FRA" → Försvarets radioanstalt ✅
- "IMY" → Integritetsskyddsmyndigheten ✅

### 3.5 ✅ Document Title Rejection Working

The 3 unlinked responses are correctly rejected:
```
- "Remiss av betänkande SOU 2025_103 En ny produktansvarslag"
- "Remiss av SOU 2025:106 Om överföring av Sjätte AP-fondens..."
- "Remiss av betänkandet Stärkt insyn i politiska processer..."
```

---

## 4. Database Statistics

### 4.1 Entity Sources

| Source | Count |
|--------|-------|
| bootstrap_from_invitees | 1,488 |
| uninvited_respondent | 19 |
| unknown | 17 |
| manual_add | 9 |

### 4.2 Entity Rules (Allow/Block Lists)

| Rule Type | Count |
|-----------|-------|
| allow | 5 |
| block | 2 |

### 4.3 Remiss Documents

All 54 remiss documents have status `scraped` ✅

---

## 5. Recommended Actions

### 5.1 🔴 High Priority: Deduplicate Entities

**SQL to identify and merge duplicates:**
```sql
-- Find all case-duplicate groups
SELECT LOWER(name) as canonical, 
       array_agg(id ORDER BY created_at) as ids_to_merge,
       array_agg(name ORDER BY created_at) as name_variants
FROM entities 
WHERE entity_type = 'organization'
GROUP BY LOWER(name)
HAVING COUNT(*) > 1;
```

**Merge strategy:**
1. Pick the first-created entity as canonical
2. Update all `remiss_responses.entity_id` to point to canonical
3. Delete duplicate entities

### 5.2 🟡 Medium Priority: Fix Possessive 's' Stripping

**Update `organization-matcher.ts` KEEP_TRAILING_S list:**
```typescript
const KEEP_TRAILING_S = [
  // Existing...
  // Add common English patterns:
  'access', 'news', 'defenders', 'friends', 'partners', 
  'systems', 'solutions', 'services', 'industries',
  'bofors', 'redhawks', 'analysis', // Swedish agency endings
];
```

Or better: only strip 's' if followed by possessive context (e.g., "'s" or Swedish genitive patterns).

### 5.3 🟢 Low Priority: Link Invitees to Entities

Currently `remiss_invitees.entity_id` is unused. Could add linking to enable queries like "which organizations were invited but didn't respond?"

---

## 6. Verification Queries

### Check for linking inconsistencies:
```sql
SELECT normalized_org_name, COUNT(DISTINCT entity_id) as entities
FROM remiss_responses WHERE entity_id IS NOT NULL
GROUP BY normalized_org_name HAVING COUNT(DISTINCT entity_id) > 1;
-- Expected: 0 rows ✅
```

### Check approval queue size:
```sql
SELECT COUNT(*) FROM remiss_responses 
WHERE entity_id IS NULL 
   OR match_confidence IN ('low', 'medium', 'unmatched');
-- Current: 3 (all document titles)
```

---

## 7. Conclusion

The entity linking system is **functioning well** with a **99.9% success rate**. The main issues are:

1. **45 duplicate entity groups** from case-insensitive bootstrap
2. **93 entities with truncated names** from over-aggressive 's' stripping

Neither issue affects current linking accuracy, but deduplication should be done before scaling further.

**Overall Grade: B+** (Functional, minor data quality issues to address)
