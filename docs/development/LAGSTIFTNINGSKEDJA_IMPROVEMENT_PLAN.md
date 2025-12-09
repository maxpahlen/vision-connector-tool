# Lagstiftningskedja Improvement Plan

**Created:** 2025-12-09  
**Status:** Planning Only (Not Implemented)  
**Target Phase:** Phase 6 or later

---

## Problem Statement

The Lagstiftningskedja (legislative chain) link extraction is working, but resolution to existing documents is incomplete:

| Metric | Current State |
|--------|---------------|
| Total References Extracted | 537 |
| References with `target_document_id` | 11 (2%) |
| Resolution Rate | ~2% |

### Root Causes

1. **Doc Number Extraction Quality**
   - `extractDocNumber()` often returns full titles instead of clean document numbers
   - Example: `"Dir. 2023:171 Vissa frågor om..."` instead of `"Dir. 2023:171"`
   - URL-based extraction works for `/sou-2024-70` but fails for `/remisser/2024/11/some-title/`

2. **Exact Match Only**
   - Current resolution uses exact `doc_number` match
   - No fuzzy/partial matching for variations

3. **Missing Documents**
   - Many referenced documents (directives, SOUs) may not yet be in the database
   - Resolution cannot succeed for documents we haven't scraped

---

## Improvement Plan

### Phase 1: Regex Normalization

Improve `extractDocNumber()` in `genvag-classifier.ts`:

```typescript
// Enhanced doc number extraction
function extractDocNumber(text: string, href: string): string | null {
  // Priority 1: URL-based extraction (most reliable)
  const urlPatterns = [
    /\/sou[-_]?(\d{4})[-_:]?(\d+)/i,      // /sou-2024-70
    /\/dir[-_]?(\d{4})[-_:]?(\d+)/i,      // /dir-2023-171
    /\/prop[-_]?(\d{4})[-_:]?(\d+)/i,     // /prop-2024-25-100
  ];
  
  for (const pattern of urlPatterns) {
    const match = href.match(pattern);
    if (match) {
      // Reconstruct canonical format
      return normalizeDocNumber(match[0]);
    }
  }
  
  // Priority 2: Anchor text extraction (first doc number only)
  const textPatterns = [
    /^(SOU\s*\d{4}:\d+)/i,
    /^(Dir\.\s*\d{4}:\d+)/i,
    /^(Prop\.\s*\d{4}\/\d{2}:\d+)/i,
  ];
  
  for (const pattern of textPatterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  
  return null;
}
```

### Phase 2: Fuzzy Matching Resolution

Add fuzzy matching when exact match fails:

```sql
-- Create function for fuzzy doc_number matching
CREATE OR REPLACE FUNCTION find_document_by_fuzzy_doc_number(search_term TEXT)
RETURNS UUID AS $$
DECLARE
  result_id UUID;
BEGIN
  -- Try exact match first
  SELECT id INTO result_id FROM documents 
  WHERE doc_number = search_term LIMIT 1;
  IF result_id IS NOT NULL THEN RETURN result_id; END IF;
  
  -- Try prefix match (for truncated numbers)
  SELECT id INTO result_id FROM documents 
  WHERE doc_number ILIKE search_term || '%' LIMIT 1;
  IF result_id IS NOT NULL THEN RETURN result_id; END IF;
  
  -- Try trigram similarity
  SELECT id INTO result_id FROM documents 
  WHERE similarity(doc_number, search_term) > 0.5
  ORDER BY similarity(doc_number, search_term) DESC LIMIT 1;
  
  RETURN result_id;
END;
$$ LANGUAGE plpgsql;
```

### Phase 3: Post-Processing Resolution Job

Create edge function to batch-resolve unresolved references:

```typescript
// resolve-document-references edge function
async function resolveReferences(supabase: SupabaseClient) {
  // Get unresolved references
  const { data: unresolvedRefs } = await supabase
    .from('document_references')
    .select('id, target_doc_number')
    .is('target_document_id', null)
    .not('target_doc_number', 'is', null);
  
  for (const ref of unresolvedRefs) {
    // Extract clean doc number
    const cleanDocNum = extractCleanDocNumber(ref.target_doc_number);
    if (!cleanDocNum) continue;
    
    // Try to resolve
    const { data: doc } = await supabase
      .from('documents')
      .select('id')
      .ilike('doc_number', `%${cleanDocNum}%`)
      .limit(1)
      .single();
    
    if (doc) {
      await supabase
        .from('document_references')
        .update({ target_document_id: doc.id })
        .eq('id', ref.id);
    }
  }
}
```

### Phase 4: UI Integration

Add Related Documents section to DocumentDetail page:

```tsx
// Show references from this document
const { data: outgoingRefs } = useQuery({
  queryKey: ['document-refs-outgoing', documentId],
  queryFn: () => supabase
    .from('document_references')
    .select(`
      id, reference_type, confidence,
      target_document:documents!target_document_id(id, doc_number, title)
    `)
    .eq('source_document_id', documentId)
});

// Show references to this document
const { data: incomingRefs } = useQuery({
  queryKey: ['document-refs-incoming', documentId],
  queryFn: () => supabase
    .from('document_references')
    .select(`
      id, reference_type, confidence,
      source_document:documents!source_document_id(id, doc_number, title)
    `)
    .eq('target_document_id', documentId)
});
```

---

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Resolution Rate | 2% | >50% |
| Clean Doc Numbers | ~20% | >90% |
| UI Integration | None | Related docs section |

---

## Dependencies

- Phase 5.3 (Remisser) should add more documents for resolution
- Phase 5.4 (Laws) will add law documents that propositions reference
- Full resolution may not be achievable until most document types are ingested

---

## NOT IN SCOPE FOR THIS PLAN

- Speculative relationship inference
- Cross-document similarity analysis
- Graph-based relationship discovery

These are Phase 6+ features. This plan focuses only on deterministic resolution of explicit Lagstiftningskedja links.
