# Entity Deduplication & Quality Improvement Plan
**Date:** 2026-01-15  
**Phase:** 2.7.10  
**Status:** APPROVED (Max ✅, Codex ✅, Lovable ✅)

---

## Executive Summary

This plan addresses data quality issues identified in the Entity Linking Audit:
1. **45 case-duplicate entity groups** - fragmented entity consolidation
2. **93 entities with truncated names** - possessive 's' over-stripping
3. **Prevention of future duplicates** - unique constraint on normalized name
4. **Invitee linking** - enable "invited vs responded" analytics

---

## Step 1: Deduplicate Entity Groups (HIGH PRIORITY)

### 1.1 Identify Duplicates

```sql
-- Find all case-duplicate groups with their entity IDs
SELECT 
  LOWER(name) as canonical_lower,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as entity_ids,
  array_agg(name ORDER BY created_at) as name_variants,
  MIN(created_at) as first_created
FROM entities 
WHERE entity_type = 'organization'
GROUP BY LOWER(name)
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
```

### 1.2 Merge Strategy

For each duplicate group:
1. **Canonical entity** = first-created entity (oldest `created_at`)
2. **Update references** = point all `remiss_responses.entity_id` to canonical
3. **Delete duplicates** = remove non-canonical entities

### 1.3 Migration SQL

```sql
-- Step 1: Create temp table with merge mappings
CREATE TEMP TABLE entity_merge_map AS
WITH duplicate_groups AS (
  SELECT 
    LOWER(name) as canonical_lower,
    array_agg(id ORDER BY created_at) as entity_ids
  FROM entities 
  WHERE entity_type = 'organization'
  GROUP BY LOWER(name)
  HAVING COUNT(*) > 1
)
SELECT 
  entity_ids[1] as canonical_id,
  unnest(entity_ids[2:]) as duplicate_id
FROM duplicate_groups;

-- Step 2: Update remiss_responses to point to canonical entities
UPDATE remiss_responses rr
SET entity_id = emm.canonical_id
FROM entity_merge_map emm
WHERE rr.entity_id = emm.duplicate_id;

-- Step 3: Delete duplicate entities
DELETE FROM entities 
WHERE id IN (SELECT duplicate_id FROM entity_merge_map);

-- Step 4: Verify no duplicates remain
SELECT LOWER(name), COUNT(*) 
FROM entities 
WHERE entity_type = 'organization'
GROUP BY LOWER(name) 
HAVING COUNT(*) > 1;
-- Expected: 0 rows
```

### 1.4 Verification Queries

```sql
-- Before: Count duplicate groups
SELECT COUNT(*) as duplicate_groups FROM (
  SELECT LOWER(name) FROM entities WHERE entity_type = 'organization'
  GROUP BY LOWER(name) HAVING COUNT(*) > 1
) t;
-- Current: 45

-- After: Should be 0
-- Also verify linking consistency maintained
SELECT normalized_org_name, COUNT(DISTINCT entity_id) 
FROM remiss_responses 
WHERE entity_id IS NOT NULL
GROUP BY normalized_org_name 
HAVING COUNT(DISTINCT entity_id) > 1;
-- Expected: 0 rows
```

---

## Step 2: Fix Possessive 's' Stripping (MEDIUM PRIORITY)

### 2.1 Root Cause

In `organization-matcher.ts`, the `normalizeOrganizationName()` function strips trailing 's' from names > 6 chars as a Swedish genitive handling strategy. This incorrectly truncates English names like:
- "Civil Rights Defenders" → "Civil Rights Defender"
- "Hi3G Access AB" → "Hi3G Acces"
- "Friends" → "Friend"

### 2.2 Fix Strategy

**Option A: Expand exception list** (simpler, less robust)
```typescript
const KEEP_TRAILING_S = [
  // Existing entries...
  // Add common English patterns:
  'access', 'news', 'defenders', 'friends', 'partners', 
  'systems', 'solutions', 'services', 'industries',
  'bofors', 'analysis', 'congress', 'press', 'express',
  // Swedish agency endings
  'trafikanalys', 'biståndsanalys',
];
```

**Option B: Smarter stripping logic** (more robust)
Only strip 's' when it appears to be Swedish genitive context:
- Word ends in 's' AND preceded by a proper noun pattern
- OR word is in a known genitive phrase list

### 2.3 Repair Affected Entities

