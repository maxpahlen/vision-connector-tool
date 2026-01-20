# Phase 5.6: Remissvar Content Insights

> **Status:** STAGED (Concept Brief)  
> **Owner:** Lovable (Architectural Authority)  
> **Created:** 2026-01-20  
> **Prerequisite:** Phase 5.5.3 COMPLETE, Phase 5.5.4 debugged

## Objective

Enable content-based analysis of remissvar by extracting PDF text and building a foundation for NLP-driven insights using **structural guidance from SB PM 2021:1**.

---

## Source Documents

| Document | Purpose |
|----------|---------|
| `docs/development/PHASE_5.6_REMISSVAR_TEXT_EXTRACTION_GUIDANCE.md` | Swedish stance keywords, structural anchors |
| SB PM 2021:1 "Svara på remiss" | Official remissvar format guidance |
| `docs/development/branches/phase-5.5-cross-document-insights.md` | Pre-drafted schema (deferred items) |

---

## Sub-Phases

### Phase 5.6.1: Database Schema Deployment

**Status:** Ready to execute  
**Risk:** NONE (additive columns only)

Add extraction infrastructure columns to `remiss_responses`:

```sql
ALTER TABLE remiss_responses 
  ADD COLUMN IF NOT EXISTS extraction_status TEXT DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS raw_content TEXT,
  ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_remiss_responses_extraction_status 
  ON remiss_responses(extraction_status);
```

**Extraction Status Values:**
- `not_started` — Default, never processed
- `pending` — Queued for extraction
- `ok` — Successfully extracted
- `error` — Extraction failed (check `metadata.extraction_error`)
- `skipped` — Intentionally skipped (non-PDF, empty)

---

### Phase 5.6.2: PDF Text Extraction Pipeline

**Status:** To be implemented  
**Dependencies:** Phase 5.6.1

#### New Edge Function: `process-remissvar-pdf`

Adapts existing `process-sou-pdf` pattern:

**Input:**
```json
{
  "responseId": "uuid",       // Optional: single response
  "batchSize": 50,            // Default batch size
  "dryRun": false             // Preview mode
}
```

**Behavior:**
1. Query `remiss_responses` where `extraction_status = 'not_started'`
2. For each response, call PDF extractor service using `file_url`
3. Store result in `raw_content`, set `extraction_status = 'ok'`, `extracted_at = now()`
4. Handle errors: set `extraction_status = 'error'`, store error in `metadata`

**Reuse Strategy:**
- Import shared `getPdfExtractorConfig()` from `_shared/pdf-extractor.ts`
- Use existing `sanitizeText()` from `_shared/text-utils.ts`
- Pagination pattern from `get-participation-metrics`

#### Admin UI Component: `RemissvarTextExtractorTest.tsx`

Features:
- Show counts by `extraction_status`
- "Extract All" button with progress indicator
- Sample text preview for verification
- Error log display

---

### Phase 5.6.3: Content Analysis Foundation (MVP)

**Status:** Planning  
**Dependencies:** Phase 5.6.2 complete with >50% extraction

#### Structural Anchors (from SB PM 2021:1 Guidance)

| Section | Detection Pattern | Use |
|---------|-------------------|-----|
| Header Block | First lines: date, "Dnr", department | Metadata extraction |
| Sammanfattning | First heading containing "sammanfattning" | Summary candidate |
| Ställningstaganden | Section header or inline stance keywords | Position detection |
| Section References | "avsnitt X.Y", "betänkandet" | Proposal alignment |

#### Stance Detection Keywords (Swedish)

| Position | Keywords |
|----------|----------|
| **Support** | `instämmer`, `tillstyrker`, `välkomnar`, `stödjer`, `positivt` |
| **Opposition** | `motsätter`, `avstyrker`, `avråder`, `invänder`, `kritiskt` |
| **Conditional** | `med förbehåll`, `under förutsättning` |
| **No Opinion** | `inga synpunkter`, `avstår` |

#### Extraction Interface

```typescript
interface RemissvarAnalysis {
  // From SB PM 2021:1 guidance
  summary: string | null;              // First "Sammanfattning" section
  stance_summary: 'support' | 'oppose' | 'conditional' | 'neutral' | 'mixed' | null;
  section_references: string[];        // "avsnitt 4.3" patterns
  arguments: string | null;            // Key rationale paragraphs
  metadata_header: {
    date: string | null;
    dnr: string | null;
    department: string | null;
  };
  
  // Computed fields
  word_count: number;
  position_signals: {
    support_count: number;
    oppose_count: number;
    conditional_count: number;
  };
}
```

