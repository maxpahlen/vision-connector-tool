# Riksdagen.se Open Data API — Strategic Research

**Created:** 2026-01-28  
**Updated:** 2026-01-28  
**Status:** RESEARCH COMPLETE  
**Purpose:** Evaluate riksdagen.se API as alternative/supplement to regeringen.se scrapers

---

## Executive Summary

The riksdagen.se Open Data API is a **structured REST API** that provides clean JSON/XML access to **over 500,000 documents** dating back to 1971. It is the **definitive source** for Parliament-processed documents and the **canonical archive** for government publications.

### Key Findings

1. **Riksdagen API is the COMPLETE ARCHIVE** — Contains the full historical corpus of SOUs, Props, Dirs, Laws
2. **regeringen.se is for CURRENT/ACTIVE content** — Best for remisser, active inquiries, lagstiftningskedja
3. **sou.gov.se is for PÅGÅENDE UTREDNINGAR only** — Active commission status, not a document archive
4. **Remisser/Remissvar are EXCLUSIVE to regeringen.se** — Not available anywhere else

---

## Complete Corpus Comparison by Source

### riksdagen.se Open Data API — FULL HISTORICAL ARCHIVE

| Document Type | Total Count | Historical Range | Notes |
|---------------|-------------|------------------|-------|
| **SOUs** | **4,897** | 1922–2026 | Complete national archive |
| **Propositions** | **31,598** | 1971–2026 | All government bills |
| **Directives** | **6,361** | 1988–2026 | All committee directives |
| **Committee Reports** | **74,629** | 1971–2026 | All betänkanden + utlåtanden |
| **Laws (SFS)** | **11,409** | 1736–2026 | Swedish Code of Statutes |
| **DS (Departementsserien)** | **1,637** | 1983–2026 | Ministry reports |
| **Motions** | **257,620** | 1971–2026 | All parliamentary motions |

**Total: 500,000+ documents across 50+ years**

### regeringen.se — CURRENT PUBLICATIONS + REMISS ECOSYSTEM

| Document Type | Availability | Notes |
|---------------|--------------|-------|
| SOUs | Recent years only | Links to sou.gov.se for active |
| Propositions | Recent years | HTML + PDF |
| Directives | Recent years | HTML + PDF |
| **Remisser** | ✅ EXCLUSIVE | Consultation requests |
| **Remissvar** | ✅ EXCLUSIVE | Consultation responses |
| **Remissinstanser** | ✅ EXCLUSIVE | Invited organizations |
| **Lagstiftningskedja** | ✅ EXCLUSIVE | Process navigation links |

### sou.gov.se — ACTIVE COMMISSIONS ONLY

| Content | Availability | Notes |
|---------|--------------|-------|
| **Pågående utredningar** | ✅ EXCLUSIVE | Active commission listing with contact info |
| Completed SOUs | ❌ Links to regeringen.se | Not an archive |
| Commission contacts | ✅ EXCLUSIVE | Utredare, sekreterare names |
| Directive links | ✅ Links to regeringen.se | Discovery mechanism |

---

## Source Selection Matrix

| Document Type | Primary Source | Secondary Source | Reason |
|---------------|----------------|------------------|--------|
| **SOUs** | riksdagen.se | regeringen.se | RD has complete archive; RG has remiss links |
| **Propositions** | riksdagen.se | — | RD is complete + structured |
| **Directives** | riksdagen.se | — | RD is complete + structured |
| **Committee Reports** | riksdagen.se | — | RD is complete + cross-refs |
| **Laws (SFS)** | riksdagen.se | — | RD is canonical source |
| **DS** | riksdagen.se | — | RD has all 1,637 |
| **Remisser** | regeringen.se | — | ONLY source |
| **Remissvar** | regeringen.se | — | ONLY source |
| **Remissinstanser** | regeringen.se | — | ONLY source |
| **Active Inquiries** | sou.gov.se | regeringen.se | SOU.gov has contact info |
| **Lagstiftningskedja** | regeringen.se | — | ONLY source for process links |

---

## "Skapa sökfråga för API" Tool — Standalone Use Cases

The query builder at `data.riksdagen.se/dokumentlista/` is useful BEYOND scraping:

### 1. Ad-Hoc Research Queries

Build custom queries for specific research needs:

```
# All directives from Justice Ministry in 2024
?doktyp=dir&rm=2024&organ=Ju-dep&utformat=json

# All SOUs containing "klimat" in title
?doktyp=sou&sok=klimat&utformat=json

# All committee reports from Finance Committee this session
?doktyp=bet&rm=2025/26&organ=FiU&utformat=json
```

### 2. Political Analysis Queries

