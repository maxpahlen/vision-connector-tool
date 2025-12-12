# Database Reset and Controlled Rebuild - December 2025

## Overview

Full database reset executed to restore trust in data quality after multiple data contamination issues were identified.

## Reset Date

December 12, 2025

## Tables Truncated

All content tables were truncated while preserving schema, indices, edge functions, and user data:

```sql
TRUNCATE TABLE 
  remiss_responses,
  remiss_documents,
  relations,
  timeline_events,
  process_documents,
  agent_tasks,
  document_references,
  entities,
  processes,
  documents
RESTART IDENTITY CASCADE;
```

## Preserved Tables

- `profiles` - User profile data
- `user_roles` - User role assignments

## Pre-Reset State

| Table | Count |
|-------|-------|
| documents | 307 |
| document_references | 1,296 |
| entities | 400 |
| timeline_events | 333 |
| agent_tasks | 602 |
| processes | 191 |
| process_documents | 192 |
| relations | 612 |
| remiss_documents | 9 |
| remiss_responses | 596 |

## Issues That Led to Reset

1. **Corrupted "Kontaktuppgifter" processes** - 110 processes with incorrect titles due to scraper URL bug
2. **SOU URL misclassification** - 14 SOUs (20%) pointed to directive pages instead of SOU pages
3. **Data contamination** - SOUs had directive text in raw_content due to data race bugs
4. **Self-referencing document_references** - 41 entries where source = target
5. **Unresolved document references** - 83% (1,104/1,325) had no target_document_id
6. **Broken remiss linking** - Only 9/114 SOUs had remiss links despite most having valid remiss pages

## Controlled Rebuild Plan

### Phase 2: Scrape Fresh Data (3 pages each)

| Document Type | Source | Pages | Expected Docs |
|--------------|--------|-------|---------------|
| SOU | sou.gov.se avslutade | 3 | ~60 |
| Directive | sou.gov.se pågående | 3 | ~60 |
| Proposition | regeringen.se JSON API | 3 | ~60 |

### Execution Commands

```bash
# Step 1: Scrape SOUs
POST /functions/v1/scrape-sou-index
{"pageTypes": ["avslutade"], "maxPages": 3}

# Step 2: Fetch document details
POST /functions/v1/process-task-queue
{"task_type": "fetch_regeringen_document", "limit": 60}

# Step 3: Extract PDF text
POST /functions/v1/process-task-queue
{"task_type": "pdf_extraction", "limit": 60}

# Step 4: Scrape Directives
POST /functions/v1/scrape-sou-index
{"pageTypes": ["pagaende"], "maxPages": 3}

# Repeat steps 2-3 for directives

# Step 5: Scrape Propositions
POST /functions/v1/scrape-proposition-index
{"maxPages": 3}

# Repeat steps 2-3 for propositions

# Step 6: Run Timeline Agent
POST /functions/v1/process-task-queue
{"task_type": "timeline_extraction", "limit": 180}

# Step 7: Run Metadata Agent
POST /functions/v1/process-task-queue
{"task_type": "metadata_extraction", "limit": 180}
```

## Validation Criteria

| Goal | Success Metric |
|------|----------------|
| DB wiped | All content tables = 0 rows |
| 180-200 docs scraped | `SELECT COUNT(*) FROM documents` ≥ 180 |
| All docs have text | `raw_content IS NULL` = 0 (except known Excel files) |
| 0 pending/failing tasks | `status IN ('pending', 'failed')` = 0 |
| No self-references | `source_document_id = target_document_id` = 0 |
| ≥80% timeline coverage | Per doc type validation |
| ≥80% entity coverage | Per doc type validation |

## Validation Dashboard

A new ValidationDashboard component was created at `src/components/admin/ValidationDashboard.tsx` to monitor rebuild progress.

Access via Admin UI.

## Next Steps After Validation

1. Re-enable `scrape-sou-remiss` (currently disabled)
2. Run dry-run remiss discovery on first batch
3. Verify `target_url` populated correctly in `document_references`
4. Scale to full corpus after validation passes

## Lessons Learned

1. **URL validation is critical** - Always validate URLs match expected patterns before document creation
2. **Store URLs before scraping** - Extract and store URLs structurally during Lagstiftningskedja extraction before attempting downstream scraping
3. **Pilot before scale** - Test on 3-page samples before full ingestion
4. **Monitor data quality continuously** - Use validation dashboards to catch issues early
