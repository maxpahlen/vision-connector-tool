# Test Group 5: Batch Processing Results Tracking

**Test Start Date**: [To be filled]  
**Test Completion Date**: [To be filled]  
**Tester**: [To be filled]  
**Protocol Version**: 1.0 (see `metadata-agent-test-group-5-protocol.md`)

---

## Pre-Test Baseline

Record these before starting the test batch:

```sql
-- Run these queries and record results
SELECT COUNT(*) as entity_count FROM entities;
SELECT COUNT(*) as relation_count FROM relations;
```

**Baseline Entities Count**: _______  
**Baseline Relations Count**: _______  
**Test Start Time**: _______

---

## Document Selection

### SOU Documents (10)

| # | Doc Number | Title | Ministry | Publication Date | Notes |
|---|------------|-------|----------|------------------|-------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
| 8 | | | | | |
| 9 | | | | | |
| 10 | | | | | |

### Directive Documents (10)

| # | Doc Number | Title | Ministry | Publication Date | Notes |
|---|------------|-------|----------|------------------|-------|
| 11 | | | | | |
| 12 | | | | | |
| 13 | | | | | |
| 14 | | | | | |
| 15 | | | | | |
| 16 | | | | | |
| 17 | | | | | |
| 18 | | | | | |
| 19 | | | | | |
| 20 | | | | | |

---

## Test Execution Results

### Individual Document Results

| # | Doc Number | Doc Type | Result | People | Committees | New Entities | Reused | Relations | Time (s) | Placeholder Issues | Notes |
|---|------------|----------|--------|--------|------------|--------------|--------|-----------|----------|-------------------|-------|
| 1 | | | ✅/❌ | | | | | | | No/Yes | |
| 2 | | | ✅/❌ | | | | | | | No/Yes | |
| 3 | | | ✅/❌ | | | | | | | No/Yes | |
| 4 | | | ✅/❌ | | | | | | | No/Yes | |
| 5 | | | ✅/❌ | | | | | | | No/Yes | |
| 6 | | | ✅/❌ | | | | | | | No/Yes | |
| 7 | | | ✅/❌ | | | | | | | No/Yes | |
| 8 | | | ✅/❌ | | | | | | | No/Yes | |
| 9 | | | ✅/❌ | | | | | | | No/Yes | |
| 10 | | | ✅/❌ | | | | | | | No/Yes | |
| 11 | | | ✅/❌ | | | | | | | No/Yes | |
| 12 | | | ✅/❌ | | | | | | | No/Yes | |
| 13 | | | ✅/❌ | | | | | | | No/Yes | |
| 14 | | | ✅/❌ | | | | | | | No/Yes | |
| 15 | | | ✅/❌ | | | | | | | No/Yes | |
| 16 | | | ✅/❌ | | | | | | | No/Yes | |
| 17 | | | ✅/❌ | | | | | | | No/Yes | |
| 18 | | | ✅/❌ | | | | | | | No/Yes | |
| 19 | | | ✅/❌ | | | | | | | No/Yes | |
| 20 | | | ✅/❌ | | | | | | | No/Yes | |

---

## Batch-Level Metrics

### Success Rate
- **Documents Processed**: ___ / 20
- **Success Rate**: ____%
- **Pass/Fail**: ✅ Pass (100%) / ⚠️ Warning (95-99%) / ❌ Fail (<95%)

### Entity Metrics
- **Total Entities Extracted**: ___
- **New Entities Created**: ___
- **Entities Reused**: ___
- **Entity Reuse Rate**: ___% (target: ≥30%)
- **Avg Entities per Document**: ___ (target: 2-8)

### Entity Type Breakdown
- **People Extracted**: ___
- **Committees Extracted**: ___
- **Other Entity Types**: ___

### Relations
- **Total Relations Created**: ___
- **Avg Relations per Document**: ___

### Quality Metrics
- **Placeholder Issues Detected**: ___ (target: 0)
- **Documents with No Entities**: ___ (should be rare)
- **Documents with Invalid Data**: ___ (target: 0)

### Performance
- **Total Processing Time**: ___ minutes
- **Average Time per Document**: ___ seconds (target: <60s)
- **Longest Processing Time**: ___ seconds (doc: ___)
- **Shortest Processing Time**: ___ seconds (doc: ___)

---

## Post-Test Analysis Queries

Run these queries after test completion:

### Entity Growth
```sql
-- Entities created during test
SELECT entity_type, COUNT(*) 
FROM entities 
WHERE created_at > '[test_start_time]'
GROUP BY entity_type;
```

**Results**:
- People: ___
- Committees: ___
- Other: ___

### Top Reused Entities
```sql
-- Entities appearing in multiple processes
SELECT e.name, e.entity_type, COUNT(DISTINCT pd.process_id) as process_count
FROM entities e
JOIN relations r ON r.source_id = e.id OR r.target_id = e.id
JOIN process_documents pd ON pd.document_id = r.source_document_id
WHERE e.created_at > '[test_start_time]'
GROUP BY e.id, e.name, e.entity_type
HAVING COUNT(DISTINCT pd.process_id) > 1
ORDER BY process_count DESC
LIMIT 10;
```

**Top Reused Entities**:
1. ___ (entity_type: ___, count: ___)
2. ___ (entity_type: ___, count: ___)
3. ___ (entity_type: ___, count: ___)
...

### Failed Extractions
```sql
-- Documents with no entities extracted
SELECT d.doc_number, d.title, d.ministry
FROM documents d
LEFT JOIN entities e ON e.source_document_id = d.id
WHERE d.doc_number IN ('[paste 20 test doc_numbers here]')
  AND e.id IS NULL;
```

**Failed Extractions**: [List doc_numbers or state "None"]

---

## Issues Encountered

### Critical Issues (❌)
[Document any critical failures, data corruption, or system errors]

### Warnings (⚠️)
[Document any edge cases, unexpected behavior, or performance concerns]

### Edge Cases Observed
[Document interesting edge cases that were handled correctly]

---

## Test Outcome

**Overall Result**: ✅ PASS / ⚠️ PARTIAL PASS / ❌ FAIL

**Justification**:
[Explain the outcome based on the success criteria from the protocol]

**Blocker Issues**: [Any issues preventing progression to next test phase]

---

## Recommendations

### Immediate Actions Required
[Any bugs or issues that must be fixed before proceeding]

### Future Improvements
[Enhancements that could improve the system but aren't blockers]

### Next Steps
[What should happen after this test group]

---

## Sign-Off

**Test Completed By**: _____________  
**Date**: _____________  
**Reviewed By**: _____________  
**Date**: _____________  

**Ready for Production**: ✅ Yes / ❌ No  
**Comments**: 

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-27
