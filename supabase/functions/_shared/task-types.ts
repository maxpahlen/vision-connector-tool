// ============================================
// Task Type Registry - Central definition of all agent task types
// ============================================

/**
 * All valid task types in the system
 * 
 * This enum serves as the single source of truth for task types,
 * making it easy to add new agents/tasks in the future.
 */
export enum TaskType {
  // Phase 2 tasks (scraping and PDF processing)
  SCRAPE_SOU_INDEX = 'scrape_sou_index',
  FETCH_REGERINGEN_DOCUMENT = 'fetch_regeringen_document',
  PROCESS_PDF = 'process_pdf',
  
  // Phase 3 tasks (AI agents)
  HEAD_DETECTIVE = 'head_detective',
  TIMELINE_EXTRACTION = 'timeline_extraction',
  METADATA_EXTRACTION = 'metadata_extraction',
  
  // Future task types (placeholders for Phase 4+)
  // IMPACT_ANALYSIS = 'impact_analysis',
  // COMPLIANCE_CHECK = 'compliance_check',
  // SUMMARY_GENERATION = 'summary_generation',
}

/**
 * Task type metadata for configuration and display
 */
export interface TaskTypeMetadata {
  name: string;
  description: string;
  agentName: string;
  estimatedDurationMs: number;
  priority: number; // Higher = more important
}

/**
 * Registry of task type metadata
 */
export const TASK_TYPE_REGISTRY: Record<TaskType, TaskTypeMetadata> = {
  [TaskType.SCRAPE_SOU_INDEX]: {
    name: 'Scrape SOU Index',
    description: 'Discover new inquiries from sou.gov.se',
    agentName: 'scraper',
    estimatedDurationMs: 5000,
    priority: 100,
  },
  
  [TaskType.FETCH_REGERINGEN_DOCUMENT]: {
    name: 'Fetch Document',
    description: 'Fetch document metadata from regeringen.se',
    agentName: 'document_scraper',
    estimatedDurationMs: 3000,
    priority: 90,
  },
  
  [TaskType.PROCESS_PDF]: {
    name: 'Process PDF',
    description: 'Extract text content from PDF document',
    agentName: 'pdf_processor',
    estimatedDurationMs: 10000,
    priority: 80,
  },
  
  [TaskType.HEAD_DETECTIVE]: {
    name: 'Head Detective Analysis',
    description: 'Orchestrate document analysis and delegate to specialist agents',
    agentName: 'head_detective',
    estimatedDurationMs: 30000,
    priority: 70,
  },
  
  [TaskType.TIMELINE_EXTRACTION]: {
    name: 'Timeline Extraction',
    description: 'Extract timeline events with page citations',
    agentName: 'timeline_agent',
    estimatedDurationMs: 60000,
    priority: 60,
  },
  
  [TaskType.METADATA_EXTRACTION]: {
    name: 'Metadata Extraction',
    description: 'Extract entities and relationships with citations',
    agentName: 'metadata_agent',
    estimatedDurationMs: 60000,
    priority: 60,
  },
};

/**
 * Get metadata for a task type
 */
export function getTaskTypeMetadata(taskType: TaskType): TaskTypeMetadata {
  return TASK_TYPE_REGISTRY[taskType];
}

/**
 * Get default priority for a task type
 */
export function getDefaultPriority(taskType: TaskType): number {
  return TASK_TYPE_REGISTRY[taskType].priority;
}
