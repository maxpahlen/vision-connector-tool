# Branch Plan: Phase 2 - SOU Scraper and PDF Processing

## Branch Information
- **Branch Name**: `feature/phase-2-sou-scraper`
- **Created**: 2025-11-13
- **Status**: In Progress

## Goal
Build a two-stage data acquisition system that:
1. Uses sou.gov.se as an **index/discovery layer** to find inquiries and their regeringen.se links
2. Uses regeringen.se as the **canonical document source** to fetch actual SOUs, directives, and PDFs
3. Extracts text content from PDFs for analysis by the multi-agent system

## Architecture Principle
**sou.gov.se = index/map of inquiries**
**regeringen.se = canonical document source (directives, SOUs, PDFs)**

This matches the real structure of the websites: sou.gov.se lists investigations but doesn't host documents directly; it links to regeringen.se where the actual documents and PDFs live.

## Scope

### In Scope
- **Stage 1 - Index Scraper** (`scrape-sou-index`):
  - Scrape both `/pagaende-utredningar/` and `/avslutade-utredningar/` on sou.gov.se
  - Extract inquiry identifiers (e.g., "Ku 2025:02"), titles, ministries, and regeringen.se links
  - Store/update `processes` table using inquiry code as canonical `process_key`
  - Create pending tasks for document fetching
  
- **Stage 2 - Document Scraper** (`scrape-regeringen-document`):
  - Fetch document pages from regeringen.se based on task queue
  - Detect document types (Directive, SOU, Ds) via text patterns
  - Extract metadata: doc_number, title, publication date, ministry, PDF URL
  - Store in `documents` table with proper `doc_type` and `doc_number`
  - Link documents to processes via `process_documents` with appropriate roles
  - Update process stage to 'published' ONLY when actual SOU document is found
  
- **Task Orchestration** (`process-task-queue`):
  - Execute pending `fetch_regeringen_document` tasks from queue
  - Handle retries and error logging
  
- **PDF Processing** (update existing `process-sou-pdf`):
  - Accept `document_id` instead of raw URLs
  - Extract text and store in `documents.raw_content`
  
- **Admin UI Components**:
  - Scraper control panel
  - Process list (by inquiry code)
  - Document list (by type)
  - Task monitor
  
- Basic error handling and retry logic for network operations
- Integration with existing database schema

### Out of Scope
- AI analysis of documents (Phase 3)
- Multi-agent orchestration (Phase 3)
- Advanced PDF parsing (tables, images, complex layouts)
- User-facing UI for viewing SOUs (Future phase)
- Automatic scheduling/cron jobs (Future phase)
- Performance optimization for large-scale scraping
- PDF file storage (only text extraction for now)

## Success Criteria
- [x] Index scraper (`scrape-sou-index`) successfully fetches inquiry data from sou.gov.se ✅ TESTED 2025-11-13
- [x] Inquiry codes (e.g., "Ku 2025:02") are normalized to `process_key` format (e.g., "ku-2025-02") ✅ TESTED 2025-11-13
- [x] Processes are created/updated with appropriate initial stage ('directive' or 'writing') ✅ TESTED 2025-11-13
- [x] Document fetch tasks are queued in `agent_tasks` with regeringen.se URLs ✅ TESTED 2025-11-13
- [x] Document scraper (`scrape-regeringen-document`) correctly detects document types (Directive, SOU, Ds) ✅ IMPLEMENTED 2025-11-13
- [x] Document metadata (doc_number, title, date, PDF URL) is extracted from regeringen.se ✅ IMPLEMENTED 2025-11-13
- [x] Documents are stored in `documents` table with correct `doc_type` and `doc_number` ✅ IMPLEMENTED 2025-11-13
- [x] Process-document links are created in `process_documents` with appropriate roles ✅ IMPLEMENTED 2025-11-13
- [x] Process stage transitions to 'published' ONLY when SOU document is confirmed ✅ IMPLEMENTED 2025-11-13
- [x] Task queue processor executes pending tasks reliably ✅ TESTED 2025-11-13
- [ ] PDF text extraction works and stores content in `documents.raw_content`
- [x] Error handling prevents crashes and logs failures for review ✅ IMPLEMENTED 2025-11-13
- [ ] Admin UI allows manual triggering of scrapers and queue processing
- [ ] All security best practices followed (RLS policies, input validation)
- [ ] Code follows functional paradigm from custom knowledge
- [x] Rate limiting respects source website terms (1-2 second delays) ✅ TESTED 2025-11-13

