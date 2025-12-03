// ============================================
// Process Stage Machine - Deterministic stage computation
// ============================================
//
// PHILOSOPHY:
// The platform must feel like a forensic research tool, not a magic trick.
// We only move stages when we can point to VERIFIABLE EVIDENCE in the data.
// Fewer stages with 100% reliability is more valuable than more stages with speculation.
//
// Note: 'writing' is intentionally NOT modeled - we cannot reliably distinguish
// "directive issued" from "committee actively writing" without external evidence.
// Any time-based heuristic would be speculation. We add stages only when we have
// real signals from the data (e.g., 'committee_formed', 'experts_added').
// ============================================

/**
 * Valid process lifecycle stages (evidence-based only)
 * 
 * Phase 5.2 additions: 'proposition' and 'enacted' stages
 */
export type ProcessStage = 
  | 'directive'          // Process exists, no directive document yet
  | 'directive_issued'   // Directive document linked (evidence: directive doc exists)
  | 'published'          // SOU published (evidence: SOU doc + sou_published event)
  | 'remiss'             // In remiss consultation period
  | 'proposition'        // Government proposition submitted to Riksdag
  | 'enacted'            // Law enacted and in force (Phase 5.2)
  | 'law'                // Legacy alias for 'enacted' (deprecated, kept for compatibility)

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
 * 
 * EVIDENCE-BASED TRANSITIONS (strict priority order):
 * 1. hasLaw → 'law'
 * 2. hasProposition → 'proposition'
 * 3. hasRemissDocument || hasRemissEvents → 'remiss'
 * 4. hasSou && hasSouPublishedEvent → 'published' (BOTH required!)
 * 5. hasDirective || hasDirectiveIssuedEvent → 'directive_issued'
 * 6. default → 'directive'
 */
export function computeProcessStage(evidence: ProcessEvidence): StageResult {
  // Stage 6: Law enacted (highest priority)
  if (evidence.hasLaw || evidence.hasLawEnactedEvent) {
    return {
      stage: 'enacted',
      explanation: 'Lag har antagits och trätt i kraft. Processen är fullbordad.',
    };
  }
  
  // Stage 5: Proposition submitted (Phase 5.2)
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
  
  // Stage 3: SOU published (BOTH SOU doc AND event required for high confidence)
  if (evidence.hasSou && evidence.hasSouPublishedEvent) {
    const dateStr = evidence.souPublicationDate 
      ? ` (${formatSwedishDate(evidence.souPublicationDate)})`
      : '';
    
    return {
      stage: 'published',
      explanation: `Utredningen har publicerats som SOU${dateStr}. Remissbehandling kan påbörjas.`,
    };
  }
  
  // Stage 2: Directive issued (evidence: directive document exists)
  if (evidence.hasDirective || evidence.hasDirectiveIssuedEvent) {
    return {
      stage: 'directive_issued',
      explanation: 'Direktiv har utfärdats. Utredningsarbete kan påbörjas.',
    };
  }
  
  // Stage 1: Directive stage (default/initial - no documents yet)
  return {
    stage: 'directive',
    explanation: 'Utredning planerad eller pågående. Väntar på direktiv eller mer information.',
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
    'directive_issued',
    'published',
    'remiss',
    'proposition',
    'enacted',
    'law' // Legacy alias - maps to same position as enacted
  ];
  
  const fromIndex = stageOrder.indexOf(fromStage);
  const toIndex = stageOrder.indexOf(toStage);
  
  // Handle 'law' as alias for 'enacted'
  const normalizedFromIndex = fromStage === 'law' ? stageOrder.indexOf('enacted') : fromIndex;
  const normalizedToIndex = toStage === 'law' ? stageOrder.indexOf('enacted') : toIndex;
  
  // Allow same stage (no-op)
  if (normalizedFromIndex === normalizedToIndex) {
    return true;
  }
  
  // Only allow forward transitions
  return normalizedToIndex > normalizedFromIndex;
}
