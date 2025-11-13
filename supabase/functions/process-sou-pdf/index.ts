import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, pdfUrl } = await req.json();

    if (!documentId && !pdfUrl) {
      throw new Error('Either documentId or pdfUrl must be provided');
    }

    console.log(`Processing PDF for document: ${documentId || pdfUrl}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let document;
    let targetPdfUrl = pdfUrl;

    // If documentId provided, fetch the document to get PDF URL
    if (documentId) {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (error || !data) {
        throw new Error(`Document not found: ${documentId}`);
      }

      document = data;
      targetPdfUrl = data.pdf_url;

      if (!targetPdfUrl) {
        throw new Error('Document has no PDF URL');
      }
    }

    console.log(`Downloading PDF from: ${targetPdfUrl}`);

    // Download PDF
    const pdfResponse = await fetch(targetPdfUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.statusText}`);
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    console.log(`Downloaded PDF, size: ${pdfBuffer.byteLength} bytes`);

    // For now, we'll extract text using a simple approach
    // In production, you'd use a proper PDF parsing library
    // This is a placeholder that stores basic info
    const extractedText = await extractTextFromPdf(pdfBuffer);
    
    console.log(`Extracted ${extractedText.length} characters of text`);

    // Update document with extracted text
    if (documentId) {
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          raw_content: extractedText,
          processed_at: new Date().toISOString(),
          metadata: {
            ...document.metadata,
            text_length: extractedText.length,
            processed_at: new Date().toISOString()
          }
        })
        .eq('id', documentId);

      if (updateError) {
        console.error('Error updating document:', updateError);
        throw updateError;
      }

      console.log(`Successfully updated document ${documentId} with extracted text`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        textLength: extractedText.length,
        preview: extractedText.substring(0, 200)
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in process-sou-pdf:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Basic text extraction from PDF
// This is a simplified version - in production use a proper PDF library
async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  try {
    // Convert buffer to Uint8Array
    const uint8Array = new Uint8Array(buffer);
    
    // Simple text extraction: look for text between PDF text operators
    // This is a very basic approach and won't work for all PDFs
    const decoder = new TextDecoder('latin1');
    const pdfText = decoder.decode(uint8Array);
    
    // Extract text between BT (Begin Text) and ET (End Text) operators
    const textRegex = /BT\s+(.*?)\s+ET/gs;
    const matches = pdfText.matchAll(textRegex);
    
    const extractedParts = [];
    for (const match of matches) {
      const textContent = match[1];
      // Extract strings in parentheses or angle brackets
      const stringRegex = /\((.*?)\)|<(.*?)>/g;
      const stringMatches = textContent.matchAll(stringRegex);
      
      for (const stringMatch of stringMatches) {
        const text = stringMatch[1] || stringMatch[2];
        if (text && text.trim()) {
          extractedParts.push(text.trim());
        }
      }
    }
    
    const result = extractedParts.join(' ').replace(/\s+/g, ' ').trim();
    
    // If extraction failed, return a message
    if (!result || result.length < 100) {
      return `[PDF processing: Basic text extraction from ${buffer.byteLength} byte PDF. Enhanced PDF parsing requires additional libraries.]`;
    }
    
    return result;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return `[PDF processing error: ${errorMessage}]`;
  }
}
