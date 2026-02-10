# Metadata Agent Test Group 5: Batch Processing Protocol

## 📋 Overview

Test Group 5 validates that the Metadata Agent can process multiple documents in batch mode while maintaining:
- Consistent entity extraction quality
- Proper entity reuse (deduplication)
- Correct relation mapping
- Safe placeholder rejection
- Performance within acceptable limits

---

## 🎯 Test Objectives

1. **Volume validation**: Process 20 documents without failures
2. **Entity reuse validation**: Confirm committees/people are deduplicated across documents
3. **Quality consistency**: Extraction quality remains stable across batch
4. **Edge case coverage**: Include diverse document types and metadata scenarios
5. **Performance**: Batch completes within reasonable time (~10-15 minutes)

---

## 📦 Document Selection Criteria

### Required Mix (20 documents total)

#### **10 SOU Documents**
- **3 documents**: Recent SOUs (2024-2025) with clear committee + person metadata
- **3 documents**: Mid-range SOUs (2022-2023) with standard metadata
- **3 documents**: Older SOUs (2020-2021) for variety
- **1 document**: SOU with committee but NO person names (placeholder rejection test)

#### **10 Directive Documents**
- **3 documents**: Recent Directives (2025) with clear person + committee
- **3 documents**: Mid-range Directives (2023-2024)
- **3 documents**: Older Directives (2021-2022)
- **1 document**: Directive with committee but NO valid person names

### Selection Guidelines

✅ **Do include**:
- Documents from different ministries (diversity)
- Documents with varying content lengths
- Mix of committee sizes (1-10 members)
- Documents where entity reuse is likely (same committees/people across docs)

❌ **Avoid**:
- Documents without raw_content (not yet extracted)
- Duplicate doc_numbers
- Documents known to have corrupted content

---

## 🔍 How to Select Documents

### Using MetadataAgentTest Component

1. Navigate to `/admin/scraper`
2. Click on **"Metadata Agent Test"** tab
3. Use filters:
   - **Doc Type**: Select "SOU" first
   - Load documents
   - Manually review titles/ministries to ensure diversity
   - Record 10 doc_numbers

4. Repeat for **Directives**

### Manual Selection Query (if direct DB access available)

```sql
-- 10 SOUs with content, diverse ministries
SELECT 
  doc_number,
  title,
  ministry,
  publication_date
FROM documents
WHERE doc_type = 'SOU' 
  AND raw_content IS NOT NULL
  AND LENGTH(raw_content) > 1000
ORDER BY publication_date DESC, ministry
LIMIT 10;

-- 10 Directives with content, diverse ministries
SELECT 
  doc_number,
  title,
  ministry,
  publication_date
FROM documents
WHERE doc_type = 'Directive' 
  AND raw_content IS NOT NULL
  AND LENGTH(raw_content) > 1000
ORDER BY publication_date DESC, ministry
LIMIT 10;
```

---

## 📝 Test Execution Protocol

### Pre-Test Checklist

- [ ] Edge function `agent-metadata` is deployed
- [ ] Database has entities/relations tables ready
- [ ] OpenAI API key is configured (`OPENAI_API_KEY` secret)
- [ ] MetadataAgentTest component is functional

### Execution Steps

1. **Record baseline state**:
   ```sql
   SELECT COUNT(*) FROM entities;
   SELECT COUNT(*) FROM relations;
   ```

2. **For each of the 20 documents**:
   - Load document in MetadataAgentTest
   - Click "Run Metadata Agent"
   - Wait for completion
   - Record results in tracking sheet (see below)

3. **Run documents sequentially** (not parallel) to avoid rate limits

4. **Monitor logs** for warnings/errors during processing

---

## ✅ Success Criteria

### Individual Document Level

For **each** document processed:

| Criterion | Pass Condition |
|-----------|----------------|
| **Execution** | No errors, completes successfully |
| **Entities extracted** | ≥1 entity found (committee or person) |
| **Placeholder rejection** | No `(not specified)` or role titles as person names |
| **Entity format** | All entities have `name`, `entity_type`, valid `source_document_id` |
| **Relations** | If multiple entities, relations exist between them |

### Batch-Level Metrics

