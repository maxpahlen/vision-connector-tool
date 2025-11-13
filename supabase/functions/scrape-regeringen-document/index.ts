import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DOMParser, Element, Document } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PdfCandidate {
  url: string;
  score: number;
  signals: string[];
  penalties: string[];
  linkText: string;
  filename: string;
  location: string;
}

interface PdfExtractionResult {
  bestPdf: string | null;
  confidence: number;
  reasoning: string[];
  allCandidates: PdfCandidate[];
  extractionLog: string[];
  htmlSnapshot: string | null;
}

interface DocumentMetadata {
  docType: 'sou' | 'directive' | 'ds' | 'unknown';
  docNumber: string;
  title: string;
  publicationDate: string | null;
  ministry: string;
  pdfUrl: string | null;
  url: string;
  // Enhanced PDF extraction fields
  pdf_status: 'found' | 'missing' | 'multiple_candidates' | 'extraction_failed';
  pdf_confidence_score: number;
  pdf_reasoning: string[];
  pdf_candidates: PdfCandidate[];
  extraction_log: string[];
  html_snapshot?: string;
  last_extraction_attempt: string;
}

// Detect document type from HTML content
function detectDocumentType(html: string, doc: Document): { type: string; number: string } | null {
  const text = html.toLowerCase();
  
  // Check for SOU (highest priority for completed investigations)
  const souVignette = doc.querySelector('.h1-vignette');
  if (souVignette && /sou\s+\d{4}:\d+/i.test(souVignette.textContent || '')) {
    const match = souVignette.textContent?.match(/SOU\s+(\d{4}:\d+)/i);
    if (match) return { type: 'sou', number: `SOU ${match[1]}` };
  }
  
  // Fallback: check in text
  if (text.includes('statens offentliga utredningar') || /sou\s+\d{4}:\d+/.test(text)) {
    const match = html.match(/SOU\s+(\d{4}:\d+)/i);
    if (match) return { type: 'sou', number: `SOU ${match[1]}` };
  }
  
  // Check for Directive
  if (text.includes('kommittédirektiv') || /dir\.\s+\d{4}:\d+/.test(text)) {
    const match = html.match(/Dir\.\s+(\d{4}:\d+)/i);
    if (match) return { type: 'directive', number: `Dir. ${match[1]}` };
  }
  
  // Check for Ds
  if (text.includes('departementsserien') || /ds\s+\d{4}:\d+/.test(text)) {
    const match = html.match(/Ds\s+(\d{4}:\d+)/i);
    if (match) return { type: 'ds', number: `Ds ${match[1]}` };
  }
  
  return null;
}

// Extract ministry from page
function extractMinistry(doc: Document): string {
  const categoryText = doc.querySelector('.categories-text');
  if (categoryText) {
    const text = categoryText.textContent || '';
    
    // Common ministry patterns
    const ministries = [
      'Kulturdepartementet',
      'Utbildningsdepartementet',
      'Finansdepartementet',
      'Arbetsmarknadsdepartementet',
      'Socialdepartementet',
      'Miljödepartementet',
      'Näringsdepartementet',
      'Försvarsdepartementet',
      'Justitiedepartementet',
      'Infrastrukturdepartementet',
      'Utrikesdepartementet',
      'Klimat- och näringslivsdepartementet',
    ];
    
    for (const ministry of ministries) {
      if (text.includes(ministry)) {
        return ministry;
      }
    }
    
    // Return the whole text if no exact match
    return text.trim();
  }
  
  return 'Okänt departement';
}

// Extract title from page
function extractTitle(doc: Document): string {
  const h1 = doc.querySelector('h1#h1id, h1');
  if (h1) {
    // Remove the vignette span if present
    const vignette = h1.querySelector('.h1-vignette');
    if (vignette) {
      vignette.remove();
    }
    return h1.textContent?.trim() || '';
  }
  return '';
}

// Extract publication date
function parseSwedishDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  const monthMap: Record<string, string> = {
    'januari': '01', 'februari': '02', 'mars': '03', 'april': '04',
    'maj': '05', 'juni': '06', 'juli': '07', 'augusti': '08',
    'september': '09', 'oktober': '10', 'november': '11', 'december': '12'
  };
  
  // Match "12 maj 2025" format
  const match = dateStr.match(/(\d{1,2})\s+([a-zåäö]+)\s+(\d{4})/i);
  if (match) {
    const [, day, month, year] = match;
    const monthNum = monthMap[month.toLowerCase()];
    if (monthNum) {
      return `${year}-${monthNum}-${day.padStart(2, '0')}`;
    }
  }
  
  return null;
}

