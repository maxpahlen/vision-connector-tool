import { Document, Element } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts';

/**
 * Detect document type from HTML content
 */
export function detectDocumentType(html: string, doc: Document): { type: string; number: string } | null {
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

/**
 * Extract ministry from page
 */
export function extractMinistry(doc: Document): string {
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

/**
 * Extract title from page
 */
export function extractTitle(doc: Document): string {
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

/**
 * Parse Swedish date format to ISO date
 */
export function parseSwedishDate(dateStr: string): string | null {
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

/**
 * Extract publication date from page
 */
export function extractPublicationDate(doc: Document): string | null {
  const timeElement = doc.querySelector('.published time');
  if (timeElement) {
    const datetime = timeElement.getAttribute('datetime');
    if (datetime) {
      return parseSwedishDate(datetime);
    }
  }
  return null;
}
