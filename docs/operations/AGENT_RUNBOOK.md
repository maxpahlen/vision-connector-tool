# Agent System Operational Runbook

**Version:** 2.0  
**Last Updated:** 2026-02-10  
**Audience:** Max (Head Developer), Lovable (Architectural Authority), Codex (Execution Coder)

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Admin UI Workflow Tabs](#admin-ui-workflow-tabs)
3. [Current Active Agents & Tools](#current-active-agents--tools)
4. [Verification Responsibilities](#verification-responsibilities)
5. [Monitoring](#monitoring)
6. [Common Issues & Solutions](#common-issues--solutions)
7. [Emergency Procedures](#emergency-procedures)
8. [Test Utilities](#test-utilities)

---

## System Overview

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Cron Scheduler                     │
└──────────────┬──────────────────────┬────────────────┘
               │                      │
               ▼                      ▼
    ┌──────────────────┐   ┌─────────────────────┐
    │ Head Detective   │   │ Task Queue          │
    │ (Daily at 2 AM)  │   │ (Every 10 minutes)  │
    └────────┬─────────┘   └──────────┬──────────┘
             │                        │
             ▼                        ▼
    ┌──────────────────┐   ┌─────────────────────┐
    │ Create Tasks:    │   │ Execute Tasks:      │
    │ - Timeline v2    │   │ - Timeline Agent v2 │
    │ - Metadata       │   │ - Metadata Agent    │
    └──────────────────┘   └─────────────────────┘
                                      │
                                      ▼
                            ┌─────────────────────┐
                            │ Update Database:    │
                            │ - timeline_events   │
                            │ - entities          │
                            │ - relations         │
                            │ - processes         │
                            └─────────────────────┘
```

### Components

| Component | Edge Function | Purpose |
|-----------|--------------|---------|
| **Head Detective** | `agent-head-detective` | Multi-agent orchestrator; finds candidates, delegates, updates stages |
| **Timeline Agent v2** | `agent-timeline-v2` | Extracts timeline events from SOUs |
| **Metadata Agent** | `agent-metadata` | Extracts entities (people, committees) and relations |
| **Task Queue** | `process-task-queue` | Async task execution (max 10/run, 1s delay between) |

### Document Pipeline Components

| Component | Edge Function | Purpose |
|-----------|--------------|---------|
| **SOU Scraper** | `scrape-sou-index` / `scrape-sou-metadata` | Discovers and scrapes SOU metadata |
| **Directive Scraper** | `scrape-directives-riksdagen` / `scrape-directive-metadata` | Discovers directives via Riksdagen API |
| **Proposition Scraper** | `scrape-propositions-riksdagen` / `scrape-proposition-index` | Discovers propositions |
| **Committee Report Scraper** | `scrape-committee-reports` | Discovers committee reports |
| **Law Scraper** | `scrape-laws` | Discovers laws |
| **Remiss Pipeline** | `scrape-remiss-index` / `process-remiss-pages` / `process-remissinstanser` | Remiss discovery + invitee extraction |
| **Text Extractors** | `process-sou-pdf` / `process-directive-pdf` / `process-proposition-pdf` / `process-committee-report-pdf` / `process-remissvar-pdf` / `process-directive-text` | PDF/text extraction per doc type |
| **Entity Linkers** | `link-invitee-entities` / `link-remissvar-entities` | Link organizations to entity records |
| **Stance Analyzer** | `analyze-remissvar-stance` / `classify-stance-ai` | Keyword + AI stance classification |
| **Reference Resolver** | `resolve-document-references` | Cross-document reference detection |

---

## Admin UI Workflow Tabs

The Admin page (`/admin/scraper`) is organized into 6 workflow tabs:

| Tab | Purpose | Key Components |
|-----|---------|---------------|
| **1. Dashboard** | Data health overview | Document counts, process status |
| **2. Scraping** | All document ingestion | SOU/Directive/Proposition/Committee/Law/Remiss scrapers |
| **3. Extraction** | All text processing | PDF extractors, batch text extraction |
| **4. Agents** | AI analysis & linking | Head Detective, Timeline v2, Metadata, Stance, Entity linking |
| **5. Monitoring** | Task queues & logs | Task queue monitor, validation dashboard |
| **6. System** | Testing & legacy tools | State machine test, org matcher test |

### Run Order Guidance

Each tab shows dependency badges. The general pipeline flow is:

```
Scrape index → Extract text → Run agents → Link entities → Analyze stance
```

---

## Current Active Agents & Tools

### Agents (AI-powered)

| Agent | Runs Via | AI Model | What It Does |
|-------|---------|----------|-------------|
| Head Detective | Cron (2 AM) or manual | N/A (orchestrator) | Finds candidate processes, delegates to specialists |
| Timeline Agent v2 | Task queue | OpenAI | Extracts publication dates with citations |
| Metadata Agent | Task queue | OpenAI | Extracts people + committees with dedup |
| Stance Classifier (AI) | Manual trigger | OpenAI | AI-based remissvar stance classification |

### Tools (Non-AI)

| Tool | Purpose |
|------|---------|
| Stance Analyzer | Keyword-based stance detection |
| Entity Linker (invitees) | Match invitee names → entity records |
| Entity Linker (remissvar) | Match response org names → entity records |
| Reference Resolver | Detect cross-document references |
| Process Stage Machine | Deterministic stage transitions |

---

## Verification Responsibilities

### Lovable-runs (DB/Architecture/Data-layer)

- ✅ Database migration verification
- ✅ RLS policy review
- ✅ Edge function deployment + log checks
- ✅ Task queue health monitoring (SQL queries)
- ✅ Agent output validation (entity quality, dedup)
- ✅ Data integrity checks (broken FK refs, orphaned records)
- ✅ Schema alignment with types.ts

### Codex-runs (App-level/UI/Build)

- ✅ Component rendering and interaction
- ✅ Admin UI tab navigation
- ✅ Search functionality
- ✅ Client-side error handling
- ✅ TypeScript compilation
- ✅ Route guards and auth flow

---

## Monitoring

### Key Health Queries

**Task status distribution (last 24h):**
```sql
SELECT status, COUNT(*) as count
FROM agent_tasks
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

**Alert thresholds:**
- ⚠️ Warning: `failed` > 10%
- 🚨 Critical: `failed` > 25%
- 🚨 Critical: `pending` tasks older than 2 hours

**Average execution time (last 7d):**
```sql
SELECT agent_name,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds,
  COUNT(*) as tasks
FROM agent_tasks
WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '7 days'
GROUP BY agent_name;
```

**Expected durations:**
- Timeline Agent: 3–5s
- Metadata Agent: 4–6s
- Head Detective: 8–12s

---

## Common Issues & Solutions

### High Failure Rate (>10%)

1. Check OpenAI API status
2. Review `agent_tasks.error_message` for patterns
3. If rate limits (429): slow cron frequency temporarily
4. If auth errors (401): verify `OPENAI_API_KEY` secret

### Slow Task Processing

1. Check if task queue cron is running
2. Check oldest pending tasks
3. Manually trigger: call `process-task-queue` edge function
4. If timing out: reduce batch size

### Duplicate Entities

1. Query for name duplicates in `entities`
2. Review fuzzy matching threshold (Levenshtein distance = 3)
3. Check entity stoplist for missing role titles
4. Manual merge: update `relations.source_id`, delete duplicate

### Missing Timeline Events

1. Check if process has SOU with `raw_content`
2. Review front matter (first 5000 chars)
3. Check for failed timeline tasks
4. Manual re-trigger: reset task status to `pending`

---

## Emergency Procedures

### OpenAI Quota Exceeded

1. Pause all cron jobs
2. Assess pending task backlog
3. Clear old pending tasks if backlog > 500
4. Wait for quota reset or upgrade tier

### Circuit Breaker Stuck Open

1. Check OpenAI status
2. Wait for auto-reset (60s)
3. If persists > 30 min: redeploy edge functions

---

## Test Utilities

These edge functions are **manual/dev-only** and not part of production workflows.

### test-org-matcher

**Purpose:** Unit tests for `organization-matcher.ts` (fuzzy name matching, normalization).

**When to use:** After modifying org matching logic, to verify thresholds, or to debug entity linking.

### test-stage-machine

**Purpose:** Unit tests for `process-stage-machine.ts` (state transitions, stage determination).

**When to use:** After modifying stage machine logic, to verify transition rules, or to debug process stage issues.

---

## Related Docs

| Doc | Location |
|-----|----------|
| Agent behaviors & limitations | `docs/operations/AGENT_BEHAVIORS.md` |
| Golden SOU test set | `docs/testing/golden-sou-test-set.md` |
| Scraper known issues | `docs/development/SCRAPER_KNOWN_ISSUES.md` |
| Master doc index | `docs/DOC_INDEX.md` |
