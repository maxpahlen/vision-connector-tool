# PDF Extraction Regression - 2025-11-20

## Summary
100% of PDF extraction attempts failed after refactoring due to response field mismatch between PDF extractor service and edge function.

## Root Cause
During refactoring, the PDF extractor service response structure was changed:
- **Before**: `{ success: true, text: "...", metadata: {...} }`
- **After**: `{ ok: true, text: "...", metadata: {...} }`

However, the edge function (`process-sou-pdf`) continued checking `result.success` instead of `result.ok`, causing all extractions to fail silently with "extraction_failed" error.

## Timeline
- **Before refactoring**: System working perfectly
- **After refactoring**: 100% failure rate
- **Detection**: All PDF tasks failing with generic "extraction_failed" error
- **Resolution**: Updated edge function to check `result.ok` instead of `result.success`

## Code Changes

### services/pdf-extractor/index.js (Line 135)
```javascript
// Returns this structure:
return res.status(200).json({
  ok: true,  // ← Changed from "success" to "ok"
  text: sanitizedText,
  metadata: { ... }
});
```

### supabase/functions/process-sou-pdf/index.ts (Line 73)
```typescript
// Was checking:
if (!result.success) { ... }  // ← Always undefined!

// Fixed to check:
if (!result.ok && result.ok !== undefined) { ... }
```

## Prevention
1. **Type Safety**: Created TypeScript interface matching PDF extractor response
2. **Integration Test**: Added test validating response structure
3. **Debug Logging**: Enhanced logging to catch response structure mismatches

## Lessons Learned
1. **Contract Testing**: When refactoring API responses, update all consumers
2. **Type Safety**: Use TypeScript interfaces to enforce contracts
3. **Integration Tests**: Test actual service integration, not just mocks
4. **Debug Logging**: Include response structure validation in production logs

## Related Files
- `services/pdf-extractor/index.js` - PDF extractor service
- `services/pdf-extractor/test-integration.js` - Integration tests
- `supabase/functions/process-sou-pdf/index.ts` - Edge function consumer
- `supabase/functions/_shared/http-utils.ts` - HTTP utilities
