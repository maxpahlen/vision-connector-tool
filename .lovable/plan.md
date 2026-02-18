

## Fix: Document Count Discrepancy (1000-Row Limit Bug)

### Problem
Both the Document Summary Runner and Validation Dashboard fetch all documents in a single query without pagination, hitting the Supabase default 1,000-row limit. This causes severe undercounting: SOUs show 24/60, committee reports show 356/3,143, etc.

### Solution: Server-Side Counting

Replace client-side counting (fetching all rows and counting in JS) with server-side `COUNT` queries grouped by doc_type. This eliminates the 1,000-row limit problem AND avoids transferring large `raw_content` blobs to the browser.

### Changes

#### 1. `src/components/admin/DocumentSummaryRunner.tsx` -- useCorpusStats rewrite

Replace the current approach (3 separate queries fetching full rows) with server-side count queries:

```text
Current (broken):
  supabase.from('documents').select('doc_type, raw_content')  -- returns max 1000 rows
  supabase.from('document_summaries').select('document_id')    -- also limited

Fix:
  For each doc_type in ['sou','proposition','committee_report','directive','law']:
    1. supabase.from('documents').select('*', { count: 'exact', head: true }).eq('doc_type', type)
    2. supabase.from('documents').select('*', { count: 'exact', head: true }).eq('doc_type', type).not('raw_content', 'is', null).not('raw_content', 'eq', '')
    3. supabase.from('document_summaries').select('*, documents!inner(doc_type)', { count: 'exact', head: true }).eq('documents.doc_type', type)
```

All 15 queries (5 types x 3 counts) run in parallel via `Promise.all`. Each returns only a count number, zero data transfer.

#### 2. `src/components/admin/ValidationDashboard.tsx` -- same pattern

Apply the same server-side counting fix to:
- Line 57: document coverage stats (doc_type, raw_content, url, pdf_url counts)
- Lines 82-84 and 132-134: process linkage and timeline coverage queries

Each will use `{ count: 'exact', head: true }` with appropriate filters instead of fetching all rows.

#### 3. Documentation update

Update `docs/development/PHASE_7_2_SUMMARIZER_STATUS.md` with corrected corpus counts.

### Technical Details

- The `{ count: 'exact', head: true }` option tells PostgREST to return only the count header, no row data
- This bypasses the 1,000-row default limit entirely
- Queries are parallelized per type to keep latency low (~200ms total vs current ~2s for transferring raw_content)
- The `document_summaries` join uses `!inner` to enforce the foreign key relationship

### Expected Result

After the fix, the UI will show the correct counts:
- SOU: 60 (was 24)
- Committee Report: 3,143 / 2,967 with content (was 356/349)
- Proposition: 2,029 / 2,028 with content (was 275)
- Directive: 1,397 (was 184)
- Law: 161 (unchanged, under 1000 threshold)