function extractPublicationDate(doc: Document): string | null {
  const timeElement = doc.querySelector('.published time');
  if (timeElement) {
    const datetime = timeElement.getAttribute('datetime');
    if (datetime) {
      return parseSwedishDate(datetime);
    }
  }
  return null;
}

// ============================================
// Enhanced PDF Extraction with Scoring System
// ============================================

function determineLocation(link: Element, doc: Document): string {
  let current = link.parentElement;
  let depth = 0;
  
  while (current && depth < 10) {
    const heading = current.querySelector('h2, h3, h4');
    if (heading?.textContent?.toLowerCase().includes('ladda ner')) {
      return 'download_section';
    }
    
    if (current.classList?.contains('main-content') || 
        current.classList?.contains('article-content')) {
      return 'main_content';
    }
    
    current = current.parentElement;
    depth++;
  }
  
  if (link.closest('aside, footer, .sidebar')) {
    return 'sidebar';
  }
  
  return 'body_text';
}

function isInDownloadSection(link: Element, doc: Document): boolean {
  let current = link.parentElement;
  let depth = 0;
  
  while (current && depth < 8) {
    const headings = current.querySelectorAll('h2, h3, h4');
    for (const heading of headings) {
      const text = heading.textContent?.toLowerCase() || '';
      if (text.includes('ladda ner') || 
          text.includes('dokument') || 
          text.includes('publicering')) {
        return true;
      }
    }
    current = current.parentElement;
    depth++;
  }
  
  return false;
}

// Helper function to find all PDF candidates using multi-tier detection
function findPdfCandidates(doc: Document): Element[] {
  const candidates = new Set<Element>();
  const allLinks = doc.querySelectorAll('a[href]');
  
  // First, try to find candidates in preferred sections ("Ladda ner" context)
  const preferredSections: Element[] = [];
  
  // Find "Ladda ner" sections
  const allHeadings = doc.querySelectorAll('h2, h3, h4');
  for (const heading of allHeadings) {
    const text = heading.textContent?.toLowerCase() || '';
    if (text.includes('ladda ner')) {
      const parent = heading.parentElement;
      if (parent) {
        preferredSections.push(parent);
      }
    }
  }
  
  // Add structured sections
  const structuredSections = doc.querySelectorAll('.list--icons, .download, .file-list');
  preferredSections.push(...Array.from(structuredSections) as Element[]);
  
  // Tier 1: Search within preferred sections first
  for (const section of preferredSections) {
    const sectionLinks = section.querySelectorAll('a[href]');
    for (const link of sectionLinks) {
      const element = link as Element;
      const text = element.textContent?.toLowerCase() || '';
      const href = element.getAttribute('href')?.toLowerCase() || '';
      
      // Skip obvious image links
      if (href.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i)) continue;
      
      // Match PDF indicators
      if (
        href.includes('.pdf') ||
        href.includes('/contentassets/') ||
        href.includes('/globalassets/') ||
        text.includes('pdf') ||
        text.match(/\([\d,.]+ ?mb\)/i)
      ) {
        candidates.add(element);
      }
    }
  }
  
  // Tier 2: If no candidates found in preferred sections, search globally
  if (candidates.size === 0) {
    for (const link of allLinks) {
      const element = link as Element;
      const text = element.textContent?.toLowerCase() || '';
      const href = element.getAttribute('href')?.toLowerCase() || '';
      
      // Skip obvious image links
      if (href.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i)) continue;
      
      // Match PDF indicators (same criteria but globally)
      if (
        href.includes('.pdf') ||
        href.includes('/contentassets/') ||
        href.includes('/globalassets/') ||
        text.includes('pdf') ||
        text.match(/\([\d,.]+ ?mb\)/i)
      ) {
        candidates.add(element);
      }
    }
  }
  
  return Array.from(candidates);
}

