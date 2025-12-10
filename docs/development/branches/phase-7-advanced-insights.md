# Phase 7: Advanced Insights & Predictions

**Status:** Planned (not started)  
**Branch:** `phase-7-advanced-insights`  
**Dependencies:** Phase 6 (Relationship Inference & Case Reconstruction)

---

## Goal

Provide intelligence layer for strategic decision-making by analyzing patterns across the entire legislative corpus. Move beyond descriptive analytics to **predictive and prescriptive insights**.

**Key Principle:** All insights must be **evidence-backed** with explainable reasoning, not black-box predictions.

---

## Scope

### In Scope

#### 1. Stakeholder Influence Mapping
- **Organization influence scores:** Which organizations' remissvar recommendations are most often adopted?
- **Frequency analysis:** Which organizations submit remissvar most often?
- **Network analysis:** Which organizations collaborate or coordinate responses?

#### 2. Entity Co-Occurrence Networks
- **Collaboration patterns:** Which entities work together frequently?
- **Committee composition:** How do committee memberships evolve?
- **Ministry-entity connections:** Which lead investigators work with which ministries?

#### 3. Change Tracking & Evolution
- **Directive amendments:** Track how directives are modified over time
- **SOU recommendation adoption:** Measure which SOU recommendations become law
- **Legislative velocity:** Time between directive → SOU → proposition → law

#### 4. Predicted Impact Monitoring
- **Sector impact:** Which sectors are most affected by pending legislation?
- **Ministry activity:** Which ministries are most active in which policy areas?
- **Timeline forecasting:** Predict when cases will reach next stage

#### 5. Trend Analysis
- **Topic trends:** What topics are increasing/decreasing in legislative activity?
- **Entity prominence:** Which entities are becoming more/less active?
- **Policy cycles:** Identify recurring patterns in legislative timing

#### 6. Semantic Linking Across Policy Documents
- **Deep conceptual similarity:** Surface non-obvious connections across SOU, Dir., Prop., Remissvar
- **Cross-temporal discovery:** Find related proposals across different years
- **Outcome-agnostic matching:** Connect rejected SOUs with revived propositions
- **Policy memory:** Enable questions like "Has this idea been attempted before?"

### Out of Scope

- ❌ User behavior tracking (privacy concerns)
- ❌ Real-time monitoring (batch processing acceptable)
- ❌ External data sources (focus on internal corpus)
- ❌ Public-facing insights API (internal use only)

---

## Success Criteria

- [ ] Stakeholder influence scores calculated with explainable methodology
- [ ] Entity co-occurrence network visualized and explorable
- [ ] Change tracking dashboard operational
- [ ] Prediction model validated against historical data (>75% accuracy)
- [ ] Semantic links discoverable in Document Detail UI with >80% precision
- [ ] All insights cite evidence (no black-box predictions)

---

## Technical Approach

### Database Schema Extensions

#### New Tables

**1. Entity Co-Occurrence**
```sql
CREATE TABLE entity_cooccurrence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_a_id UUID NOT NULL REFERENCES entities(id),
  entity_b_id UUID NOT NULL REFERENCES entities(id),
  cooccurrence_count INTEGER NOT NULL DEFAULT 0,
  shared_documents UUID[] NOT NULL, -- Array of document IDs
  first_cooccurrence_date DATE,
  last_cooccurrence_date DATE,
  relationship_strength NUMERIC(3,2), -- 0.00 to 1.00
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (entity_a_id < entity_b_id), -- Prevent duplicates
  UNIQUE(entity_a_id, entity_b_id)
);

CREATE INDEX idx_cooccurrence_entity_a ON entity_cooccurrence(entity_a_id);
CREATE INDEX idx_cooccurrence_entity_b ON entity_cooccurrence(entity_b_id);
CREATE INDEX idx_cooccurrence_strength ON entity_cooccurrence(relationship_strength DESC);
```

**2. Stakeholder Influence**
```sql
CREATE TABLE stakeholder_influence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id),
  influence_type TEXT NOT NULL, -- 'remissvar_frequency', 'recommendation_adoption', 'case_involvement'
  influence_score NUMERIC(5,2) NOT NULL, -- 0.00 to 100.00
  total_submissions INTEGER,
  adopted_recommendations INTEGER,
  case_count INTEGER,
  calculation_date DATE NOT NULL,
  evidence JSONB, -- { "cases": [...], "recommendations": [...] }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, influence_type, calculation_date)
);

CREATE INDEX idx_influence_entity ON stakeholder_influence(entity_id);
CREATE INDEX idx_influence_score ON stakeholder_influence(influence_score DESC);
CREATE INDEX idx_influence_date ON stakeholder_influence(calculation_date DESC);
```

