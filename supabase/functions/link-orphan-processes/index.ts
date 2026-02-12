import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/http-utils.ts';

// ============================================
// Slice 6A.3 — Process Linkage (Deterministic)
//
// Clusters orphan documents into processes using
// resolved document_references only. No AI.
//
// Two operations:
// 1. ADOPT: Orphan references a doc already in a process → join that process
// 2. CREATE: Orphan↔orphan clusters → new process via union-find
//
// Safety guards:
// - Ambiguity guard: orphan linking to 2+ processes → skipped
// - Cluster cap: clusters > MAX_CLUSTER_SIZE → skipped
// - Dry-run mode: compute manifest without DB writes
// ============================================

const MAX_CLUSTER_SIZE = 20;
const PAGE_SIZE = 1000;

// --- Union-Find ---
class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let curr = x;
    while (curr !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const rankA = this.rank.get(ra)!;
    const rankB = this.rank.get(rb)!;
    if (rankA < rankB) {
      this.parent.set(ra, rb);
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }
  }

  getClusters(): Map<string, string[]> {
    const clusters = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root)!.push(key);
    }
    return clusters;
  }
}

// --- Stage inference from doc types ---
const STAGE_PRIORITY: Record<string, { rank: number; stage: string; explanation: string }> = {
  'law': { rank: 6, stage: 'enacted', explanation: 'Lag har antagits. Processen är fullbordad.' },
  'committee_report': { rank: 4, stage: 'proposition', explanation: 'Utskottsbetänkande finns – riksdagsbehandling pågår eller avslutad.' },
  'proposition': { rank: 3, stage: 'proposition', explanation: 'Regeringens proposition har lämnats till riksdagen.' },
  'sou': { rank: 2, stage: 'published', explanation: 'Utredning publicerad som SOU.' },
  'directive': { rank: 1, stage: 'directive_issued', explanation: 'Direktiv har utfärdats.' },
};

function inferStage(docTypes: string[]): { stage: string; explanation: string } {
  let best = { rank: 0, stage: 'directive', explanation: 'Process skapad från dokumentlänkar.' };
  for (const dt of docTypes) {
    const entry = STAGE_PRIORITY[dt];
    if (entry && entry.rank > best.rank) best = entry;
  }
  return { stage: best.stage, explanation: best.explanation };
}

// --- Doc type → process_documents role mapping ---
function docTypeToRole(docType: string): string {
  const roleMap: Record<string, string> = {
    'directive': 'directive',
    'sou': 'sou',
    'proposition': 'proposition',
    'committee_report': 'committee_report',
    'law': 'law',
  };
  return roleMap[docType] || 'related';
}

// --- Stable process key generation ---
function makeProcessKey(docs: Array<{ doc_number: string; doc_type: string }>): string {
  // Pick the highest-priority doc_number as anchor
  let best: { doc_number: string; rank: number } = { doc_number: docs[0].doc_number, rank: 0 };
  for (const d of docs) {
    const rank = STAGE_PRIORITY[d.doc_type]?.rank || 0;
    if (rank > best.rank) {
      best = { doc_number: d.doc_number, rank };
    }
  }
  // Hash for uniqueness: first 8 chars of sorted doc_numbers joined
  const sorted = docs.map(d => d.doc_number).sort().join('|');
  const hash = simpleHash(sorted);
  const anchor = best.doc_number.replace(/[^a-zA-Z0-9.:\/\-]/g, '').substring(0, 30);
  return `auto-${anchor}-${hash}`;
}

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).substring(0, 8);
}

