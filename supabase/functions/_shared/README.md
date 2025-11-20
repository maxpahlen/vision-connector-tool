# Shared Utility Modules

This directory contains reusable utility modules for the edge functions. These modules follow functional programming principles and provide consistent, testable functions for document processing.

## Table of Contents

- [html-parser.ts](#html-parserts)
- [pdf-scorer.ts](#pdf-scorerts)
- [Architecture Principles](#architecture-principles)
- [Extending the Modules](#extending-the-modules)

---

## html-parser.ts

### Purpose

Provides functions for parsing HTML from regeringen.se pages and extracting structured metadata about Swedish government documents (SOUs, directives, and departmental series).

### Core Functions

#### `detectDocumentType(html: string, doc: Document)`

Detects the type and number of a government document from HTML content.

**Returns:** `{ type: string; number: string } | null`

**Detection Priority:**
1. SOU (Statens Offentliga Utredningar) - checks `.h1-vignette` class first
2. Directive (Kommittédirektiv) - checks for \"Dir. YYYY:NN\" pattern
3. Ds (Departementsserien) - checks for \"Ds YYYY:NN\" pattern

**Example:**
```typescript
const docInfo = detectDocumentType(html, doc);
// Returns: { type: 'sou', number: 'SOU 2024:45' }
```

#### `extractMinistry(doc: Document)`

Extracts the responsible ministry from the page.

**Returns:** `string` (defaults to \"Okänt departement\" if not found)

**Strategy:**
- Looks for `.categories-text` element
- Matches against known ministry names
- Returns full text if no exact match found

**Known Ministries:**
- Kulturdepartementet
- Utbildningsdepartementet
- Finansdepartementet
- Arbetsmarknadsdepartementet
- Socialdepartementet
- Miljödepartementet
- Näringsdepartementet
- Försvarsdepartementet
- Justitiedepartementet
- Infrastrukturdepartementet
- Utrikesdepartementet
- Klimat- och näringslivsdepartementet

#### `extractTitle(doc: Document)`

Extracts the document title, removing vignette elements.

**Returns:** `string`

**Implementation:**
```typescript
const title = extractTitle(doc);
// Returns clean title without \"SOU 2024:45\" prefix
```

#### `parseSwedishDate(dateStr: string)`

Converts Swedish date format to ISO format.

**Input:** `\"12 maj 2025\"`
**Output:** `\"2025-05-12\"`

#### `extractPublicationDate(doc: Document)`

Extracts and formats the publication date from a `<time>` element.

**Returns:** `string | null`

---

## pdf-scorer.ts

### Purpose

Implements an intelligent PDF detection and scoring system for finding the correct main document PDF on regeringen.se pages. This is critical because pages often contain multiple PDFs (summaries, English versions, appendices, fact sheets).

### Core Types

```typescript
interface PdfCandidate {
  url: string;           // Full PDF URL
  score: number;         // Confidence score
  signals: string[];     // Positive indicators
  penalties: string[];   // Negative indicators
  linkText: string;      // Link text content
  filename: string;      // PDF filename
  location: string;      // Page location
}

interface PdfExtractionResult {
  bestPdf: string | null;          // Best candidate URL
  confidence: number;               // 0-100 confidence score
  reasoning: string[];              // Decision explanation
  allCandidates: PdfCandidate[];   // Top 5 candidates
  extractionLog: string[];          // Extraction steps
  htmlSnapshot: string | null;     // Relevant HTML for debugging
}
```

### Scoring System

The PDF scorer uses a multi-factor scoring system:

#### High-Value Signals (+10-25 points)

| Signal | Points | Description |
|--------|--------|-------------|
| `pdf_extension` | +10 | URL ends with `.pdf` |
| `doc_number_match` | +25 | Filename/text contains doc number |
| `file_size_indicator` | +12 | Link shows file size (e.g., \"2.3 MB\") |
| `ladda_ner_context` | +15 | Within \"Ladda ner\" section |

#### Moderate Signals (+3-8 points)

| Signal | Points | Description |
|--------|--------|-------------|
| `in_structured_section` | +8 | In `.list--icons`, `.download` section |
| `regeringen_cdn` | +5 | From contentassets/globalassets |
| `explicit_pdf_indicator` | +3 | Link text contains \"PDF\" |
| `swedish_full_report` | +8 | Not a summary/English version |

#### Penalties (-3 to -7 points)

| Penalty | Points | Description |
|---------|--------|-------------|
| `kortversion` | -5 | Short version |
| `sammanfattning` | -5 | Summary |
| `english_version` | -5 | English translation |
| `fact_sheet` | -7 | Fact sheet/brochure |
| `appendix` | -3 | Appendix (unless doc type is appendix) |

#### Disqualifiers (score = -999)

- External domain (not regeringen.se)
- Cover page only
- Doc number in body text without PDF signals

### Core Functions

#### `determineLocation(link: Element, doc: Document)`

Determines the structural location of a link.

**Returns:** `'download_section' | 'main_content' | 'sidebar' | 'body_text'`

**Priority:**
1. Structured sections (`.list--icons`, `.download`)
2. \"Ladda ner\" heading context
3. Main content area
4. Sidebar/footer
5. Generic body text

#### `findPdfCandidates(doc: Document)`

Multi-tier PDF candidate discovery.

**Strategy:**
1. **Preferred sections**: Links under \"Ladda ner\" headings
2. **Structured sections**: `.list--icons`, `.download`, `.file-list`
3. **Global fallback**: All PDF links on page

**Returns:** `Element[]`

#### `scorePdfCandidate(link, doc, docType, docNumber)`

Scores a single PDF candidate using the scoring system.

**Returns:** `PdfCandidate`

**Example:**
```typescript
const candidate = scorePdfCandidate(link, doc, 'sou', 'SOU 2024:45');
// Returns:
// {
//   url: 'https://www.regeringen.se/contentassets/.../sou-2024-45.pdf',
//   score: 58,
//   signals: ['pdf_extension', 'doc_number_match', 'ladda_ner_context'],
//   penalties: [],
//   linkText: 'Hela betänkandet SOU 2024:45 (2.3 MB)',
//   filename: 'sou-2024-45.pdf',
//   location: 'download_section'
// }
```

#### `extractAndScorePdfs(doc, docType, docNumber)`

Orchestrates the PDF extraction process.

**Returns:** `PdfExtractionResult`

**Process:**
1. Find all PDF candidates
2. Score each candidate
3. Filter out disqualified candidates
4. Sort by score (descending)
5. Calculate confidence (0-100)
6. Generate reasoning
7. Return best candidate + metadata

**Confidence Calculation:**
```typescript
confidence = Math.min(100, Math.max(0, score * 2))
```

#### `captureRelevantHtml(doc: Document)`

Captures relevant HTML sections for debugging.

**Returns:** `string` (HTML snapshot)

**Captures:**
- Download sections (`.list--icons`, `.download`)
- \"Ladda ner\" heading contexts

---

## Architecture Principles

### 1. Functional Paradigm

All utilities follow functional programming principles:

- **Pure functions**: No side effects, same input = same output
- **Immutability**: Functions don't modify input parameters
- **Composability**: Small functions that can be chained
- **Testability**: Easy to unit test in isolation

### 2. Separation of Concerns

- **html-parser.ts**: Document metadata extraction
- **pdf-scorer.ts**: PDF detection and scoring logic
- **Edge functions**: Orchestration and database operations

### 3. Error Handling

Functions return `null` or default values rather than throwing errors, allowing graceful degradation:

```typescript
extractMinistry(doc) // Returns \"Okänt departement\" instead of throwing
detectDocumentType(html, doc) // Returns null if no match found
```

### 4. Type Safety

All functions have explicit TypeScript types for better IDE support and compile-time safety.

---

## Extending the Modules

### Adding a New Document Type

**File:** `html-parser.ts`

1. Add detection logic to `detectDocumentType()`:

```typescript
// Check for new type
if (text.includes('new-document-type') || /pattern/.test(text)) {
  const match = html.match(/Pattern (\\d{4}:\\d+)/i);
  if (match) return { type: 'new_type', number: `Pattern ${match[1]}` };
}
```

2. Update TypeScript types in consuming functions:

```typescript
interface DocumentMetadata {
  docType: 'sou' | 'directive' | 'ds' | 'new_type' | 'unknown';
  // ...
}
```

### Adding a New Ministry

**File:** `html-parser.ts`

Add to the `ministries` array in `extractMinistry()`:

```typescript
const ministries = [
  // ... existing ministries
  'Nya departementet',
];
```

### Customizing PDF Scoring

**File:** `pdf-scorer.ts`

#### Add a New Signal

1. Add signal logic in `scorePdfCandidate()`:

```typescript
// New signal: boost for specific text patterns
if (linkText.includes('fullständig rapport')) {
  score += 10;
  signals.push('full_report_indicator');
}
```

#### Add a New Penalty

```typescript
// New penalty: demote preliminary versions
if (filenameClean.includes('preliminär') || linkText.includes('preliminär')) {
  score -= 6;
  penalties.push('preliminary_version');
}
```

#### Add a New Disqualifier

```typescript
// New disqualifier: skip archived versions
if (filenameClean.includes('arkiv') || href.includes('/arkiv/')) {
  score = -999;
  penalties.push('DISQUALIFIED:archived_version');
}
```

### Adjusting Weights

To fine-tune scoring, adjust point values in `scorePdfCandidate()`:

```typescript
// Before: +15 points for \"Ladda ner\" context
if (foundLaddaNer) {
  score += 15;
  signals.push('ladda_ner_context');
}

// After: increase to +20 for stronger signal
if (foundLaddaNer) {
  score += 20;  // Increased weight
  signals.push('ladda_ner_context');
}
```

### Adding New Utility Functions

When adding new functions, follow these patterns:

#### HTML Parser Pattern

```typescript
/**
 * Extract specific metadata from document
 */
export function extractNewMetadata(doc: Document): string {
  const element = doc.querySelector('.selector');
  if (element) {
    // Process and return data
    return element.textContent?.trim() || '';
  }
  return 'default_value'; // Always return default
}
```

#### PDF Scorer Pattern

```typescript
/**
 * Analyze PDF link for specific characteristic
 */
export function analyzeNewCharacteristic(
  link: Element,
  doc: Document
): boolean {
  // Implement analysis logic
  // Return boolean or specific type
  return result;
}
```

### Testing Your Extensions

When extending modules, test with edge cases:

```typescript
// Test with missing elements
extractNewMetadata(emptyDoc) // Should return default

// Test with malformed data
detectNewPattern(invalidHtml) // Should return null

// Test with edge cases
scorePdfCandidate(edgeCaseLink, doc, 'unknown', '') // Should handle gracefully
```

---

## Usage Examples

### In Edge Functions

```typescript
import { 
  detectDocumentType, 
  extractMinistry 
} from '../_shared/html-parser.ts';
import { 
  extractAndScorePdfs 
} from '../_shared/pdf-scorer.ts';

// Parse document
const doc = new DOMParser().parseFromString(html, 'text/html');
const docInfo = detectDocumentType(html, doc);
const ministry = extractMinistry(doc);

// Find best PDF
const pdfResult = extractAndScorePdfs(
  doc, 
  docInfo?.type || 'unknown', 
  docInfo?.number || ''
);

console.log('PDF confidence:', pdfResult.confidence);
console.log('PDF URL:', pdfResult.bestPdf);
console.log('Reasoning:', pdfResult.reasoning);
```

---

## Debugging Tips

### Enable Verbose Logging

The PDF scorer includes extraction logs:

```typescript
const result = extractAndScorePdfs(doc, docType, docNumber);
console.log('Extraction log:', result.extractionLog);
// [
//   \"Starting PDF extraction for sou SOU 2024:45\",
//   \"Found 15 PDF candidates\",
//   \"Filtered to 8 valid candidates\"
// ]
```

### Analyze All Candidates

```typescript
const result = extractAndScorePdfs(doc, docType, docNumber);
console.log('All candidates:');
result.allCandidates.forEach((candidate, i) => {
  console.log(`#${i+1}: ${candidate.filename}`);
  console.log(`  Score: ${candidate.score}`);
  console.log(`  Signals: ${candidate.signals.join(', ')}`);
  console.log(`  Penalties: ${candidate.penalties.join(', ')}`);
});
```

### Review HTML Snapshot

```typescript
const result = extractAndScorePdfs(doc, docType, docNumber);
if (result.htmlSnapshot) {
  console.log('Relevant HTML:', result.htmlSnapshot);
  // Save to document metadata for later review
}
```

---

## Performance Considerations

### HTML Parsing

- DOM queries are cached when possible
- Early returns prevent unnecessary processing
- Regex patterns are compiled once

### PDF Scoring

- Candidates are filtered before sorting (removes disqualified immediately)
- Only top 5 candidates are returned in results
- String operations use lowercase comparisons for consistency

---

## Future Enhancements

Potential improvements to consider:

1. **Machine Learning**: Train a model on historical PDF selections to improve scoring
2. **Language Detection**: Better handling of multilingual documents
3. **Date Validation**: Verify publication dates against expected formats
4. **Link Validation**: Check if PDF URLs are accessible before returning
5. **Caching**: Cache parsed DOM elements for repeated queries
6. **Metrics**: Track scoring accuracy over time to refine weights

---

## Contributing

When modifying these utilities:

1. **Maintain backward compatibility**: Don't change function signatures
2. **Add tests**: Test new functionality with various edge cases
3. **Update documentation**: Keep this README in sync with code changes
4. **Log changes**: Add comments explaining why scoring weights changed
5. **Consider performance**: Profile changes with large HTML documents

---

## Support

For questions or issues with these utilities:

1. Review extraction logs in edge function output
2. Check the HTML snapshot for debugging
3. Analyze the candidate scores and reasoning
4. Refer to regeringen.se page structure for context
