

# Phase 7.2b: Doc-Type-Specific Summarization Prompts

## Problem

The current single system prompt is optimized for SOUs. It produces incorrect or misleading output for other document types:

- **Directives**: Mandate tasks are listed as "proposals" (they are not)
- **Committee reports**: Miss reservationer, tillkannagivanden, and the committee's stance on the proposition
- **Laws**: "proposals" framing is nonsensical for enacted legislation
- **Propositions**: Work reasonably well but could be tighter

## Design: Per-Type Prompt Sections

Rather than 5 completely separate prompts (expensive to maintain, duplicates shared rules), use a **base prompt + doc-type-specific instruction block** pattern.

### Shared Base (all types)

- Output format (JSON schema)
- Language rules (Swedish, factual, no filler)
- Field definitions for universal fields: `summary_text`, `policy_aim`, `policy_domains`, `keywords`, `outcome_status`, `key_actors`

### Per-Type Instruction Blocks

#### SOU / Proposition (current prompt works well)

- `core_recommendations`: Formal legislative proposals (forslag)
- `proposals_not_adopted`: Considered but rejected items
- `proposal_count`: Explicit count if stated
- Instructions: Skip mandate preamble, look for "Vi foreslagar", exhaustive extraction checklist

#### Directive

- `core_recommendations` repurposed as: **Key mandate questions/tasks** the inquiry must address
- `proposals_not_adopted` repurposed as: **Explicit scope limitations** (what is outside the mandate)
- `proposal_count`: Always `null` (directives don't contain proposals)
- Additional instructions:
  - "A directive (kommittedirektiv) instructs an inquiry -- it does NOT contain legislative proposals"
  - "List the specific questions the inquiry must answer under core_recommendations"
  - "List explicit scope limitations under proposals_not_adopted"
  - "Capture the deadline (redovisningsdatum) in summary_text"
  - outcome_status should always be "pending"

#### Committee Report (betankande)

- `core_recommendations`: The committee's formal positions (ställningstaganden) and any tillkannagivanden
- `proposals_not_adopted`: Reservationer (dissenting opinions with party attribution)
- `proposal_count`: Number of tillkannagivanden if any
- Additional instructions:
  - "A committee report (betankande) evaluates a government proposition. Focus on whether the committee SUPPORTS or REJECTS each proposal."
  - "List reservationer under proposals_not_adopted with party names"
  - "List tillkannagivanden (parliamentary directives to the government) under core_recommendations"
  - "Note the vote outcome if stated"

#### Law

- `core_recommendations`: Key provisions/obligations the law establishes
- `proposals_not_adopted`: Empty (not applicable)
- `proposal_count`: `null`
- Additional instructions:
  - "A law (lag/forordning) is enacted legislation. Summarize what it regulates, key obligations, scope, and affected parties."
  - "outcome_status must be 'enacted'"
  - "Capture the effective date (ikraftträdande) in summary_text"
  - "Do NOT describe the law as 'proposing' anything -- it IS the law"

## Implementation

### File: `supabase/functions/generate-document-summary/index.ts`

1. Split `SYSTEM_PROMPT` into `BASE_PROMPT` + `DOC_TYPE_INSTRUCTIONS` map
2. New function `buildSystemPrompt(docType: string): string` that concatenates base + type-specific block
3. Pass `docType` into `summarizeDocument` to select the right prompt
4. No schema changes needed -- the existing JSONB fields are flexible enough to hold different semantic content per type

### Prompt Structure (pseudocode)

```text
BASE_PROMPT = """
You are a Swedish legislative policy analyst...
[shared output format, language rules, universal field definitions]
"""

DOC_TYPE_INSTRUCTIONS = {
  "sou": "... [current SOU-specific rules] ...",
  "proposition": "... [proposition-specific rules] ...",
  "directive": "... [directive-specific rules] ...",
  "committee_report": "... [committee report-specific rules] ...",
  "law": "... [law-specific rules] ..."
}

systemPrompt = BASE_PROMPT + DOC_TYPE_INSTRUCTIONS[docType]
```

### No Database Migration Needed

The existing `document_summaries` schema uses JSONB for `core_recommendations` and `proposals_not_adopted`, which can hold different semantic content per document type. The field names remain the same; only the interpretation changes per type. This avoids schema bloat and keeps the table clean.

### Documentation Update

Update `docs/development/PHASE_7_2_SUMMARIZER_STATUS.md` with:
- Per-type prompt strategy
- Semantic meaning of fields per doc type
- Test results for each type

## Verification

1. Re-run one document of each type with the new prompts
2. Check:
   - Directive: mandate tasks listed (not "proposals"), scope limitations captured, deadline in summary
   - Committee report: stance on proposition stated, reservationer listed, tillkannagivanden captured
   - Law: provisions described as enacted rules, effective date captured, outcome_status = "enacted"
   - SOU/Proposition: no regression from current quality
3. Compare before/after for the 4 existing test documents

## Cost Impact

None -- same model, same token budget. Prompt is ~200 tokens longer per type-specific block, negligible.

## Sequencing

1. Refactor prompt into base + type-specific blocks
2. Test one document per type
3. Validate quality
4. Run pilot batch of 100 documents (balanced mix)

