# Golden SOU Test Set

**Purpose**: Define a stable set of representative SOU documents with documented expected outputs for regression testing and quality validation.

**Last Updated**: 2025-11-27  
**Status**: Active

---

## Overview

This golden test set contains 2-3 carefully selected SOU documents that represent different complexity levels and edge cases. These documents serve as:
- **Regression test baselines**: Validate that system changes don't degrade extraction quality
- **Quality benchmarks**: Measure extraction accuracy over time
- **Integration test fixtures**: Verify end-to-end orchestration works correctly

---

## Golden Test Documents

### Document 1: Standard Complexity SOU
**SOU 2023:63** - *En del av sjukförsäkringen – Delbetänkande*

**Characteristics**:
- Typical structure with clear sections
- Moderate entity count (4-6 committee members)
- Standard committee structure
- Clear directive references
- Publication date: 2023-12-14

**Expected Outputs**:

#### Entities
Minimum 4 entities of type `person`:
- Committee chairperson (with role)
- 3-4 committee members (with roles: expert, secretary, etc.)
- All entities should have:
  - `source_document_id` matching SOU document
  - `source_excerpt` with quoted text
  - `source_page` number

#### Relations
Minimum 4 relations of type `committee_membership`:
- Each person → process relationship
- `source_excerpt` containing context
- `source_page` documented

#### Timeline Events
Expected events (if data available):
- `directive` event with directive date
- `published` event with publication date
- All events should have:
  - `event_date` in YYYY-MM-DD format
  - `source_excerpt` from document
  - `actors` array with relevant entities

#### Citation Quality
- **Required**: Every entity/relation/event must have `source_excerpt`
- **Required**: Every item must have `source_page` number
- **Excerpt length**: 50-300 characters
- **Excerpt quality**: Must contain the actual name/date being extracted

---

### Document 2: High Complexity SOU
**SOU 2024:12** - *Ett starkare skydd för de som utsätts för brott*

**Characteristics**:
- Larger committee (6-8 members)
- Multiple expert roles
- Complex directive structure
- Extended timeline with multiple events
- Publication date: 2024-03-14

**Expected Outputs**:

#### Entities
Minimum 6 entities of type `person`:
- Committee chairperson
- 5-7 committee members with various roles
- At least 2 different role types (e.g., expert, secretary, member)

#### Relations
Minimum 6 relations:
- Each person → process
- At least one secretary → process
- At least one expert → process

#### Timeline Events
Minimum 3 events:
- `directive` event
- `published` event
- At least 1 intermediate event (if available in document)

#### Citation Quality
- Same standards as Document 1
- Additional validation: Multiple excerpts from different pages
- Verify no duplicate excerpts

---

### Document 3: Minimal/Edge Case SOU
**SOU 2023:08** - *Simple structure or minimal metadata*

**Characteristics**:
- Minimal committee information
- Few entities
- Basic structure
- Tests handling of sparse data

**Expected Outputs**:

#### Entities
Minimum 2 entities:
- At least chairperson
- May have 1-2 additional members
- Tests system behavior with minimal data

#### Relations
Minimum 2 relations:
- Corresponding to extracted entities

#### Timeline Events
Minimum 2 events:
- `directive` and `published` at minimum
- Tests basic timeline construction

#### Citation Quality
- Same citation standards apply
- Validates quality doesn't degrade with sparse data

---

## Validation Criteria

### Pass Criteria
For a test run to PASS, it must meet:

1. **Entity Extraction**:
   - ✅ Entity count ≥ expected minimum
   - ✅ All entities have `source_excerpt`
   - ✅ All entities have `source_page` > 0
   - ✅ No placeholder values ("Unknown", "N/A", etc.)
   - ✅ Names are properly capitalized and formatted

2. **Relation Extraction**:
   - ✅ Relation count ≥ expected minimum
   - ✅ All relations have valid `source_id` and `target_id`
   - ✅ All relations have `source_excerpt`
   - ✅ Relation types are correct (`committee_membership`)

3. **Timeline Events**:
   - ✅ Event count ≥ expected minimum
   - ✅ All events have valid `event_date` in YYYY-MM-DD format
   - ✅ All events have `source_excerpt`
   - ✅ Event types are correct (`directive`, `published`, etc.)

