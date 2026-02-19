# Phase 7: Advanced Insights & Semantic Intelligence

**Status:** Approved (planning complete)  
**Branch:** `phase-7-advanced-insights`  
**Dependencies:** Phase 6 (Relationship Inference — ✅ DONE)

---

## Goal

Transform the legislative corpus from a **navigable graph** into an **intelligence platform** with three pillars:
1. **Stakeholder analytics** — who influences what
2. **Semantic discovery** — find non-obvious connections
3. **Trend and prediction insights**

**Key Principle:** All insights must be **evidence-backed** with explainable reasoning, not black-box predictions.

---

## Current System Health (verified 2026-02-13)

| Metric | Value |
|--------|-------|
| Total documents | 6,790 |
| Documents with text | 5,490 (80.9%) |
| Documents in processes | 3,151 (46.4%) |
| Orphan documents | 3,639 (53.6%) |
| Total processes | 4,456 |
| Document relationships | 2,791 |
| Resolved references | 3,460 / 7,441 (46.5%) |
| Entities | 1,780 (1,473 orgs, 188 persons, 119 committees) |
| Relations | 295 |
| Remissvar | 3,421 (3,366 with extracted text) |

---

## Slice Sequencing

```text
Phase     Slice   Description                      Priority   Parallel?
-------   -----   ----------------------------     --------   ---------
Wave 1    7.1     Stakeholder Influence             P0         Yes (independent)
Wave 1    7.2     Summarizer Agent + Embeddings     P0         Yes (independent)
Wave 1    7.4     Entity Co-Occurrence              P1         Yes (independent)

Wave 2    7.3     Semantic Link Engine              P1         After 7.2
Wave 2    7.5     Legislative Trends                P2         Anytime (independent)

Wave 3    7.6     Parliamentary Motions Ingestion   P2         After product decision
Wave 3    7.7     Prediction Engine                 P3         After 7.1 + 7.5
```

---

## Slice 7.1: Stakeholder Influence Analytics

**Priority:** P0 (data already exists, highest user value)  
**Dependencies:** Phase 5.6 stance data, entity pipeline  
**Estimated effort:** Medium

### What

Calculate per-organization influence metrics from existing data: remissvar frequency, invitation frequency, stance distribution, and cross-case involvement.

### Why First

- All required data already exists (3,421 remissvar, 4,321 invitees, 1,473 org entities)
- Extends existing Participation Dashboard (already at `/insights/participation`)
- No new AI infrastructure needed — pure SQL aggregation

### Deliverables

**Database:**
- New table: `stakeholder_influence` (entity_id, influence_type, score, evidence JSONB, calculation_date)
- Materialized view: `mv_top_influencers` for dashboard performance

**Edge function:** `get-stakeholder-influence`
- Calculates: submission frequency, invitation rate, stance consistency, cross-case breadth
- Evidence field traces every score to specific remissvar/cases

**Frontend:** Enhanced Participation Dashboard
- Influence ranking table (sortable by score type)
- Organization detail modal with submission history
- Filter by org type, policy area

### Database Schema

```sql
CREATE TABLE stakeholder_influence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id),
  influence_type TEXT NOT NULL, -- 'remissvar_frequency', 'invitation_rate', 'stance_consistency', 'cross_case_breadth'
  influence_score NUMERIC(5,2) NOT NULL, -- 0.00 to 100.00
  total_submissions INTEGER,
  case_count INTEGER,
  calculation_date DATE NOT NULL,
  evidence JSONB, -- { "cases": [...], "remissvar_ids": [...] }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, influence_type, calculation_date)
);

CREATE INDEX idx_influence_entity ON stakeholder_influence(entity_id);
CREATE INDEX idx_influence_score ON stakeholder_influence(influence_score DESC);
CREATE INDEX idx_influence_date ON stakeholder_influence(calculation_date DESC);
```

### Success Criteria

- [ ] Influence scores for all 1,473 organizations
- [ ] Every score cites evidence (no black-box metrics)
- [ ] Dashboard loads in under 500ms

---

## Slice 7.2: Semantic Summarizer Agent

**Priority:** P0 (prerequisite for 7.3 and Phase 8)  
**Dependencies:** Documents with text content (5,490 available)  
**Estimated effort:** Large

### What

Generate structured policy summaries for each document (200-500 words) containing: policy aim, core recommendations, key actors, policy domains, keywords, outcome status.

### Why P0

- Required foundation for semantic linking (7.3) and conversational intelligence (Phase 8)
- Generates embeddings needed for vector search
- Produces structured metadata (keywords, domains) that enriches every downstream feature

### Deliverables

**Database:**
- Enable `pgvector` extension
- New table: `document_summaries` with `embedding vector(1024)` column
- IVFFlat index on embedding column
- GIN indexes on keywords and policy_domains arrays

