import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DOMParser, Element } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { 
  detectDocumentType, 
  extractMinistry, 
  extractTitle, 
  extractPublicationDate 
} from '../_shared/html-parser.ts';
import { 
  extractAndScorePdfs,
  type PdfCandidate
} from '../_shared/pdf-scorer.ts';
import {
  classifyGenvagLink,
  extractDocNumber,
  type GenvagLink,
  type ClassifiedReference
} from '../_shared/genvag-classifier.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema
const RequestSchema = z.object({
  url: z.string().url().refine(
    (url) => url.startsWith('https://www.regeringen.se/') || url.startsWith('https://regeringen.se/'),
    { message: 'URL must be from regeringen.se domain' }
  ).optional(),
  regeringen_url: z.string().url().refine(
    (url) => url.startsWith('https://www.regeringen.se/') || url.startsWith('https://regeringen.se/'),
    { message: 'URL must be from regeringen.se domain' }
  ).optional(),
  task_id: z.string().uuid().optional(),
  process_id: z.string().uuid().optional(),
}).refine(
  (data) => data.url || data.regeringen_url,
  { message: 'Either url or regeringen_url must be provided' }
);

interface LagstiftningskedjaLink {
  url: string;
  anchorText: string;
  docType?: string;
}

interface ExtractedReference {
  url: string;
  anchorText: string;
  referenceType: string;
  targetDocNumber: string | null;
  confidence: string;
}

interface DocumentMetadata {
  docType: 'sou' | 'directive' | 'ds' | 'unknown';
  docNumber: string;
  title: string;
  publicationDate: string | null;
  ministry: string;
  pdfUrl: string | null;
  url: string;
  pdf_status: 'found' | 'missing' | 'multiple_candidates' | 'extraction_failed';
  pdf_confidence_score: number;
  pdf_reasoning: string[];
  pdf_candidates: PdfCandidate[];
  extraction_log: string[];
  html_snapshot?: string;
  last_extraction_attempt: string;
  lagstiftningskedja_links: LagstiftningskedjaLink[];
  extracted_references: ExtractedReference[];
}

/**
 * Check if a URL is a valid government document link (not social media, etc.)
 */
function isValidDocumentUrl(url: string): boolean {
  // Reject social media and sharing links
  const invalidPatterns = [
    'facebook.com',
    'twitter.com',
    'linkedin.com',
    'x.com',
    'sharer',
    'share',
    'mailto:',
    'javascript:',
    '#',
  ];
  
  const lowerUrl = url.toLowerCase();
  for (const pattern of invalidPatterns) {
    if (lowerUrl.includes(pattern)) return false;
  }
  
  // Must be a regeringen.se link to a document
  return url.includes('regeringen.se/');
}

/**
 * Determine document type from URL path
 */
function inferDocTypeFromUrl(url: string): string | undefined {
  if (url.includes('/statens-offentliga-utredningar/')) return 'sou';
  if (url.includes('/kommittedirektiv/')) return 'directive';
  if (url.includes('/propositioner/') || url.includes('/proposition/')) return 'proposition';
  if (url.includes('/remisser/')) return 'remiss';
  if (url.includes('/departementsserien/')) return 'ds';
  return undefined;
}

/**
 * Extract Lagstiftningskedja (legislative chain) links from detail page
 */
function extractLagstiftningskedjaLinks(doc: any, baseUrl: string): LagstiftningskedjaLink[] {
  const links: LagstiftningskedjaLink[] = [];
  const seenUrls = new Set<string>();
  
  // Look for lagstiftningskedja/genvägar sections
  const sections = doc.querySelectorAll(
    '[class*="lagstiftning"], [class*="legislative"], [class*="related"], ' +
    '[class*="genvag"], [class*="shortcut"], .publication-shortcuts, .shortcuts'
  );
  
  console.log(`[Lagstiftningskedja] Found ${sections.length} potential sections`);
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i] as Element;
    const sectionLinks = section.querySelectorAll('a[href]');
    
    for (let j = 0; j < sectionLinks.length; j++) {
      const link = sectionLinks[j] as Element;
      let url = link.getAttribute('href') || '';
      const anchorText = link.textContent?.trim() || '';
      
      if (!url || url === '#' || !anchorText) continue;
      
      if (!url.startsWith('http')) {
        url = `https://www.regeringen.se${url.startsWith('/') ? '' : '/'}${url}`;
      }
      
      // Skip invalid or duplicate URLs
      if (!isValidDocumentUrl(url)) continue;
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      
      const docType = inferDocTypeFromUrl(url);
      // Only include links that are identifiable document types
      if (docType) {
        links.push({ url, anchorText, docType });
      }
    }
  }
  
  // Also check the main content area for linked documents
  const mainContent = doc.querySelector('main#content, .l-main, article');
  if (mainContent) {
    // Look for links to government documents specifically
    const relatedLinks = mainContent.querySelectorAll('a[href*="/remisser/"], a[href*="/kommittedirektiv/"], a[href*="/statens-offentliga-utredningar/"], a[href*="/propositioner/"]');
    
    for (let i = 0; i < relatedLinks.length; i++) {
      const link = relatedLinks[i] as Element;
      let url = link.getAttribute('href') || '';
      const anchorText = link.textContent?.trim() || '';
      
      if (!url || url === '#' || !anchorText) continue;
      
      if (!url.startsWith('http')) {
        url = `https://www.regeringen.se${url.startsWith('/') ? '' : '/'}${url}`;
      }
      
      // Skip invalid or duplicate URLs  
      if (!isValidDocumentUrl(url)) continue;
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      
      const docType = inferDocTypeFromUrl(url);
      if (docType) {
        links.push({ url, anchorText, docType });
      }
    }
  }
  
  console.log(`[Lagstiftningskedja] Extracted ${links.length} valid document links`);
  return links;
}

