# Phase 6: Relationship Inference & Case Reconstruction

**Status:** Planned (not started)  
**Branch:** `phase-6-relationship-inference`  
**Dependencies:** Phase 5 (Legislative Graph Expansion)

---

## Goal

Build a **blackboard-level agent** that operates across the entire document corpus to reconstruct full legislative cases and infer document-to-document relationships based on evidence.

**Key Principle:** All relationships must be **evidence-based** — cite shared entities, dates, or explicit references as justification.

---

## Scope

### In Scope

#### 1. Case Reconstruction Agent
- **Operates at system level:** Analyzes all documents, entities, relations, timeline events
- **Builds legislative cases:** Links directives → SOUs → propositions → laws
- **Evidence-based linking:** Every case link must cite:
  - Shared directive numbers
  - Shared entities (lead investigator, ministry)
  - Shared timeline event dates
  - Explicit document references from Phase 5

#### 2. Document Relationship Discovery
- **Explicit relationships:** Already captured in Phase 5 (`document_references`)
- **Implicit relationships:** Infer based on:
  - Shared entities (e.g., same lead investigator)
  - Shared timeline event dates (e.g., same publication date)
  - Directive numbers mentioned in SOU titles
  - SOU numbers mentioned in proposition text

#### 3. Relationship-Based Search Enhancements
- "Show all documents in the same case as [SOU]"
- "Find all cases involving [Ministry]"
- "Show full timeline for [Case]"
- "Find all propositions that resulted from [Directive]"

#### 4. Case Timeline Visualization
- **End-to-end timeline:** Directive issued → Committee formed → SOU published → Remiss period → Proposition submitted → Law enacted
- **Multi-document view:** Show events from all docs in a case on one timeline
- **Evidence links:** Click event to see source citation

### Out of Scope

- ❌ Predictive analytics (Phase 7)
- ❌ Stakeholder influence scoring (Phase 7)
- ❌ Change tracking over time (Phase 7)
- ❌ Natural language queries ("show me climate-related legislation") (Phase 7)

---

## Success Criteria

- [ ] Case Reconstruction Agent identifies cases with 90%+ accuracy
- [ ] All case links cite evidence (shared entities, dates, or explicit refs)
- [ ] Relationship-based search returns relevant results
- [ ] Case timelines visualize full legislative process
- [ ] No speculative relationships (citation-first principle maintained)

---

## Technical Approach

### Database Schema Extensions

#### New Tables

**1. Legislative Cases**
```sql
CREATE TABLE legislative_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, -- e.g., "Klimatanpassning av Sverige"
  directive_id UUID REFERENCES documents(id), -- The initiating directive
  sou_id UUID REFERENCES documents(id), -- The resulting SOU
  proposition_id UUID REFERENCES documents(id), -- The resulting proposition
  law_id UUID REFERENCES documents(id), -- The enacted law
  stage TEXT NOT NULL, -- 'directive', 'investigation', 'proposition', 'enacted'
  ministry TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cases_directive ON legislative_cases(directive_id);
CREATE INDEX idx_cases_sou ON legislative_cases(sou_id);
CREATE INDEX idx_cases_stage ON legislative_cases(stage);
CREATE INDEX idx_cases_ministry ON legislative_cases(ministry);
```

**2. Case Documents (Many-to-Many)**
```sql
CREATE TABLE case_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES legislative_cases(id),
  document_id UUID NOT NULL REFERENCES documents(id),
  role TEXT NOT NULL, -- 'directive', 'sou', 'remissvar', 'proposition', 'committee_report', 'law'
  evidence_type TEXT NOT NULL, -- 'explicit_reference', 'shared_entity', 'shared_date', 'directive_number_match'
  evidence_text TEXT, -- Citation or description of evidence
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(case_id, document_id, role)
);

CREATE INDEX idx_case_docs_case ON case_documents(case_id);
CREATE INDEX idx_case_docs_document ON case_documents(document_id);
CREATE INDEX idx_case_docs_evidence ON case_documents(evidence_type);
```