**Edge function:** `generate-document-summary`
- Uses Lovable AI (google/gemini-2.5-flash) for summarization
- Batch processing (10-20 docs per invocation)
- Stores structured summary + raw text for embedding
- Idempotent: skips documents with existing summaries at same version

**Edge function:** `generate-embeddings`
- Calls embedding model on summary text
- Stores 1024-dim vector in `document_summaries.embedding`
- Model: Evaluate `intfloat/multilingual-e5-large` via Hugging Face Inference API vs OpenAI `text-embedding-3-large`

**Admin UI:** Batch summarization controls
- Progress tracking (X / 5,490 summarized)
- Sample review panel

### Database Schema

```sql
CREATE TABLE document_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) UNIQUE,
  summary_text TEXT NOT NULL,
  policy_aim TEXT,
  core_recommendations JSONB DEFAULT '[]',
  key_actors JSONB DEFAULT '[]',
  policy_domains TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  outcome_status TEXT, -- 'enacted', 'rejected', 'pending', 'superseded', 'unknown'
  embedding vector(1024),
  model_version TEXT NOT NULL, -- e.g., 'gemini-2.5-flash-v1'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_summaries_document ON document_summaries(document_id);
CREATE INDEX idx_summaries_embedding ON document_summaries USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_summaries_keywords ON document_summaries USING GIN (keywords);
CREATE INDEX idx_summaries_domains ON document_summaries USING GIN (policy_domains);
```

### Success Criteria

- [ ] 5,490+ documents summarized
- [ ] All summaries include keywords and policy_domains
- [ ] Embeddings indexed and queryable via cosine similarity

### Open Decision

- **Embedding model choice:** `intfloat/multilingual-e5-large` (self-hosted, excellent Swedish) vs OpenAI `text-embedding-3-large` (API, cost scales). Must be resolved before execution.

---

## Slice 7.3: Semantic Link Engine

**Priority:** P1 (depends on 7.2 embeddings)  
**Dependencies:** Slice 7.2 complete  
**Estimated effort:** Large

> **Detailed Plan:** See [SEMANTIC_LINK_AGENT_PLAN.md](../SEMANTIC_LINK_AGENT_PLAN.md)

### What

Discover non-obvious conceptual connections between documents using composite scoring: embedding similarity (50%), shared actors, keywords, domains, temporal distance.

### Composite Scoring Algorithm

| Signal | Weight | Max Contribution |
|--------|--------|------------------|
| Embedding similarity | 50% | 0.50 |
| Shared utredare | +0.15 each | 0.30 |
| Shared keywords | +0.02 each | 0.20 |
| Shared policy domains | +0.05 each | 0.15 |
| Shared remissinstans | +0.05 each | 0.15 |
| Temporal distance | -0.01/year | -0.20 |

### Deliverables

**Database:**
- New table: `semantic_links` (source_document_id, target_document_id, score, confidence, explanation, score_breakdown JSONB, status)
- DB function: `find_similar_documents(doc_id, threshold, limit)`

**Edge function:** `compute-semantic-links`
- Batch process: for each document, find top-10 nearest neighbors above threshold 0.6
- Compute composite score (embedding + metadata signals)
- Generate human-readable explanation via LLM

**Edge function:** `get-semantic-links`
- Returns links for a given document with explanation text

**Frontend:** "Semantiskt relaterade dokument" section on Document Detail page
- Shows top 5 links with confidence badge and explanation
- Admin can verify/reject links

