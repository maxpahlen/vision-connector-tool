
Message Type: VERIFICATION | Phase: EXECUTION

## Investigation Summary: Timeline Events for Propositions

### Original Concern
You questioned whether timeline events (eventsCreated: 0) were actually missing from older propositions or if there was a bug in our extraction logic.

### Investigation Findings

#### Evidence Gathered

1. **API Response Size Comparison**:
   - Committee Report `HC01NU5`: **267 lines** of JSON with full `dokaktivitet`
   - Proposition `GY03166` (from 2010/11): **34 lines** of JSON - missing `dokaktivitet`

2. **Actual dokaktivitet Content** (from committee report):
```json
"dokaktivitet": {
  "aktivitet": [
    { "kod": "UBE", "namn": "Beredning", "datum": "2024-06-18" },
    { "kod": "JUS", "namn": "Justering", "datum": "2024-09-19" },
    { "kod": "TRY", "namn": "Trycklov", "datum": "2024-09-19" },
    { "kod": "B", "namn": "Bordläggning", "datum": "2024-09-24" },
    { "kod": "BEH", "namn": "Behandling", "datum": "2024-09-25" },
    { "kod": "BES", "namn": "Beslut", "datum": "2024-09-25" }
  ]
}
```

3. **Database Verification**:
   - Committee reports: 327 timeline events extracted successfully
   - Propositions: Only 20 timeline events (all from AI agents, not riksdagen dokaktivitet)
   - Cross-references: 23 `has_committee_report` links from props to betänkanden

### Root Cause: Architectural Understanding

**Propositions DO NOT have `dokaktivitet` in the Riksdagen API.**

This is correct behavior because:
- Propositions are **INPUT** documents (Government -> Parliament)
- Committee Reports are **OUTPUT** documents (Parliament committees -> Plenary)
- The `dokaktivitet` field tracks **parliamentary processing** which happens at the committee report level

```text
+------------------+     submitted to      +-------------------+
|   Proposition    | ------------------->  |  Parliament       |
| (from Government)|                       |  (receives prop)  |
+------------------+                       +-------------------+
                                                    |
                                                    v
                                          +-------------------+
                                          | Committee Report  |
                                          | (has dokaktivitet)|
                                          +-------------------+
                                                    |
                                           Contains: UBE, JUS,
                                           TRY, B, BEH, BES
```

### Scraper Status: WORKING CORRECTLY

The proposition scraper is correctly extracting:
- Document metadata (title, date, ministry)
- Cross-references (38 refs created including links to committee reports)
- PDF URLs
- No timeline events because propositions don't have them

### Architecture Validation

The cross-references we're creating are the correct approach:
| Proposition | Links To | Reference Type |
|------------|----------|----------------|
| Prop. 2024/25:205 | Bet. 2025/26:FöU4 | has_committee_report |
| Prop. 2024/25:204 | Bet. 2025/26:AU4 | has_committee_report |

To get parliamentary process timeline for a proposition, the correct query is:

```sql
SELECT te.event_type, te.event_date, te.description
FROM document_references dr
JOIN documents bet ON dr.target_doc_number = bet.doc_number
JOIN processes p ON p.main_document_id = bet.id
JOIN timeline_events te ON te.process_id = p.id
WHERE dr.source_document_id = '<proposition_id>'
AND dr.reference_type = 'has_committee_report';
```

### Recommendations

1. **Documentation Update**: Update Phase 6 migration plan to clarify that proposition timeline events come from linked committee reports, not directly from proposition dokaktivitet

2. **No Code Change Needed**: The scraper is working as intended

3. **Consider UI Enhancement**: When displaying a proposition's timeline, resolve the `has_committee_report` reference and show that committee report's timeline events

### Files Reviewed
- `supabase/functions/scrape-propositions-riksdagen/index.ts`
- `supabase/functions/scrape-committee-reports/index.ts`
- `docs/development/branches/phase-6-riksdagen-api-migration.md`
- API responses from `data.riksdagen.se/dokumentstatus/`