4. **Citation Quality**:
   - ✅ Excerpt length: 50-300 characters
   - ✅ Excerpts contain the actual data being extracted
   - ✅ Page numbers are reasonable (1 to document page count)
   - ✅ No duplicate excerpts within same document

5. **Process Stage**:
   - ✅ Process stage correctly computed
   - ✅ Stage explanation is clear and references evidence

### Quality Metrics

Track these metrics over time:

```
- Average entities per document
- Average relations per document
- Citation coverage (% with excerpts)
- Citation quality score (manual review)
- Processing time per document
- Error rate
```

---

## Running the Golden Test Set

### Using Integration Test Component

1. Navigate to `/admin/scraper`
2. Open "Integration Test" component
3. The test will automatically:
   - Verify these documents exist
   - Run Head Detective v2 orchestration
   - Validate outputs against criteria above

### Manual Testing Protocol

1. **Identify Golden Documents**:
   ```sql
   SELECT id, doc_number, title, pdf_url
   FROM documents
   WHERE doc_number IN ('SOU 2023:63', 'SOU 2024:12', 'SOU 2023:08')
     AND doc_type = 'SOU';
   ```

2. **Clear Existing Data** (optional for clean test):
   ```sql
   -- Be careful! This deletes extracted data
   DELETE FROM entities WHERE source_document_id = '<document_id>';
   DELETE FROM relations WHERE source_document_id = '<document_id>';
   DELETE FROM agent_tasks WHERE document_id = '<document_id>';
   ```

3. **Trigger Head Detective**:
   - Use HeadDetectiveTest component
   - Or call edge function directly
   - Monitor task queue completion

4. **Validate Outputs**:
   ```sql
   -- Check entities
   SELECT COUNT(*), entity_type, 
          COUNT(*) FILTER (WHERE source_excerpt IS NOT NULL) as with_citations
   FROM entities
   WHERE source_document_id = '<document_id>'
   GROUP BY entity_type;
   
   -- Check relations
   SELECT COUNT(*),
          COUNT(*) FILTER (WHERE source_excerpt IS NOT NULL) as with_citations
   FROM relations
   WHERE source_document_id = '<document_id>';
   
   -- Check timeline events
   SELECT event_type, event_date, source_excerpt
   FROM timeline_events te
   JOIN process_documents pd ON te.process_id = pd.process_id
   WHERE pd.document_id = '<document_id>'
   ORDER BY event_date;
   ```

5. **Compare Against Expected Outputs**:
   - Entity counts
   - Citation coverage
   - Quality of excerpts
   - Stage computation accuracy

---

## Regression Test Schedule

### When to Run

- **Before production deployment**: Always run golden test
- **After agent prompt changes**: Validate extraction quality
- **After LLM model changes**: Ensure output consistency
- **Weekly baseline**: Track quality metrics over time
- **After database schema changes**: Verify data integrity

### Recording Results

Create a dated record in `docs/testing/golden-test-results/YYYY-MM-DD.md`:

```markdown
# Golden Test Results - 2025-11-27

## Summary
- ✅ Document 1: PASS
- ✅ Document 2: PASS  
- ⚠️ Document 3: FAIL - Missing 1 entity

## Detailed Results

### SOU 2023:63
- Entities: 5 (expected ≥4) ✅
- Relations: 5 (expected ≥4) ✅
- Citations: 100% coverage ✅
- Stage: 'published' ✅

### Issues
- Document 3 missing secretary entity
- Action: Reviewing extraction prompt

## Metrics
- Avg processing time: 45s
- Citation coverage: 98%
- Error rate: 0%
```

---

## Maintenance

### Updating the Golden Set

Update this document when:
- Agent capabilities change significantly
- New extraction types are added
- Document structure patterns change
- Better representative documents are identified

### Versioning

Track changes to expected outputs:
- **v1.0** (2025-11-27): Initial golden set with Head Detective v2
- Future versions: Document changes to criteria

---

## Notes

- **Protected Code**: This test set definition is reference material for regression testing
- **Data Freshness**: Documents should remain in database; re-scraping may alter metadata
- **Manual Validation**: Some aspects require human review (e.g., citation quality)
- **Baseline Drift**: Acceptable if improvements are documented and intentional

---

## See Also

- [Integration Test Component](../../src/components/admin/IntegrationTest.tsx)
- [Metadata Agent Test Results](metadata-agent-test-results.md)
- [Test Group 5 Protocol](metadata-agent-test-group-5-protocol.md)
