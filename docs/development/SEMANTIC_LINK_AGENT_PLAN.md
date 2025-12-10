# Phase 7: Semantic Link Agent Plan

> **Status**: Planning Only — Not Yet Implemented  
> **Target**: After Phase 6 (Relationship Inference & Case Reconstruction)  
> **Vision**: Enable discovery of non-obvious, high-value connections across Swedish policy documents

---

## 1. Overview

Phase 7 introduces **semantic linkage** across SOU, Dir., Prop., and Remissvar documents, surfacing connections that traditional keyword search or explicit references cannot detect.

### User Questions This Enables

- "Has a similar idea to this 2025 proposal been attempted before?"
- "Which SOUs align with this viewpoint — even if they're years apart?"
- "What happened to similar proposals that didn't become law?"
- "Who are the recurring actors pushing this policy direction?"

### Core Principles

| Principle | Description |
|-----------|-------------|
| **Forensic Transparency** | Every link must be explainable — no black-box similarity |
| **Precision > Recall** | Only surface confident matches; avoid link flooding |
| **Swedish Policy Context** | Models must handle Swedish legal/policy language |
| **Auditable** | All matches traceable to specific evidence |

---

## 2. Architecture Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEMANTIC LINK PIPELINE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  Summarizer  │───▶│  Embedding   │───▶│   Vector     │       │
│  │    Agent     │    │   Service    │    │    Store     │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                                       │                │
│         ▼                                       ▼                │
│  ┌──────────────┐                       ┌──────────────┐        │
│  │   Summary    │                       │   Matching   │        │
│  │    Store     │──────────────────────▶│    Engine    │        │
│  └──────────────┘                       └──────────────┘        │
│                                                │                 │
│                                                ▼                 │
│                                         ┌──────────────┐        │
│                                         │  Link Store  │        │
│                                         │  + Surfacing │        │
│                                         └──────────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Component A: Summarizer Agent

### Purpose

Generate structured summaries (~200-500 words) for each document, optimized for semantic comparison.

### Summary Schema

```typescript
interface DocumentSummary {
  document_id: string;
  doc_type: 'sou' | 'directive' | 'proposition' | 'remissvar';
  
  // Core summary
  policy_aim: string;              // 1-2 sentences: what does this propose?
  core_recommendations: string[];  // Key actionable proposals
  rationale: string;               // Why is this being proposed?
  
  // Actors & Attribution
  key_actors: {
    name: string;
    role: 'utredare' | 'minister' | 'remissinstans' | 'expert' | 'organization';
    stance?: 'supportive' | 'critical' | 'neutral';
  }[];
  
  // Classification
  policy_domains: string[];        // e.g., ['pension', 'social_security', 'labor']
  ideological_framing?: string;    // e.g., 'market-oriented', 'welfare-expanding'
  
  // References
  mentioned_laws: string[];        // e.g., ['SFS 2010:110', 'EU-direktiv 2019/1158']
  cited_documents: string[];       // e.g., ['SOU 2017:101', 'Dir. 2023:45']
  
  // Outcome flags
  outcome_status?: 'enacted' | 'rejected' | 'pending' | 'superseded' | 'unknown';
  revival_note?: string;           // e.g., "Ideas resurfaced in Prop. 2025/26:42"
  
  // Extraction metadata
  keywords: string[];              // Top 10-15 policy-relevant terms
  summary_confidence: 'high' | 'medium' | 'low';
  generated_at: string;
}
```

### Summarizer Prompt Structure

```
You are a Swedish policy analyst. Summarize this legislative document focusing on:

1. POLICY AIM: What problem does this address? What change is proposed?
2. RECOMMENDATIONS: List 3-5 concrete policy recommendations
3. RATIONALE: What arguments justify this proposal?
4. KEY ACTORS: Who authored, commissioned, or influenced this?
5. POLICY DOMAINS: Which areas does this touch? (max 3)
6. IDEOLOGICAL FRAMING: Is there a detectable political orientation?
7. OUTCOME: If known, what happened to this proposal?

Extract keywords that would help find conceptually similar documents.
Be factual. Cite page numbers where possible. Swedish output preferred.
```

### Implementation Notes

