# Riksdagen.se Open Data API — Strategic Research

**Created:** 2026-01-28  
**Status:** RESEARCH COMPLETE  
**Purpose:** Evaluate riksdagen.se API as alternative/supplement to regeringen.se scrapers

---

## Executive Summary

The riksdagen.se Open Data API is a **structured REST API** that provides clean JSON/XML access to many document types we currently scrape from regeringen.se. However, **remissinstanser and remissvar are NOT available** — these must remain on regeringen.se.

### Recommendation Matrix

| Document Type | Current Source | Riksdagen API Available? | Recommendation |
|---------------|----------------|--------------------------|----------------|
| **SOUs** | regeringen.se | ✅ YES (105 in 2024) | ⚠️ HYBRID — API for metadata, regeringen.se for PDFs + remiss links |
| **Propositions** | regeringen.se | ✅ YES (237 in 2024/25) | ✅ SWITCH — API is cleaner, text content available |
| **Directives** | regeringen.se | ✅ YES (127 in 2024) | ✅ SWITCH — API has committee codes |
| **Committee Reports** | riksdagen.se | ✅ YES (333 in 2024/25) | ✅ ALREADY USING |
| **Laws (SFS)** | riksdagen.se | ✅ YES (161 in 2024) | ✅ ALREADY USING |
| **Remisser** | regeringen.se | ❌ NO | 🔒 KEEP on regeringen.se |
| **Remissvar** | regeringen.se | ❌ NO | 🔒 KEEP on regeringen.se |
| **Remissinstanser** | regeringen.se | ❌ NO | 🔒 KEEP on regeringen.se |
| **DS (Departementsserien)** | N/A | ✅ YES (35 in 2024) | 🆕 NEW OPPORTUNITY |
| **Motions** | N/A | ✅ YES (1000s) | 🆕 FUTURE PHASE |

---

## Critical Finding: Remiss Data NOT in Riksdagen API

**The riksdagen.se API does NOT contain:**
- Remiss documents (consultation requests)
- Remissinstanser (invited organizations)
- Remissvar (consultation responses)

These are **exclusive to regeringen.se** and must continue to be scraped from there.

**Implication:** The "Skapa sökfråga för API" tool shown in the screenshot is useful for Riksdagen documents but CANNOT replace our remiss pipeline.

---

## API Endpoints & Document Type Codes

### Base URL
```
https://data.riksdagen.se/dokumentlista/?doktyp={TYPE}&rm={SESSION}&utformat=json
```

### Document Type Codes (from API dropdown)

| Code | Name | Description |
|------|------|-------------|
| `sou` | Statens offentliga utredning | Government commission reports |
| `prop` | Proposition | Government bills |
| `dir` | Kommittédirektiv | Committee directives |
| `ds` | Departementsserien | Ministry reports (smaller than SOUs) |
| `bet` | Betänkande | Committee reports |
| `sfs` | Svensk författningssamling | Laws |
| `mot` | Motion | Parliamentary motions |
| `ip` | Interpellation | Parliamentary questions |
| `fr` | Skriftlig fråga | Written questions |
| `frs` | Svar på skriftlig fråga | Answers to written questions |
| `fpm` | Fakta-PM om EU-förslag | EU proposal fact sheets |
| `kom` | EU-förslag | EU proposals (COM documents) |
| `rir` | Riksrevisionens granskningsrapport | National Audit Office reports |
| `rskr` | Riksdagsskrivelse | Parliamentary communications |
| `prot` | Protokoll | Chamber protocols |

### Session/Year Format

| Document Types | Format | Example |
|----------------|--------|---------|
| Riksdag documents (prop, bet, mot) | Riksmöte | `2024/25` |
| Government documents (sou, dir, ds, sfs) | Calendar year | `2024` |

---

## Coverage Comparison: Our Data vs Riksdagen API

### Current Database (from regeringen.se scrapers)

| Type | Count | Date Range |
|------|-------|------------|
| SOUs | 60 | 2024-2025 |
| Directives | 56 | 2025 |
| Propositions | 10 | 2025 |
| Committee Reports | 333 | 2024-2025 |
| Laws | 161 | 2024 |
| Remisser | 54 | — |
| Remissvar | 3,421 | — |
| Invitees | 4,321 | — |

### Riksdagen API Availability (sample queries)

| Type | API Count | Session/Year |
|------|-----------|--------------|
| SOUs | 105 | 2024 |
| Propositions | 237 | 2024/25 |
| Directives | 127 | 2024 |
| DS | 35 | 2024 |

**Observation:** Riksdagen API has MORE documents than our current corpus, suggesting it's a more complete source for these types.

