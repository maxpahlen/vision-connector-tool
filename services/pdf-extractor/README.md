# PDF Extractor Service

Production-grade PDF text extraction service for Swedish government documents (SOU, Dir, Ds).

## Architecture

This is a Node.js microservice that extracts text from PDF files using the battle-tested `pdf-parse` library. It's designed to be called by Deno edge functions in the main Lovable application.

**Key Features:**
- ✅ API key authentication
- ✅ Domain allow-listing (regeringen.se only)
- ✅ Size limits (50MB default)
- ✅ Timeout protection (60s default)
- ✅ Double-layer text sanitization (null byte removal)
- ✅ Structured error taxonomy

## Installation

```bash
cd services/pdf-extractor
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**Required environment variables:**

- `PDF_EXTRACTOR_API_KEY` - Generate with `openssl rand -hex 32`

**Optional overrides:**

- `PORT` - Server port (default: 3000)
- `MAX_PDF_SIZE_BYTES` - Max PDF size (default: 52428800 = 50MB)
- `REQUEST_TIMEOUT_MS` - Max processing time (default: 60000 = 60s)
- `DOWNLOAD_TIMEOUT_MS` - Max download time (default: 30000 = 30s)

## Local Development

```bash
npm run dev
```

Test health endpoint:
```bash
curl http://localhost:3000/health
```

Test extraction (requires API key):
```bash
curl -X POST http://localhost:3000/extract \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "pdfUrl": "https://www.regeringen.se/...",
    "documentId": "doc-123",
    "docNumber": "SOU 2025:46"
  }'
```

## Deployment

### Vercel (Recommended)

1. Push code to GitHub repository
2. Import project in Vercel dashboard
3. Configure build settings:
   - **Root Directory:** `services/pdf-extractor`
   - **Framework Preset:** Other
   - **Build Command:** (leave empty)
   - **Output Directory:** (leave empty)
4. Add environment variable:
   - `PDF_EXTRACTOR_API_KEY` = (generate with `openssl rand -hex 32`)
5. Deploy

Your service will be available at: `https://your-project.vercel.app`

### Railway

1. Create new project from GitHub repo
2. Set root directory: `services/pdf-extractor`
3. Add environment variable: `PDF_EXTRACTOR_API_KEY`
4. Deploy

### Render

1. Create new Web Service
2. Connect GitHub repository
3. Set:
   - **Root Directory:** `services/pdf-extractor`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Add environment variable: `PDF_EXTRACTOR_API_KEY`
5. Deploy

## API Reference

### `GET /health`

Health check endpoint (no authentication required).

**Response:**
```json
{
  "status": "ok",
  "service": "pdf-extractor",
  "version": "1.0.0",
  "config": {
    "maxPdfSizeMB": 50,
    "requestTimeoutSeconds": 60,
    "downloadTimeoutSeconds": 30,
    "allowedDomains": ["https://www.regeringen.se", "https://regeringen.se"]
  }
}
```

### `POST /extract`

Extract text from a PDF (requires API key).

**Headers:**
- `X-API-Key: your-api-key-here` (required)
- `Content-Type: application/json` (required)

**Request body:**
```json
{
  "pdfUrl": "https://www.regeringen.se/contentassets/.../sou-2025-46.pdf",
  "documentId": "optional-doc-id",
  "docNumber": "optional-doc-number"
}
```

**Success response (200):**
```json
{
  "ok": true,
  "text": "Extracted text content...",
  "metadata": {
    "pageCount": 312,
    "byteLength": 5242880,
    "textLength": 456789,
    "documentId": "doc-123",
    "docNumber": "SOU 2025:46",
    "extractedAt": "2025-11-14T10:30:00.000Z",
    "processingTimeMs": 1234,
    "pdfInfo": {
      "title": "Document Title",
      "author": "Author Name"
    }
  }
}
```

**Error responses:**

| Code | Error | Reason |
|------|-------|--------|
| 401 | `unauthorized` | Missing or invalid API key |
| 403 | `domain_not_allowed` | PDF URL not from allowed domain |
| 400 | `download_failed` | Network error or invalid URL |
| 400 | `too_large` | PDF exceeds 50MB limit |
| 400 | `timeout` | Download or parsing exceeded timeout |
| 400 | `parse_failed` | PDF parsing failed or empty PDF |
| 500 | `sanitization_error` | Text cleaning failed |

**Error response format:**
```json
{
  "ok": false,
  "error": "timeout",
  "message": "PDF parsing timeout exceeded (60000ms)",
  "pdfUrl": "https://..."
}
```

## Error Taxonomy

Fixed set of error codes for consistent error handling:

- `domain_not_allowed` - PDF URL not in allow-list
- `download_failed` - Network error, HTTP error, invalid URL
- `too_large` - PDF exceeds size limit
- `timeout` - Download or parsing timeout
- `parse_failed` - pdf-parse library failed
- `sanitization_error` - Text cleaning failed
- `unauthorized` - Invalid API key
- `unknown_error` - Unexpected error

## Security

**API Key Authentication:**
- All `/extract` requests must include `X-API-Key` header
- Key must match `PDF_EXTRACTOR_API_KEY` environment variable
- Unauthorized requests receive 401 response

**Domain Allow-List:**
- Only processes PDFs from `https://www.regeringen.se/*` and `https://regeringen.se/*`
- Other domains receive 403 response with `domain_not_allowed` error
- Prevents abuse and unauthorized PDF sources

**Operational Safeguards:**
- Max PDF size: 50MB (configurable)
- Download timeout: 30s (configurable)
- Processing timeout: 60s (configurable)
- Exceeding limits results in clean failure (no partial data)

## Integration with Lovable

After deploying this service:

1. Note the service URL (e.g., `https://your-service.vercel.app`)
2. In Lovable Cloud, add secrets:
   - `PDF_EXTRACTOR_URL` = `https://your-service.vercel.app` (no trailing slash)
   - `PDF_EXTRACTOR_API_KEY` = (same key used in service)
3. The Deno edge function `process-sou-pdf` will call this service
4. Extracted text is stored in `documents.raw_content` with metadata

## Troubleshooting

**Service rejects all requests with 401:**
- Verify `PDF_EXTRACTOR_API_KEY` is set in environment variables
- Check that the key matches between service and caller

**Domain not allowed errors:**
- Verify PDF URL starts with `https://www.regeringen.se/` or `https://regeringen.se/`
- Check for typos in the URL

**Timeout errors:**
- Check PDF file size (must be under 50MB)
- Verify network connectivity to regeringen.se
- Consider increasing timeout limits in production

**Parse failed errors:**
- PDF may be corrupted or password-protected
- PDF may be an image-only scan (requires OCR)
- Check PDF can be opened manually

## Monitoring

**Health checks:**
```bash
curl https://your-service.vercel.app/health
```

**Log analysis:**
- All extraction attempts are logged with timestamps
- Errors include detailed messages and stack traces
- Monitor for patterns in error types

## License

Part of the SOU Scraper project.