## Technical Approach

### Key Architecture Decisions

1. **Process Identity**: Use inquiry/directive codes (e.g., "Ku 2025:02") as canonical `process_key`
   - Normalized format: `ku-2025-02`
   - SOU numbers (e.g., "SOU 2025:108") are stored as `documents.doc_number`
   - UI prominently displays SOU number when available, but process identity remains stable

2. **Stage Transitions**: Evidence-driven stage updates
   - Index scraper sets initial stage ('directive' for ongoing, 'writing' for completed)
   - Stage advances to 'published' ONLY when SOU document is detected and stored
   - Stage explanations document the transition reasoning

3. **Data Flow**: Two-stage pipeline with task queue
   - Stage 1 discovers and queues → Stage 2 fetches and processes
   - Asynchronous processing allows batch operations and retry logic
   - Separation of concerns: discovery vs. document processing

### Key Components

1. **Index Scraper** (`scrape-sou-index`)
   - Fetch HTML from sou.gov.se (both ongoing and completed pages)
   - Parse accordion/list structure to extract:
     - Inquiry identifier (committee code + year + number)
     - Title and ministry
     - Link to regeringen.se document page
   - Upsert to `processes` table with inquiry code as `process_key`
   - Create tasks in `agent_tasks` for document fetching

2. **Document Scraper** (`scrape-regeringen-document`)
   - Accept regeringen.se URL from task queue
   - Fetch and parse HTML from regeringen.se
   - Detect document type via text patterns:
     - "Kommittédirektiv" + "Dir. YYYY:NN" → directive
     - "Statens offentliga utredningar" + "SOU YYYY:NN" → sou
     - "Departementsserien" + "Ds YYYY:NN" → ds
   - Extract metadata (doc_number, title, date, ministry, PDF URL)
   - Insert into `documents` table
   - Link to process via `process_documents` with role ('directive', 'main_sou', etc.)
   - Update process stage to 'published' if SOU found
   - Queue PDF processing task

3. **Task Queue Processor** (`process-task-queue`)
   - Query pending tasks from `agent_tasks`
   - Execute document fetch tasks with rate limiting
   - Update task status (processing → completed/failed)
   - Return processing summary

4. **PDF Processing** (update existing `process-sou-pdf`)
   - Accept `document_id` parameter
   - Fetch PDF URL from `documents` table
   - Extract text content using PDF parsing library
   - Store in `documents.raw_content`
   - Set `documents.processed_at` timestamp

5. **Admin UI Components**
   - Scraper control panel (trigger index scraper, process queue)
   - Process list (show inquiry codes, stages, linked SOUs)
   - Document list (show doc types, numbers, PDF status)
   - Task monitor (show queue status, errors)

### Dependencies
- PDF parsing library (pdf-parse or similar for Deno edge functions)
- HTML parsing library (deno-dom for Deno edge functions)
- Network access from edge functions
- Existing database schema from Phase 1 (processes, documents, process_documents, agent_tasks)

### Implementation Order
1. `scrape-sou-index` for avslutade-utredningar (using inquiry codes)
2. `scrape-regeringen-document` to create documents + process_documents
3. `process-task-queue` to orchestrate task execution
4. Update existing `process-sou-pdf` to use document_id
5. Admin UI components for manual control
6. Extend index scraper to pagaende-utredningar
7. Search & discovery features (by inquiry code or SOU number)

## Testing Strategy

### Manual Testing
- Test scraper with known SOU pages
- Verify PDF download and text extraction with sample documents
- Check database records for correctness
- Test error cases (404, invalid PDFs, network failures)

### Automated Testing (Future)
- Unit tests for parsing functions
- Integration tests for edge function workflows
- Test data fixtures for consistent testing

Reference: `docs/technical/testing-strategy.md` (to be created if not exists)

## Security Considerations
- Edge functions use service role key for database access
- No user-facing endpoints expose raw scraping functionality
- Input validation on all external data
- Rate limiting considerations for scraping
- Respect robots.txt and terms of service

## Related Documentation
- Database schema: `docs/technical/database-design.md` (if exists)
- Phase 1 completion: Foundation and authentication
- Phase 3 preview: Multi-agent AI analysis system

