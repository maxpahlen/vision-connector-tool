
# Phase 5.6.4: AI-Assisted Stance Classification

## Objective

Automate triage of 961 uncertain remissvar stances (720 neutral with 0 keywords + 241 mixed) using OpenAI tool calling, reducing manual review burden from ~961 items to only low-confidence AI classifications.

---

## Current State Analysis

### Database Query Results

| Category | Count | Description |
|----------|-------|-------------|
| Neutral (0 keywords) | 720 | No stance signals detected - may contain unrecognized phrasing |
| Mixed | 241 | Conflicting signals (both support AND oppose keywords) |
| **Total eligible for AI** | **961** | Requires AI to resolve ambiguity |

### Existing Infrastructure

- `_shared/openai-client.ts`: Shared OpenAI wrapper with retry logic (uses `OPENAI_API_KEY` secret - already configured)
- `analyze-remissvar-stance/index.ts`: Current keyword-based analyzer (Phase 5.6.3)
- `stance-analyzer.ts`: Shared module with `extractSections()` for Sammanfattning detection
- `StanceManualReview.tsx`: Manual review UI with metadata storage pattern
- `RemissvarStanceAnalyzerTest.tsx`: Batch processing UI with progress tracking

---

## Implementation Details

### 1. Edge Function: `classify-stance-ai`

**File:** `supabase/functions/classify-stance-ai/index.ts`

**Query Filter (enforces eligibility):**
```sql
SELECT * FROM remiss_responses
WHERE extraction_status = 'ok'
  AND analysis_status = 'ok'  -- Already keyword-analyzed
  AND (
    (stance_summary = 'neutral' AND stance_signals->>'keywords_found' = '[]')
    OR stance_summary = 'mixed'
  )
  AND (metadata->>'ai_review' IS NULL)  -- Not yet AI-processed
LIMIT :limit
```

**Text Preparation (Summary-First Strategy):**
1. Extract "Sammanfattning" section using existing `extractSections()` logic
2. If Sammanfattning exists, use it (up to 1500 chars)
3. Append first N chars of body (up to 2500 chars) for context
4. Total max: ~4000 chars per document

**Tool Definition (Structured Output):**
```typescript
{
  type: "function",
  function: {
    name: "classify_stance",
    description: "Classify the stance of a Swedish consultation response (remissvar)",
    parameters: {
      type: "object",
      properties: {
        stance: { 
          type: "string", 
          enum: ["support", "oppose", "conditional", "neutral"] 
        },
        confidence: { 
          type: "string", 
          enum: ["high", "medium", "low"],
          description: "Confidence level based on clarity of position in text"
        },
        reasoning: { 
          type: "string",
          description: "Brief explanation in Swedish (1-2 sentences max)"
        },
        key_phrases: {
          type: "array",
          items: { type: "string" },
          description: "2-5 key phrases from the text that informed the decision"
        }
      },
      required: ["stance", "confidence", "reasoning", "key_phrases"]
    }
  }
}
```

**System Prompt (Swedish Context):**
```
Du analyserar svenska remissvar (consultation responses) till statliga utredningar (SOU).

Bestäm organisationens ställningstagande till förslagen:
- support: Organisationen tillstyrker/instämmer i förslaget
- oppose: Organisationen avstyrker/motsätter sig förslaget
- conditional: Stödjer med förbehåll, villkor eller reservationer
- neutral: Inga synpunkter, faller utanför verksamhetsområdet, eller irrelevant

Var uppmärksam på:
- Explicit ställningstagande i sammanfattning eller inledning
- Formuleringar som "vi instämmer", "vi tillstyrker", "vi avstyrker", "vi motsätter oss"
- Förbehåll som "under förutsättning att", "med förbehåll"
- "Inga synpunkter" eller "berörs ej" indikerar neutral

Om texten saknar tydligt ställningstagande, välj "neutral" med "low" confidence.
```

**Database Updates:**
- If confidence >= threshold: Update `stance_summary` to AI classification
- Set `analysis_status` to `ai_classified` or `ai_low_confidence`
- Store full AI response in `metadata.ai_review`:
```json
{
  "ai_review": {
    "stance": "support",
    "confidence": "high",
    "reasoning": "Organisationen tillstyrker samtliga förslag och välkomnar utredningens slutsatser.",
    "key_phrases": ["tillstyrker förslaget", "välkomnar utredningen"],
    "model": "gpt-4o-2024-08-06",
    "classified_at": "2026-01-27T12:00:00Z",
    "original_stance": "mixed",
    "auto_applied": true
  }
}
```

**Request Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 20 | Batch size (max 50) |
| `dry_run` | boolean | false | Preview mode |
| `confidence_threshold` | string | "medium" | Auto-apply threshold (high/medium/low) |

**Response Format:**
```json
{
  "processed": 20,
  "classified": 18,
  "low_confidence": 2,
  "errors": [],
  "summary": { "support": 8, "oppose": 5, "conditional": 3, "neutral": 2 },
  "details": [
    {
      "response_id": "uuid",
      "organization": "Naturvårdsverket",
      "original_stance": "mixed",
      "ai_stance": "support",
      "confidence": "high",
      "reasoning": "...",
      "auto_applied": true
    }
  ],
  "dry_run": false
}
```