- Use Lovable AI (google/gemini-2.5-flash) for summarization
- Process in batches of 10-20 documents
- Store summaries in `document_summaries` table
- Re-run on document updates (track `summary_version`)

---

## 4. Component B: Embedding + Indexing

### Model Recommendations

| Model | Pros | Cons | Recommendation |
|-------|------|------|----------------|
| **intfloat/multilingual-e5-large** | Excellent Swedish support, 1024 dims, open-source | Requires self-hosting | ✅ **Primary choice** |
| **sentence-transformers/paraphrase-multilingual-mpnet-base-v2** | Good multilingual, 768 dims, fast | Slightly lower quality | ✅ Fallback option |
| **OpenAI text-embedding-3-large** | Best quality, 3072 dims | API cost, data privacy | Consider for production |
| **Cohere embed-multilingual-v3** | Strong multilingual | API dependency | Alternative |

### Recommended: intfloat/multilingual-e5-large

- **Why**: Trained on 100+ languages including Swedish, excellent on legal/formal text
- **Dimensions**: 1024 (good balance of quality vs storage)
- **Hosting**: Run via Hugging Face Inference API or self-host

### Vector Database Choice

**Recommended: pgvector (PostgreSQL extension)**

| Option | Pros | Cons |
|--------|------|------|
| **pgvector** | Native Postgres, no extra infra, ACID compliance | Slower at massive scale |
| Pinecone | Fast, managed, scalable | External dependency, cost |
| Weaviate | Feature-rich, hybrid search | Complex setup |
| Qdrant | Fast, open-source | Another service to manage |

**pgvector is ideal** for our scale (~1000s of documents) and keeps data in existing Supabase infrastructure.

### Schema Extension

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Document summaries with embeddings
CREATE TABLE document_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  
  -- Summary content
  policy_aim TEXT,
  core_recommendations JSONB DEFAULT '[]',
  rationale TEXT,
  key_actors JSONB DEFAULT '[]',
  policy_domains TEXT[] DEFAULT '{}',
  ideological_framing TEXT,
  mentioned_laws TEXT[] DEFAULT '{}',
  cited_documents TEXT[] DEFAULT '{}',
  outcome_status TEXT,
  revival_note TEXT,
  keywords TEXT[] DEFAULT '{}',
  
  -- Full summary text (for embedding)
  full_summary_text TEXT NOT NULL,
  
  -- Vector embedding (1024 dimensions for multilingual-e5-large)
  embedding vector(1024),
  
  -- Metadata
  summary_confidence TEXT DEFAULT 'medium',
  summary_version INTEGER DEFAULT 1,
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(document_id)
);