## Notes

### Architectural
- **Two-stage pattern**: sou.gov.se for discovery, regeringen.se for documents
- **Canonical identifiers**: Inquiry codes (not SOU numbers) as process keys
- **Evidence-driven stages**: Only advance to 'published' with confirmed SOU document
- **Async task queue**: Decouples discovery from document processing

### Technical
- Follow functional paradigm: data → function → data → function
- Edge functions are stateless; state maintained in database
- Consider using XState for complex scraping workflows if needed
- All scraped data should be treated as potentially malicious (input validation)
- Solve for the general case, not just specific SOUs
- Rate limiting: 1-2 second delays between requests to respect source websites
- Regex patterns for document detection:
  - Inquiry codes: `/(Ku|U|Fi|A|S|M|N|Fö|Ju)\s+\d{4}:\d+/i`
  - SOU: `/SOU\s+\d{4}:\d+/i`
  - Directive: `/Dir\.\s+\d{4}:\d+/i`
  - Ds: `/Ds\s+\d{4}:\d+/i`

### Data Model
- `processes.process_key` = normalized inquiry code (e.g., "ku-2025-02")
- `documents.doc_number` = official document number (e.g., "SOU 2025:108", "Dir. 2025:97")
- `documents.doc_type` = document type ('directive', 'sou', 'ds')
- `process_documents.role` = relationship type ('directive', 'main_sou', 'reference_sou', etc.)
- `agent_tasks` = async work queue for document fetching and PDF processing

## PDF Extraction Architecture

### Core Principle
**"Be explicit about what we know, what we don't know, and never pretend."**

### Challenge: Directory-Based URLs on Regeringen.se

**Problem Identified:** Regeringen.se often uses directory-based URLs for PDFs (e.g., `https://www.regeringen.se/contentassets/abc123.../`) rather than explicit `.pdf` file extensions in link hrefs. This caused the initial implementation to miss valid PDF candidates.

**Solution:** Enhanced multi-tier PDF candidate detection that:
1. **Broadens candidate detection** to include:
   - Links with `.pdf` in href (original)
   - Links to `/contentassets/` or `/globalassets/` paths (NEW)
   - Links with "pdf" in link text (case-insensitive) (NEW)
   - Links with file size patterns like `(pdf 2 MB)`, `(2,5 MB)` (NEW)
   
2. **Prioritizes contextual matches** over global search:
   - **Tier 1:** Search within "Ladda ner" sections first (`.list--icons`, `.download`, `.file-list`)
   - **Tier 2:** Only if Tier 1 finds nothing, search globally (with lower scores)
   
3. **Excludes obvious non-PDFs:**
   - Skip image links (`.jpg`, `.png`, `.svg`, `.webp`, etc.)

**Key Principle:** "Be generous in what qualifies as a *candidate*, but strict in what becomes the *primary* PDF."

### PDF Scoring System

The scraper uses an intelligent scoring system to select the correct PDF when multiple candidates exist. **All detected candidates are passed through the scoring system** - there are no shortcuts or bypasses.

The scraper uses an intelligent scoring system to select the correct PDF when multiple candidates exist. **All detected candidates are passed through the scoring system** - there are no shortcuts or bypasses.

**Strong Signals (+10-15 points each):**
- **"Ladda ner" Context** (+15): Link found directly under or within a "Ladda ner" heading - HIGHEST priority
- Document number appears in URL or filename (within primary sections only) (+10)
- Document number appears in link text (within primary sections only) (+10)
- Link is inside a section with "Ladda ner" heading (+10, if not already awarded +15 context boost)

**Moderate Signals (+5-8 points):**
- Link is in `.list--icons`, `.download`, or `.file-list` structured sections (+8, increased from +5)
- URL is from regeringen's CDN (`/contentassets/`, `/globalassets/`) (+5 if contextually correct)
- Link text explicitly indicates PDF (+5)

**Low Priority Signals (+2 points):**
- **Global Fallback** (+2): Link found only via generic patterns outside preferred sections - lowest priority
  - Example: `/contentassets/` URL found in body text (not in "Ladda ner" sections)
  - These candidates are allowed but score significantly lower than contextually-correct links

