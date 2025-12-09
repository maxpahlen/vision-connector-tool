import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts";
import { classifyGenvagLink, extractDocNumber, type GenvagLink, type ClassifiedReference } from "../_shared/genvag-classifier.ts";
import { extractAndScorePdfs, extractAttachments, type AttachmentCandidate, type FileType } from "../_shared/pdf-scorer.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Proposition Index Scraper v5.2.5
 * 
 * Uses the internal regeringen.se Filter API for pagination:
 * https://www.regeringen.se/Filter/GetFilteredItems
 * 
 * Part of Phase 5.2: Proposition Slice
 * 
 * Features:
 * - JSON API pagination (bypasses client-side JS limitation)
 * - Detail page extraction using pdf-scorer (DOM-based)
 * - Document reference classification
 * - Diagnostic logging for 19/20 extraction behaviour (v5.2.4)
 * - Non-PDF attachment handling with file type classification (v5.2.5)
 */

interface PropositionMetadata {
  title: string;
  docNumber: string;  // e.g., "Prop. 2024/25:123"
  url: string;
  pdfUrl?: string;
  ministry?: string;
  publicationDate?: string;
  primaryFileType?: FileType;
  attachments?: AttachmentCandidate[];
}

interface LagstiftningskedjaLink {
  url: string;
  anchorText: string;
  docType?: string;
}

interface ScrapeResult {
  propositions: PropositionMetadata[];
  page: number;
  hasMore: boolean;
  inserted: number;
  skippedExistingInDb: number;
  skippedDuplicateInPage: number;
  references_created: number;
  errors: string[];
}

/**
 * Build the Filter API URL for regeringen.se
 * This API is used internally by the website for AJAX pagination
 * 
 * Key parameter: preFilteredCategories=1329 → Propositioner
 */
function buildFilterApiUrl(page: number): string {
  const params = new URLSearchParams({
    'lang': 'sv',
    'filterType': 'Taxonomy',
    'filterByType': 'FilterablePageBase',
    'preFilteredCategories': '1329', // Category ID for "proposition"
    'rootPageReference': '0',
    'page': String(page),
    'displayLimited': 'True',
    'displaySortedByRelevance': 'False'
  });
  
  return `https://www.regeringen.se/Filter/GetFilteredItems?${params.toString()}`;
}

/**
 * Parse proposition items from the Filter API JSON response
 * The API can return either:
 * 1. A list of item objects with properties
 * 2. An HTML string that needs DOM parsing
 */
function parseFilterApiResponse(json: any, baseUrl: string): PropositionMetadata[] {
  const propositions: PropositionMetadata[] = [];
  
  // Log JSON structure for debugging
  const jsonKeys = typeof json === 'object' ? Object.keys(json) : [];
  console.log('[Proposition Scraper v5.2.2] JSON response keys:', jsonKeys);
  
  // Check if response contains HTML string (common pattern)
  // Note: regeringen.se API returns HTML in "Message" field
  if (json.Message || json.Html || json.html || json.Content || json.content) {
    const htmlContent = json.Message || json.Html || json.html || json.Content || json.content;
    console.log('[Proposition Scraper v5.2.2] Found HTML content in JSON (Message field), parsing...');
    return parsePropositionListHtml(htmlContent, baseUrl);
  }
  
  // Check if response contains items array
  const items = json.Items || json.items || json.Hits || json.hits || json.Results || json.results;
  
  if (Array.isArray(items)) {
    console.log('[Proposition Scraper v5.2.2] Found items array with', items.length, 'items');
    
    for (const item of items) {
      const prop = parsePropositionItem(item, baseUrl);
      if (prop) {
        propositions.push(prop);
      }
    }
  } else if (typeof json === 'string') {
    // Response might be HTML string directly
    console.log('[Proposition Scraper v5.2.2] Response is HTML string, parsing...');
    return parsePropositionListHtml(json, baseUrl);
  } else {
    // Log full structure for debugging
    console.log('[Proposition Scraper v5.2.2] Unknown JSON structure, first item:', 
      JSON.stringify(json).substring(0, 500));
  }
  
  return propositions;
}

