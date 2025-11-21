# Phase 6: Advanced Analysis & Intelligence

**Status:** Planning  
**Branch:** `phase-6-advanced-analysis`  
**Dependencies:** Phase 3 (AI), Phase 4 (Search), Phase 5 (User Features)

---

## Purpose

Apply advanced AI and analytics to provide deeper insights: sentiment analysis, impact assessment, cross-document reasoning, trend detection, and predictive intelligence about legislative processes.

---

## Rough Goals

### 1. Impact Analysis Agent
- Estimate which sectors/stakeholders affected by SOU
- Extract policy recommendations with confidence scores
- Map potential downstream effects

### 2. Compliance & Legal Cross-Referencing
- Check SOU recommendations against existing laws
- Identify conflicts or overlaps with other processes
- Cite relevant legal frameworks

### 3. Sentiment & Tone Analysis
- Analyze language in remiss responses
- Detect support/opposition patterns
- Track shifts in debate over time

### 4. Cross-Document Reasoning
- Compare multiple SOUs on same topic
- Identify evolving policy positions
- Track how recommendations change through process stages

### 5. Trend Detection & Predictions
- "Climate policy SOUs increasing 30% YoY"
- "Average time from SOU to law: 18 months"
- Predict likelihood of SOU leading to legislation

### 6. Visualization Dashboards
- Interactive process flows (Sankey diagrams)
- Network graphs of entity relationships
- Heatmaps of ministry activity
- Timeline comparisons

---

## Interaction with Phase 3 Data

### New AI Agents

- **Impact Agent:** Analyzes `documents.raw_content` → creates `impact_assessments` table
- **Legal Agent:** Cross-references with external legal databases
- **Sentiment Agent:** Processes remiss documents → `sentiment_scores` table
- **Trend Agent:** Aggregates data across processes → `trends` table

### Extends Database Schema

```sql
-- Impact assessments
CREATE TABLE impact_assessments (
  id uuid PRIMARY KEY,
  process_id uuid REFERENCES processes(id),
  affected_sectors jsonb,
  stakeholders jsonb,
  confidence_score float,
  source_citations jsonb,
  created_at timestamptz DEFAULT now()
);

-- Sentiment analysis
CREATE TABLE sentiment_scores (
  id uuid PRIMARY KEY,
  document_id uuid REFERENCES documents(id),
  sentiment_type text, -- 'support', 'opposition', 'neutral'
  score float, -- -1.0 to 1.0
  analyzed_sections jsonb,
  created_at timestamptz DEFAULT now()
);

-- Detected trends
CREATE TABLE trends (
  id uuid PRIMARY KEY,
  trend_type text,
  description text,
  data_points jsonb,
  period_start date,
  period_end date,
  created_at timestamptz DEFAULT now()
);
```

---

## Technical Considerations

### Advanced NLP
- May need embeddings (vector search) for semantic similarity
- Consider pgvector extension for Supabase
- Use OpenAI embeddings or open-source alternatives

### Multi-Document Processing
- Batch processing for trend analysis
- Incremental updates as new SOUs arrive
- Caching of intermediate results

### Visualization
- D3.js for complex interactive charts
- Recharts for standard graphs
- Consider dedicated viz libraries (ECharts, Plotly)

### Performance
- Pre-compute analytics on cron schedule
- Materialized views for dashboard queries
- Consider read replicas for heavy analysis

---

## Open Questions

1. **Embedding strategy:** Self-hosted or API-based?
   - OpenAI embeddings: Easy but costs scale
   - Open-source (e.g., sentence-transformers): More control
   - Hybrid: Cache embeddings, recompute on change

2. **Legal database integration:** Which sources?
   - Riksdagen API for existing laws
   - EU legal databases if relevant
   - Subscription services (Zeteo, Karnov)?

3. **Real-time vs. batch:** How fresh do insights need to be?
   - Trend analysis: Daily batch OK
   - Impact assessment: Per-document, can wait
   - Sentiment: Per-remiss response, near real-time

4. **Validation:** How to measure accuracy of predictions?
   - Track predictions vs. actual outcomes
   - User feedback on impact assessments
   - A/B test different models

5. **Bias & ethics:** How to handle controversial topics?
   - Transparency in methodology
   - Multiple perspectives (not single "correct" view)
   - User controls to adjust weights/filters

---

## Success Criteria

- [ ] Impact assessments cited by users in analysis
- [ ] Trend detection surfaces non-obvious patterns
- [ ] Sentiment analysis aligns with manual review (80%+ accuracy)
- [ ] Cross-document reasoning helps identify related work
- [ ] Dashboards load in <2 seconds with 1000+ processes

---

## Future Enhancements

- Natural language query interface ("Show me climate SOUs opposed by industry")
- Predictive models (machine learning on historical data)
- Integration with parliamentary voting records
- Real-time monitoring of Riksdagen debates
- Automated report generation for stakeholders