```
# All motions by party S in current session
?doktyp=mot&rm=2025/26&parti=S&utformat=json

# All interpellations to specific minister
?doktyp=ip&rm=2025/26&utformat=json

# All written questions about specific topic
?doktyp=fr&sok=migration&utformat=json
```

### 3. Legislative Tracking

```
# All propositions with upcoming decision dates
?doktyp=prop&rm=2025/26&utformat=json

# All committee reports on propositions from a specific ministry
?doktyp=bet&rm=2025/26&organ=JuU&utformat=json
```

### 4. Voteringar (Voting Records)

The API also provides voting data:
```
# All votes in current session
?doktyp=votering&rm=2025/26&utformat=json

# Votes filtered by party
?doktyp=votering&rm=2025/26&parti=SD&utformat=json
```

### 5. Bulk Dataset Downloads

The API supports bulk CSV downloads for analysis:
- Download all propositions as CSV for Excel analysis
- Export SOUs for academic research
- Get motion statistics by party/year

---

## Strategic Recommendations

### Immediate Actions

1. **Switch Propositions to riksdagen.se** — Get 31,598 vs our current 10
2. **Switch Directives to riksdagen.se** — Get 6,361 vs our current 56
3. **Keep Remiss pipeline on regeringen.se** — No alternative exists
4. **Add DS as new document type** — 1,637 ministry reports available

### Hybrid Strategy for SOUs

SOUs require data from BOTH sources:

| Data Point | Source |
|------------|--------|
| Metadata (title, date, number) | riksdagen.se |
| Full text content | riksdagen.se (`.text` endpoint) |
| PDF URL | riksdagen.se (dokumentstatus) |
| Remiss page URL | regeringen.se |
| Remissvar | regeringen.se |
| Active commission status | sou.gov.se |

### Long-Term Vision

```
riksdagen.se API → Primary document archive (structured, complete)
     ↓
regeringen.se → Remiss enrichment layer (consultations, responses)
     ↓
sou.gov.se → Active inquiry discovery (pågående utredningar)
```

---

## API Endpoints Reference

### Base URL
```
https://data.riksdagen.se/dokumentlista/?doktyp={TYPE}&rm={SESSION}&utformat=json
```

### Document Type Codes

| Code | Name | Total Count |
|------|------|-------------|
| `sou` | Statens offentliga utredning | 4,897 |
| `prop` | Proposition | 31,598 |
| `dir` | Kommittédirektiv | 6,361 |
| `ds` | Departementsserien | 1,637 |
| `bet` | Betänkande | 74,629 |
| `sfs` | Svensk författningssamling | 11,409 |
| `mot` | Motion | 257,620 |
| `ip` | Interpellation | ~10,000 |
| `fr` | Skriftlig fråga | ~50,000 |
| `fpm` | Fakta-PM om EU-förslag | ~3,000 |
| `rir` | Riksrevisionens rapport | ~500 |
| `rskr` | Riksdagsskrivelse | ~5,000 |

### Content Endpoints

| Endpoint | Purpose | Example |
|----------|---------|---------|
| `/dokument/{id}.text` | Plain text | `HCB398.text` |
| `/dokument/{id}.html` | HTML | `HCB398.html` |
| `/dokument/{id}.json` | JSON metadata | `HCB398.json` |
| `/dokumentstatus/{id}.json` | Full status + refs | `HCB398` |

### Query Parameters

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `doktyp` | Document type | `sou`, `prop`, `bet` |
| `rm` | Session/year | `2024/25` or `2024` |
| `sok` | Full-text search | `klimat`, `skatt` |
| `organ` | Committee/ministry | `FiU`, `Ju-dep` |
| `parti` | Party filter | `S`, `M`, `SD` |
| `datum` | Date from | `2024-01-01` |
| `tom` | Date to | `2024-12-31` |
| `p` | Page number | `1`, `2`, `3` |
| `sz` | Page size | `20`, `50`, `100` |
| `utformat` | Response format | `json`, `xml`, `csv` |

---

## Professional Nuances & Considerations

### Nuance 1: Freshness Lag — "Canonical Archive" vs "Current Publication"

**Observation:** riksdagen.se is the canonical historical archive, but regeringen.se may publish documents before they are processed into riksdagen.se.

**Implication:** For near-real-time ingestion of newly published documents, a freshness check against regeringen.se may still be needed. This doesn't conflict with using riksdagen.se as the primary source, but suggests a dual-check pattern for the most recent documents (e.g., last 30 days).

**Mitigation:** Compare `systemdatum` from riksdagen.se against `publicationDate` from regeringen.se for recent documents; prefer whichever is more current for latest-week ingestion.

