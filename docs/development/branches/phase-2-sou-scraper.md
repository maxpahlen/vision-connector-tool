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
- [x] Task queue processor executes pending tasks reliably ✅ IMPLEMENTED 2025-11-13
- [ ] PDF text extraction works and stores content in `documents.raw_content`
- [x] Error handling prevents crashes and logs failures for review ✅ IMPLEMENTED 2025-11-13
- [ ] Admin UI allows manual triggering of scrapers and queue processing
- [ ] All security best practices followed (RLS policies, input validation)
- [ ] Code follows functional paradigm from custom knowledge
- [x] Rate limiting respects source website terms (1-2 second delays) ✅ IMPLEMENTED 2025-11-13

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