#### Heuristics (from guidance doc)

1. **First heading "Sammanfattning"** → candidate summary
2. **Sentences containing "instämmer/motsätter"** → stance detection
3. **Pattern "avsnitt X.Y"** → section reference extraction

#### Entity Page Enhancement

On organization entity pages (`/entity/:id`), show:
- Total response word count
- Position signal summary
- "Read Response" links to extracted text

---

### Phase 5.6.4: NLP Analysis Pipeline (Future)

**Status:** Deferred until 5.6.3 validated

#### Planned Capabilities

| Capability | Approach | Model Requirement |
|------------|----------|-------------------|
| Sentiment scoring | LLM structured extraction | Lovable AI (Gemini) |
| Key argument extraction | Tool calling with schema | Lovable AI (Gemini) |
| Cross-response comparison | Embeddings + similarity | Consider pgvector |
| Trend detection | Aggregation over time | Batch processing |

---

## Success Criteria

### Phase 5.6.1 (Schema)
- [ ] Columns deployed without data loss
- [ ] Indexes created for query performance

### Phase 5.6.2 (Extraction)
- [ ] >90% of 3,424 responses successfully extracted
- [ ] Error rate <5%
- [ ] Extraction time <30 seconds per PDF average
- [ ] Admin UI shows extraction progress

### Phase 5.6.3 (Content MVP)
- [ ] Word count metrics displayed on entity pages
- [ ] Position signals detected for >50% of responses
- [ ] Erik confirms insights are useful

### Phase 5.6.4 (NLP - Future)
- [ ] Sentiment analysis accuracy >80% vs manual review
- [ ] Key arguments surfaced and verifiable

---

## Data Volume Estimates

| Metric | Estimate | Notes |
|--------|----------|-------|
| Total remissvar | 3,424 | All have PDF URLs |
| Avg PDF size | ~200 KB | Based on sample filenames |
| Avg text length | ~5,000 chars | Estimate from SOU patterns |
| Total extraction time | ~3-4 hours | At 3 sec/PDF |
| Storage increase | ~17 MB | 3,424 × 5,000 chars |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| PDF extraction failures | Use existing error handling from `process-sou-pdf`, store error in metadata |
| Rate limiting by regeringen.se | Add delay between requests (500ms), process in batches |
| Large PDFs causing timeouts | Existing extractor has 60s timeout, mark as `error` and continue |
| Low-value responses (empty, duplicates) | Skip responses <100 chars, flag potential duplicates |

---

## Files to Create/Modify

**New:**
- `supabase/functions/process-remissvar-pdf/index.ts` — Extraction edge function
- `src/components/admin/RemissvarTextExtractorTest.tsx` — Admin UI

**Modify:**
- `src/pages/EntityDetail.tsx` — Add response content section
- `docs/development/PRODUCT_ROADMAP.md` — Update phase status
- `docs/PHASE_DELTAS.md` — Log changes
- `docs/CONTEXT_PRIORITY.md` — Add Phase 5.6 docs

---

## Governance

- **Data Risk:** NONE for 5.6.1-5.6.3 (additive columns, no deletions)
- **Architectural Owner:** Lovable (database changes, edge functions)
- **Approval Required:** Max (scope) + Lovable (architecture) + Codex (execution)

---

## Recommended Execution Order

1. **Debug Phase 5.5.4** — Fix Velocity Dashboard bug first
2. **Phase 5.6.1** — Deploy schema (1 migration, 5 min)
3. **Phase 5.6.2** — Build extraction pipeline (edge function + admin UI, 2-3 hours)
4. **Run extraction** — Process all 3,424 remissvar (3-4 hours batch)
5. **Phase 5.6.3** — Build content MVP (keyword detection using Swedish stance terms, 2 hours)
6. **User feedback** — Erik reviews, validates usefulness
7. **Phase 5.6.4** — NLP pipeline (only if 5.6.3 validated)

---

## Approval Log

| Date | Decision | Approved By |
|------|----------|-------------|
| 2026-01-20 | Phase 5.6 concept brief created | Max, Lovable, Codex |

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-01-20 | Initial concept brief created from guidance doc | Lovable |