**3. Case Predictions**
```sql
CREATE TABLE case_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES legislative_cases(id),
  predicted_stage TEXT NOT NULL, -- 'proposition', 'enacted', etc.
  predicted_date DATE NOT NULL,
  confidence_score NUMERIC(3,2) NOT NULL, -- 0.00 to 1.00
  model_version TEXT NOT NULL, -- e.g., 'v1.0'
  rationale TEXT NOT NULL, -- Human-readable explanation
  features JSONB, -- { "avg_time_to_stage": 180, "ministry": "...", "complexity": "high" }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  actual_stage TEXT, -- Filled in when prediction is validated
  actual_date DATE, -- Filled in when prediction is validated
  accuracy_score NUMERIC(3,2) -- Calculated after validation
);

CREATE INDEX idx_predictions_case ON case_predictions(case_id);
CREATE INDEX idx_predictions_date ON case_predictions(predicted_date);
CREATE INDEX idx_predictions_confidence ON case_predictions(confidence_score DESC);
```

**4. Legislative Trends**
```sql
CREATE TABLE legislative_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_type TEXT NOT NULL, -- 'topic', 'entity', 'ministry', 'policy_area'
  trend_key TEXT NOT NULL, -- e.g., topic name, entity ID, ministry name
  time_period DATE NOT NULL, -- Year-month (YYYY-MM-01)
  document_count INTEGER NOT NULL,
  case_count INTEGER,
  trend_direction TEXT, -- 'increasing', 'decreasing', 'stable'
  change_percentage NUMERIC(5,2), -- % change from previous period
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trend_type, trend_key, time_period)
);

CREATE INDEX idx_trends_type ON legislative_trends(trend_type);
CREATE INDEX idx_trends_period ON legislative_trends(time_period DESC);
CREATE INDEX idx_trends_direction ON legislative_trends(trend_direction);
```

### Analytics Agents

#### 1. Influence Analysis Agent

**Purpose:** Calculate stakeholder influence scores

**Processing:**
1. **Remissvar frequency:**
   ```sql
   SELECT entity_id, COUNT(*) as submission_count
   FROM relations
   WHERE relation_type = 'submitted_remissvar'
   GROUP BY entity_id;
   ```

2. **Recommendation adoption:**
   - Analyze which remissvar recommendations appear in final propositions
   - Track language similarity between remissvar and proposition text
   - Calculate adoption rate per organization

3. **Case involvement:**
   ```sql
   SELECT e.id, COUNT(DISTINCT cd.case_id) as case_count
   FROM entities e
   JOIN relations r ON e.id = r.target_id
   JOIN documents d ON r.source_document_id = d.id
   JOIN case_documents cd ON d.id = cd.document_id
   GROUP BY e.id;
   ```

**Output:** Populates `stakeholder_influence` table

#### 2. Co-Occurrence Analysis Agent

**Purpose:** Build entity co-occurrence networks

**Processing:**
1. **Find entity pairs in same documents:**
   ```sql
   SELECT 
     r1.target_id as entity_a,
     r2.target_id as entity_b,
     r1.source_document_id,
     COUNT(*) as cooccurrence_count
   FROM relations r1
   JOIN relations r2 ON r1.source_document_id = r2.source_document_id
   WHERE r1.target_id < r2.target_id
   GROUP BY r1.target_id, r2.target_id, r1.source_document_id;
   ```

2. **Calculate relationship strength:**
   - Frequency of co-occurrence
   - Recency of co-occurrence
   - Role similarity (both lead investigators, etc.)

**Output:** Populates `entity_cooccurrence` table

#### 3. Prediction Agent

**Purpose:** Forecast case progression

**Features for prediction:**
- Average time from directive → SOU for this ministry
- Average time from SOU → proposition for this topic
- Complexity indicators (document length, entity count)
- Remiss period length
- Ministry workload (how many active cases)

**Model:**
```typescript
interface PredictionModel {
  predictStageDate(case_id: string, target_stage: string): {
    predicted_date: Date;
    confidence: number;
    rationale: string;
    features: Record<string, any>;
  };
}
```