| Metric | Target | Pass/Fail |
|--------|--------|-----------|
| **Success rate** | 20/20 documents processed without errors | ✅ Pass = 100%, ⚠️ Warning = 95-99%, ❌ Fail < 95% |
| **Entity reuse rate** | ≥30% of entities reused (not newly created) | ✅ High reuse indicates proper deduplication |
| **Avg entities per doc** | 2-8 entities per document | ✅ Within expected range |
| **Person validation** | 0 placeholder person names inserted | ✅ Pass = 0 placeholders, ❌ Fail > 0 |
| **Processing time** | <60 seconds per document average | ✅ Acceptable performance |
| **Committee extraction** | ≥95% of docs with committees extract them | ✅ High recall |
| **Person extraction** | ≥70% of docs with valid people extract them | ✅ Reasonable recall given validation |

---

## 📊 Results Tracking Sheet

Create a spreadsheet or markdown table:

| # | Doc Number | Doc Type | Ministry | Result | Entities Created | Entities Reused | Relations | Time (s) | Notes |
|---|------------|----------|----------|--------|------------------|----------------|-----------|----------|-------|
| 1 | SOU 2025:1 | SOU | ... | ✅/❌ | 3 | 1 | 2 | 45 | ... |
| 2 | Dir. 2025:45 | Directive | ... | ✅/❌ | 0 | 1 | 0 | 32 | Placeholder rejected correctly |
| ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |

---

## 🐛 Known Edge Cases to Watch For

1. **Committee name variations**:
   - "Fondmarknadsutredningen" vs "fondmarknadsutredningen" (case sensitivity)
   - Should reuse entity despite case differences

2. **Person name formats**:
   - "Anna Svensson" (valid)
   - "Svensson, Anna" (valid if contains space)
   - "Särskild utredare" (REJECT)
   - "(not specified)" (REJECT)

3. **Role-based rejections**:
   - Ensure "ordföranden", "samordnaren" rejected as person entities
   - But "Anna Svensson, ordföranden" → extract relation, not person name

4. **Ministry field**:
   - Some documents may have `null` ministry
   - Should not cause failures

---

## 🔄 Post-Test Analysis

### Queries to Run

```sql
-- Total entities created during batch
SELECT entity_type, COUNT(*) 
FROM entities 
WHERE created_at > '[test_start_time]'
GROUP BY entity_type;

-- Top reused entities
SELECT e.name, e.entity_type, COUNT(DISTINCT pd.process_id) as process_count
FROM entities e
JOIN relations r ON r.source_id = e.id OR r.target_id = e.id
JOIN process_documents pd ON pd.document_id = r.source_document_id
GROUP BY e.id, e.name, e.entity_type
HAVING COUNT(DISTINCT pd.process_id) > 1
ORDER BY process_count DESC
LIMIT 20;

-- Documents with no entities extracted
SELECT d.doc_number, d.title, d.ministry
FROM documents d
LEFT JOIN entities e ON e.source_document_id = d.id
WHERE d.doc_number IN ('[list of 20 test doc_numbers]')
  AND e.id IS NULL;
```

---

## 🚨 Failure Response Plan

### If <95% success rate:
1. Review error logs for common patterns
2. Identify failing document characteristics
3. Fix edge cases in validation logic
4. Re-run failed documents

### If excessive placeholders inserted:
1. **HALT TESTING IMMEDIATELY**
2. Review validation logic in `agent-metadata/index.ts`
3. Add missing stoplist terms
4. Re-deploy edge function
5. Restart Test Group 5

### If poor entity reuse (<20%):
1. Check entity matching logic (case sensitivity, trimming)
2. Review `name` normalization
3. Consider fuzzy matching for similar names

---

## 📌 Next Steps After Test Group 5

Upon successful completion:
- Document aggregate statistics
- Identify any prompt refinements needed
- Proceed to **Test Group 6: Relation Extraction Validation**

---

## 🎓 Lessons from Previous Test Groups

- **Test Group 1**: Validated basic SOU extraction works
- **Test Group 2**: Validated basic Directive extraction works
- **Test Group 3**: Validated entity reuse (deduplication) works
- **Test Group 4**: Validated placeholder rejection works correctly
- **Test Group 5**: Now validating all of the above at scale

---

## Document Candidate List Template

Fill this in during document selection:

### SOU Documents (10)
1. SOU [number] - [title] - [ministry]
2. SOU [number] - [title] - [ministry]
3. ...

### Directive Documents (10)
1. Dir. [number] - [title] - [ministry]
2. Dir. [number] - [title] - [ministry]
3. ...

---

**Protocol Version**: 1.0  
**Created**: 2025-11-27  
**Status**: Ready for execution