### Database Schema

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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_document_id, target_document_id)
);
```

### Success Criteria

- [ ] Semantic links generated for all summarized documents
- [ ] Precision >80% on manual review of top-100 highest-scored links
- [ ] Every link includes human-readable Swedish explanation
- [ ] Admin verification workflow operational

---

## Slice 7.4: Entity Co-Occurrence Networks

**Priority:** P1 (standalone, no dependency on 7.2/7.3)  
**Dependencies:** Existing entity and relations data  
**Estimated effort:** Medium  
**Status:** ✅ COMPLETE (2026-02-19)

### What

Build entity co-occurrence graph from shared remiss participation (invitations + responses). Visualize as interactive force-directed network.

### Implementation (Final)

**Data sources:** `remiss_invitees` (orgs invited to same remiss) + `remiss_responses` (orgs responding to same remiss).

**Co-occurrence rule:** Counted ONCE per remiss per pair (deduplicated). If A and B are both invited AND both respond to the same remiss, that remiss counts once toward `cooccurrence_count` but increments both split counters.

**Database:** `entity_cooccurrence` table with:
- Split counters: `invite_cooccurrence_count`, `response_cooccurrence_count`
- Bias-corrected score: `jaccard_score` (|A∩B| / |A∪B|)
- `relationship_strength` = `jaccard_score` (v1)
- Range checks: `jaccard_score >= 0 AND <= 1`, `relationship_strength >= 0 AND <= 1`
- Capped `shared_cases` (100 most recent) + uncapped `total_shared_case_count`
- Canonical pair constraint: `entity_a_id < entity_b_id`
- Composite indexes: `(entity_a_id, strength DESC)`, `(entity_b_id, strength DESC)`, `(strength DESC, updated_at DESC)`

**Edge functions:**
- `compute-entity-cooccurrence` — Full recompute, admin-protected, `dry_run` flag supported
- `get-entity-network` — Auth-protected read API, returns nodes + edges with filters

**Frontend:** `/insights/network` — d3-force simulation + React SVG rendering
- Throttled rendering (every 3 ticks), freeze toggle
- 200-node cap, min-strength slider, entity type filters
- Node color by type, size by degree, edge thickness by strength

### Success Criteria

- [x] Co-occurrence computed from remiss participation
- [x] Split invite/response counters with Jaccard scoring
- [x] Network visualization with performance guardrails
- [x] Admin compute trigger in Agents tab

---

## Slice 7.5: Legislative Trend Dashboard

**Priority:** P2 (pure aggregation, low risk)  
**Dependencies:** Existing document corpus  
**Estimated effort:** Small

### What

Monthly/yearly trend analysis of legislative activity by doc_type, ministry, and policy area.

### Deliverables

**Edge function:** `get-legislative-trends`
- Aggregates documents by month/year, ministry, doc_type
- Calculates trend direction (increasing/decreasing/stable)

**Frontend:** Trends page (`/insights/trends`)
- Line chart: document counts over time by type (recharts)
- Ministry activity bar chart
- Period comparison (this year vs last year)

### Database Schema

```sql
CREATE TABLE legislative_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_type TEXT NOT NULL, -- 'topic', 'entity', 'ministry', 'doc_type'
  trend_key TEXT NOT NULL,
  time_period DATE NOT NULL, -- YYYY-MM-01
  document_count INTEGER NOT NULL,
  case_count INTEGER,
  trend_direction TEXT, -- 'increasing', 'decreasing', 'stable'
  change_percentage NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trend_type, trend_key, time_period)
);

CREATE INDEX idx_trends_type ON legislative_trends(trend_type);
CREATE INDEX idx_trends_period ON legislative_trends(time_period DESC);
```

### Success Criteria

- [ ] Trends cover 2015-2025 time range
- [ ] Dashboard loads under 500ms
- [ ] Trend direction calculations are verifiable

---

## Slice 7.6: Parliamentary Motions Ingestion

**Priority:** P2 (corpus expansion)  
**Dependencies:** Clear product demand  
**Estimated effort:** Large (~60,000 documents)

### What

Ingest motions (`doktyp=mot`) from Riksdagen API to resolve ~2,820 deferred motion references and expand corpus coverage.

### Why P2

- Large volume (~60k docs) with significant infrastructure cost
- Only valuable if there is clear user demand for motion-level tracking
- Should be scoped with explicit ingestion window (e.g., 2015-2025 only)

### Deliverables

- Riksdagen API scraper for motions (reuse existing scraper patterns)
- Reference resolution pass for the 2,820 motion references
- Updated orphan/process coverage metrics

### Gate

- ⚠️ Requires explicit AGREE from Max before execution
- Scoped ingestion plan with year range and success criteria

---

## Slice 7.7: Prediction Engine

**Priority:** P3 (future, after validated analytics)  
**Dependencies:** Slices 7.1-7.5 complete, 3+ years of historical data  
**Estimated effort:** Large

### What

Forecast case progression timelines based on historical patterns (ministry, topic, complexity).

### Why Last

- Requires validated influence scores and trend data as features
- Prediction accuracy depends on corpus completeness
- Highest risk of low accuracy — needs historical backtesting

### Deliverables

**Database:**

```sql
CREATE TABLE case_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES processes(id),
  predicted_stage TEXT NOT NULL,
  predicted_date DATE NOT NULL,
  confidence_score NUMERIC(3,2) NOT NULL, -- 0.00 to 1.00
  model_version TEXT NOT NULL,
  rationale TEXT NOT NULL, -- Human-readable explanation
  features JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  actual_stage TEXT,
  actual_date DATE,
  accuracy_score NUMERIC(3,2)
);
```

**Frontend:** Predictions dashboard (`/insights/predictions`)

### Gate

- Only proceed if backtesting achieves >75% accuracy within 30 days
- Otherwise: downgrade to "descriptive velocity stats" (extend existing Velocity Dashboard)

---

## Execution Order Summary

```text
Wave 1 (parallel):  7.1 Stakeholder Influence
                     7.2 Summarizer + Embeddings
                     7.4 Entity Co-Occurrence