**Example prediction:**
```
Case: Dir. 2024:122 → SOU 2025:32
Predicted: Proposition by 2026-03-15 (confidence 0.78)
Rationale: 
- Average time directive → SOU for this ministry: 12 months
- Average time SOU → proposition for climate topics: 8 months
- Document complexity: medium (based on length, entity count)
- Similar cases took 20 months on average
```

**Output:** Populates `case_predictions` table

#### 4. Trend Analysis Agent

**Purpose:** Identify patterns over time

**Processing:**
1. **Monthly aggregations:**
   ```sql
   SELECT 
     DATE_TRUNC('month', publication_date) as time_period,
     doc_type,
     ministry,
     COUNT(*) as doc_count
   FROM documents
   GROUP BY time_period, doc_type, ministry
   ORDER BY time_period DESC;
   ```

2. **Trend direction calculation:**
   - Compare current period to previous period
   - Calculate % change
   - Classify as increasing/decreasing/stable

**Output:** Populates `legislative_trends` table

### Frontend Dashboards

#### 1. Influence Dashboard (`/insights/influence`)

**Components:**
- **Top organizations ranking table** (by influence score)
- **Organization detail modal** (submission history, adoption rate)
- **Timeline chart** (influence score over time)

**Filters:**
- By organization type (private company, NGO, government agency)
- By policy area
- By time period

#### 2. Network Visualization (`/insights/network`)

**Components:**
- **Force-directed graph** (D3.js)
  - Nodes: Entities
  - Edges: Co-occurrence relationships (thickness = strength)
  - Colors: Entity type
- **Entity detail panel** (connections, documents)

**Interactions:**
- Hover node: Highlight connections
- Click node: Show entity details
- Filter by entity type, relationship strength

#### 3. Predictions Dashboard (`/insights/predictions`)

**Components:**
- **Upcoming stages table** (cases with predicted dates)
- **Accuracy metrics** (past predictions vs actuals)
- **Confidence distribution chart**

**Features:**
- Sort by predicted date
- Filter by ministry, confidence score
- Export predictions to CSV

#### 4. Trends Dashboard (`/insights/trends`)

**Components:**
- **Topic trends chart** (line chart over time)
- **Ministry activity heatmap** (ministry × policy area)
- **Seasonal patterns** (monthly aggregations)

**Filters:**
- Time range selector
- Ministry filter
- Trend direction filter

### New Edge Functions

**1. `get-stakeholder-influence`**
- Returns influence scores for all organizations
- Supports filtering by type, policy area

**2. `get-entity-network`**
- Returns co-occurrence data for network visualization
- Supports depth parameter (1-hop, 2-hop connections)

**3. `get-case-predictions`**
- Returns predictions for all active cases
- Supports filtering by ministry, confidence

**4. `get-legislative-trends`**
- Returns trend data for charting
- Supports time range, aggregation level (monthly, yearly)

**5. `get-semantic-links`**
- Returns semantically similar documents for a given document
- Includes match scores, explanations, and shared evidence

**6. `generate-document-summary`**
- Generates structured summaries for embedding
- Extracts policy aims, actors, keywords, ideological framing

### Semantic Linking Module

> **Detailed Plan:** See [SEMANTIC_LINK_AGENT_PLAN.md](../SEMANTIC_LINK_AGENT_PLAN.md)

#### Purpose
Surface non-obvious, high-value connections across policy documents based on deep conceptual similarity rather than explicit references.

#### Components

**A. Summarizer Agent**
- Generates 200-500 word structured summaries per document
- Extracts: policy aim, core recommendations, key actors, policy domains, keywords
- Flags outcome status (enacted, rejected, pending, superseded)

**B. Embedding + Indexing**
- **Recommended model:** `intfloat/multilingual-e5-large` (1024 dims, excellent Swedish support)
- **Vector store:** pgvector (native PostgreSQL, no extra infrastructure)
- Index all summaries for scalable similarity search

**C. Matching Engine**
Composite scoring algorithm:

| Signal | Weight | Max Contribution |
|--------|--------|------------------|
| Embedding similarity | 50% | 0.50 |
| Shared utredare | +0.15 each | 0.30 |
| Shared keywords | +0.02 each | 0.20 |
| Shared policy domains | +0.05 each | 0.15 |
| Shared remissinstans | +0.05 each | 0.15 |
| Temporal distance | -0.01/year | -0.20 |

