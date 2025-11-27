# Metadata Agent Test Results

## Test Campaign Overview

**Purpose**: Validate the Metadata Agent's ability to extract entities (committees, people) and relations from SOU and Directive documents while properly rejecting placeholder values.

**Test Period**: 2025-11-27  
**Agent Version**: agent-metadata (current deployment)  
**Status**: Phase 1 Complete (Test Groups 1-4) ✅ **CONFIRMED**

---

## Test Group 1: Basic SOU Extraction ✅

**Objective**: Validate basic entity extraction from a standard SOU document

**Test Document**: SOU 2025:1  
**Date Executed**: 2025-11-27  
**Result**: ✅ PASS

### Results
- **Entities Extracted**: 2 (1 committee, 1 person)
- **Entities Created**: 2 new entities
- **Entities Reused**: 0
- **Relations Created**: 1 (person → committee)
- **Processing Time**: ~45s

### Key Findings
- Basic extraction works correctly for SOUs
- Proper entity formatting
- Relations correctly established between person and committee
- No placeholder values inserted

---

## Test Group 2: Basic Directive Extraction ✅

**Objective**: Validate basic entity extraction from a Directive document

**Test Document**: Dir. 2025:45  
**Date Executed**: 2025-11-27  
**Result**: ✅ PASS

### Results
- **Entities Extracted**: 2 (1 committee, 1 person)
- **Entities Created**: 1 new entity (person)
- **Entities Reused**: 1 (committee: "Fondmarknadsutredningen")
- **Relations Created**: 1 (person → committee)
- **Processing Time**: ~40s

### Key Findings
- Basic extraction works correctly for Directives
- Entity deduplication working (committee reused from Test Group 1)
- Proper cross-document entity linking
- No placeholder values inserted

---

## Test Group 3: Entity Reuse Validation ✅

**Objective**: Confirm entity deduplication works across multiple documents

**Test Documents**: SOU 2025:1, Dir. 2025:45  
**Date Executed**: 2025-11-27  
**Result**: ✅ PASS

### Results
- Committee "Fondmarknadsutredningen" successfully reused across both documents
- No duplicate committee entities created
- Entity matching working correctly (case-insensitive, trimmed)

### Key Findings
- Entity deduplication logic functioning as expected
- Reduces data redundancy
- Maintains referential integrity across documents

---

## Test Group 4: Placeholder Rejection ⚠️ → ✅

**Objective**: Validate that placeholder person names (roles, generic titles) are rejected

**Test Document**: Dir. 2025:45  
**Date Executed**: 2025-11-27 (initial), Re-run 2025-11-27 (after bugfix)

### Initial Run Result: ❌ FAIL
- **Issue**: OpenAI returned `"(not specified)"` as person name
- **Root Cause**: Prompt insufficient; validation did not catch placeholder
- **Impact**: Invalid person entity would have been inserted

### Bugfix Applied
- Enhanced prompt with explicit rejection instructions
- Added validation stoplist: `["(not specified)", "ej angiven", "inte angiven", "unknown", "n/a"]`
- Added role-based rejection for titles like "ordföranden", "särskild utredare"

### Re-run Result: ✅ PASS
- **Entities Reported**: 2 (OpenAI still returned person, but with role title)
- **Entities Created**: 0 new
- **Entities Reused**: 1 (committee: "Fondmarknadsutredningen")
- **Relations Created**: 0
- **People Extracted**: 0 (correctly rejected "Särskild utredare")
- **Committees Extracted**: 1 (reused)

### Key Findings
- Validation now correctly rejects placeholder values
- Role-based stoplist prevents generic titles from becoming person entities
- Committee extraction remains stable despite person rejection
- No data pollution from invalid person names

---

## Phase 1 Summary

| Test Group | Objective | Status | Key Learning |
|------------|-----------|--------|--------------|
| 1 | Basic SOU extraction | ✅ PASS | Core functionality works |
| 2 | Basic Directive extraction | ✅ PASS | Cross-doc type support confirmed |
| 3 | Entity reuse | ✅ PASS | Deduplication working correctly |
| 4 | Placeholder rejection | ✅ PASS | Validation prevents invalid data |

### Overall Assessment
- **Success Rate**: 4/4 test groups passed ✅
- **Critical Issues Found**: 1 (placeholder rejection - now fixed)
- **Regressions Introduced**: 0
- **Entity Quality**: High (no invalid data after bugfix)
- **Validation**: All bugfixes confirmed working in production

**🎉 Phase 1 Complete - Ready for Scale Testing**

---

## Next Phase: Test Group 5 - Batch Processing

**Objective**: Validate consistency and performance at scale (20 documents)

**Status**: 🟡 READY TO EXECUTE

**Protocol**: See `metadata-agent-test-group-5-protocol.md`

**Expected Outcomes**:
- 100% success rate (20/20 documents processed)
- High entity reuse rate (≥30% of entities reused)
- No placeholder values inserted
- Consistent extraction quality across diverse documents
- Acceptable performance (<60s average per document)

---

## Lessons Learned

1. **Always validate AI output**: OpenAI can return placeholder values despite instructions
2. **Defense in depth**: Prompt instructions + server-side validation = robust system
3. **Test edge cases early**: Placeholder rejection caught before production data pollution
4. **Entity reuse is critical**: Reduces redundancy and maintains data quality
5. **Iterative testing works**: Small test groups → find issues → fix → validate → scale

---

## Recommendations for Future Testing

1. Continue monitoring for new edge cases in Test Group 5
2. Add automated regression tests for placeholder rejection
3. Consider fuzzy matching for entity deduplication (e.g., "Anna Svensson" vs "Svensson, Anna")
4. Monitor processing time at scale for performance optimization
5. Document common failure patterns for future reference

---

**Last Updated**: 2025-11-27  
**Next Review**: After Test Group 5 completion