### Nuance 2: SOU Hybrid Matching Complexity

**Observation:** The SOU hybrid approach (riksdagen for metadata/text, regeringen for remiss links) implies a non-trivial matching problem via `doc_number`.

**Risk:** Mismatches between sources would degrade remiss link quality downstream.

**Mitigation:** 
- Establish matching reliability metrics early in pilot phase
- Track match success rate (target: >99%)
- Implement fuzzy matching fallback for edge cases (e.g., "SOU 2024:1" vs "SOU 2024:01")
- Log and alert on unmatched documents for manual review

### Nuance 3: Text Source Quality vs PDF Fidelity

**Observation:** riksdagen.se text content is OCR'd from PDFs. For older documents, OCR errors are more likely.

**Implication:** Any LLM pipeline or search indexing should track provenance (text source: OCR vs native) to enable quality-aware processing.

**Mitigation:**
- Add `text_source` metadata field: `riksdagen_ocr`, `pdf_extracted`, `native_html`
- For high-stakes analysis, prefer PDF extraction over pre-OCR'd text
- Validate OCR quality on sample of historical documents before bulk ingestion

---

## Risk Analysis

### Risk 1: Data Sync Between Sources

**Risk:** riksdagen.se and regeringen.se may have different publication dates
**Mitigation:** Use riksdagen.se `systemdatum` for freshness, match by doc_number; implement dual-check for latest-week documents
**Impact:** LOW — Both sources are government-official

### Risk 2: Remiss Dependency

**Risk:** Switching to riksdagen.se for SOUs loses remiss linkage
**Mitigation:** Maintain parallel lookup by doc_number on regeringen.se; establish matching metrics early
**Impact:** MEDIUM — Requires two-source pipeline with quality monitoring

### Risk 3: API Rate Limiting

**Risk:** Large historical ingestion may hit limits
**Mitigation:** Already implemented exponential backoff with jitter; batch processing
**Impact:** LOW — API is public and generous

### Risk 4: Content Format Differences

**Risk:** riksdagen.se text may differ from regeringen.se PDFs due to OCR quality
**Mitigation:** Track text provenance; validate OCR quality on historical sample
**Impact:** LOW — Both are authoritative; provenance metadata enables quality-aware processing

---

## Implementation Roadmap

### Phase 1: Proposition Migration (Priority: HIGH)
- Switch from regeringen.se Filter API to riksdagen.se
- Ingest current session (237 docs) + historical (31,361 docs)
- Cross-reference to betänkanden via `dokreferens`

### Phase 2: Directive Migration (Priority: HIGH)
- Switch to riksdagen.se for complete 6,361 corpus
- Extract kommittébeteckning for SOU linkage
- Historical backfill from 1988

### Phase 3: SOU Hybrid Pipeline (Priority: MEDIUM)
- Use riksdagen.se for discovery + metadata + text
- Match to regeringen.se for remiss page discovery
- Combine for complete SOU + remiss linkage

### Phase 4: DS Introduction (Priority: MEDIUM)
- New document type: `ds` (Departementsserien)
- Ingest all 1,637 ministry reports
- Link to related SOUs and propositions

### Phase 5: Historical Expansion (Priority: LOW)
- Backfill SOUs from 1922–2020
- Backfill propositions from 1971–2020
- Complete legislative graph for historical research

---

## Appendix: Document Counts by Year (Sample)

| Year | SOUs | Props | Dirs | Betänkanden |
|------|------|-------|------|-------------|
| 2025 | 125+ | 200+ | 7 | 400+ |
| 2024 | 105 | 237 | 127 | 333 |
| 2023 | 98 | 215 | 118 | 310 |
| 2022 | 87 | 198 | 105 | 295 |
| ... | ... | ... | ... | ... |
| 1990 | ~60 | ~180 | ~80 | ~250 |

---

## Conclusion

**riksdagen.se is the canonical archive for Swedish legislative documents.** It contains:
- 50+ years of complete historical data
- Structured JSON/XML API with cross-references
- Direct text content (no PDF extraction needed for most uses)

**regeringen.se remains essential for:**
- Remiss ecosystem (exclusively available there)
- Lagstiftningskedja process navigation
- Active inquiry context

**sou.gov.se is a discovery tool for:**
- Active commissions (pågående utredningar)
- Commission contact information
- Links to directives and completed reports

**Recommended strategy:** Use riksdagen.se as primary source for document ingestion; regeringen.se for remiss enrichment; sou.gov.se for active inquiry discovery.

---

## Files Updated

- `docs/development/RIKSDAGEN_API_RESEARCH.md` (this file)
