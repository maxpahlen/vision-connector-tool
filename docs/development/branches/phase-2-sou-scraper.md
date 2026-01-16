# Branch Plan: Phase 2 - SOU Scraper and PDF Processing

> **📜 HISTORICAL RECORD — PHASE COMPLETE**
> 
> This phase was completed on 2025-11-14. The scraping pipeline is operational and has been extended in subsequent phases. This document is preserved for reference.

---

## Branch Information

- **Branch Name**: `feature/phase-2-sou-scraper`
- **Created**: 2025-11-13
- **Status**: ✅ COMPLETE (2025-11-14)
- **Completion**: All core objectives achieved - scraping pipeline operational, PDF extraction deployed, admin UI built

---

## Phase 2 Completion Summary (2025-11-14)

### ✅ Completed Components

1. **Index Scraper** (`scrape-sou-index`) - Discovers inquiries from sou.gov.se
2. **Document Scraper** (`scrape-regeringen-document`) - Extracts metadata from regeringen.se
3. **PDF Extraction Service** - Production Node.js service deployed to Vercel
4. **Task Queue Processor** (`process-task-queue`) - Orchestrates document and PDF tasks
5. **Admin Control Panel** (`/admin/scraper`) - Full monitoring and control interface

### ✅ Verified End-to-End Pipeline

Successfully tested with 3 SOUs:

- **SOU 2025:46** - Tryggare idrottsarrangemang (1.02M chars, 452 pages)
- **SOU 2025:50** - En ny nationell myndighet för viltförvaltning (958K chars, 492 pages)
- **SOU 2025:52** - Ökad insyn i politiska processer (1.69M chars, 808 pages)

### 🔧 Fixes Applied (2025-11-18)

- **Pagination Implementation**: Added multi-page scraping capability to `scrape-sou-index`
  - Correctly uses `?page=N#result` URL pattern (WordPress pagination)
  - Fixed selector to anchor to `.list--block.list--investigation > li` under `<main>`
  - Supports `maxPages` throttle parameter for development testing
  - Tested successfully: 3 pages scraped, 59 processes/tasks created
- **Task Queue Display** (2025-11-14): Fixed RLS policies on `agent_tasks` table

---

## Goal

Build a two-stage data acquisition system that:

1. Uses sou.gov.se as an **index/discovery layer** to find inquiries and their regeringen.se links
2. Uses regeringen.se as the **canonical document source** to fetch actual SOUs, directives, and PDFs
3. Extracts text content from PDFs for analysis by the multi-agent system

## Architecture Principle

**sou.gov.se = index/map of inquiries**
**regeringen.se = canonical document source (directives, SOUs, PDFs)**

This matches the real structure of the websites: sou.gov.se lists investigations but doesn't host documents directly; it links to regeringen.se where the actual documents and PDFs live.

---

## Success Criteria (All Met ✅)

- [x] Index scraper (`scrape-sou-index`) successfully fetches inquiry data from sou.gov.se
- [x] Inquiry codes (e.g., "Ku 2025:02") are normalized to `process_key` format
- [x] Processes are created/updated with appropriate initial stage
- [x] Document fetch tasks are queued in `agent_tasks`
- [x] Document scraper (`scrape-regeringen-document`) correctly detects document types
- [x] Document metadata extracted from regeringen.se
- [x] Documents stored in `documents` table with correct `doc_type`
- [x] Process-document links created in `process_documents`
- [x] Process stage transitions implemented
- [x] Task queue processor executes pending tasks reliably
- [x] PDF processing tasks execute and update documents
- [x] Production-grade PDF extraction service deployed
- [x] Admin UI components for scraper control
- [x] Rate limiting respects source website terms

---

## Technical Approach

### Key Architecture Decisions

1. **Process Identity**: Use inquiry/directive codes as canonical `process_key`
2. **Stage Transitions**: Evidence-driven stage updates
3. **Data Flow**: Two-stage pipeline with task queue

### Key Components

1. **Index Scraper** (`scrape-sou-index`) - Discovery layer
2. **Document Scraper** (`scrape-regeringen-document`) - Canonical source
3. **Task Queue Processor** (`process-task-queue`) - Orchestration
4. **PDF Processing** (`process-sou-pdf`) - Text extraction
5. **Admin UI** - Manual control and monitoring

---

## PDF Extraction Architecture

### PDF Scoring System

The scraper uses an intelligent scoring system to select the correct PDF when multiple candidates exist.

**Strong Signals (+10-15 points):**
- "Ladda ner" Context (+15)
- Document number appears in URL/filename (+10)
- Document number appears in link text (+10)

**Moderate Signals (+5-8 points):**
- Link in structured sections (+8)
- CDN URL patterns (+5)

**Penalties (-5 to -10):**
- Kortversion/sammanfattning (-5)
- English version (-5)
- Faktablad (-7)

**Disqualifiers (score = -999):**
- External domain
- Cover page only

### Confidence Score Interpretation

- **80-100**: High confidence - Swedish full report with doc number match
- **60-79**: Medium confidence - Likely correct but may need verification
- **30-59**: Low confidence - Ambiguous, requires review
- **0-29**: Very low - PDF found but uncertain

---

## Subsequent Phases

This phase laid the foundation for:

- **Phase 3**: Multi-Agent AI System (Timeline Agent, Metadata Agent, Head Detective)
- **Phase 4**: Search & Discovery (Full-text search, entity autocomplete)
- **Phase 5**: Legislative Graph Expansion (Propositions, Remisser, Remissvar)

---

## Related Documentation

- `docs/development/PHASE_2_COMPLETION_SUMMARY.md`
- `docs/development/branches/phase-3-multi-agent-ai.md`
- `docs/development/PRODUCT_ROADMAP.md`