/**
 * Parse a single proposition item from JSON
 */
function parsePropositionItem(item: any, baseUrl: string): PropositionMetadata | null {
  // Try various property names (APIs often vary)
  const title = item.Title || item.title || item.Name || item.name || item.Heading || '';
  let url = item.Url || item.url || item.Link || item.link || item.Href || '';
  const dateStr = item.Date || item.date || item.Published || item.published || item.PublicationDate || '';
  const ministry = item.Ministry || item.ministry || item.Organization || item.organization || '';
  
  // Normalize URL
  if (url && !url.startsWith('http')) {
    url = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }
  
  // Skip if not a proposition
  if (!url || !url.includes('/proposition/')) {
    return null;
  }
  
  // Extract doc number from title or URL
  let docNumber = '';
  const titleMatch = title.match(/Prop\.\s*(\d{4}\/\d{2}:\d+)/i);
  if (titleMatch) {
    docNumber = `Prop. ${titleMatch[1]}`;
  } else {
    // Try URL pattern
    const urlMatch = url.match(/prop[.-](\d{4})(\d{2})(\d+)/i);
    if (urlMatch) {
      docNumber = `Prop. ${urlMatch[1]}/${urlMatch[2]}:${urlMatch[3]}`;
    }
  }
  
  if (!docNumber) {
    console.log('[Proposition Scraper v5.2.2] Could not extract doc number from:', title.substring(0, 80));
    return null;
  }
  
  // Clean title (remove doc number suffix)
  const cleanTitle = title.replace(/,?\s*Prop\.\s*\d{4}\/\d{2}:\d+/i, '').trim();
  
  // Parse date
  const publicationDate = parseDate(dateStr);
  
  return {
    title: cleanTitle || title,
    docNumber,
    url,
    ministry: ministry || undefined,
    publicationDate
  };
}

/**
 * Parse proposition listing from HTML (fallback or when API returns HTML)
 * Matches actual regeringen.se structure
 * 
 * Known Behaviour (NON-BLOCKING): Occasionally extracts 19/20 items instead of 20/20.
 * This is intentional—items are dropped if they lack valid proposition links or doc numbers.
 * Diagnostic logging added to track skip categories. See PHASE_5.2_IMPLEMENTATION_LOG.md.
 */