**3. Document Relationships (Inferred)**
```sql
CREATE TABLE document_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID NOT NULL REFERENCES documents(id),
  target_document_id UUID NOT NULL REFERENCES documents(id),
  relationship_type TEXT NOT NULL, -- 'leads_to', 'responds_to', 'implements', 'related'
  confidence_score NUMERIC(3,2) NOT NULL, -- 0.00 to 1.00
  evidence_type TEXT NOT NULL, -- 'explicit_reference', 'shared_entity', 'shared_date', etc.
  evidence_details JSONB, -- { "shared_entities": [...], "shared_dates": [...], "references": [...] }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_document_id, target_document_id, relationship_type)
);

CREATE INDEX idx_doc_relationships_source ON document_relationships(source_document_id);
CREATE INDEX idx_doc_relationships_target ON document_relationships(target_document_id);
CREATE INDEX idx_doc_relationships_type ON document_relationships(relationship_type);
```

### Case Reconstruction Agent

#### Agent Architecture

**File:** `supabase/functions/agent-case-reconstruction/index.ts`

**Input:**
- All documents in database
- All entities
- All relations
- All timeline events
- All document_references (from Phase 5)

**Processing:**
1. **Find directive-SOU pairs:**
   - Match directive number in SOU title (e.g., "Dir. 2024:122" → SOU about Dir. 2024:122)
   - Shared entities (same lead investigator)
   - Shared ministry
   - Explicit references from `document_references`

2. **Find SOU-proposition pairs:**
   - Explicit references from `document_references`
   - SOU number mentioned in proposition text
   - Shared ministry
   - Shared entities

3. **Find proposition-law pairs:**
   - Explicit references from `document_references`
   - Proposition number → law number mapping
   - Committee report connections

4. **Create case structure:**
   - Insert into `legislative_cases`
   - Link documents via `case_documents`
   - Record evidence for each link

**Output:**
- Creates/updates entries in `legislative_cases`
- Populates `case_documents` with evidence
- Logs case structure in `output_data`

#### Evidence Scoring

**Confidence Calculation:**
```typescript
function calculateConfidence(evidence: Evidence): number {
  let score = 0.0;
  
  // Explicit reference = highest confidence
  if (evidence.explicitReference) score += 0.70;
  
  // Shared directive number in title
  if (evidence.directiveNumberMatch) score += 0.60;
  
  // Shared lead investigator
  if (evidence.sharedLeadInvestigator) score += 0.40;
  
  // Shared ministry
  if (evidence.sharedMinistry) score += 0.30;
  
  // Same timeline dates (within 30 days)
  if (evidence.similarTimelineDates) score += 0.20;
  
  // Cap at 1.0
  return Math.min(score, 1.0);
}
```

**Threshold for case creation:**
- Confidence >= 0.70: Create case automatically
- Confidence 0.50-0.69: Flag for manual review
- Confidence < 0.50: Do not create case

#### Tool: `create_legislative_case`

```typescript
{
  name: "create_legislative_case",
  description: "Create a legislative case linking related documents",
  parameters: {
    title: { type: "string", description: "Case title (e.g., directive title)" },
    directive_id: { type: "string", format: "uuid" },
    sou_id: { type: "string", format: "uuid" },
    proposition_id: { type: "string", format: "uuid", nullable: true },
    law_id: { type: "string", format: "uuid", nullable: true },
    evidence: {
      type: "object",
      properties: {
        explicit_references: { type: "array", items: { type: "string" } },
        shared_entities: { type: "array", items: { type: "string" } },
        shared_dates: { type: "array", items: { type: "string" } },
        directive_number_match: { type: "boolean" }
      }
    }
  },
  required: ["title", "directive_id", "evidence"]
}
```

### Head Detective v4 Integration

**New responsibilities:**
- Schedule Case Reconstruction Agent to run daily (after all document-level agents)
- Run in batch mode: analyze all processes
- Update `legislative_cases.stage` based on latest evidence

**Task delegation:**
```typescript
// Create case reconstruction task
await supabase.from('agent_tasks').insert({
  agent_name: 'case-reconstruction',
  task_type: 'case_reconstruction',
  status: 'pending',
  priority: 10, // Lower priority than document-level extraction
  input_data: {
    mode: 'batch',
    min_confidence: 0.70
  }
});
```

### Relationship-Based Search

#### New Edge Function: `search-cases`

**Endpoint:** `supabase/functions/search-cases/index.ts`

**Query types:**
1. **By document:** "Show case for SOU 2024:32"
   ```sql
   SELECT * FROM legislative_cases lc
   JOIN case_documents cd ON lc.id = cd.case_id
   WHERE cd.document_id = $1;
   ```

2. **By ministry:** "Show all cases from [Ministry]"
   ```sql
   SELECT * FROM legislative_cases
   WHERE ministry = $1
   ORDER BY created_at DESC;
   ```