**D. Link Storage**
```sql
CREATE TABLE semantic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID NOT NULL REFERENCES documents(id),
  target_document_id UUID NOT NULL REFERENCES documents(id),
  score FLOAT NOT NULL CHECK (score >= 0 AND score <= 1),
  confidence TEXT NOT NULL, -- 'high', 'medium', 'low'
  explanation TEXT NOT NULL, -- Human-readable reasoning
  shared_entities JSONB DEFAULT '[]',
  keywords_overlap JSONB DEFAULT '[]',
  score_breakdown JSONB DEFAULT '{}',
  status TEXT DEFAULT 'auto', -- 'auto', 'verified', 'rejected'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_document_id, target_document_id)
);
```

#### Key Requirements
- **Precision > Recall:** Only surface confident matches (score > 0.6)
- **Explainable:** Every link includes human-readable explanation
- **Auditable:** Admin can verify or reject auto-generated links

---

## Testing Strategy

### Model Validation

**Historical backtesting:**
- Train prediction model on pre-2023 data
- Test predictions on 2023-2024 data
- Target: >75% accuracy within 30 days

**A/B testing:**
- Compare multiple prediction models
- Select best performing model for production

### Influence Score Validation

**Manual validation:**
- Expert review of top 20 organizations
- Validate that high-influence orgs are known to be influential
- Check for false positives (low-influence orgs ranked too high)

**Correlation analysis:**
- Influence score vs actual policy outcomes
- Influence score vs media mentions (external validation)

### Network Analysis Validation

**Sanity checks:**
- No isolated nodes (all entities connected to at least one other)
- Strongest connections align with known collaborations
- Network density reasonable (not too sparse or too dense)

---

## Performance Considerations

### Batch Processing

**All analytics agents run as batch jobs:**
- Influence Analysis: Daily at 3 AM
- Co-Occurrence Analysis: Daily at 4 AM
- Prediction Agent: Daily at 5 AM
- Trend Analysis: Daily at 6 AM

**Not real-time:**
- Acceptable lag: 24 hours
- Users see yesterday's analytics

### Query Optimization

**Materialized views for dashboards:**
```sql
CREATE MATERIALIZED VIEW mv_top_influencers AS
SELECT * FROM stakeholder_influence
WHERE influence_score > 50
ORDER BY influence_score DESC
LIMIT 100;

-- Refresh daily
REFRESH MATERIALIZED VIEW mv_top_influencers;
```

### Caching Strategy

- Cache dashboard data for 24 hours
- Cache network graph data for 12 hours
- Cache prediction lists for 6 hours

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Prediction accuracy too low | Users don't trust insights | Validate model on historical data, show confidence scores |
| Bias in influence scoring | Unfair representation | Transparent methodology, manual validation, external expert review |
| Network visualization too complex | Poor UX | Simplify with filters, limit node count, provide tutorials |
| Data privacy concerns | Legal issues | Internal use only, no personal data exposed, anonymize if needed |

---

## Dependencies

### Before Starting Phase 7

- [ ] Phase 6 complete (cases reconstructed)
- [ ] Sufficient historical data (3+ years)
- [ ] At least 500+ cases in database
- [ ] Entity and relation coverage >90%

### Phase 7 Prerequisites

- [ ] Clear use cases identified (who uses insights, for what decisions?)
- [ ] Legal review complete (data privacy, influence scoring)
- [ ] Team capacity for ML model development

---

## Related Documentation

- [Phase 6: Relationship Inference](./phase-6-relationship-inference.md)
- [Product Roadmap](../PRODUCT_ROADMAP.md)
- [Semantic Link Agent Plan](../SEMANTIC_LINK_AGENT_PLAN.md) — Detailed technical plan for semantic linking

---

## Notes

**Why Phase 7 Last?**
- Requires complete data corpus (all doc types, all relationships)
- Requires historical data for training/validation
- Most value when foundation is solid

**Explainability First:**
- All predictions include rationale
- All influence scores cite evidence
- All semantic links include human-readable explanations
- No black-box models

**Future Extensions:**
- Natural language queries ("What climate legislation is coming?")
- Anomaly detection (unusual patterns in legislative activity)
- Recommendation engine (suggest related cases to users)
- "Find similar" functionality from any document