function parsePropositionListHtml(html: string, baseUrl: string): PropositionMetadata[] {
  const propositions: PropositionMetadata[] = [];
  
  // In-page deduplication: track URLs we've already seen in this HTML response
  const seenUrls = new Set<string>();
  
  // === Diagnostic Counters (NON-BLOCKING instrumentation) ===
  let domItems = 0;
  let skipNoLink = 0;
  let skipNoDocNum = 0;
  let skipDuplicate = 0;
  
  // Keep first 2 examples of each skip type for diagnostic breadcrumbs
  const skipNoLinkExamples: { itemIndex: number; textPreview: string }[] = [];
  const skipNoDocNumExamples: { itemIndex: number; textPreview: string }[] = [];
  const skipDuplicateExamples: { itemIndex: number; textPreview: string }[] = [];
  
  // Try DOM parsing first
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    if (doc) {
      // FIX: Use a single, specific selector to avoid matching both parent <li> and child .sortcompact
      // The .sortcompact class is the card wrapper for each proposition result
      const items = doc.querySelectorAll('.sortcompact');
      domItems = items.length;
      
      console.log('[Proposition Scraper v5.2.3] DOM selector matched', items.length, 'items');
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i] as Element;
        const itemText = item.textContent?.trim() || '';
        const textPreview = itemText.substring(0, 100).replace(/\s+/g, ' ');
        
        const linkEl = item.querySelector('a[href*="/proposition/"]');
        if (!linkEl) {
          skipNoLink++;
          if (skipNoLinkExamples.length < 2) {
            skipNoLinkExamples.push({ itemIndex: i, textPreview });
          }
          continue;
        }
        
        let url = linkEl.getAttribute('href') || '';
        const linkText = linkEl.textContent?.trim() || '';
        
        // Normalize URL
        if (url && !url.startsWith('http')) {
          url = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
        }
        
        // In-page deduplication: skip if we've already seen this URL in this response
        const canonicalKey = url.trim().toLowerCase();
        if (seenUrls.has(canonicalKey)) {
          skipDuplicate++;
          if (skipDuplicateExamples.length < 2) {
            skipDuplicateExamples.push({ itemIndex: i, textPreview: linkText.substring(0, 100) });
          }
          continue;
        }
        seenUrls.add(canonicalKey);
        
        // Extract doc number
        const docNumMatch = linkText.match(/Prop\.\s*(\d{4}\/\d{2}:\d+)/i);
        if (!docNumMatch) {
          skipNoDocNum++;
          if (skipNoDocNumExamples.length < 2) {
            skipNoDocNumExamples.push({ itemIndex: i, textPreview: linkText.substring(0, 100) });
          }
          continue;
        }
        
        const docNumber = `Prop. ${docNumMatch[1]}`;
        
        // Extract title
        const titleMatch = linkText.match(/^(.+?),?\s*Prop\./i);
        const title = titleMatch ? titleMatch[1].trim() : linkText;
        
        // Extract date
        const timeEl = item.querySelector('time[datetime]');
        const publicationDate = timeEl?.getAttribute('datetime') || undefined;
        
        // Extract ministry
        let ministry: string | undefined;
        const ministryMatch = item.textContent?.match(/från\s+([^\s]+departementet)/i);
        if (ministryMatch) {
          ministry = ministryMatch[1] + 'departementet';
        }
        
        propositions.push({
          title,
          docNumber,
          url,
          ministry,
          publicationDate
        });
      }
    }
  } catch (e) {
    console.log('[Proposition Scraper v5.2.3] DOM parsing failed, using regex fallback');
  }
  
  // === Diagnostic Summary Log (NON-BLOCKING) ===
  const parsed = propositions.length;
  console.log('[Prop Scraper] Parse summary', {
    domItems,
    parsed,
    skipNoLink,
    skipNoDocNum,
    skipDuplicate,
  });
  
  // Log first 2 examples of each skip category (breadcrumbs, not spam)
  if (skipNoLinkExamples.length > 0) {
    console.log('[Prop Scraper] Skip examples (no proposition link):', skipNoLinkExamples);
  }
  if (skipNoDocNumExamples.length > 0) {
    console.log('[Prop Scraper] Skip examples (no doc number match):', skipNoDocNumExamples);
  }
  if (skipDuplicateExamples.length > 0) {
    console.log('[Prop Scraper] Skip examples (duplicate URL):', skipDuplicateExamples);
  }
  
  // Fallback to regex if DOM parsing didn't find anything
  if (propositions.length === 0) {
    const itemPattern = /<li[^>]*>[\s\S]*?<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<\/li>/gi;
    
    let match;
    while ((match = itemPattern.exec(html)) !== null) {
      let url = match[1];
      const linkText = match[2].trim();
      
      if (!url.includes('/proposition/')) continue;
      
      // Normalize URL
      if (!url.startsWith('http')) {
        url = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
      }
      
      const docNumMatch = linkText.match(/Prop\.\s*(\d{4}\/\d{2}:\d+)/i);
      if (!docNumMatch) continue;
      
      const docNumber = `Prop. ${docNumMatch[1]}`;
      const titleMatch = linkText.match(/^(.+?),?\s*Prop\./i);
      const title = titleMatch ? titleMatch[1].trim() : linkText;
      
      propositions.push({
        title,
        docNumber,
        url
      });
    }
  }
  
  console.log('[Proposition Scraper v5.2.2] Parsed', propositions.length, 'propositions from HTML');
  return propositions;
}