---

## Data Quality Comparison

### Riksdagen API Advantages

1. **Structured JSON/XML** — No HTML parsing required
2. **Consistent schema** — All documents follow same format
3. **Direct text content** — Via `dokument_url_text` endpoint
4. **PDF attachments** — Via `dokumentstatus` endpoint
5. **Cross-references** — `dokreferens` links propositions ↔ betänkanden
6. **Activity timeline** — `dokaktivitet` includes decision dates
7. **Pagination** — Clean `@sidor`, `@nasta_sida` metadata
8. **No JavaScript** — Pure REST API, no client-side rendering

### Riksdagen API Limitations

1. **No remiss/remissvar data** — Critical gap
2. **Connection resets** — Intermittent `ECONNRESET` errors (mitigated with retries)
3. **No full-text PDFs inline** — Need separate PDF fetch
4. **Historical gaps** — Some older years have missing documents

### Regeringen.se Advantages

1. **Remiss ecosystem** — Only source for remissinstanser, remissvar
2. **Lagstiftningskedja** — Process discovery via inquiry pages
3. **PDF scoring** — Multiple PDF variants with Swedish/English, summary, etc.
4. **Commission pages** — sou.gov.se for active inquiries

### Regeringen.se Limitations

1. **HTML scraping** — Fragile, layout-dependent
2. **JSON Filter API** — Undocumented internal API for pagination
3. **Cloudflare protection** — Occasional blocks
4. **Inconsistent structure** — Different page layouts by document type

---

## Strategic Recommendations

### Phase 1: Immediate — Validate Riksdagen Coverage

Before switching any scrapers, verify that Riksdagen API has ALL documents we need:

```sql
-- Compare our SOUs with Riksdagen API
-- Our doc_number format: "2024:98"
-- Riksdagen format: "98" (in beteckning) + "2024" (in rm)
```

**Action Items:**
1. Query Riksdagen API for SOUs 2024 + 2025
2. Compare doc_numbers with our existing 60 SOUs
3. Verify 100% coverage before switching

### Phase 2: Hybrid Approach for SOUs

SOUs require data from BOTH sources:
- **Riksdagen:** Metadata, text content, committee info
- **Regeringen:** PDF URLs, remiss page links, lagstiftningskedja

**Proposed pipeline:**
1. Discover SOUs via Riksdagen API (more complete index)
2. Match to regeringen.se URL pattern for PDF + remiss links
3. Enrich with Riksdagen text content as fallback

### Phase 3: Switch Propositions to Riksdagen API

Propositions are well-suited for API migration:
- Direct text via `dokument_url_text`
- Cross-references to betänkanden via `dokreferens`
- Committee assignments via `organ`
- No remiss dependency

**Benefits:**
- Eliminate fragile HTML/JSON scraping from regeringen.se
- Get 237 propositions vs our current 10
- Clean pagination, no Cloudflare issues

### Phase 4: Explore New Document Types

The Riksdagen API opens access to document types we don't currently have:

| Type | Use Case | Priority |
|------|----------|----------|
| **DS** | Ministry reports (smaller investigations) | HIGH |
| **Motions** | Parliamentary motions on topics | MEDIUM |
| **Interpellations** | Minister Q&A on specific issues | LOW |
| **RIR** | Audit office findings | MEDIUM |

---

## "Skapa sökfråga för API" Tool

The screenshot shows riksdagen.se's query builder at `data.riksdagen.se/dokumentlista/`.

### How It Works

1. Fill in filter fields (document type, session, date, committee, etc.)
2. Click "Sök" to generate API URL
3. URL can be used directly in scrapers

### Useful Filters

| Field | Purpose | Example |
|-------|---------|---------|
| **Dokumenttyp** | Filter by type | `sou`, `prop`, `dir` |
| **Riksmöte** | Session filter | `2024/25` |
| **Datum** | Date range | `2024-01-01` to `2024-12-31` |
| **Utskott/organ** | Committee filter | `FiU`, `JuU`, `SkU` |
| **Ledamot/person** | Author filter | Specific MP |
| **Parti** | Party filter | `S`, `M`, `SD`, etc. |
| **Utformat** | Response format | `json`, `xml`, `csv` |

### Example Query URLs

```bash
# All SOUs from 2024
https://data.riksdagen.se/dokumentlista/?doktyp=sou&rm=2024&utformat=json

# All propositions from 2024/25 session
https://data.riksdagen.se/dokumentlista/?doktyp=prop&rm=2024/25&utformat=json

# All directives from Finance Ministry
https://data.riksdagen.se/dokumentlista/?doktyp=dir&rm=2024&utformat=json&organ=Fi-dep

# Get text content for a specific document
https://data.riksdagen.se/dokument/HCB398.text
```