Wave 2 (after 7.2): 7.3 Semantic Link Engine
                     7.5 Legislative Trends (anytime)

Wave 3 (gated):     7.6 Motions Ingestion (product decision)
                     7.7 Prediction Engine (after 7.1 + 7.5)
```

---

## New Database Tables Summary

| Table | Slice | Purpose |
|-------|-------|---------|
| `stakeholder_influence` | 7.1 | Per-org influence scores with evidence |
| `document_summaries` | 7.2 | Structured summaries + vector embeddings |
| `semantic_links` | 7.3 | Cross-document semantic connections |
| `entity_cooccurrence` | 7.4 | Entity pair co-occurrence metrics |
| `legislative_trends` | 7.5 | Aggregated trend data |
| `case_predictions` | 7.7 | Forecasted case progressions |

## New Edge Functions Summary

| Function | Slice | Type |
|----------|-------|------|
| `get-stakeholder-influence` | 7.1 | Read + compute |
| `generate-document-summary` | 7.2 | AI batch processing |
| `generate-embeddings` | 7.2 | Embedding pipeline |
| `compute-semantic-links` | 7.3 | Batch matching |
| `get-semantic-links` | 7.3 | Read |
| `compute-entity-cooccurrence` | 7.4 | Batch SQL |
| `get-entity-network` | 7.4 | Read |
| `get-legislative-trends` | 7.5 | Read + aggregate |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Embedding model cost for 5,490 docs | Budget overrun | Batch processing, evaluate cheaper models first |
| Swedish language embedding quality | Poor semantic matches | Use multilingual-e5-large (trained on Swedish), validate on sample |
| Network visualization performance | Browser crashes | Cap visible nodes at 200, use filtering |
| Influence score bias | Misleading rankings | Transparent methodology, evidence-linked scores, expert review |
| Motions volume (~60k) | Storage/processing time | Scope to 2015-2025, gate on product demand |

---

## Performance Considerations

### Batch Processing

All analytics agents run as batch jobs (not real-time):
- Acceptable lag: 24 hours
- Users see yesterday's analytics

### Query Optimization

Materialized views for dashboards:
```sql
CREATE MATERIALIZED VIEW mv_top_influencers AS
SELECT * FROM stakeholder_influence
WHERE influence_score > 50
ORDER BY influence_score DESC
LIMIT 100;
```

### Caching Strategy

- Dashboard data: 24 hours
- Network graph data: 12 hours
- Prediction lists: 6 hours

---

## Technical Notes

- All new tables will have standard RLS policies (admin write, authenticated read)
- pgvector extension required for 7.2 (enabled via migration)
- Lovable AI (google/gemini-2.5-flash) used for summarization; no external API key needed
- Embedding model requires a decision before 7.2 execution
- All agents follow existing patterns: edge function + admin UI test component + idempotent batch processing

---

## Supersedes

This plan supersedes `docs/development/branches/phase-6-advanced-analysis.md`, which contained rough goals that have been refined and incorporated here. That file should be archived.

---

## Phase 8 Alignment: Grounded Conversational Intelligence

> **Full spec:** `docs/development/PRODUCT_ROADMAP.md` → Phase 8

Phase 7's semantic linking infrastructure (embeddings, vector index, summarizer agent) is a **prerequisite** for Phase 8's grounded chat capability:

| Phase 7 Delivers | Phase 8 Consumes |
|---|---|
| Document embeddings (pgvector) | Vector retrieval leg of hybrid search |
| Structured summaries | Pre-computed context for generation |
| Semantic links with scores | Graph-aware answer generation |
| Entity co-occurrence network | Entity-grounded query understanding |

### Key Architectural Constraint

Phase 8 is explicitly **retrieval-first, evidence-first, and verifier-gated**:

1. Deterministic reference/process lookup executes before any LLM call
2. Hybrid retrieval (BM25 + vector ANN) with reranking
3. Evidence extraction produces (claim, quote, citation) triples
4. Generation synthesizes from extracted evidence only
5. Verifier gate removes unsupported statements
6. Explicit refusal when evidence is insufficient

---

## Related Documentation

- [Phase 6: Relationship Inference](./phase-6-relationship-inference.md) — ✅ Complete
- [Phase 6: Advanced Analysis](./phase-6-advanced-analysis.md) — ⚠️ Superseded by this plan
- [Product Roadmap](../PRODUCT_ROADMAP.md)
- [Semantic Link Agent Plan](../SEMANTIC_LINK_AGENT_PLAN.md) — Detailed technical plan for semantic linking
