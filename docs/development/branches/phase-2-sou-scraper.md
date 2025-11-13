# Branch Plan: Phase 2 - SOU Scraper and PDF Processing

## Branch Information
- **Branch Name**: `feature/phase-2-sou-scraper`
- **Created**: 2025-11-13
- **Status**: In Progress

## Goal
Build the core data acquisition system that scrapes SOU metadata from sou.gov.se, downloads PDF documents, and extracts text content for analysis by the multi-agent system.

## Scope

### In Scope
- Edge function to scrape SOU metadata from sou.gov.se
- Edge function to download and process PDF documents
- Text extraction from PDF files
- Storage of SOU metadata in database
- Storage of extracted text content
- Basic error handling and retry logic for network operations
- Integration with existing database schema

### Out of Scope
- AI analysis of documents (Phase 3)
- Multi-agent orchestration (Phase 3)
- Advanced PDF parsing (tables, images, complex layouts)
- User interface for viewing SOUs (Future phase)
- Automatic scheduling/cron jobs (Future phase)
- Performance optimization for large-scale scraping
- PDF storage in file system (only text storage for now)

## Success Criteria
- [ ] SOU metadata scraper successfully fetches data from sou.gov.se
- [ ] Metadata is correctly stored in database with proper structure
- [ ] PDF download function retrieves documents from URLs
- [ ] Text extraction produces readable content from PDFs
- [ ] Extracted text is stored and associated with correct SOU
- [ ] Error handling prevents crashes on failed downloads
- [ ] Edge functions can be triggered manually or via API
- [ ] All security best practices followed (RLS policies if needed)
- [ ] Code follows functional paradigm from custom knowledge

## Technical Approach

### Key Components

1. **SOU Metadata Scraper Edge Function** (`scrape-sou-metadata`)
   - Fetch HTML from sou.gov.se
   - Parse HTML to extract SOU information (title, ID, date, PDF URL, etc.)
   - Store metadata in database
   - Handle pagination if needed

2. **PDF Processing Edge Function** (`process-sou-pdf`)
   - Accept SOU ID or PDF URL
   - Download PDF document
   - Extract text content using PDF parsing library
   - Store extracted text in database linked to SOU
   - Return processing status

3. **Database Updates**
   - Ensure schema supports storing extracted text (likely already in place)
   - Add indexes for efficient querying
   - Verify RLS policies align with backend-only access pattern

### Dependencies
- PDF parsing library (pdf-parse or similar for Deno edge functions)
- HTML parsing library (cheerio or deno-dom)
- Network access from edge functions
- Existing database schema from Phase 1

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
- Follow functional paradigm: data → function → data → function
- Edge functions are stateless; state maintained in database
- Consider using XState for complex scraping workflows if needed
- All user input (even from web scraping) should be treated as potentially malicious
- Solve for the general case, not just specific SOUs
