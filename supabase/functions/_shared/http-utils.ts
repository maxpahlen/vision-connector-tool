/**
 * Common HTTP utilities for edge functions
 * Provides CORS handling and response creators
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Handle CORS preflight requests
 */
export function handleCorsPreflightRequest(): Response {
  return new Response(null, { headers: corsHeaders });
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: string, 
  message: string, 
  status = 400
): Response {
  return new Response(
    JSON.stringify({ success: false, error, message }),
    { 
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Create a standardized success response
 */
export function createSuccessResponse(data: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ success: true, ...data }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    }
  );
}