After fixing the normalizer, repair entity names:

```sql
-- Identify entities that may have been truncated
-- (names ending in consonant clusters that suggest missing 's')
SELECT id, name 
FROM entities 
WHERE entity_type = 'organization'
AND (
  name LIKE '%Acces' OR
  name LIKE '%Defender' OR 
  name LIKE '%Friend' OR
  name LIKE '%Partner' OR
  name LIKE '%System' OR
  name LIKE '%New' OR
  name LIKE '%Bofor' OR
  name LIKE '% analy' OR
  name LIKE '%analys'
);

-- Manual review and update as needed
-- (Some may be intentionally singular)
```

---

## Step 3: Prevent Future Duplicates (MEDIUM PRIORITY)

### 3.1 Add Unique Constraint

```sql
-- Add a generated column for normalized lowercase name
ALTER TABLE entities 
ADD COLUMN name_lower TEXT GENERATED ALWAYS AS (LOWER(name)) STORED;

-- Add unique constraint for organization entities
CREATE UNIQUE INDEX idx_entities_org_name_unique 
ON entities (name_lower) 
WHERE entity_type = 'organization';
```

### 3.2 Update Bootstrap Function

Modify `bootstrap-org-entities/index.ts` to check against lowercase names:

```typescript
// Before inserting, check for case-insensitive match
const existingCheck = await supabase
  .from('entities')
  .select('id, name')
  .eq('entity_type', 'organization')
  .ilike('name', candidateName)
  .limit(1);

if (existingCheck.data?.length > 0) {
  // Skip - already exists (case-insensitive)
  continue;
}
```

---

## Step 4: Link Invitees to Entities (REQUIRED)

### 4.1 Purpose

Enable analytics like:
- "Which organizations were invited but didn't respond?"
- "Response rate by organization type"
- "Invitee participation trends"

### 4.2 Implementation Strategy

Create a new edge function `link-invitee-entities` that:
1. Iterates through `remiss_invitees` with NULL `entity_id`
2. Uses same `matchOrganization()` logic as response linking
3. Updates `entity_id` on successful match

### 4.3 Edge Function Skeleton

```typescript
// supabase/functions/link-invitee-entities/index.ts

// Fetch invitees with NULL entity_id
// For each invitee:
//   1. Normalize organization_name
//   2. Call matchOrganization()
//   3. Update entity_id if match found
// Return stats: { processed, linked, unlinked, errors }
```

### 4.4 Migration (add index for performance)

```sql
-- Add index for faster lookups
CREATE INDEX idx_remiss_invitees_entity_id 
ON remiss_invitees (entity_id) 
WHERE entity_id IS NULL;
```

---

## Execution Order

| Step | Priority | Owner | Dependencies |
|------|----------|-------|--------------|
| 1. Deduplicate entities | HIGH | Lovable | None |
| 2. Fix 's' stripping | MEDIUM | Lovable | Step 1 (clean slate) |
| 3. Add unique constraint | MEDIUM | Lovable | Step 1 (no duplicates) |
| 4. Link invitees | REQUIRED | Lovable | Step 1 (canonical entities) |

---

## Rollback Plan

### Step 1 Rollback
- Not easily reversible (deleted entities gone)
- Mitigation: Export duplicate entities before deletion

```sql
-- Pre-deletion backup
CREATE TABLE entities_duplicates_backup_20260115 AS
SELECT * FROM entities WHERE id IN (
  SELECT unnest(entity_ids[2:]) FROM (
    SELECT array_agg(id ORDER BY created_at) as entity_ids
    FROM entities WHERE entity_type = 'organization'
    GROUP BY LOWER(name) HAVING COUNT(*) > 1
  ) t
);
```

### Steps 2-4 Rollback
- Code changes can be reverted via git
- Constraint can be dropped: `DROP INDEX idx_entities_org_name_unique;`

---

## Success Criteria

| Metric | Before | After | 
|--------|--------|-------|
| Duplicate entity groups | 45 | 0 |
| Truncated entity names | 93 | 0 |
| Linking consistency | 100% | 100% |
| Invitees linked | 0% | >95% |
| Unique constraint | None | Active |

---

## Sign-off

- [x] Max (Human) - APPROVED 2026-01-15
- [x] Codex - APPROVED 2026-01-15
- [x] Lovable - APPROVED 2026-01-15
