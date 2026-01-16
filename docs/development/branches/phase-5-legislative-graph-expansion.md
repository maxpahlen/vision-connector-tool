# Phase 5: Legislative Graph Expansion

**Status:** ✅ Phase 5.3 COMPLETE | Phase 5.4 Ready  
**Branch:** `phase-5-legislative-graph`  
**Dependencies:** Phase 3 (Multi-Agent AI), Phase 4 (Search & Discovery)

---

## Current Status (2026-01-15)

### Phase 5.1: Database Schema + Timeline Agent v2.1 ✅ COMPLETE
### Phase 5.2: Propositions End-to-End ✅ COMPLETE  
### Phase 5.3: Remisser + Remissvar + Entity Pipeline ✅ COMPLETE
### Phase 5.4: Committee Reports + Laws 📋 READY TO START

---

## Current Database Metrics

| Table | Count | Notes |
|-------|-------|-------|
| Documents | 127 | 61 SOUs, 56 directives, 10 propositions |
| Processes | 127 | All with linked documents |
| Entities | 1,473 | Organizations (cleaned, deduplicated) |
| Timeline Events | 723 | Extracted with citations |
| Document References | 494 | Cross-document citations |
| Remiss Documents | 54 | All scraped with remissinstanser PDFs |
| Remiss Responses | 3,424 | 99.91% linked to entities |
| Remiss Invitees | 4,321 | 100% linked to entities |

---

## Milestone: Timeline Agent v2.1 — COMPLETE ✅

**Validated:** 2025-12-03

### Summary
- ✅ v2.1 successfully enriches metadata on existing events (upsert instead of skip)
- ✅ Person-based dedup works correctly for `committee_formed` events
- ✅ No false positives or duplicate explosions
- ✅ Idempotency preserved across re-runs
- ✅ Metadata quality is high and aligns with forensic-citation standard

### Test Results
| Metric | Value |
|--------|-------|
| Documents tested | 10 (5 directives + 5 SOUs) |
| Success rate | 100% |
| Events extracted | 69 |
| Events inserted | 17 |
| Events updated | 39 |

---

## Core Strategy

> **One new document type at a time → fully end-to-end → tested → then move to the next.**

Each document type must be integrated *completely*, meaning:
1. It is scraped / ingested
2. Metadata Agent extracts entities and relations from it
3. Timeline Agent extracts relevant events with citations
4. Search/discovery features consume it correctly

Only after a document type is stable do we move on to the next one.

---

## Implementation Order

Following the Swedish legislative lifecycle:

| Order | Document Type | Source | Status |
|-------|--------------|--------|--------|
| 1️⃣ | **Propositions** | regeringen.se/propositioner | ✅ COMPLETE |
| 2️⃣ | **Remisser + Remissvar** | regeringen.se/remisser | ✅ COMPLETE |
| 3️⃣ | **Committee Reports** | riksdagen.se | 📋 PLANNED |
| 4️⃣ | **Laws** | riksdagen.se | 📋 PLANNED |

---

## Goal

Expand beyond SOUs and Directives to build comprehensive legislative process graph, following the walking skeleton approach.

**Key Principle:** New document types are **optional enrichments** that extend the walking skeleton, not blockers.

---

## Scope

### In Scope

#### 1. New Document Types (in order)
- **Propositions** — ✅ COMPLETE
- **Remisser** — ✅ COMPLETE
- **Remissvar** — ✅ COMPLETE
- **Committee Reports** — 📋 NEXT
- **Laws** — 📋 PLANNED

#### 2. Timeline Agent v2 Enhancements ✅
- **Confidence scoring:** high (exact day), medium (month+year), low (year only)
- **Future date extraction:** Planned events with citations
- **New event types:** directive_issued, committee_formed, remiss_period_start/end, proposition_submitted, law_enacted

#### 3. Document-to-Document References via Genvägar ✅
- Scrape "Genvägar" links from regeringen.se
- Model as document-to-document references
- Classify link types based on anchor text and URL patterns