function captureRelevantHtml(doc: Document): string {
  const sections: string[] = [];
  
  // Capture "Ladda ner" section
  const allHeadings = doc.querySelectorAll('h2, h3, h4');
  for (const heading of allHeadings) {
    const text = heading.textContent?.toLowerCase() || '';
    if (text.includes('ladda ner')) {
      const parent = heading.parentElement;
      if (parent) {
        sections.push(`=== Download Section ===\n${parent.outerHTML}`);
      }
    }
  }
  
  // Capture any .list--icons or .download sections
  const listSections = doc.querySelectorAll('.list--icons, .download, .file-list');
  for (const section of Array.from(listSections).slice(0, 2)) {
    sections.push(`=== List Section ===\n${(section as Element).outerHTML}`);
  }
  
  // Capture all PDF candidates found by enhanced detection
  const pdfCandidates = findPdfCandidates(doc);
  if (pdfCandidates.length > 0) {
    sections.push(`=== Found ${pdfCandidates.length} PDF Candidates ===`);
    for (const link of pdfCandidates.slice(0, 5)) {
      const href = link.getAttribute('href');
      const text = link.textContent?.trim();
      sections.push(`Link: ${text}\nURL: ${href}`);
    }
  }
  
  const combined = sections.join('\n\n---\n\n');
  return combined.length > 3000 
    ? combined.substring(0, 3000) + '\n\n... [truncated for storage]'
    : combined;
}

function scorePdfCandidate(
  link: Element,
  doc: Document,
  docNumber: string,
  docType: string,
  baseUrl: string,
  log: string[]
): PdfCandidate | null {
  const href = link.getAttribute('href');
  if (!href) return null;
  
  const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
  const linkText = (link.textContent || '').toLowerCase().trim();
  const filename = fullUrl.split('/').pop() || '';
  const filenameClean = filename.toLowerCase();
  
  let score = 0;
  const signals: string[] = [];
  const penalties: string[] = [];
  
  // Normalize document number for matching
  const normalizedDocNum = docNumber.replace(/[^\d:]/g, '').toLowerCase();
  const compactDocNum = normalizedDocNum.replace(':', '');
  
  // === STRONG SIGNALS (+10 points each) ===
  const location = determineLocation(link, doc);
  
  if (location === 'download_section' || location === 'main_content') {
    if (href.toLowerCase().includes(normalizedDocNum) || 
        href.toLowerCase().includes(compactDocNum)) {
      score += 10;
      signals.push('doc_number_in_url');
    }
    
    if (linkText.includes(normalizedDocNum) || linkText.includes(compactDocNum)) {
      score += 10;
      signals.push('doc_number_in_text');
    }
  }
  
  if (isInDownloadSection(link, doc)) {
    score += 10;
    signals.push('in_download_section');
  }
  
  // === CONTEXTUAL WEIGHTING: "Ladda ner" Context (+15 points) ===
  // Check if link is directly under "Ladda ner" heading (highest priority)
  let current = link.parentElement;
  let foundLaddaNer = false;
  let depth = 0;

  while (current && depth < 3) {
    const nearbyHeading = current.querySelector('h2, h3, h4');
    if (nearbyHeading?.textContent?.toLowerCase().includes('ladda ner')) {
      foundLaddaNer = true;
      break;
    }
    current = current.parentElement;
    depth++;
  }

  if (foundLaddaNer) {
    score += 15;
    signals.push('ladda_ner_context');
  }
  
  // === MODERATE SIGNALS (+5-8 points) ===
  // Boost for structured sections (increased from +5 to +8)
  if (link.closest('.list--icons, .download, .file-list')) {
    score += 8;
    signals.push('in_structured_section');
  }
  
  // Check if this is a global fallback candidate
  const isGlobalFallback = !foundLaddaNer && 
                           !link.closest('.list--icons, .download, .file-list') &&
                           location === 'body_text';

  // Contentassets scoring with contextual awareness
  if (fullUrl.includes('contentassets') || fullUrl.includes('globalassets')) {
    if (isGlobalFallback) {
      score += 2; // Lower score for global fallback candidates
      signals.push('global_fallback_contentassets');
    } else {
      score += 5; // Normal score for contextually-correct links
      signals.push('regeringen_cdn');
    }
  }
  
  if (linkText.includes('pdf') || link.querySelector('.icon-pdf, .fa-file-pdf')) {
    score += 3;
    signals.push('explicit_pdf_indicator');
  }
  
  // === SWEDISH FULL REPORT RULE (+8 points) ===
  const isFullReport = !filenameClean.includes('kortversion') &&
                       !filenameClean.includes('sammanfattning') &&
                       !filenameClean.includes('summary') &&
                       !filenameClean.includes('english') &&
                       !linkText.includes('kortversion') &&
                       !linkText.includes('sammanfattning') &&
                       !linkText.includes('summary');
  
  if (isFullReport) {
    score += 8;
    signals.push('swedish_full_report');
  }
  
  // === PENALTIES (-5 to -10 points) ===
  if (filenameClean.includes('kortversion') || linkText.includes('kortversion')) {
    score -= 5;
    penalties.push('kortversion');
  }
  
  if (filenameClean.includes('sammanfattning') || linkText.includes('sammanfattning')) {
    score -= 5;
    penalties.push('sammanfattning');
  }
  
  if (filenameClean.includes('english') || filenameClean.includes('summary') || 
      linkText.includes('english') || linkText.includes('in english')) {
    score -= 5;
    penalties.push('english_version');
  }
  
  if (filenameClean.includes('faktablad') || linkText.includes('faktablad') ||
      (filenameClean.includes('fact') && filenameClean.includes('sheet'))) {
    score -= 7;
    penalties.push('fact_sheet');
  }
  
  if (!docType.includes('bilaga') && 
      (filenameClean.includes('bilaga') || linkText.includes('bilaga'))) {
    score -= 3;
    penalties.push('appendix');
  }
  
  // === DISQUALIFIERS (score = -999) ===
  if (!fullUrl.includes('regeringen.se') && !fullUrl.includes('contentassets')) {
    score = -999;
    penalties.push('DISQUALIFIED:external_domain');
  }
  
  if (linkText.includes('omslag') || linkText.includes('cover')) {
    score = -999;
    penalties.push('DISQUALIFIED:cover_page_only');
  }
  
  if (location === 'body_text' && 
      (href.toLowerCase().includes(normalizedDocNum) || 
       linkText.includes(normalizedDocNum))) {
    score = -999;
    penalties.push('DISQUALIFIED:doc_number_in_wrong_context');
  }
  
  log.push(
    `  Candidate: ${filename.substring(0, 40)}... ` +
    `(score: ${score}, location: ${location})`
  );
  
  return {
    url: fullUrl,
    score,
    signals,
    penalties,
    linkText,
    filename,
    location,
  };
}

