import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting SOU metadata scraping...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { limit = 10 } = await req.json().catch(() => ({ limit: 10 }));

    // Fetch SOU list page
    const response = await fetch("https://www.sou.gov.se/pagaende-utredningar/");
    const html = await response.text();

    console.log("Fetched SOU list page, parsing...");

    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc) {
      throw new Error("Failed to parse HTML");
    }

    // Parse SOU entries
    const souEntries = [];
    const souElements = doc.querySelectorAll(".sou-item, article, .publication-item");

    console.log(`Found ${souElements.length} potential SOU elements`);

    for (let i = 0; i < Math.min(souElements.length, limit); i++) {
      const element = souElements[i] as any; // Cast to access querySelector methods

      // Extract title
      const titleElement = element.querySelector?.("h2, h3, .title, .sou-title");
      const title = titleElement?.textContent?.trim() || "";

      // Extract SOU number
      const souNumberMatch = title.match(/SOU\s*(\d{4}:\d+)/i);
      const docNumber = souNumberMatch ? souNumberMatch[1] : "";

      // Extract URL
      const linkElement = element.querySelector?.("a");
      const url = linkElement?.getAttribute?.("href") || "";
      const fullUrl = url.startsWith("http") ? url : `https://www.sou.gov.se${url}`;

      // Extract PDF URL if available
      const pdfLink = element.querySelector?.('a[href*=".pdf"]');
      const pdfUrl = pdfLink?.getAttribute?.("href") || "";
      const fullPdfUrl = pdfUrl ? (pdfUrl.startsWith("http") ? pdfUrl : `https://www.sou.gov.se${pdfUrl}`) : null;

      // Extract ministry if available
      const ministryElement = element.querySelector?.(".ministry, .department");
      const ministry = ministryElement?.textContent?.trim() || null;

      if (title && docNumber) {
        souEntries.push({
          doc_type: "SOU",
          doc_number: docNumber,
          title: title,
          url: fullUrl,
          pdf_url: fullPdfUrl,
          ministry: ministry,
          metadata: {
            scraped_at: new Date().toISOString(),
            source: "sou.gov.se",
          },
        });
      }
    }

    console.log(`Parsed ${souEntries.length} SOU entries, storing in database...`);

    // Store in database using upsert to handle duplicates
    const { data: insertedDocs, error: insertError } = await supabase
      .from("documents")
      .upsert(souEntries, {
        onConflict: "doc_type,doc_number",
        ignoreDuplicates: false,
      })
      .select();

    if (insertError) {
      console.error("Error inserting documents:", insertError);
      throw insertError;
    }

    console.log(`Successfully stored ${insertedDocs?.length || 0} SOU documents`);

    return new Response(
      JSON.stringify({
        success: true,
        count: insertedDocs?.length || 0,
        documents: insertedDocs,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in scrape-sou-metadata:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