#### 4. Entity Pipeline ✅
- Organization entity bootstrap from invitees
- Response entity linking (99.91%)
- Invitee entity linking (100%)
- Entity deduplication (0 duplicates)

### Out of Scope (Phase 6+)

- ❌ Document-to-document relationship **inference**
- ❌ Case-level reconstruction
- ❌ Entity influence mapping
- ❌ Predictive analytics
- ❌ Timeline visualization (UI improvement)

---

## Success Criteria

### Phase 5.3 ✅ COMPLETE

- [x] Remisser matched to SOUs (54/54)
- [x] Remissvar extracted (3,424)
- [x] Invitees parsed (4,321)
- [x] Entity bootstrap complete (1,473 entities)
- [x] Response linking operational (99.91%)
- [x] Invitee linking operational (100%)
- [x] Entity deduplication complete (0 duplicates)
- [x] No truncated entity names (0)

### Phase 5.4 Criteria (Pending)

- [ ] Committee reports scraped from riksdagen.se
- [ ] Laws scraped from riksdagen.se
- [ ] Links to source propositions established
- [ ] Timeline events for law_enacted

---

## Database Schema Changes (Implemented)

### 1. `lifecycle_stage` on documents ✅
```sql
ALTER TABLE documents
ADD COLUMN lifecycle_stage TEXT;
```

### 2. Document-to-Document References ✅
```sql
CREATE TABLE document_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID NOT NULL REFERENCES documents(id),
  target_document_id UUID REFERENCES documents(id),
  target_doc_number TEXT,
  target_url TEXT,  -- Added for remiss URL lookups
  reference_type TEXT NOT NULL,
  source_page INTEGER,
  source_excerpt TEXT,
  confidence TEXT
);
```

### 3. External URLs ✅
```sql
ALTER TABLE documents
ADD COLUMN external_urls JSONB DEFAULT '[]'::jsonb;
```

---

## Implementation Phases

### Phase 5.1: Database Schema + Timeline Agent v2.1 ✅ COMPLETE
- [x] Run database migrations
- [x] Deploy Timeline Agent v2.1 with confidence scoring
- [x] Add metadata layer (committee_event_kind, deadline_kind)
- [x] Person-based deduplication for committee_formed
- [x] Metadata upsert on re-runs

### Phase 5.2: Propositions End-to-End ✅ COMPLETE
- [x] Proposition scraper (`scrape-proposition-index`)
- [x] Genvägar link classifier
- [x] Timeline Agent v2.2 enhancements
- [x] Metadata Agent v2.2 for proposition entities

### Phase 5.3: Remisser + Remissvar ✅ COMPLETE
- [x] Remiss scraper (`scrape-sou-remiss`)
- [x] Remissvar scraper (`process-remiss-pages`)
- [x] Remissinstanser PDF parsing (`process-remissinstanser`)
- [x] Entity bootstrap from invitees
- [x] Response entity linking
- [x] Invitee entity linking
- [x] Entity deduplication

### Phase 5.4: Committee Reports + Laws (Ready to Start)
- [ ] Committee report scraper (riksdagen.se)
- [ ] Law scraper (riksdagen.se)
- [ ] Validation on 5 samples each

### Phase 5.5: Integration & Polish
- [ ] End-to-end test all document types
- [ ] Performance validation
- [ ] Documentation update

---

## Related Documentation

- [Phase 3: Multi-Agent AI](./phase-3-multi-agent-ai.md) — Historical record
- [Phase 4: Search & Discovery](./phase-4-search-and-discovery.md) — Historical record
- [Phase 5.3: Remisser Branch](./phase-5.3-remisser-remissvar.md) — Complete
- [Phase 6: Relationship Inference](./phase-6-relationship-inference.md) — Planned
- [Product Roadmap](../PRODUCT_ROADMAP.md)