/**
 * Parse various date formats to ISO
 */
function parseDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.substring(0, 10);
  }
  
  // Swedish months
  const months: Record<string, string> = {
    'januari': '01', 'februari': '02', 'mars': '03', 'april': '04',
    'maj': '05', 'juni': '06', 'juli': '07', 'augusti': '08',
    'september': '09', 'oktober': '10', 'november': '11', 'december': '12'
  };
  
  const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = months[match[2].toLowerCase()];
    const year = match[3];
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }
  
  return undefined;
}

/**
 * Extract PDF URL and attachments from detail page using DOM-based pdf-scorer
 * Now includes file type classification and attachment extraction (v5.2.5)
 */
function extractPdfAndAttachments(
  html: string, 
  docNumber: string
): { 
  pdfUrl: string | null; 
  confidence: number; 
  reasoning: string[];
  primaryFileType: FileType | null;
  attachments: AttachmentCandidate[];
} {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    if (!doc) {
      return { 
        pdfUrl: null, 
        confidence: 0, 
        reasoning: ['Failed to parse HTML'],
        primaryFileType: null,
        attachments: []
      };
    }
    
    // Extract all attachments first (with file type classification)
    const attachmentResult = extractAttachments(doc);
    
    // Then try to find the best PDF specifically
    const pdfResult = extractAndScorePdfs(doc, 'proposition', docNumber);
    
    // Determine primary file type
    let primaryFileType = attachmentResult.primaryFileType;
    
    // If we found a good PDF, that's our primary
    if (pdfResult.bestPdf && pdfResult.confidence >= 20) {
      primaryFileType = 'pdf';
    }
    
    console.log('[Proposition Scraper v5.2.5] PDF/Attachment extraction', {
      docNumber,
      foundPdf: !!pdfResult.bestPdf,
      pdfConfidence: pdfResult.confidence,
      primaryFileType,
      attachmentCount: attachmentResult.attachments.length,
      attachmentTypes: attachmentResult.attachments.map(a => a.fileType)
    });
    
    // If best PDF exists but is actually a non-PDF (shouldn't happen after pdf-scorer fix, but belt-and-braces)
    let finalPdfUrl = pdfResult.bestPdf;
    if (finalPdfUrl) {
      const lowerUrl = finalPdfUrl.toLowerCase();
      if (lowerUrl.endsWith('.xlsx') || lowerUrl.endsWith('.xls') || 
          lowerUrl.endsWith('.docx') || lowerUrl.endsWith('.doc')) {
        console.log('[Proposition Scraper v5.2.5] Rejecting non-PDF as pdf_url:', finalPdfUrl);
        finalPdfUrl = null;
        primaryFileType = attachmentResult.attachments[0]?.fileType || 'other';
      }
    }
    
    return {
      pdfUrl: finalPdfUrl,
      confidence: pdfResult.confidence,
      reasoning: pdfResult.reasoning,
      primaryFileType,
      attachments: attachmentResult.attachments
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { 
      pdfUrl: null, 
      confidence: 0, 
      reasoning: [`Error: ${errorMsg}`],
      primaryFileType: null,
      attachments: []
    };
  }
}

/**
 * Extract PDF URL from detail page using DOM-based pdf-scorer
 * @deprecated Use extractPdfAndAttachments instead
 */
function extractPdfUrlFromDom(html: string, docNumber: string): { url: string | null; confidence: number; reasoning: string[] } {
  const result = extractPdfAndAttachments(html, docNumber);
  return {
    url: result.pdfUrl,
    confidence: result.confidence,
    reasoning: result.reasoning
  };
}

/**
 * Extract Lagstiftningskedja (legislative chain) links from detail page
 */