-- Index for fast similarity search
CREATE INDEX ON document_summaries 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for keyword filtering
CREATE INDEX idx_summaries_keywords ON document_summaries USING GIN(keywords);
CREATE INDEX idx_summaries_domains ON document_summaries USING GIN(policy_domains);
```

### Embedding Pipeline

```typescript
// Pseudocode for embedding generation
async function embedDocument(summary: DocumentSummary): Promise<number[]> {
  const textToEmbed = [
    summary.policy_aim,
    summary.rationale,
    summary.core_recommendations.join('. '),
    summary.keywords.join(', ')
  ].join('\n\n');
  
  // Call embedding model
  const embedding = await embedText(textToEmbed, 'intfloat/multilingual-e5-large');
  return embedding;
}
```

---

## 5. Component C: Matching Engine

### Similarity Search

```sql
-- Find semantically similar documents
CREATE OR REPLACE FUNCTION find_similar_documents(
  source_doc_id UUID,
  match_threshold FLOAT DEFAULT 0.75,
  max_results INT DEFAULT 10
)
RETURNS TABLE(
  target_document_id UUID,
  similarity_score FLOAT,
  shared_keywords TEXT[],
  shared_domains TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  WITH source AS (
    SELECT embedding, keywords, policy_domains
    FROM document_summaries
    WHERE document_id = source_doc_id
  )
  SELECT 
    ds.document_id,
    1 - (ds.embedding <=> source.embedding) AS similarity_score,
    ARRAY(SELECT UNNEST(ds.keywords) INTERSECT SELECT UNNEST(source.keywords)) AS shared_keywords,
    ARRAY(SELECT UNNEST(ds.policy_domains) INTERSECT SELECT UNNEST(source.policy_domains)) AS shared_domains
  FROM document_summaries ds, source
  WHERE ds.document_id != source_doc_id
    AND 1 - (ds.embedding <=> source.embedding) > match_threshold
  ORDER BY ds.embedding <=> source.embedding
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;
```

### Composite Scoring Algorithm

```typescript
interface MatchScore {
  embedding_similarity: number;    // 0-1, from vector search
  shared_utredare_bonus: number;   // +0.15 per shared utredare
  shared_keywords_bonus: number;   // +0.02 per keyword (max +0.2)
  shared_domains_bonus: number;    // +0.05 per domain (max +0.15)
  temporal_penalty: number;        // -0.01 per year distance (max -0.2)
  shared_remissinstans_bonus: number; // +0.05 per shared org
  
  final_score: number;             // Weighted combination
  confidence: 'high' | 'medium' | 'low';
}

function computeMatchScore(
  source: DocumentSummary,
  target: DocumentSummary,
  embeddingSimilarity: number
): MatchScore {
  // Base score from embedding
  let score = embeddingSimilarity * 0.5;  // 50% weight
  
  // Shared utredare bonus
  const sharedUtredare = findSharedActors(source.key_actors, target.key_actors, 'utredare');
  score += Math.min(sharedUtredare.length * 0.15, 0.3);  // Max 30%
  
  // Shared keywords bonus
  const sharedKeywords = intersection(source.keywords, target.keywords);
  score += Math.min(sharedKeywords.length * 0.02, 0.2);  // Max 20%
  
  // Shared policy domains bonus
  const sharedDomains = intersection(source.policy_domains, target.policy_domains);
  score += Math.min(sharedDomains.length * 0.05, 0.15); // Max 15%
  
  // Temporal distance penalty (documents far apart are less likely related)
  const yearDistance = Math.abs(getYear(source) - getYear(target));
  score -= Math.min(yearDistance * 0.01, 0.2);  // Max -20%
  
  // Shared remissinstans bonus
  const sharedOrgs = findSharedActors(source.key_actors, target.key_actors, 'remissinstans');
  score += Math.min(sharedOrgs.length * 0.05, 0.15);  // Max 15%
  
  // Normalize to 0-1
  const finalScore = Math.max(0, Math.min(1, score));
  
  return {
    embedding_similarity: embeddingSimilarity,
    shared_utredare_bonus: sharedUtredare.length * 0.15,
    shared_keywords_bonus: sharedKeywords.length * 0.02,
    shared_domains_bonus: sharedDomains.length * 0.05,
    temporal_penalty: -Math.min(yearDistance * 0.01, 0.2),
    shared_remissinstans_bonus: sharedOrgs.length * 0.05,
    final_score: finalScore,
    confidence: finalScore > 0.8 ? 'high' : finalScore > 0.6 ? 'medium' : 'low'
  };
}
```

### Score Weight Summary

| Signal | Weight | Max Contribution |
|--------|--------|------------------|
| Embedding similarity | 50% | 0.50 |
| Shared utredare | +0.15 each | 0.30 |
| Shared keywords | +0.02 each | 0.20 |
| Shared policy domains | +0.05 each | 0.15 |
| Shared remissinstans | +0.05 each | 0.15 |
| Temporal distance | -0.01/year | -0.20 |

---

## 6. Component D: Link Storage + Surfacing

### Semantic Links Table

```sql
CREATE TABLE semantic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link endpoints
  source_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  target_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  
  -- Match metadata
  match_type TEXT DEFAULT 'semantic',
  score FLOAT NOT NULL CHECK (score >= 0 AND score <= 1),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  
  -- Explainability (CRITICAL for forensic transparency)
  explanation TEXT NOT NULL,
  
  -- Evidence breakdown
  embedding_similarity FLOAT,
  shared_entities JSONB DEFAULT '[]',    -- [{name, type, role}]
  keywords_overlap JSONB DEFAULT '[]',   -- ['pension', 'arbetsrätt']
  domains_overlap JSONB DEFAULT '[]',    -- ['social_security']
  
  -- Scoring components (for audit)
  score_breakdown JSONB DEFAULT '{}',
  
  -- Management
  status TEXT DEFAULT 'auto' CHECK (status IN ('auto', 'verified', 'rejected')),
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Prevent duplicates
  UNIQUE(source_document_id, target_document_id)
);

