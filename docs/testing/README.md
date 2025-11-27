# Metadata Agent Testing Documentation

This directory contains test protocols, results, and analysis for the Metadata Agent system.

---

## 📁 Directory Structure

- **`metadata-agent-test-group-5-protocol.md`**: Detailed protocol for Test Group 5 (Batch Processing)
- **`metadata-agent-test-results.md`**: Cumulative results from all test groups
- **`test-group-5-results-tracking.md`**: Real-time tracking sheet for Test Group 5 execution
- **`README.md`**: This file - overview and navigation guide

---

## 🧪 Test Campaign Overview

### Purpose
Validate the Metadata Agent's ability to extract structured entities (committees, people) and their relations from Swedish government documents (SOU and Directive types) while ensuring data quality through placeholder rejection.

### Test Structure

The testing is organized into progressive test groups:

1. **Test Group 1**: Basic SOU extraction ✅
2. **Test Group 2**: Basic Directive extraction ✅
3. **Test Group 3**: Entity reuse validation ✅
4. **Test Group 4**: Placeholder rejection ✅
5. **Test Group 5**: Batch processing (20 documents) 🟡 In Progress
6. **Test Group 6**: Relation extraction validation (Future)
7. **Test Group 7**: Performance & scalability (Future)

---

## 📊 Current Status

| Phase | Status | Completion Date | Result |
|-------|--------|----------------|--------|
| Test Groups 1-4 | ✅ Complete | 2025-11-27 | PASS |
| Test Group 5 | 🟡 Ready | Pending | - |
| Test Group 6+ | 📋 Planned | - | - |

---

## 🎯 Test Group 5: Next Actions

### Preparation Steps

1. **Select 20 Documents**
   - 10 SOU documents (mix of recent/older, diverse ministries)
   - 10 Directive documents (mix of recent/older, diverse ministries)
   - Include at least 2 documents known to have placeholder issues
   - Record selections in `test-group-5-results-tracking.md`

2. **Record Baseline**
   ```sql
   SELECT COUNT(*) FROM entities;
   SELECT COUNT(*) FROM relations;
   ```
   - Document in tracking sheet

3. **Set Up Tracking**
   - Open `test-group-5-results-tracking.md`
   - Fill in pre-test information
   - Prepare to record results in real-time

### Execution Steps

1. Navigate to `/admin/scraper` → **Metadata Agent Test** tab
2. For each of the 20 documents:
   - Load document by doc_number
   - Click "Run Metadata Agent"
   - Wait for completion
   - Record results in tracking sheet
3. Process documents sequentially (avoid rate limits)
4. Monitor logs for errors/warnings

### Post-Test Analysis

1. Run post-test queries (provided in tracking sheet)
2. Calculate batch-level metrics
3. Document issues encountered
4. Determine test outcome (PASS/PARTIAL/FAIL)
5. Update `metadata-agent-test-results.md` with Test Group 5 section

---

## 📖 Key Documents

### For Test Execution
→ **`metadata-agent-test-group-5-protocol.md`**  
Detailed instructions, success criteria, edge cases to watch for

→ **`test-group-5-results-tracking.md`**  
Real-time tracking sheet - fill this in during test execution

### For Results Analysis
→ **`metadata-agent-test-results.md`**  
Cumulative test results, lessons learned, recommendations

---

## ✅ Success Criteria Summary

### Individual Document Level
- ✅ No errors during execution
- ✅ ≥1 entity extracted (committee or person)
- ✅ No placeholder person names inserted
- ✅ Valid entity format (name, entity_type, source_document_id)
- ✅ Relations exist between multiple entities

### Batch Level
- ✅ 100% success rate (20/20 documents)
- ✅ ≥30% entity reuse rate (deduplication working)
- ✅ 2-8 entities per document average
- ✅ 0 placeholder person names inserted
- ✅ <60s average processing time per document
- ✅ ≥95% committee extraction recall
- ✅ ≥70% person extraction recall

---

## 🐛 Known Edge Cases

1. **Committee Name Variations**
   - Case sensitivity: "Fondmarknadsutredningen" vs "fondmarknadsutredningen"
   - Should reuse entity despite case differences

2. **Person Name Formats**
   - "Anna Svensson" (valid)
   - "Svensson, Anna" (valid)
   - "Särskild utredare" (REJECT - role title)
   - "(not specified)" (REJECT - placeholder)

3. **Role-Based Rejections**
   - "ordföranden", "samordnaren" rejected as person entities
   - But "Anna Svensson, ordföranden" → extract relation, not person name

4. **Missing Metadata**
   - Some documents have `null` ministry → should not cause failures

---

## 📝 Testing Philosophy

1. **Progressive Complexity**: Start simple, scale gradually
2. **Defense in Depth**: Prompt instructions + server-side validation
3. **Quality Over Speed**: Better to reject uncertain data than insert garbage
4. **Real-World Scenarios**: Use actual government documents, not mocked data
5. **Document Everything**: Lessons learned prevent future regressions

---

## 🔄 After Test Group 5

### If PASS (100% success rate, no critical issues):
1. Document aggregate statistics in `metadata-agent-test-results.md`
2. Identify any prompt refinements needed
3. Plan Test Group 6: Relation Extraction Validation
4. Consider production rollout for batch processing

### If PARTIAL PASS (95-99% success rate):
1. Analyze failure patterns
2. Determine if failures are acceptable edge cases
3. Document known limitations
4. Decide: proceed with caution or fix issues first

### If FAIL (<95% success rate):
1. **HALT FURTHER TESTING**
2. Review error logs for common patterns
3. Identify root causes
4. Fix critical issues
5. Re-run Test Group 5 from scratch

---

## 📞 Support & Questions

For questions about test execution or results interpretation:
1. Review the protocol documents thoroughly
2. Check `metadata-agent-test-results.md` for lessons learned
3. Examine edge function logs for detailed error messages
4. Document new edge cases discovered during testing

---

**Last Updated**: 2025-11-27  
**Next Review**: After Test Group 5 completion