function extractAndScorePdfs(
  doc: Document, 
  baseUrl: string, 
  docNumber: string,
  docType: string
): PdfExtractionResult {
  const extractionLog: string[] = [];
  const allCandidates: PdfCandidate[] = [];
  
  // Use enhanced multi-tier PDF candidate detection
  const pdfCandidates = findPdfCandidates(doc);
  extractionLog.push(`Found ${pdfCandidates.length} PDF candidates on page (using enhanced detection)`);
  extractionLog.push(`Looking for document: ${docNumber} (${docType})`);
  
  if (pdfCandidates.length === 0) {
    extractionLog.push('❌ No PDF candidates found (tried .pdf extension, /contentassets/, "pdf" in text, file size patterns)');
    return {
      bestPdf: null,
      confidence: 0,
      reasoning: ['No PDF candidates found despite enhanced detection (directory URLs, text patterns, file sizes)'],
      allCandidates: [],
      extractionLog,
      htmlSnapshot: captureRelevantHtml(doc),
    };
  }
  
  // Score each candidate (all candidates go through the scoring system)
  for (const link of pdfCandidates) {
    const candidate = scorePdfCandidate(
      link, 
      doc, 
      docNumber, 
      docType, 
      baseUrl,
      extractionLog
    );
    if (candidate) {
      allCandidates.push(candidate);
    }
  }
  
  // Sort by score descending
  allCandidates.sort((a, b) => b.score - a.score);
  
  const bestCandidate = allCandidates[0];
  
  if (!bestCandidate || bestCandidate.score < 0) {
    extractionLog.push('❌ No suitable PDF found after scoring');
    return {
      bestPdf: null,
      confidence: 0,
      reasoning: ['All PDF candidates were disqualified or had negative scores'],
      allCandidates: allCandidates.slice(0, 5),
      extractionLog,
      htmlSnapshot: captureRelevantHtml(doc),
    };
  }
  
  // Calculate confidence (0-100)
  const confidence = Math.min(100, Math.max(0, (bestCandidate.score / 25) * 100));
  
  // Build reasoning
  const reasoning = [
    `Selected: ${bestCandidate.filename}`,
    `Confidence: ${confidence.toFixed(0)}/100`,
    `Positive signals: ${bestCandidate.signals.join(', ') || 'none'}`,
    bestCandidate.penalties.length > 0 
      ? `Penalties applied: ${bestCandidate.penalties.join(', ')}` 
      : 'No penalties',
  ];
  
  extractionLog.push(`✓ Selected PDF: ${bestCandidate.url}`);
  extractionLog.push(`  Score: ${bestCandidate.score}, Confidence: ${confidence.toFixed(0)}%`);
  
  return {
    bestPdf: bestCandidate.url,
    confidence,
    reasoning,
    allCandidates: allCandidates.slice(0, 5),
    extractionLog,
    htmlSnapshot: null,
  };
}