function parseRegeringenDocument(html: string, url: string): DocumentMetadata {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) {
    throw new Error('Failed to parse HTML');
  }
  
  const docTypeInfo = detectDocumentType(html, doc);
  const docNumber = docTypeInfo?.number || '';
  const docType = docTypeInfo?.type || 'unknown';
  
  const pdfResult = extractAndScorePdfs(doc, docType, docNumber);
  
  // Extract Lagstiftningskedja links
  const lagstiftningskedjaLinks = extractLagstiftningskedjaLinks(doc, url);
  
  // Classify each link using genvag-classifier
  const extractedReferences: ExtractedReference[] = lagstiftningskedjaLinks.map(link => {
    const genvagLink: GenvagLink = { url: link.url, anchorText: link.anchorText };
    const classification = classifyGenvagLink(genvagLink);
    
    return {
      url: link.url,
      anchorText: link.anchorText,
      referenceType: classification.referenceType,
      targetDocNumber: classification.targetDocNumber,
      confidence: classification.confidence,
    };
  });
  
  console.log(`[Document] Extracted ${extractedReferences.length} references from ${docNumber || url}`);
  
  return {
    docType: (docType as 'sou' | 'directive' | 'ds') || 'unknown',
    docNumber,
    title: extractTitle(doc),
    publicationDate: extractPublicationDate(doc),
    ministry: extractMinistry(doc),
    pdfUrl: pdfResult.bestPdf,
    url,
    pdf_status: pdfResult.bestPdf ? 'found' : 'missing',
    pdf_confidence_score: pdfResult.confidence,
    pdf_reasoning: pdfResult.reasoning,
    pdf_candidates: pdfResult.allCandidates,
    extraction_log: pdfResult.extractionLog,
    html_snapshot: pdfResult.htmlSnapshot || undefined,
    last_extraction_attempt: new Date().toISOString(),
    lagstiftningskedja_links: lagstiftningskedjaLinks,
    extracted_references: extractedReferences,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const body = await req.json();
    const validationResult = RequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request body',
          details: validationResult.error.issues 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { task_id, regeringen_url, process_id, url } = validationResult.data;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const documentUrl = regeringen_url || url;
    
    if (!documentUrl) {
      throw new Error('Missing required parameter: regeringen_url or url');
    }
    
    console.log(`Scraping document: ${documentUrl}${process_id ? ` for process ${process_id}` : ' (standalone test)'}`);
    
    // Guard: Reject index/listing pages that don't point to specific documents
    const indexPagePatterns = [
      /\/statens-offentliga-utredningar\/?(\?|#|$)/,
      /\/kommittedirektiv\/?(\?|#|$)/,
      /\/proposition\/?(\?|#|$)/,
      /\/rattsliga-dokument\/?(\?|#|$)/,
    ];

    if (indexPagePatterns.some(pattern => pattern.test(documentUrl))) {
      const errorMsg = `URL is an index page, not a document: ${documentUrl}`;
      console.error(errorMsg);
      
      // If this came from a task, mark it as failed
      if (task_id) {
        await supabase
          .from('agent_tasks')
          .update({ 
            status: 'failed', 
            error_message: errorMsg,
            completed_at: new Date().toISOString()
          })
          .eq('id', task_id);
      }
      
      throw new Error(errorMsg);
    }
    
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
    
    const role = metadata.docType === 'sou' ? 'main_sou' : 
                 metadata.docType === 'directive' ? 'directive' : 
                 'reference_ds';
    
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
      
      if (metadata.docType === 'sou') {
        console.log(`SOU detected! Updating process stage to 'published'...`);
        
        const { error: updateProcessError } = await supabase
          .from('processes')
          .update({
            current_stage: 'published',
            stage_explanation: `SOU ${metadata.docNumber} has been published`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', process_id);
        
        if (updateProcessError) {
          console.error('Error updating process stage:', updateProcessError);
        }
      }
      
      if (metadata.docType === 'directive') {
        console.log(`Directive detected! Updating process stage...`);
        
        const { error: updateProcessError } = await supabase
          .from('processes')
          .update({
            current_stage: 'directive_issued',
            stage_explanation: `Directive ${metadata.docNumber} has been issued`,
            directive_number: metadata.docNumber,
            updated_at: new Date().toISOString(),
          })
          .eq('id', process_id);
        
        if (updateProcessError) {
          console.error('Error updating process stage:', updateProcessError);
        }
      }
    }
    
    // Store document references from Lagstiftningskedja
    if (metadata.extracted_references.length > 0) {
      console.log(`Storing ${metadata.extracted_references.length} document references...`);
      
      let refsCreated = 0;
      for (const ref of metadata.extracted_references) {
        // Try to find target document if we have a doc number
        let targetDocumentId: string | null = null;
        if (ref.targetDocNumber) {
          const { data: targetDoc } = await supabase
            .from('documents')
            .select('id')
            .eq('doc_number', ref.targetDocNumber)
            .maybeSingle();
          
          if (targetDoc) {
            targetDocumentId = targetDoc.id;
          }
        }
        
        // Insert reference (using source_excerpt to store anchor text for forensic traceability)
        // target_url stores the original URL for Phase A remiss lookups
        const { error: refError } = await supabase
          .from('document_references')
          .upsert({
            source_document_id: documentId,
            target_document_id: targetDocumentId,
            target_doc_number: ref.targetDocNumber || ref.anchorText, // Prefer parsed doc number
            target_url: ref.url, // Store the original URL for remiss resolution
            reference_type: ref.referenceType,
            confidence: ref.confidence,
            source_excerpt: ref.anchorText,
          }, {
            onConflict: 'source_document_id,target_doc_number',
            ignoreDuplicates: true,
          });
        
        if (refError) {
          console.error(`Error inserting reference: ${refError.message}`);
        } else {
          refsCreated++;
        }
      }
      
      console.log(`Created ${refsCreated} document references for ${metadata.docNumber}`);
    }
    
    if (metadata.pdfUrl && metadata.pdf_confidence_score >= 40) {
      console.log(`PDF found with ${metadata.pdf_confidence_score}% confidence.`);
      
      // Check for existing PDF processing tasks to prevent duplicates
      const { data: existingPdfTask } = await supabase
        .from('agent_tasks')
        .select('id, status')
        .eq('document_id', documentId)
        .eq('task_type', 'process_pdf')
        .in('status', ['pending', 'processing', 'completed'])
        .maybeSingle();
      
      if (existingPdfTask) {
        console.log(`PDF task already exists for document ${documentId} (status: ${existingPdfTask.status}), skipping duplicate creation`);
      } else {
        console.log('Creating process_pdf task...');
        const { error: taskError } = await supabase
          .from('agent_tasks')
          .insert({
            task_type: 'process_pdf',
            agent_name: 'pdf_processor',
            status: 'pending',
            process_id: process_id || null,
            document_id: documentId,
            priority: metadata.pdf_confidence_score >= 70 ? 1 : 2,
            input_data: {
              pdf_url: metadata.pdfUrl,
              doc_number: metadata.docNumber,
              confidence_score: metadata.pdf_confidence_score,
            },
          });
        
        if (taskError) {
          console.error('Error creating PDF task:', taskError);
        } else {
          console.log('PDF processing task created successfully');
        }
      }
    } else if (!metadata.pdfUrl) {
      console.log('No PDF found for this document');
    } else {
      console.log(`PDF confidence too low (${metadata.pdf_confidence_score}%), skipping processing`);
    }
    
    if (task_id) {
      const { error: taskUpdateError } = await supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          output_data: {
            document_id: documentId,
            doc_number: metadata.docNumber,
            doc_type: metadata.docType,
            pdf_found: !!metadata.pdfUrl,
            pdf_confidence: metadata.pdf_confidence_score,
          },
        })
        .eq('id', task_id);
      
      if (taskUpdateError) {
        console.error('Error updating task status:', taskUpdateError);
      }
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        document_id: documentId,
        doc_number: metadata.docNumber,
        doc_type: metadata.docType,
        pdf_url: metadata.pdfUrl,
        pdf_confidence: metadata.pdf_confidence_score,
        pdf_status: metadata.pdf_status,
        references_extracted: metadata.extracted_references.length,
        lagstiftningskedja_links: metadata.lagstiftningskedja_links.length,
        metadata,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    console.error('Error in scrape-regeringen-document:', error);
    
    const body = await req.json().catch(() => ({}));
    const task_id = body?.task_id;
    
    if (task_id) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      await supabase
        .from('agent_tasks')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
        })
        .eq('id', task_id);
    }
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An error occurred',
        details: error instanceof Error ? error.stack : String(error)
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