---

## Risk Analysis

### Risk 1: Data Completeness Gap

**Risk:** Riksdagen API may not have 100% of documents on regeringen.se
**Mitigation:** Run coverage validation before switching
**Impact:** LOW — Can maintain fallback to regeringen.se

### Risk 2: API Instability

**Risk:** Connection resets (os error 104) observed
**Mitigation:** Already implemented — User-Agent headers, exponential backoff
**Impact:** LOW — Retries handle transient failures

### Risk 3: Schema Changes

**Risk:** Riksdagen may change API structure
**Mitigation:** Version-aware parsing, schema validation
**Impact:** MEDIUM — Would require scraper updates

### Risk 4: Loss of Remiss Context

**Risk:** Switching to Riksdagen loses lagstiftningskedja context
**Mitigation:** Maintain regeringen.se for remiss discovery
**Impact:** HIGH if not managed — Critical for process graph

---

## Implementation Roadmap

### Sprint 1: Validation (1 week)
- [ ] Query Riksdagen API for all 2024+2025 SOUs
- [ ] Compare with existing 60 SOUs in database
- [ ] Document any gaps or discrepancies
- [ ] Test text extraction quality

### Sprint 2: Proposition Migration (1 week)
- [ ] Create `scrape-propositions-riksdagen` edge function
- [ ] Migrate from regeringen.se JSON Filter API
- [ ] Ingest all 237 propositions from 2024/25
- [ ] Validate cross-references to betänkanden

### Sprint 3: Directive Migration (1 week)
- [ ] Create `scrape-directives-riksdagen` edge function
- [ ] Ingest all 127 directives from 2024
- [ ] Extract committee assignments from `tempbeteckning`
- [ ] Link to SOUs via kommittébeteckning

### Sprint 4: DS Introduction (1 week)
- [ ] Create `scrape-ds` edge function
- [ ] Ingest 35 DS from 2024
- [ ] Add `ds` as new document type
- [ ] Update UI to display DS documents

### Sprint 5: Historical Backfill (2 weeks)
- [ ] Ingest SOUs, Props, Dirs from 2020-2023
- [ ] Cross-reference with existing lagstiftningskedja
- [ ] Resolve document_references to historical corpus

---

## Appendix: API Response Samples

### dokumentlista (list endpoint)

```json
{
  "dokumentlista": {
    "@traffar": "105",
    "@sidor": "6",
    "@nasta_sida": "http://data.riksdagen.se/dokumentlista/?doktyp=sou&rm=2024&utformat=json&p=2",
    "dokument": [
      {
        "dok_id": "HCB398",
        "titel": "En ny samordnad miljöbedömnings- och tillståndsprövningsprocess",
        "rm": "2024",
        "beteckning": "98",
        "datum": "2025-01-01",
        "dokument_url_text": "//data.riksdagen.se/dokument/HCB398.text",
        "dokument_url_html": "//data.riksdagen.se/dokument/HCB398.html"
      }
    ]
  }
}
```

### dokumentstatus (detail endpoint)

```json
{
  "dokumentstatus": {
    "dokument": {
      "dok_id": "HC01SkU18",
      "titel": "Godkännande för F-skatt",
      "debattdag": "2025-09-17",
      "beslutsdag": "2025-09-17"
    },
    "dokreferens": {
      "referens": [
        { "ref_dok_id": "HC03100", "ref_dok_typ": "prop" }
      ]
    },
    "dokaktivitet": {
      "aktivitet": [
        { "datum": "2025-06-12", "kod": "justering" },
        { "datum": "2025-09-17", "kod": "beslut" }
      ]
    },
    "dokbilaga": {
      "bilaga": [
        { "fil_url": "https://data.riksdagen.se/fil/...", "typ": "pdf" }
      ]
    }
  }
}
```

---

## Conclusion

The riksdagen.se Open Data API is a **valuable complement** to our existing regeringen.se scrapers, offering:
- Cleaner data access (JSON vs HTML scraping)
- Better coverage (more documents indexed)
- Richer metadata (cross-references, activities, attachments)

However, it **cannot replace** regeringen.se for:
- Remiss data (remissinstanser, remissvar)
- Lagstiftningskedja discovery
- Process-centric navigation

**Recommended strategy:** Hybrid approach using Riksdagen API as primary source for document metadata, with regeringen.se for remiss context and PDF enrichment.

---

## Files Updated

- `docs/development/RIKSDAGEN_API_RESEARCH.md` (this file)
