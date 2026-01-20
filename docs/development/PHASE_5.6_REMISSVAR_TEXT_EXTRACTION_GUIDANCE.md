# Phase 5.6 Input: Remissvar Structure Guidance (SB PM 2021:1)

This document captures structural guidance from the Swedish government memo **"Svara på remiss" (SB PM 2021:1)**. The memo provides a recommended format for remissvar and is intended to inform future **text extraction + NLP analysis** work (Phase 5.6 concept brief).

## Why This Matters

The guidance describes consistent sections and phrasing that can be used as:
- **Parsing anchors** (e.g., summary, stance statements, section references)
- **Classification cues** (agree/oppose/no opinion)
- **Template signals** for higher‑quality extraction and normalization

## Recommended Remissvar Structure (From Guidance + Example)

### Header Block
- Date
- Case number (Dnr)
- Department name
- Title referencing the proposal (SOU/betänkande)

### Body Sections (Suggested)
1. **Sammanfattning** (short summary early in the document)
2. **Ställningstaganden** (explicit positions)
   - Agree / oppose / no opinion
3. **Disposition aligned with proposal sections**
   - References to numbered sections (e.g., “avsnitt 4.3”)
4. **Argumentation and rationale**
5. **Closing / handling note**
   - Often lists who decided / who handled the case

## Suggested Linguistic & Formatting Cues

### Stance Statements
Look for explicit phrasing:
- “Vi instämmer i förslaget…”
- “Vi motsätter oss…”
- “Vi har inga synpunkter…”

### Section References
Common patterns that can anchor extraction:
- “avsnitt X.Y”
- “utredningsförslaget”
- “betänkandet”

### Clarity & Style Requirements (Useful for NLP)
The memo advises:
- Clear, concise language
- Short paragraphs
- Avoid unexplained abbreviations
- Separate background summaries from the organization’s own positions

## Implications for Future Extraction

### Candidate Fields
Potential structured fields for future remissvar extraction:
- `summary`
- `stance_summary` (agree/oppose/no opinion)
- `section_references` (e.g., “avsnitt 4.3”)
- `arguments` (rationale paragraph(s))
- `metadata_header` (date, dnr, department)

### Potential Heuristics
1. **First heading “Sammanfattning”** → candidate summary
2. **Sentences containing “instämmer/motsätter”** → stance detection
3. **Section references (“avsnitt X.Y”)** → align to proposal structure

## Source Document Metadata

- Title: “Svara på remiss”
- Series: SB PM 2021:1
- Publisher: Regeringskansliet, Statsrådsberedningen
- Date: September 2021