function extractLagstiftningskedjaLinks(html: string, baseUrl: string): LagstiftningskedjaLink[] {
  const links: LagstiftningskedjaLink[] = [];
  
  // Try DOM parsing first
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    if (doc) {
      // Look for lagstiftningskedja section
      const sections = doc.querySelectorAll('[class*="lagstiftning"], [class*="legislative"], [class*="related"]');
      
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i] as Element;
        const sectionLinks = section.querySelectorAll('a[href]');
        for (let j = 0; j < sectionLinks.length; j++) {
          const link = sectionLinks[j] as Element;
          let url = link.getAttribute('href') || '';
          const anchorText = link.textContent?.trim() || '';
          
          if (!url || url === '#' || !anchorText) continue;
          
          if (!url.startsWith('http')) {
            url = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
          }
          
          let docType: string | undefined;
          if (url.includes('/statens-offentliga-utredningar/')) docType = 'sou';
          else if (url.includes('/kommittedirektiv/')) docType = 'directive';
          else if (url.includes('/proposition/')) docType = 'proposition';
          else if (url.includes('/remisser/')) docType = 'remiss';
          
          links.push({ url, anchorText, docType });
        }
      }
    }
  } catch (e) {
    // Fallback to regex
  }
  
  // Regex fallback
  if (links.length === 0) {
    const sectionPatterns = [
      /Lagstiftningskedja[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/gi,
      /<div[^>]*class="[^"]*lagstiftningskedja[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
    ];
    
    let sectionHtml = '';
    for (const pattern of sectionPatterns) {
      const match = html.match(pattern);
      if (match) {
        sectionHtml = match[0];
        break;
      }
    }
    
    if (sectionHtml) {
      const linkPattern = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
      let match;
      
      while ((match = linkPattern.exec(sectionHtml)) !== null) {
        let url = match[1];
        const anchorText = match[2].trim();
        
        if (!url || url === '#' || !anchorText) continue;
        
        if (!url.startsWith('http')) {
          url = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
        }
        
        let docType: string | undefined;
        if (url.includes('/statens-offentliga-utredningar/')) docType = 'sou';
        else if (url.includes('/kommittedirektiv/')) docType = 'directive';
        else if (url.includes('/proposition/')) docType = 'proposition';
        
        links.push({ url, anchorText, docType });
      }
    }
  }
  
  return links;
}

/**
 * Store document references from lagstiftningskedja links
 */