-- Indexes
CREATE INDEX idx_semantic_links_source ON semantic_links(source_document_id);
CREATE INDEX idx_semantic_links_target ON semantic_links(target_document_id);
CREATE INDEX idx_semantic_links_score ON semantic_links(score DESC);
CREATE INDEX idx_semantic_links_confidence ON semantic_links(confidence);
```

### Sample Link JSON

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "source_document_id": "doc-sou-2017-101",
  "target_document_id": "doc-prop-2025-26-42",
  "match_type": "semantic",
  "score": 0.847,
  "confidence": "high",
  "explanation": "Both documents propose pension reform targeting gig economy workers. SOU 2017:101 recommended portable pension rights for platform workers; Prop. 2025/26:42 implements a similar framework 8 years later. Shared policy domain (pension, labor), overlapping keywords (plattformsarbete, pensionsrätt, egenföretagare), and similar ideological framing (expanding social safety net to non-traditional employment).",
  "embedding_similarity": 0.82,
  "shared_entities": [
    {"name": "Pensionsmyndigheten", "type": "organization", "role": "remissinstans"},
    {"name": "LO", "type": "organization", "role": "remissinstans"}
  ],
  "keywords_overlap": ["pension", "plattformsarbete", "gig-ekonomi", "socialförsäkring"],
  "domains_overlap": ["pension", "labor"],
  "score_breakdown": {
    "embedding_similarity": 0.41,
    "shared_keywords_bonus": 0.08,
    "shared_domains_bonus": 0.10,
    "shared_remissinstans_bonus": 0.10,
    "temporal_penalty": -0.08,
    "shared_utredare_bonus": 0.0
  },
  "status": "auto",
  "created_at": "2025-12-10T14:30:00Z"
}
```

---

## 7. Explanation Generation

### Explanation Prompt

```
You are generating an explanation for why two Swedish policy documents are semantically linked.

Document A: {source_summary}
Document B: {target_summary}

Similarity Score: {score}
Shared Keywords: {keywords}
Shared Actors: {actors}
Shared Domains: {domains}

Write a 2-3 sentence explanation in Swedish that:
1. States the core conceptual connection
2. Highlights specific shared elements (actors, themes, proposals)
3. Notes any interesting temporal or outcome relationship

Be factual. Do not speculate. If the connection is weak, say so.
```

### Example Output

> "Båda dokumenten behandlar pensionsreform för plattformsarbetare. SOU 2017:101 föreslog portabla pensionsrättigheter för gigarbetare, medan Prop. 2025/26:42 implementerar ett liknande ramverk åtta år senare. Gemensamma nyckelord inkluderar 'plattformsarbete', 'pensionsrätt' och 'socialförsäkring'."

---

## 8. UI Integration Hints

### Document Detail Page

```tsx
// Future component: SemanticLinks.tsx
<Card>
  <CardHeader>
    <CardTitle>Semantiskt relaterade dokument</CardTitle>
    <CardDescription>
      Dokument med liknande policyinnehåll eller tematik
    </CardDescription>
  </CardHeader>
  <CardContent>
    {semanticLinks.map(link => (
      <div key={link.id} className="border-b py-3">
        <div className="flex justify-between items-start">
          <Link to={`/document/${link.target_document_id}`}>
            <span className="font-medium">{link.target_title}</span>
          </Link>
          <Badge variant={link.confidence === 'high' ? 'default' : 'secondary'}>
            {Math.round(link.score * 100)}% match
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {link.explanation}
        </p>
        <div className="flex gap-2 mt-2">
          {link.keywords_overlap.slice(0, 3).map(kw => (
            <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>
          ))}
        </div>
      </div>
    ))}
  </CardContent>
</Card>
```

### Search Integration

- Add "Find similar" button on search results
- Filter search by semantic cluster
- "More like this" functionality

---

## 9. Batch Processing Pipeline

### Daily/Weekly Job