### 2. Config Update

**File:** `supabase/config.toml`

Add entry:
```toml
[functions.classify-stance-ai]
verify_jwt = false
```

### 3. Admin UI Updates: `RemissvarStanceAnalyzerTest.tsx`

Add new collapsible section: "AI Classification (Phase 5.6.4)"

**Components:**
1. **Target Stats Card**
   - Neutral with 0 keywords: X
   - Mixed stances: Y
   - AI processed: Z
   - Pending AI review: (X+Y-Z)

2. **Batch Controls**
   - Batch size selector: 10, 20, 30, 50
   - Batch count selector: 1, 5, 10, 20
   - Confidence threshold: high, medium (default), low
   - Dry run toggle
   - Run/Stop buttons

3. **Progress Display**
   - Current batch / total batches
   - Items processed this session
   - AI classification distribution chart

4. **Results Table**
   - Organization name
   - Original stance (neutral/mixed)
   - AI stance (with badge)
   - Confidence (with color: high=green, medium=yellow, low=red)
   - Auto-applied (check/x icon)
   - Reasoning (truncated, expandable)

### 4. Manual Review Integration: `StanceManualReview.tsx`

**Updates:**

1. **Add filter for AI-processed items:**
   - New filter option: "AI Low Confidence" (`analysis_status = 'ai_low_confidence'`)

2. **Display AI reasoning in review dialog:**
   - If `metadata.ai_review` exists, show:
     - AI's stance classification
     - Confidence level
     - Reasoning text
     - Key phrases (as badges)
   - Clear visual distinction: "AI Suggested: Support (Medium Confidence)"

3. **Pre-populate corrected stance:**
   - If AI classified with low confidence, pre-select AI's stance as starting point for human review

---

## File Changes Summary

| File | Action | Lines | Description |
|------|--------|-------|-------------|
| `supabase/functions/classify-stance-ai/index.ts` | Create | ~300 | New AI classification edge function |
| `supabase/config.toml` | Modify | +3 | Add function config |
| `src/components/admin/RemissvarStanceAnalyzerTest.tsx` | Modify | +200 | Add AI classification section |
| `src/components/admin/StanceManualReview.tsx` | Modify | +80 | Add AI filter and reasoning display |

---

## Cost Estimation

| Model | Input Rate | Output Rate | Est. Total |
|-------|------------|-------------|------------|
| gpt-4o-2024-08-06 | $2.50/1M | $10/1M | ~$15-20 |
| gpt-4o-mini | $0.15/1M | $0.60/1M | ~$1-2 |

Recommendation: Start with `gpt-4o-2024-08-06` (default in `openai-client.ts`) for accuracy, given the relatively small corpus (961 items).

---

## Success Criteria

| Metric | Target |
|--------|--------|
| AI classification coverage | >90% of 961 uncertain stances |
| High/Medium confidence rate | >80% of classifications |
| Manual review queue reduction | <200 items requiring human review |
| Spot-check accuracy | >85% agreement on 20 random samples |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| API rate limits | Use existing `retryWithBackoff()` in openai-client.ts; 2s delay between batches |
| Token costs | Truncate to 4000 chars; batch limits prevent runaway costs |
| Poor classifications | Store AI reasoning for audit; low-confidence → manual queue |
| Data governance | Already approved for OpenAI; no PII in remissvar (public documents) |

---

## Execution Order

1. ✅ Create `classify-stance-ai` edge function
2. ✅ Update `supabase/config.toml` with function config
3. ✅ Add AI classification section to `RemissvarStanceAnalyzerTest.tsx`
4. ✅ Update `StanceManualReview.tsx` with AI filter and reasoning display
5. 🔄 Deploy and run dry-run test on 10 items
6. ⏳ Run full batch processing (961 items in ~50 batches of 20)
7. ⏳ Update documentation

---

## Technical Notes

### Reuse Patterns

- **OpenAI client**: Import `callOpenAI` from `_shared/openai-client.ts` (includes retry logic)
- **Section extraction**: Reuse `extractSections()` from `stance-analyzer.ts` for summary-first selection
- **Batch UI pattern**: Follow existing `RemissvarStanceAnalyzerTest.tsx` batch controls structure
- **Metadata storage**: Follow existing `metadata.manual_review` pattern for `metadata.ai_review`

### Analysis Status State Machine

```text
not_started → ok (keyword analysis) → ai_classified (AI confirmed)
                                    → ai_low_confidence (needs human review)
                                    → manual_confirmed (human approved)
                                    → manual_corrected (human changed)
```

---

## Governance

- **Data Risk:** LOW (additive metadata field, no schema changes)
- **Architectural Owner:** Lovable (edge function, database updates)
- **Cost Owner:** Max (OpenAI API usage ~$15-20)