3. **By stage:** "Show all cases in proposition stage"
   ```sql
   SELECT * FROM legislative_cases
   WHERE stage = 'proposition'
   ORDER BY updated_at DESC;
   ```

4. **By entity:** "Show all cases involving [Person]"
   ```sql
   SELECT DISTINCT lc.* FROM legislative_cases lc
   JOIN case_documents cd ON lc.id = cd.case_id
   JOIN documents d ON cd.document_id = d.id
   JOIN relations r ON d.id = r.source_document_id
   JOIN entities e ON r.target_id = e.id
   WHERE e.name = $1;
   ```

### Case Timeline Visualization

#### New Page: `/case/:id/timeline`

**Component hierarchy:**
```
CaseTimelinePage
 ├── CaseHeader (title, stage, ministry)
 ├── CaseDocumentList (all docs in case)
 ├── CaseTimelineChart (D3 or recharts)
 └── CaseEvidencePanel (why docs are linked)
```

**Timeline Chart:**
- **X-axis:** Date
- **Y-axis:** Document type (directive, SOU, proposition, law)
- **Events:** All timeline events from all documents in case
- **Connections:** Lines showing document relationships
- **Interactivity:** Click event → see source citation

**Data source:**
```sql
SELECT 
  te.event_date,
  te.event_type,
  te.description,
  te.source_page,
  te.source_excerpt,
  d.doc_type,
  d.doc_number,
  d.title
FROM timeline_events te
JOIN case_documents cd ON te.process_id = cd.case_id
JOIN documents d ON cd.document_id = d.id
WHERE cd.case_id = $1
ORDER BY te.event_date;
```

---

## Testing Strategy

### Case Reconstruction Validation

**Test with known cases:**
- [ ] Dir. 2024:122 → SOU 2025:32 (known link via directive number)
- [ ] Manual validation of 10 reconstructed cases
- [ ] False positive rate < 10% (manual review)
- [ ] False negative rate < 20% (known links missed)

### Evidence Quality

- [ ] All case links cite at least one evidence type
- [ ] Confidence scores match manual assessment (correlation > 0.8)
- [ ] No cases created with confidence < 0.70

### Search Performance

- [ ] Case search returns results in < 500ms
- [ ] Entity-based case search scales to 1000+ cases
- [ ] Timeline visualization renders in < 2s

### Data Integrity

- [ ] No circular case relationships
- [ ] No duplicate case_documents entries
- [ ] All case stages valid and updated

---

## Performance Considerations

### Case Reconstruction Agent

**Expected processing time:**
- ~10-20s to analyze all documents and create cases
- Run frequency: Daily (or after new documents ingested)
- Not real-time — batch processing acceptable

**Database load:**
- Complex joins across documents, entities, relations, timeline_events
- May require additional indexes
- Monitor query performance

### Case Search

**Optimization strategies:**
- Materialized view for case summaries
- Pre-compute entity-case mappings
- Cache case timelines

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| False positives in case linking | Incorrect case structures | Confidence thresholds, manual review queue |
| Case reconstruction too slow | Agent times out | Batch processing, incremental updates |
| Complex queries slow down search | Poor UX | Materialized views, caching |
| Evidence not strong enough | Low-confidence cases | Require multiple evidence types for case creation |

---

## Dependencies

### Before Starting Phase 6

- [ ] Phase 5 complete (all document types ingested)
- [ ] `document_references` table populated
- [ ] External links scraped and validated
- [ ] At least 100+ documents of each type in database

### Phase 6 Prerequisites

- [ ] Clear evidence patterns identified in Phase 5 data
- [ ] Performance benchmarks acceptable for Phase 5 data volume
- [ ] User feedback confirms search is valuable

---

## Related Documentation

- [Phase 5: Legislative Graph Expansion](./phase-5-legislative-graph-expansion.md)
- [Phase 7: Advanced Insights](./phase-7-advanced-insights.md)
- [Product Roadmap](../PRODUCT_ROADMAP.md)

---

## Notes

**Why Phase 6 After Phase 5?**
- Need diverse document types to build meaningful case chains
- Need explicit references from "Genvägar" scraping
- Need enough data volume to validate confidence scoring

**Evidence-Based Principle:**
- Every case link must cite evidence
- No "guessing" or "intuition" — only verifiable connections
- Confidence scores provide transparency

**Future Extensions:**
- Machine learning for confidence scoring (Phase 7)
- Natural language case queries (Phase 7)
- Case similarity scoring (Phase 7)