```typescript
// Pseudocode for batch semantic linking
async function runSemanticLinkingBatch() {
  // 1. Get documents needing summarization
  const docsToSummarize = await getDocumentsWithoutSummaries();
  
  // 2. Generate summaries (batch of 20)
  for (const batch of chunk(docsToSummarize, 20)) {
    await generateSummaries(batch);
  }
  
  // 3. Generate embeddings for new summaries
  const summariesToEmbed = await getSummariesWithoutEmbeddings();
  for (const batch of chunk(summariesToEmbed, 50)) {
    await generateEmbeddings(batch);
  }
  
  // 4. Compute new semantic links
  const recentDocs = await getRecentDocuments(days: 30);
  for (const doc of recentDocs) {
    const candidates = await findSimilarDocuments(doc.id, threshold: 0.7);
    for (const candidate of candidates) {
      const score = computeMatchScore(doc, candidate);
      if (score.final_score > 0.6) {
        const explanation = await generateExplanation(doc, candidate, score);
        await storeSemanticLink(doc.id, candidate.id, score, explanation);
      }
    }
  }
  
  // 5. Log stats
  console.log(`Processed ${docsToSummarize.length} summaries, ${newLinks} new links`);
}
```

---

## 10. Validation & Quality Assurance

### Manual Review Pipeline

1. **Auto-generated links** start with `status: 'auto'`
2. Admin UI shows links sorted by score
3. Reviewer can mark as `verified` or `rejected`
4. Rejected links inform model tuning

### Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Precision@10 | >80% | Manual review of top 10 links per document |
| User click-through | >15% | Track when users follow semantic links |
| False positive rate | <10% | Random sample audit |

### Test Cases for Validation

1. **Known revival**: SOU 2017 proposal → Prop. 2025 implementation (should link)
2. **Same utredare**: Documents by same lead investigator (should boost score)
3. **Unrelated**: Tax reform ↔ Environmental policy (should NOT link)
4. **Cross-type**: Dir. 2020 → SOU 2022 → Prop. 2025 chain (should all link)

---

## 11. Implementation Phases

### Phase 7.1: Foundation
- [ ] Enable pgvector extension
- [ ] Create `document_summaries` table
- [ ] Create `semantic_links` table
- [ ] Implement Summarizer Agent (edge function)

### Phase 7.2: Embedding Pipeline
- [ ] Integrate multilingual-e5-large model
- [ ] Build embedding generation job
- [ ] Index existing document summaries

### Phase 7.3: Matching Engine
- [ ] Implement similarity search function
- [ ] Build composite scoring algorithm
- [ ] Create explanation generation

### Phase 7.4: UI Integration
- [ ] Add semantic links to Document Detail
- [ ] Build admin review interface
- [ ] Add "Find similar" to search

### Phase 7.5: Refinement
- [ ] Tune score weights based on feedback
- [ ] Improve Swedish-specific keyword extraction
- [ ] Add temporal pattern detection

---

## 12. Dependencies

| Dependency | Purpose | Status |
|------------|---------|--------|
| Phase 5 complete | Document corpus available | ✅ Done |
| Phase 6 complete | Case reconstruction provides ground truth | Planned |
| pgvector | Vector similarity search | Available in Supabase |
| Embedding model | Generate document vectors | To be integrated |
| Lovable AI | Summarization | Available |

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Poor Swedish embedding quality | Low precision matches | Test multiple models; consider fine-tuning |
| Explanation hallucination | User mistrust | Strict prompting; include only verifiable facts |
| Score gaming | Irrelevant links surface | Manual review pipeline; user feedback |
| Compute cost | Expensive embeddings | Batch processing; cache embeddings |
| Privacy concerns | Sensitive policy analysis | Keep processing local; audit logs |

---

## 14. Success Criteria

Phase 7 is complete when:

1. ✅ 80%+ of documents have summaries and embeddings
2. ✅ Semantic links discoverable in Document Detail UI
3. ✅ Precision@10 > 80% on manual review
4. ✅ Explanations are factual and auditable
5. ✅ Users can "Find similar" from any document
6. ✅ Admin can verify/reject auto-generated links

---

*Document created: 2025-12-10*  
*Phase: Planning only — implementation after Phase 6*