// --- Paginated fetch helper ---
async function fetchAllPaginated<T>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  select: string,
  filters?: (q: any) => any,
): Promise<T[]> {
  const all: T[] = [];
  let page = 0;
  while (true) {
    let query = supabase.from(table).select(select).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (filters) query = filters(query);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  return all;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // DEFAULT to dry-run for safety
    
    console.log(`[link-orphans] Starting (dryRun: ${dryRun})`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch all documents
    const allDocs = await fetchAllPaginated<{
      id: string; doc_number: string; doc_type: string; title: string; ministry: string | null;
    }>(supabase, 'documents', 'id, doc_number, doc_type, title, ministry');

    const docMap = new Map(allDocs.map(d => [d.id, d]));
    console.log(`[link-orphans] Loaded ${allDocs.length} documents`);

    // 2. Fetch existing process_documents to identify orphans
    const existingPD = await fetchAllPaginated<{ document_id: string; process_id: string }>(
      supabase, 'process_documents', 'document_id, process_id'
    );
    const docToProcess = new Map<string, Set<string>>();
    for (const pd of existingPD) {
      if (!docToProcess.has(pd.document_id)) docToProcess.set(pd.document_id, new Set());
      docToProcess.get(pd.document_id)!.add(pd.process_id);
    }

    const orphanIds = new Set(allDocs.filter(d => !docToProcess.has(d.id)).map(d => d.id));
    console.log(`[link-orphans] Found ${orphanIds.size} orphan documents`);

    // 3. Fetch resolved references
    const resolvedRefs = await fetchAllPaginated<{
      source_document_id: string; target_document_id: string;
    }>(supabase, 'document_references', 'source_document_id, target_document_id',
      q => q.not('target_document_id', 'is', null)
    );
    console.log(`[link-orphans] Loaded ${resolvedRefs.length} resolved references`);

    // 4. Fetch existing process keys to avoid collisions
    const existingProcesses = await fetchAllPaginated<{ id: string; process_key: string }>(
      supabase, 'processes', 'id, process_key'
    );
    const existingKeys = new Set(existingProcesses.map(p => p.process_key));

    // --- PHASE A: ADOPTION (orphan → existing process) ---
    const adoptions: Array<{
      document_id: string; doc_number: string; doc_type: string;
      process_id: string; role: string;
    }> = [];
    const skippedAmbiguous: Array<{
      document_id: string; doc_number: string; process_ids: string[];
    }> = [];

    for (const ref of resolvedRefs) {
      const sourceOrphan = orphanIds.has(ref.source_document_id);
      const targetOrphan = orphanIds.has(ref.target_document_id);

      // Case: orphan source → non-orphan target (adopt source into target's process)
      if (sourceOrphan && !targetOrphan && docToProcess.has(ref.target_document_id)) {
        const targetProcesses = docToProcess.get(ref.target_document_id)!;
        const doc = docMap.get(ref.source_document_id);
        if (!doc) continue;
        if (targetProcesses.size > 1) {
          skippedAmbiguous.push({
            document_id: ref.source_document_id,
            doc_number: doc.doc_number,
            process_ids: [...targetProcesses],
          });
          continue;
        }
        const processId = [...targetProcesses][0];
        adoptions.push({
          document_id: ref.source_document_id,
          doc_number: doc.doc_number,
          doc_type: doc.doc_type,
          process_id: processId,
          role: docTypeToRole(doc.doc_type),
        });
      }

      // Case: non-orphan source → orphan target (adopt target into source's process)
      if (!sourceOrphan && targetOrphan && docToProcess.has(ref.source_document_id)) {
        const sourceProcesses = docToProcess.get(ref.source_document_id)!;
        const doc = docMap.get(ref.target_document_id);
        if (!doc) continue;
        if (sourceProcesses.size > 1) {
          skippedAmbiguous.push({
            document_id: ref.target_document_id,
            doc_number: doc.doc_number,
            process_ids: [...sourceProcesses],
          });
          continue;
        }
        const processId = [...sourceProcesses][0];
        adoptions.push({
          document_id: ref.target_document_id,
          doc_number: doc.doc_number,
          doc_type: doc.doc_type,
          process_id: processId,
          role: docTypeToRole(doc.doc_type),
        });
      }
    }

    // Deduplicate adoptions (same doc may be referenced multiple times)
    const uniqueAdoptions = new Map<string, typeof adoptions[0]>();
    const adoptionConflicts: typeof skippedAmbiguous = [];
    for (const a of adoptions) {
      const existing = uniqueAdoptions.get(a.document_id);
      if (!existing) {
        uniqueAdoptions.set(a.document_id, a);
      } else if (existing.process_id !== a.process_id) {
        // Same doc wants to join 2 different processes → ambiguous
        adoptionConflicts.push({
          document_id: a.document_id,
          doc_number: a.doc_number,
          process_ids: [existing.process_id, a.process_id],
        });
        uniqueAdoptions.delete(a.document_id);
      }
    }
    const finalAdoptions = [...uniqueAdoptions.values()];

    // --- PHASE B: CLUSTERING (orphan↔orphan → new processes) ---
    const uf = new UnionFind();
    const orphanOrphanEdges: Array<[string, string]> = [];

    for (const ref of resolvedRefs) {
      if (orphanIds.has(ref.source_document_id) && orphanIds.has(ref.target_document_id)) {
        // Skip docs already being adopted
        if (uniqueAdoptions.has(ref.source_document_id) || uniqueAdoptions.has(ref.target_document_id)) continue;
        uf.union(ref.source_document_id, ref.target_document_id);
        orphanOrphanEdges.push([ref.source_document_id, ref.target_document_id]);
      }
    }

    const rawClusters = uf.getClusters();
    const newProcesses: Array<{
      process_key: string;
      title: string;
      ministry: string | null;
      stage: string;
      stage_explanation: string;
      documents: Array<{ id: string; doc_number: string; doc_type: string; role: string }>;
    }> = [];
    const skippedOversized: Array<{ root: string; size: number; sample_docs: string[] }> = [];

    for (const [root, members] of rawClusters) {
      if (members.length > MAX_CLUSTER_SIZE) {
        skippedOversized.push({
          root,
          size: members.length,
          sample_docs: members.slice(0, 5).map(id => docMap.get(id)?.doc_number || id),
        });
        continue;
      }

      const clusterDocs = members
        .map(id => docMap.get(id))
        .filter((d): d is NonNullable<typeof d> => d !== undefined);

      if (clusterDocs.length === 0) continue;

      const docTypes = clusterDocs.map(d => d.doc_type);
      const { stage, explanation } = inferStage(docTypes);
      const processKey = makeProcessKey(clusterDocs);

      // Skip if key already exists (idempotency)
      if (existingKeys.has(processKey)) continue;

      // Pick title from highest-priority doc
      const titleDoc = clusterDocs.reduce((best, d) => {
        const rank = STAGE_PRIORITY[d.doc_type]?.rank || 0;
        const bestRank = STAGE_PRIORITY[best.doc_type]?.rank || 0;
        return rank > bestRank ? d : best;
      });

      // Pick ministry from any doc that has one
      const ministry = clusterDocs.find(d => d.ministry)?.ministry || null;

      newProcesses.push({
        process_key: processKey,
        title: titleDoc.title,
        ministry,
        stage,
        stage_explanation: explanation,
        documents: clusterDocs.map(d => ({
          id: d.id,
          doc_number: d.doc_number,
          doc_type: d.doc_type,
          role: docTypeToRole(d.doc_type),
        })),
      });
    }

    // --- Compute metrics ---
    const totalOrphansBefore = orphanIds.size;
    const adoptedCount = finalAdoptions.length;
    const clusteredCount = newProcesses.reduce((sum, p) => sum + p.documents.length, 0);
    const totalLinked = adoptedCount + clusteredCount;
    const totalOrphansAfter = totalOrphansBefore - totalLinked;
    const reductionPct = ((totalLinked / totalOrphansBefore) * 100).toFixed(1);

    // --- WRITE MODE ---
    let writeResults = null;
    if (!dryRun) {
      const DB_BATCH = 50;
      let adoptedWritten = 0;
      let processesCreated = 0;
      let pdLinksCreated = 0;

      // Write adoptions
      for (let i = 0; i < finalAdoptions.length; i += DB_BATCH) {
        const batch = finalAdoptions.slice(i, i + DB_BATCH);
        const rows = batch.map(a => ({
          document_id: a.document_id,
          process_id: a.process_id,
          role: a.role,
        }));
        const { error } = await supabase.from('process_documents').insert(rows);
        if (error) {
          console.error(`[link-orphans] Adoption batch error:`, error);
        } else {
          adoptedWritten += batch.length;
        }
      }

      // Write new processes + their documents
      for (const proc of newProcesses) {
        const { data: newProc, error: procErr } = await supabase
          .from('processes')
          .insert({
            process_key: proc.process_key,
            title: proc.title,
            ministry: proc.ministry,
            current_stage: proc.stage,
            stage_explanation: proc.stage_explanation,
          })
          .select('id')
          .single();

        if (procErr) {
          console.error(`[link-orphans] Process creation error for ${proc.process_key}:`, procErr);
          continue;
        }

        processesCreated++;

        const pdRows = proc.documents.map(d => ({
          process_id: newProc.id,
          document_id: d.id,
          role: d.role,
        }));

        const { error: pdErr } = await supabase.from('process_documents').insert(pdRows);
        if (pdErr) {
          console.error(`[link-orphans] PD insert error for ${proc.process_key}:`, pdErr);
        } else {
          pdLinksCreated += pdRows.length;
        }
      }

      writeResults = { adoptedWritten, processesCreated, pdLinksCreated };
    }

    // --- Build manifest ---
    const manifest = {
      dryRun,
      timestamp: new Date().toISOString(),
      
      before: {
        total_documents: allDocs.length,
        orphan_documents: totalOrphansBefore,
        existing_processes: existingProcesses.length,
        resolved_references: resolvedRefs.length,
      },

      after: {
        orphan_documents: totalOrphansAfter,
        orphan_reduction_pct: `${reductionPct}%`,
        total_processes: existingProcesses.length + newProcesses.length,
      },

      adoption: {
        count: finalAdoptions.length,
        samples: finalAdoptions.slice(0, 10).map(a => ({
          doc_number: a.doc_number,
          doc_type: a.doc_type,
          process_id: a.process_id,
          role: a.role,
        })),
      },

      new_processes: {
        count: newProcesses.length,
        total_documents_clustered: clusteredCount,
        size_distribution: computeSizeDistribution(newProcesses.map(p => p.documents.length)),
        samples: newProcesses.slice(0, 10).map(p => ({
          process_key: p.process_key,
          title: p.title,
          stage: p.stage,
          ministry: p.ministry,
          doc_count: p.documents.length,
          documents: p.documents.map(d => `${d.doc_type}:${d.doc_number}`),
        })),
      },

      skipped: {
        ambiguous: [...skippedAmbiguous, ...adoptionConflicts],
        oversized: skippedOversized,
        total_skipped: skippedAmbiguous.length + adoptionConflicts.length + skippedOversized.length,
      },

      confidence: 'HIGH — all links derived from deterministic document_references with verified target_document_id matches. No AI inference used.',

      verification_plan: {
        steps: [
          '1. Spot-check 10 random new processes: verify doc_type roles match cluster content',
          '2. Verify no document appears in 2+ processes (uniqueness)',
          '3. Validate stage inference matches highest-ranking doc type in each cluster',
          '4. Confirm orphan count matches expected after-state',
          '5. Review all skipped sets for false negatives',
        ],
        sample_review_query: `SELECT p.process_key, p.title, p.current_stage, d.doc_number, d.doc_type, pd.role
FROM processes p
JOIN process_documents pd ON pd.process_id = p.id
JOIN documents d ON d.id = pd.document_id
WHERE p.process_key LIKE 'auto-%'
ORDER BY p.created_at DESC
LIMIT 50`,
      },

      ...(writeResults ? { write_results: writeResults } : {}),
    };

    console.log(`[link-orphans] Done. Adoptions: ${finalAdoptions.length}, New processes: ${newProcesses.length}, Clustered: ${clusteredCount}`);

    return createSuccessResponse(manifest);

  } catch (error) {
    console.error('[link-orphans] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse('linkage_error', msg, 500);
  }
});

function computeSizeDistribution(sizes: number[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const s of sizes) {
    const key = s <= 3 ? `${s}` : s <= 5 ? '4-5' : s <= 10 ? '6-10' : '11-20';
    dist[key] = (dist[key] || 0) + 1;
  }
  return dist;
}
