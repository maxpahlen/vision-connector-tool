# Remissinstanser & Entity Linking Audit Report

> **⚠️ SUPERSEDED:** This audit was conducted on 2026-01-15 during Phase 2.7.9.4. All issues identified have been resolved as of 2026-01-15 (migration v2.7.10). See addendum below.

**Date:** 2026-01-15  
**Phase:** 2.7.9.4 (Post Abbreviation & Stem Matching)  
**Status:** ✅ RESOLVED (2026-01-15)

---

## Post-Resolution Addendum (2026-01-15)

### Current Metrics

| Metric | Before | After | Status |
|--------|--------|-------|--------|
| Total organization entities | 1,533 | 1,473 | ✅ Cleaned |
| Case-duplicate entity groups | 45 | 0 | ✅ Deduplicated |
| Entities with truncated names | 93 | 0 | ✅ Fixed |
| Remiss responses linked | 99.9% | 99.91% | ✅ Excellent |
| Invitees linked to entities | 0% | 100% | ✅ Fully linked |

### Fixes Applied

1. **Entity Deduplication** - Merged 45 case-duplicate groups into canonical entities
2. **Possessive 's' Fix** - Updated KEEP_TRAILING_S list in organization-matcher.ts  
3. **Direct Name Repairs** - Fixed 3 entities (BAE Systems Bofors, Civil Rights Defenders, etc.)
4. **Orphan Cleanup** - Deleted 14 orphaned truncated entities
5. **Invitee Linking** - New edge function `link-invitee-entities` links all 4,321 invitees

### Documentation

- `docs/development/ENTITY_DEDUPLICATION_PLAN.md` - Full dedup plan and execution
- `docs/development/branches/phase-5.3-remisser-remissvar.md` - Phase completion summary

---

## Original Audit (Historical Record)

### Executive Summary (Original)

| Metric | Value | Status |
|--------|-------|--------|
| Total organization entities | 1,533 | ⚠️ Contains duplicates |
| Remiss responses linked | 3,421 / 3,424 (99.9%) | ✅ Excellent |
| Remiss responses unlinked | 3 | ✅ (all are document titles, correctly rejected) |
| Invitees linked to entities | 0 / 4,321 (0%) | ⚠️ Not linked at time of audit |
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
                           entities (1,473 orgs)
                                      ↓
                         link-remissvar-entities
                                      ↓
                    remiss_responses (3,424 records) → 99.91% linked
                                      ↓
                         link-invitee-entities
                                      ↓
                    remiss_invitees → 100% linked
```

### Current State (Post-Resolution)

- `remiss_responses.entity_id` — 99.91% linked (3 unlinked are document titles)
- `remiss_invitees.entity_id` — 100% linked via `link-invitee-entities` function
- `entities` table — 1,473 clean, deduplicated organization records

---

## 2. Issues Identified (Now Resolved)

### 2.1 ✅ Case-Sensitive Duplicates — FIXED

**Original Issue:** 45 duplicate entity groups from case differences  
**Resolution:** Merged all duplicates, updated FKs, deleted orphans

### 2.2 ✅ Possessive 's' Over-Stripping — FIXED

**Original Issue:** 93 entities with incorrectly truncated names  
**Resolution:** Updated KEEP_TRAILING_S list and repaired affected entities

---

## 3. Positive Findings (Confirmed)

### 3.1 ✅ High Linking Success Rate (99.91%)

- **3,324 responses** matched with high confidence
- **78 responses** manually approved
- **19 responses** created new entities
- Only **3 responses** unlinked (all document titles, correctly rejected)

### 3.2 ✅ Consistent Entity Resolution

When the same `normalized_org_name` appears in multiple responses, it **always** links to the **same entity**. Query confirmed: 0 cases of same org name → different entities.

### 3.3 ✅ Variation Handling Works Well

The system correctly consolidates input variations (6 variants for Länsstyrelsen i Stockholms län, 5 for SKR, etc.)

### 3.4 ✅ Abbreviation Matching Working

WWF, Svebio, SCB, FRA, IMY all match correctly.

### 3.5 ✅ Document Title Rejection Working

The 3 unlinked responses are correctly rejected document titles.

---

## 4. Database Statistics (Current)

### 4.1 Entity Sources

| Source | Count |
|--------|-------|
| bootstrap_from_invitees | ~1,430 |
| uninvited_respondent | 19 |
| manual_add | 9 |
| other | 15 |

### 4.2 Entity Rules (Allow/Block Lists)

| Rule Type | Count |
|-----------|-------|
| allow | 5 |
| block | 2 |

### 4.3 Remiss Documents

All 54 remiss documents have status `scraped` ✅

---

## 5. Verification Queries

### Check for linking consistency:
```sql
SELECT normalized_org_name, COUNT(DISTINCT entity_id) as entities
FROM remiss_responses WHERE entity_id IS NOT NULL
GROUP BY normalized_org_name HAVING COUNT(DISTINCT entity_id) > 1;
-- Expected: 0 rows ✅
```

### Check invitee linking:
```sql
SELECT COUNT(*) as total, 
       COUNT(entity_id) as linked,
       COUNT(*) - COUNT(entity_id) as unlinked
FROM remiss_invitees;
-- Expected: 4321 total, 4321 linked, 0 unlinked ✅
```

### Check for remaining duplicates:
```sql
SELECT LOWER(name) as canonical, COUNT(*) as cnt
FROM entities WHERE entity_type = 'organization'
GROUP BY LOWER(name) HAVING COUNT(*) > 1;
-- Expected: 0 rows ✅
```

---

## 6. Conclusion

**Original Grade:** B+ (Functional, minor data quality issues)  
**Current Grade:** A (All issues resolved, 100% linking coverage)

The entity linking system is now fully operational with:
- 99.91% response linking rate
- 100% invitee linking rate
- 0 duplicate entities
- 0 truncated names
- Clean, maintainable entity data