async function storeDocumentReferences(
  supabase: any,
  sourceDocId: string,
  links: LagstiftningskedjaLink[]
): Promise<number> {
  let created = 0;
  
  for (const link of links) {
    const genvagLink: GenvagLink = {
      url: link.url,
      anchorText: link.anchorText
    };
    const classification = classifyGenvagLink(genvagLink);
    
    if (classification.isExternalUrl) continue;
    
    const targetDocNumber = classification.targetDocNumber || extractDocNumber(link.url);
    
    let targetDocId: string | null = null;
    if (targetDocNumber) {
      const { data: targetDoc } = await supabase
        .from('documents')
        .select('id')
        .eq('doc_number', targetDocNumber)
        .maybeSingle();
      
      if (targetDoc) targetDocId = targetDoc.id;
    }
    
    const { data: existingRef } = await supabase
      .from('document_references')
      .select('id')
      .eq('source_document_id', sourceDocId)
      .eq('target_doc_number', targetDocNumber || link.anchorText)
      .maybeSingle();
    
    if (existingRef) continue;
    
    const { error: refError } = await supabase
      .from('document_references')
      .insert({
        source_document_id: sourceDocId,
        target_document_id: targetDocId,
        target_doc_number: targetDocNumber || link.anchorText,
        reference_type: classification.referenceType,
        confidence: classification.confidence,
        source_excerpt: `Lagstiftningskedja: ${link.anchorText}`
      });
    
    if (!refError) {
      created++;
      console.log('[Proposition Scraper v5.2.2] Created reference', { 
        type: classification.referenceType, 
        target: targetDocNumber 
      });
    }
  }
  
  return created;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { page = 1, limit = 10, skipExisting = true } = await req.json().catch(() => ({}));
    
    console.log('[Proposition Scraper v5.2.5] Starting', { page, limit, skipExisting });
    
    const baseUrl = 'https://www.regeringen.se';
    
    // Use the internal Filter API for proper pagination
    const apiUrl = buildFilterApiUrl(page);
    console.log('[Proposition Scraper v5.2.5] Fetching Filter API', { page, apiUrl });
    
    const apiResponse = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.regeringen.se/rattsliga-dokument/proposition/'
      }
    });
    
    console.log('[Proposition Scraper v5.2.2] API response status:', apiResponse.status);
    
    if (!apiResponse.ok) {
      throw new Error(`Filter API request failed: ${apiResponse.status}`);
    }
    
    // Try to parse as JSON first, fall back to text
    let responseData: any;
    const contentType = apiResponse.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      responseData = await apiResponse.json();
      console.log('[Proposition Scraper v5.2.2] Received JSON response');
    } else {
      const textContent = await apiResponse.text();
      console.log('[Proposition Scraper v5.2.2] Received text response, length:', textContent.length);
      
      // Try to parse as JSON anyway (some servers don't set content-type)
      try {
        responseData = JSON.parse(textContent);
        console.log('[Proposition Scraper v5.2.2] Successfully parsed text as JSON');
      } catch {
        // Treat as HTML
        responseData = textContent;
        console.log('[Proposition Scraper v5.2.2] Treating response as HTML');
      }
    }
    
    // Parse propositions from response
    const propositions = typeof responseData === 'string'
      ? parsePropositionListHtml(responseData, baseUrl)
      : parseFilterApiResponse(responseData, baseUrl);
    
    // Log first 3 doc numbers for debugging
    const first3DocNumbers = propositions.slice(0, 3).map(p => p.docNumber);
    console.log('[Proposition Scraper v5.2.2] Parsed propositions', { 
      page,
      count: propositions.length,
      first3DocNumbers 
    });
    
    // Determine if more pages exist
    const hasMore = propositions.length >= 10; // If we got a full page, there might be more
    
    const result: ScrapeResult = {
      propositions: [],
      page,
      hasMore,
      inserted: 0,
      skippedExistingInDb: 0,
      skippedDuplicateInPage: 0,
      references_created: 0,
      errors: []
    };
    
    // Process each proposition (limited)
    const toProcess = propositions.slice(0, limit);
    
    // Secondary in-loop deduplication (safety net for doc_number collisions)
    const processedDocNumbers = new Set<string>();
    
    for (const prop of toProcess) {
      try {
        // In-loop deduplication by doc_number (safety net)
        if (processedDocNumbers.has(prop.docNumber)) {
          console.log('[Proposition Scraper v5.2.3] Duplicate doc_number in batch, skipping', { docNumber: prop.docNumber });
          result.skippedDuplicateInPage++;
          continue;
        }
        processedDocNumbers.add(prop.docNumber);
        
        // Check if already exists in database
        if (skipExisting) {
          const { data: existing } = await supabase
            .from('documents')
            .select('id')
            .eq('doc_number', prop.docNumber)
            .maybeSingle();
          
          if (existing) {
            console.log('[Proposition Scraper v5.2.3] Skipping existing in DB', { docNumber: prop.docNumber });
            result.skippedExistingInDb++;
            continue;
          }
        }
        
        // Fetch detail page for PDF and lagstiftningskedja
        console.log('[Proposition Scraper v5.2.2] Fetching detail', { url: prop.url });
        
        const detailResponse = await fetch(prop.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LegislativeBot/5.2)',
            'Accept': 'text/html'
          }
        });
        
        let lagstiftningskedjaLinks: LagstiftningskedjaLink[] = [];
        
        if (detailResponse.ok) {
          const detailHtml = await detailResponse.text();
          
          // Extract PDF URL and attachments using v5.2.5 combined function
          const extractResult = extractPdfAndAttachments(detailHtml, prop.docNumber);
          prop.pdfUrl = extractResult.pdfUrl || undefined;
          prop.primaryFileType = extractResult.primaryFileType || undefined;
          prop.attachments = extractResult.attachments;
          
          // Log non-PDF primary file type for forensics
          if (extractResult.primaryFileType && extractResult.primaryFileType !== 'pdf') {
            console.log('[Proposition Scraper v5.2.5] Non-PDF primary file detected', {
              docNumber: prop.docNumber,
              primaryFileType: extractResult.primaryFileType,
              attachmentCount: extractResult.attachments.length,
              firstAttachmentLabel: extractResult.attachments[0]?.label?.substring(0, 60)
            });
          }
          
          // Extract Lagstiftningskedja links
          lagstiftningskedjaLinks = extractLagstiftningskedjaLinks(detailHtml, baseUrl);
          
          console.log('[Proposition Scraper v5.2.5] Detail extracted', { 
            docNumber: prop.docNumber,
            hasPdf: !!prop.pdfUrl,
            primaryFileType: prop.primaryFileType,
            attachmentCount: prop.attachments?.length || 0,
            lagstiftningskedjaCount: lagstiftningskedjaLinks.length
          });
        }
        
        // Build metadata with attachments and primary file type
        const documentMetadata: Record<string, unknown> = {
          scraped_at: new Date().toISOString(),
          scraper_version: '5.2.5',
          lagstiftningskedja_count: lagstiftningskedjaLinks.length,
        };
        
        // Add primary file type if determined
        if (prop.primaryFileType) {
          documentMetadata.primary_file_type = prop.primaryFileType;
        }
        
        // Add attachments if any
        if (prop.attachments && prop.attachments.length > 0) {
          documentMetadata.attachments = prop.attachments.map(a => ({
            url: a.url,
            file_type: a.fileType,
            label: a.label,
            source: a.source
          }));
        }
        
        // Insert document
        const { data: insertedDoc, error: insertError } = await supabase
          .from('documents')
          .insert({
            title: prop.title,
            doc_number: prop.docNumber,
            doc_type: 'proposition',
            url: prop.url,
            pdf_url: prop.pdfUrl, // Will be null for non-PDF primary files
            ministry: prop.ministry,
            publication_date: prop.publicationDate,
            lifecycle_stage: 'proposition',
            metadata: documentMetadata
          })
          .select()
          .single();
        
        if (insertError) {
          console.error('[Proposition Scraper v5.2.5] Insert error', { 
            docNumber: prop.docNumber, 
            error: insertError.message 
          });
          result.errors.push(`Failed to insert ${prop.docNumber}: ${insertError.message}`);
          continue;
        }
        
        result.propositions.push(prop);
        result.inserted++;
        
        console.log('[Proposition Scraper v5.2.5] ✅ Inserted', { 
          id: insertedDoc.id,
          docNumber: prop.docNumber,
          primaryFileType: prop.primaryFileType || 'pdf'
        });
        
        // Store document references
        if (lagstiftningskedjaLinks.length > 0) {
          const refsCreated = await storeDocumentReferences(
            supabase,
            insertedDoc.id,
            lagstiftningskedjaLinks
          );
          result.references_created += refsCreated;
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (propError) {
        const errorMsg = propError instanceof Error ? propError.message : 'Unknown error';
        console.error('[Proposition Scraper v5.2.5] Error processing', { 
          docNumber: prop.docNumber, 
          error: errorMsg 
        });
        result.errors.push(`Error processing ${prop.docNumber}: ${errorMsg}`);
      }
    }
    
    console.log('[Proposition Scraper v5.2.5] Complete', { 
      inserted: result.inserted,
      skippedExistingInDb: result.skippedExistingInDb,
      skippedDuplicateInPage: result.skippedDuplicateInPage,
      references: result.references_created,
      errors: result.errors.length,
      hasMore,
      totalProcessed: result.inserted + result.skippedExistingInDb + result.skippedDuplicateInPage
    });
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[Proposition Scraper v5.2.5] ❌ Error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