**Swedish Full Report Rule (+8 points):**
- Primary PDF should always be the Swedish full report
- Not kortversion, sammanfattning, English, or faktablad

**Penalties (-5 to -10 points):**
- Kortversion / sammanfattning (-5 each)
- English version / summary (-5)
- Faktablad / fact sheet (-7)
- Bilaga / appendix when document is not appendix type (-3)

**Disqualifiers (score = -999):**
- External domain (not regeringen.se)
- Cover page only indicators
- Document number found in wrong context (body text instead of primary sections)

### PDF Extraction Metadata

All documents store rich extraction metadata in `documents.metadata`:

```typescript
{
  pdf_status: 'found' | 'missing' | 'multiple_candidates' | 'extraction_failed',
  pdf_confidence_score: 0-100,  // Higher = more confident
  pdf_reasoning: string[],       // Why this PDF was selected
  pdf_candidates: PdfCandidate[], // Top 5 alternatives found
  extraction_log: string[],      // Full decision trail
  html_snapshot?: string,        // Captured HTML when extraction failed
  last_extraction_attempt: string // ISO timestamp
}
```

### Confidence Score Interpretation

- **80-100**: High confidence - Swedish full report with doc number match
- **60-79**: Medium confidence - Likely correct but may need verification  
- **30-59**: Low confidence - Ambiguous, requires review
- **0-29**: Very low - PDF found but uncertain if correct (no task created)

**Critical Rule:** PDF processing tasks are ONLY created when:
- `pdf_status = 'found'` AND
- `pdf_confidence_score >= 30` AND
- A clear primary PDF has been identified (not `multiple_candidates` with equal scores)

**Transparency Guarantee:** All candidates, scores, reasoning, and decision logs are stored in `documents.metadata` for full auditability. This allows future AI agents and developers to understand *exactly* why a PDF was selected or rejected.

## AI Agent Integration Guidelines

### Usage Guidelines for Future AI Agents

**Head Detective Agent:**
- If `pdf_status = 'missing'`, create verification task
- If `pdf_confidence_score < 60`, flag for manual review
- If `pdf_status = 'multiple_candidates'` and count > 3, create disambiguation task

**Timeline Agent:**
- Only process documents with `pdf_status = 'found'`
- Log confidence score in timeline event metadata
- Consult `pdf_reasoning` to understand document quality

**Metadata Agent:**
- Check `pdf_reasoning` to understand document type selection
- Use `pdf_candidates` to identify alternative versions (English, summary, etc.)
- Extract metadata only from documents with confidence >= 50

**QA Agent:**
- Review all documents with `pdf_confidence_score < 50`
- Verify that `pdf_reasoning` contains 'swedish_full_report' signal
- Flag if 'kortversion' or 'english_version' penalties were applied to selected PDF
- Cross-check `extraction_log` for disqualified candidates

### Example Queries for AI Agents

```sql
-- Find documents needing review
SELECT doc_number, title, metadata->>'pdf_confidence_score' as confidence
FROM documents
WHERE (metadata->>'pdf_status') = 'found'
  AND CAST(metadata->>'pdf_confidence_score' AS INTEGER) < 60
ORDER BY confidence ASC;

-- Find documents with missing PDFs
SELECT doc_number, title, metadata->>'extraction_log' as log
FROM documents
WHERE (metadata->>'pdf_status') = 'missing';

-- Find documents with multiple PDF candidates
SELECT doc_number, title, 
       jsonb_array_length(metadata->'pdf_candidates') as candidate_count
FROM documents
WHERE jsonb_array_length(metadata->'pdf_candidates') > 1
ORDER BY candidate_count DESC;

-- Find high-confidence Swedish full reports ready for processing
SELECT doc_number, title, pdf_url
FROM documents
WHERE (metadata->>'pdf_status') = 'found'
  AND CAST(metadata->>'pdf_confidence_score' AS INTEGER) >= 80
  AND metadata->'pdf_reasoning' @> '["swedish_full_report"]'::jsonb;
```

### Integration Principle

All downstream AI agents MUST:
1. Read and respect `pdf_status` before processing documents
2. Use `pdf_confidence_score` to prioritize work and flag uncertain cases
3. Consult `pdf_reasoning` to understand extraction decisions
4. Log their own confidence and reasoning in similar transparent manner
5. Never assume a document is complete just because it exists in the database
