# Phase 7.2 Fix: Intelligent Section Extraction for Document Summarization

## Problem Statement

The current summarizer sends the **first 12,000 characters** of each document to GPT-4o. For large documents (SOUs average 1M chars), this captures only the table of contents -- not the actual content. The model produces summaries that:

- Miss entire proposal categories (only sees TOC headings, not proposal text)
- Flip negations (cannot distinguish "proposed X" from "concluded against X")
- Over-generalize (no access to specific mechanism details)

The ChatGPT critique of SOU 2025:51 is accurate on all counts.

## Design: Smart Section Extraction

Instead of "first N characters," extract the **semantically richest sections** from Swedish government documents. All Swedish betankanden follow a standardized structure with a "Sammanfattning" (executive summary) section near the front, typically 5-30 pages long, which already contains the distilled proposals, conclusions, and key context.

### Strategy by Document Type


| Doc Type                 | Avg Size   | Extraction Strategy                           |
| ------------------------ | ---------- | --------------------------------------------- |
| SOU (60)                 | 1M chars   | Sammanfattning section + TOC structure        |
| Proposition (2,028)      | 341K chars | Sammanfattning + Forfattningsforslag headings |
| Committee report (1,844) | 115K chars | First 80K (fits most reports fully)           |
| Directive (1,397)        | 18K chars  | Full text (well under limit)                  |
| Law (161)                | 7K chars   | Full text                                     |


### Section Extraction Logic

1. Locate the "Sammanfattning" section body (not the TOC entry) by finding it after the table of contents
2. Extract from there until the next major chapter heading (typically "Forfattningsforslag" or "1 ")
3. Supplement with the TOC (chapter headings) as structural context
4. If Sammanfattning is not found, fall back to a larger window (~80K chars from the start)

### Why This Works

- Swedish SOUs' Sammanfattning sections are **written by the committee specifically to summarize all proposals and conclusions**
- They contain the negations ("vi bedomde att det inte finns skall att infora...") that the full chapters discuss
- They enumerate proposals explicitly
- Typically 10-40K chars -- well within GPT-4o's 128K token context window

## Prompt Improvements

### Current Prompt Issues

1. No instruction to handle "considered but not proposed" items
2. `core_recommendations` conflates "proposals" with "assessments"
3. No instruction to distinguish between formal proposals (forslag) and background assessments (bedomningar)

### Updated Schema

Add two new fields to the extraction:

- `proposals_not_adopted`: Array of items the inquiry explicitly considered but decided against (prevents negation flipping)
- `proposal_count`: Integer count of formal legislative proposals (from Forfattningsforslag chapter), as a sanity check

Update prompt rules to include:

- "Distinguish sharply between formal proposals (forslag) and assessments/conclusions that did NOT result in proposals (bedomningar som inte lett till forslag)"
- "If the document explicitly states that something is NOT proposed or is outside the mandate, do NOT list it as a core_recommendation"
- "core_recommendations must only contain items the document formally proposes"

## Technical Changes

### Files to Modify

`**supabase/functions/generate-document-summary/index.ts**`

1. Replace `truncateText()` with `extractKeyContent()` function:
  - Scans for "Sammanfattning" section body (after TOC)
  - Extracts that section (up to ~60K chars)
  - Prepends TOC headings as structural context (~5K chars)
  - Falls back to first 80K chars if no Sammanfattning found
  - Increase MAX_INPUT_CHARS from 12,000 to 80,000
2. Update SYSTEM_PROMPT:
  - Add negation-awareness rules
  - Add `proposals_not_adopted` field
  - Tighten `core_recommendations` to formal proposals only
  - Add instruction: "The input may contain a Sammanfattning (executive summary) section. Treat it as authoritative for the document's conclusions."
3. Update SummaryResult interface and upsert logic for new fields
4. Bump MODEL_VERSION to `"gpt-4o-v2"` to trigger re-summarization of existing documents

### Database Migration

Add columns to `document_summaries`:

- `proposals_not_adopted` (JSONB, default `'[]'`)
- `proposal_count` (INTEGER, nullable)

### Cost Impact

Current: ~3K tokens input per doc (from 12K chars)
New: ~20K tokens input per doc (from 60K chars Sammanfattning)

At GPT-4o pricing ($2.50/1M input tokens):

- 5,490 docs x 20K tokens = 110M tokens = ~$275 total
- vs current: 5,490 x 3K = 16.5M tokens = ~$41

Delta: ~$234 additional for dramatically better quality. This is a one-time batch cost.

### Embedding Impact

Better summaries produce better embeddings. The 512-token E5-Large input window remains the same -- we still truncate the summary_text to ~1,800 chars before vectorizing. But the summary itself will be more representative of the actual document content, improving similarity search quality.

## Verification Plan

1. Re-run SOU 2025:51 with the updated function
2. Send the new summary to ChatGPT for the same critique
3. Check that:
  - "samordningsansvar" is listed under `proposals_not_adopted`, not `core_recommendations`
  - "nationella riktlinjer" is described as "discussed but outside mandate"
  - All major proposal areas from chapters 8-9 appear in `core_recommendations`
  - Dispens from strandskydd, ledningsratt, VA-huvudman duties, etc. are mentioned
4. Validate against 2-3 more documents from the golden test set before running full batch

## Sequencing

1. Database migration (add new columns)
2. Update edge function (extraction logic + prompt + schema)
3. Deploy and test on SOU 2025:51
4. Validate with ChatGPT critique
5. Run batch after validation passes
6. Generate embeddings (after DeepInfra balance is topped up)

&nbsp;

# NOTE FROM MAX:

I agree with this approach BUT to keep costs down, lets only summarise 100 documents (est cost 5 USD). This is VERY important.

Secondly lets make these 100 documents a good mix of the different types of documents (SOU, Dir, prop, etc).

&nbsp;