// Parse regeringen.se document page with enhanced PDF extraction
function parseRegeringenDocument(html: string, url: string): DocumentMetadata {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) {
    throw new Error('Failed to parse HTML');
  }
  
  const docTypeInfo = detectDocumentType(html, doc);
  const docNumber = docTypeInfo?.number || '';
  const docType = docTypeInfo?.type || 'unknown';
  
  // Use enhanced PDF extraction
  const pdfResult = extractAndScorePdfs(doc, url, docNumber, docType);
  
  return {
    docType: (docType as 'sou' | 'directive' | 'ds') || 'unknown',
    docNumber,
    title: extractTitle(doc),
    publicationDate: extractPublicationDate(doc),
    ministry: extractMinistry(doc),
    pdfUrl: pdfResult.bestPdf,
    url,
    // Enhanced PDF extraction metadata
    pdf_status: pdfResult.bestPdf ? 'found' : 'missing',
    pdf_confidence_score: pdfResult.confidence,
    pdf_reasoning: pdfResult.reasoning,
    pdf_candidates: pdfResult.allCandidates,
    extraction_log: pdfResult.extractionLog,
    html_snapshot: pdfResult.htmlSnapshot || undefined,
    last_extraction_attempt: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const body = await req.json();
    const { task_id, regeringen_url, process_id, url } = body;
    
    // Accept 'url' as an alias for 'regeringen_url'
    const documentUrl = regeringen_url || url;
    
    if (!documentUrl) {
      throw new Error('Missing required parameter: regeringen_url or url');
    }
    
    // process_id is optional for standalone testing
    console.log(`Scraping document: ${documentUrl}${process_id ? ` for process ${process_id}` : ' (standalone test)'}`);
    
    // Fetch the page
    const response = await fetch(documentUrl, {
      headers: {
        'User-Agent': 'Vision-Connector-Tool/1.0 (Educational Research Tool)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${documentUrl}`);
    }
    
    const html = await response.text();
    const metadata = parseRegeringenDocument(html, documentUrl);
    
    console.log('Extracted metadata:', metadata);
    
    if (metadata.docType === 'unknown' || !metadata.docNumber) {
      throw new Error('Could not detect document type or number');
    }
    
    // Check if document already exists
    const { data: existingDoc } = await supabase
      .from('documents')
      .select('id')
      .eq('doc_number', metadata.docNumber)
      .maybeSingle();
    
    let documentId: string;
    
    if (existingDoc) {
      console.log(`Document ${metadata.docNumber} already exists, updating...`);
      
      const { data: updatedDoc, error: updateError } = await supabase
        .from('documents')
        .update({
          title: metadata.title,
          url: metadata.url,
          pdf_url: metadata.pdfUrl,
          publication_date: metadata.publicationDate,
          ministry: metadata.ministry,
          metadata: {
            pdf_status: metadata.pdf_status,
            pdf_confidence_score: metadata.pdf_confidence_score,
            pdf_reasoning: metadata.pdf_reasoning,
            pdf_candidates: metadata.pdf_candidates,
            extraction_log: metadata.extraction_log,
            html_snapshot: metadata.html_snapshot,
            last_extraction_attempt: metadata.last_extraction_attempt,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingDoc.id)
        .select()
        .single();
      
      if (updateError) throw updateError;
      documentId = updatedDoc.id;
      
    } else {
      console.log(`Creating new document ${metadata.docNumber}...`);
      
      const { data: newDoc, error: insertError } = await supabase
        .from('documents')
        .insert({
          doc_type: metadata.docType,
          doc_number: metadata.docNumber,
          title: metadata.title,
          url: metadata.url,
          pdf_url: metadata.pdfUrl,
          publication_date: metadata.publicationDate,
          ministry: metadata.ministry,
          metadata: {
            pdf_status: metadata.pdf_status,
            pdf_confidence_score: metadata.pdf_confidence_score,
            pdf_reasoning: metadata.pdf_reasoning,
            pdf_candidates: metadata.pdf_candidates,
            extraction_log: metadata.extraction_log,
            html_snapshot: metadata.html_snapshot,
            last_extraction_attempt: metadata.last_extraction_attempt,
          },
        })
        .select()
        .single();
      
      if (insertError) throw insertError;
      documentId = newDoc.id;
    }
    
    // Determine role based on document type
    const role = metadata.docType === 'sou' ? 'main_sou' : 
                 metadata.docType === 'directive' ? 'directive' : 
                 'reference_ds';
    
    // Link document to process (only if process_id provided)
    if (process_id) {
      const { error: linkError } = await supabase
        .from('process_documents')
        .upsert({
          process_id,
          document_id: documentId,
          role,
        }, {
          onConflict: 'process_id,document_id',
        });
      
      if (linkError) {
        console.error('Error linking document to process:', linkError);
      }
      
      // Update process stage if SOU
      if (metadata.docType === 'sou') {
        console.log(`SOU detected! Updating process stage to 'published'...`);
        
        const { error: processError } = await supabase
          .from('processes')
          .update({
            current_stage: 'published',
            stage_explanation: `${metadata.docNumber} published${metadata.pdfUrl ? ' with PDF available' : ''}`,
            main_document_id: documentId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', process_id);
        
        if (processError) {
          console.error('Error updating process stage:', processError);
        }
      } else {
        // Update stage explanation for other document types
        const { error: processError } = await supabase
          .from('processes')
          .update({
            stage_explanation: `${metadata.docType.toUpperCase()} ${metadata.docNumber} found`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', process_id);
        
        if (processError) {
          console.error('Error updating process explanation:', processError);
        }
      }
    } else {
      console.log('No process_id provided - skipping process linking and updates');
    }
    
    // CRITICAL: Only create PDF processing task if PDF was found and confidence >= 30
    if (metadata.pdfUrl && metadata.pdf_confidence_score >= 30) {
      console.log(`✓ Creating PDF processing task (confidence: ${metadata.pdf_confidence_score}%)...`);
      
      const { error: taskError } = await supabase
        .from('agent_tasks')
        .insert({
          task_type: 'process_pdf',
          agent_name: 'pdf_processor',
          document_id: documentId,
          input_data: {
            pdf_url: metadata.pdfUrl,
            doc_number: metadata.docNumber,
            confidence: metadata.pdf_confidence_score,
          },
          status: 'pending',
          priority: metadata.pdf_confidence_score >= 80 ? 10 : metadata.docType === 'sou' ? 8 : 5,
        });
      
      if (taskError) {
        console.error('Error creating PDF task:', taskError);
      }
    } else if (!metadata.pdfUrl) {
      console.warn(`⚠️ No PDF found for ${metadata.docNumber} - task not created`);
      console.warn(`Reason: ${metadata.pdf_reasoning.join('; ')}`);
    } else {
      console.warn(`⚠️ Low confidence PDF for ${metadata.docNumber} (${metadata.pdf_confidence_score}%) - task not created`);
      console.warn(`Candidate details: ${JSON.stringify(metadata.pdf_candidates[0], null, 2)}`);
    }
    
    // Update original task status if task_id provided
    if (task_id) {
      await supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          output_data: {
            document_id: documentId,
            doc_type: metadata.docType,
            doc_number: metadata.docNumber,
          },
        })
        .eq('id', task_id);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        document: {
          id: documentId,
          doc_type: metadata.docType,
          doc_number: metadata.docNumber,
          title: metadata.title,
        },
        pdf_extraction: {
          status: metadata.pdf_status,
          url: metadata.pdfUrl,
          confidence_score: metadata.pdf_confidence_score,
          reasoning: metadata.pdf_reasoning,
          candidate_count: metadata.pdf_candidates?.length || 0,
          task_created: !!metadata.pdfUrl && metadata.pdf_confidence_score >= 30,
        },
        process: process_id ? {
          id: process_id,
          stage_updated: metadata.docType === 'sou',
        } : null,
      }, null, 2),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error in scrape-regeringen-document:', error);
    
    // Update task status to failed if task_id provided
    const body = await req.json().catch(() => ({}));
    if (body.task_id) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        await supabase
          .from('agent_tasks')
          .update({
            status: 'failed',
            error_message: errorMsg,
            completed_at: new Date().toISOString(),
          })
          .eq('id', body.task_id);
      } catch (updateError) {
        console.error('Error updating task status:', updateError);
      }
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMsg,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
