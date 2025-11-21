// ============================================
// Process Stage Machine - Deterministic stage computation
// ============================================

/**
 * Valid process lifecycle stages
 */
export type ProcessStage = 
  | 'directive'      // Directive issued, committee forming or working
  | 'writing'        // Committee actively writing report
  | 'published'      // SOU published, awaiting remiss
  | 'remiss'         // In remiss consultation period
  | 'proposition'    // Government proposition submitted to Riksdag
  | 'law'            // Law enacted and in force

/**
 * Evidence collected from database about a process
 */
export interface ProcessEvidence {
  // Document presence
  hasDirective: boolean;
  hasSou: boolean;
  hasRemissDocument: boolean;
  hasProposition: boolean;
  hasLaw: boolean;
  
  // Timeline events (if available)
  hasDirectiveIssuedEvent: boolean;
  hasSouPublishedEvent: boolean;
  hasRemissEvents: boolean;
  hasPropositionEvent: boolean;
  hasLawEnactedEvent: boolean;
  
  // Current state from process record
  currentStage?: ProcessStage;
  
  // SOU publication date (if available)
  souPublicationDate?: Date;
}

/**
 * Computed stage result with explanation
 */
export interface StageResult {
  stage: ProcessStage;
  explanation: string;
}

/**
 * Compute process stage based on available evidence
 * 
 * This is a pure function - no database access, no LLM calls.
 * All decisions are deterministic based on the evidence provided.
 */
export function computeProcessStage(evidence: ProcessEvidence): StageResult {
  // Stage 6: Law enacted (highest priority)
  if (evidence.hasLaw || evidence.hasLawEnactedEvent) {
    return {
      stage: 'law',
      explanation: 'Lag har antagits och trätt i kraft. Processen är fullbordad.',
    };
  }
  
  // Stage 5: Proposition submitted
  if (evidence.hasProposition || evidence.hasPropositionEvent) {
    return {
      stage: 'proposition',
      explanation: 'Regeringens proposition har lämnats till riksdagen för behandling.',
    };
  }
  
  // Stage 4: Remiss period
  if (evidence.hasRemissDocument || evidence.hasRemissEvents) {
    return {
      stage: 'remiss',
      explanation: 'SOU:n är under remissbehandling. Remissinstanser lämnar synpunkter.',
    };
  }
  
  // Stage 3: SOU published
  if (evidence.hasSou || evidence.hasSouPublishedEvent) {
    const dateStr = evidence.souPublicationDate 
      ? ` (${formatSwedishDate(evidence.souPublicationDate)})`
      : '';
    
    return {
      stage: 'published',
      explanation: `Utredningen har publicerats som SOU${dateStr}. Remissbehandling kan påbörjas.`,
    };
  }
  
  // Stage 2: Committee writing (has directive but no SOU yet)
  if (evidence.hasDirective || evidence.hasDirectiveIssuedEvent) {
    return {
      stage: 'writing',
      explanation: 'Kommittén arbetar med utredningen enligt direktiv.',
    };
  }
  
  // Stage 1: Directive stage (default/initial)
  return {
    stage: 'directive',
    explanation: 'Utredning planerad eller pågående. Väntar på mer information.',
  };
}

/**
 * Format date in Swedish format (YYYY-MM-DD → "DD månad YYYY")
 */
function formatSwedishDate(date: Date): string {
  const months = [
    'januari', 'februari', 'mars', 'april', 'maj', 'juni',
    'juli', 'augusti', 'september', 'oktober', 'november', 'december'
  ];
  
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  
  return `${day} ${month} ${year}`;
}

/**
 * Determine if a stage transition is valid
 * (stages should generally only move forward, never backward)
 */
export function isValidTransition(
  fromStage: ProcessStage,
  toStage: ProcessStage
): boolean {
  const stageOrder: ProcessStage[] = [
    'directive',
    'writing',
    'published',
    'remiss',
    'proposition',
    'law'
  ];
  
  const fromIndex = stageOrder.indexOf(fromStage);
  const toIndex = stageOrder.indexOf(toStage);
  
  // Allow same stage (no-op)
  if (fromIndex === toIndex) {
    return true;
  }
  
  // Only allow forward transitions
  return toIndex > fromIndex;
}
