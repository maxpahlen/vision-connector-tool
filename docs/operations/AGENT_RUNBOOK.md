# Agent System Operational Runbook

**Version:** 1.0  
**Last Updated:** 2025-11-27  
**Audience:** DevOps, Site Reliability Engineers

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Deployment](#deployment)
3. [Monitoring](#monitoring)
4. [Common Issues & Solutions](#common-issues--solutions)
5. [Performance Optimization](#performance-optimization)
6. [Scaling Considerations](#scaling-considerations)
7. [Cost Management](#cost-management)
8. [Emergency Procedures](#emergency-procedures)

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
    │ - Timeline       │   │ - Timeline Agent    │
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

**Head Detective** (`agent-head-detective`)
- **Purpose:** Orchestrator for specialist agents
- **Trigger:** Cron (daily 2 AM UTC) or manual API call
- **Responsibilities:**
  - Find candidate processes (has SOU, needs extraction)
  - Create or reuse Timeline Agent tasks
  - Create or reuse Metadata Agent tasks
  - Wait for both agents to complete
  - Update process stage based on evidence

**Task Queue** (`process-task-queue`)
- **Purpose:** Execute agent tasks asynchronously
- **Trigger:** Cron (every 10 minutes) or manual API call
- **Responsibilities:**
  - Fetch pending tasks (max 10 per run)
  - Execute tasks in priority order
  - Update task status (running → completed/failed)
  - Rate limit: 1 second between tasks

**Timeline Agent** (`agent-timeline`)
- **Purpose:** Extract publication dates from SOUs
- **Trigger:** Task queue (via `timeline_extraction` tasks)
- **Responsibilities:**
  - Extract `sou_published` event from front matter
  - Create timeline event with citation
  - Mark task as completed

**Metadata Agent** (`agent-metadata`)
- **Purpose:** Extract entities and relations
- **Trigger:** Task queue (via `metadata_extraction` tasks)
- **Responsibilities:**
  - Extract lead investigators, ministries, committees
  - Deduplicate entities via fuzzy matching
  - Create entity-process relations
  - Mark task as completed

---

## Deployment

### Prerequisites

- Supabase project with all migrations applied
- OpenAI API key configured as `OPENAI_API_KEY` secret
- PDF extraction service running (for Phase 2 data)

### Edge Function Deployment

All edge functions deploy automatically on git push to main branch.

**Manual deployment** (if needed):
```bash
supabase functions deploy agent-head-detective
supabase functions deploy agent-timeline
supabase functions deploy agent-metadata
supabase functions deploy process-task-queue
```

### Cron Configuration

**Setup via Supabase Dashboard:**

1. Navigate to Database → Cron Jobs (pg_cron extension)
2. Create cron jobs:

```sql
-- Head Detective: Daily at 2 AM UTC
SELECT cron.schedule(
  'head-detective-daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://[PROJECT_REF].supabase.co/functions/v1/agent-head-detective',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer [ANON_KEY]"}'::jsonb,
    body := '{"batch_mode": true}'::jsonb
  );
  $$
);

-- Task Queue: Every 10 minutes
SELECT cron.schedule(
  'task-queue-processor',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://[PROJECT_REF].supabase.co/functions/v1/process-task-queue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer [ANON_KEY]"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

**Verify cron jobs:**
```sql
SELECT * FROM cron.job;
```

**Check cron execution history:**
```sql
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 20;
```

---

## Monitoring

### Key Metrics to Track

#### Agent Tasks Table

**Monitor task status distribution:**
```sql
SELECT 
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM agent_tasks
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

**Expected healthy distribution:**
- `completed`: 80-95%
- `pending`: 5-15% (waiting for execution)
- `running`: 0-5% (actively processing)
- `failed`: <5%

**Alert Thresholds:**
- ⚠️  Warning: `failed` > 10%
- 🚨 Critical: `failed` > 25%
- 🚨 Critical: `pending` tasks older than 2 hours

#### Performance Metrics

**Average execution time:**
```sql
SELECT 
  agent_name,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds,
  COUNT(*) as task_count
FROM agent_tasks
WHERE status = 'completed'
  AND completed_at > NOW() - INTERVAL '7 days'
GROUP BY agent_name;
```

**Expected durations:**
- Timeline Agent: 3-5 seconds
- Metadata Agent: 4-6 seconds
- Head Detective: 8-12 seconds

**Alert Thresholds:**
- ⚠️  Warning: Duration > 2x baseline
- 🚨 Critical: Duration > 5x baseline

#### Cost Tracking

**Estimated OpenAI costs (last 24h):**
```sql
-- Approximation based on task counts
SELECT 
  agent_name,
  COUNT(*) * 0.04 as estimated_cost_usd
FROM agent_tasks
WHERE status = 'completed'
  AND completed_at > NOW() - INTERVAL '24 hours'
  AND agent_name IN ('agent-timeline', 'agent-metadata')
GROUP BY agent_name;
```

**Expected daily costs:**
- Timeline Agent: ~$2-5/day (50-125 documents)
- Metadata Agent: ~$3-6/day (50-125 documents)
- Total: ~$5-11/day (~$150-330/month)

**Alert Thresholds:**
- ⚠️  Warning: Daily cost > $20
- 🚨 Critical: Daily cost > $50

#### Error Rate

**Error distribution (last 24h):**
```sql
SELECT 
  agent_name,
  error_message,
  COUNT(*) as occurrences
FROM agent_tasks
WHERE status = 'failed'
  AND completed_at > NOW() - INTERVAL '24 hours'
GROUP BY agent_name, error_message
ORDER BY occurrences DESC;
```

---

## Common Issues & Solutions

### Issue: High Failure Rate (>10%)

**Symptoms:**
- Many tasks in `failed` status
- Error messages indicate OpenAI API issues
- Circuit breaker state showing `open`

**Diagnosis:**
1. Check OpenAI API status: https://status.openai.com/
2. Review error messages in `agent_tasks.error_message`
3. Check circuit breaker state via edge function logs

**Solutions:**

**If rate limit errors (429):**
```bash
# Check pending task backlog
SELECT COUNT(*) FROM agent_tasks WHERE status = 'pending';

# If > 100 pending, slow down cron frequency temporarily
SELECT cron.unschedule('task-queue-processor');
SELECT cron.schedule(
  'task-queue-processor',
  '*/30 * * * *',  -- Changed from 10 to 30 minutes
  $$ ... $$
);
```

**If API errors (500+):**
- Wait for OpenAI service recovery
- Circuit breaker will automatically reopen after 60 seconds
- No action needed unless outage persists > 1 hour

**If authentication errors (401):**
- Verify `OPENAI_API_KEY` secret is set correctly
- Check API key hasn't expired or been revoked
- Rotate key if compromised

### Issue: Slow Task Processing

**Symptoms:**
- Tasks stuck in `pending` for > 30 minutes
- Task queue execution taking > 5 minutes

**Diagnosis:**
```sql
-- Check oldest pending tasks
SELECT 
  id,
  task_type,
  created_at,
  NOW() - created_at as age
FROM agent_tasks
WHERE status = 'pending'
ORDER BY created_at
LIMIT 10;
```

**Solutions:**

**If task queue cron not running:**
```sql
-- Check last task queue execution
SELECT * FROM cron.job_run_details 
WHERE jobname = 'task-queue-processor'
ORDER BY start_time DESC 
LIMIT 5;
```

**If no recent executions, manually trigger:**
```bash
curl -X POST 'https://[PROJECT_REF].supabase.co/functions/v1/process-task-queue' \
  -H 'Authorization: Bearer [ANON_KEY]' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

**If executions timing out:**
- Reduce batch size in `process-task-queue` (default: 10)
- Increase cron frequency to distribute load

### Issue: Duplicate Entities Created

**Symptoms:**
- Same person/ministry appearing multiple times in `entities` table
- Entity names vary slightly (e.g., "Anna Svensson" vs "Anna Svenson")

**Diagnosis:**
```sql
-- Find potential duplicates
SELECT 
  name,
  COUNT(*) as count
FROM entities
GROUP BY name
HAVING COUNT(*) > 1
ORDER BY count DESC;
```

**Solutions:**

**If duplicates exist:**
1. Check Metadata Agent fuzzy matching logic (Levenshtein distance threshold)
2. Review entity stoplist for missing role titles
3. Manually merge duplicates:

```sql
-- Merge duplicate entities (example)
UPDATE relations 
SET source_id = '[correct_entity_id]'
WHERE source_id = '[duplicate_entity_id]';

DELETE FROM entities 
WHERE id = '[duplicate_entity_id]';
```

**If preventable duplicates:**
- Update Metadata Agent validation rules
- Add entries to entity stoplist
- Lower fuzzy matching threshold (currently 3)

### Issue: Missing Timeline Events

**Symptoms:**
- Processes stuck in `directive` stage despite having SOU
- Timeline Agent tasks completed but no events created

**Diagnosis:**
```sql
-- Find processes with SOU but no timeline event
SELECT 
  p.process_key,
  p.current_stage,
  p.title,
  d.doc_number,
  t.event_date
FROM processes p
LEFT JOIN documents d ON p.main_document_id = d.id
LEFT JOIN timeline_events t ON p.id = t.process_id AND t.event_type = 'sou_published'
WHERE d.doc_type = 'SOU'
  AND t.id IS NULL;
```

**Solutions:**

**If Timeline Agent didn't find evidence:**
- Review SOU front matter (first 5000 chars) in `documents.raw_content`
- Check if publication date is outside front matter
- Manual event creation if date is obvious:

```sql
INSERT INTO timeline_events (
  process_id,
  event_type,
  event_date,
  description,
  source_page,
  source_excerpt
) VALUES (
  '[process_id]',
  'sou_published',
  '2024-12-01',
  'Manual entry: SOU published (verified from PDF)',
  1,
  '[excerpt from PDF]'
);
```

**If Timeline Agent failed silently:**
- Check `agent_tasks` for failed timeline tasks
- Review error messages
- Re-trigger task:

```sql
UPDATE agent_tasks 
SET status = 'pending', error_message = NULL
WHERE id = '[task_id]';
```

---

## Performance Optimization

### Reduce Token Usage

**Current token consumption:**
- Timeline Agent: ~2000-3000 tokens/document
- Metadata Agent: ~3000-4000 tokens/document

**Optimization strategies:**

1. **Use smaller models for simple tasks:**
   - Change `DEFAULT_MODEL` to `gpt-4o-mini` for Timeline Agent
   - Estimated savings: 87% cost reduction

2. **Reduce prompt verbosity:**
   - Remove redundant examples from system prompts
   - Focus on core extraction rules only

3. **Implement prompt caching** (future):
   - Cache system prompts across requests
   - OpenAI prompt caching: 50% cost reduction

### Parallel Processing

**Current behavior:**
- Head Detective waits for Timeline Agent, then Metadata Agent
- Sequential execution: ~8-12 seconds total

**Optimization (future):**
- True parallel execution via Promise.all()
- Expected improvement: ~5-7 seconds total

### Batch Processing

**Current behavior:**
- Task queue processes 10 tasks per run (every 10 minutes)
- Each task processed sequentially with 1-second delay

**Optimization (future):**
- Increase batch size to 20 tasks
- Reduce cron frequency to 15 minutes
- Trade-off: Higher latency, lower overhead

---

## Scaling Considerations

### Current Limits

- **Throughput:** ~144 tasks/day (10 tasks/10 min × 144 intervals)
- **Max daily documents:** ~70-140 (Timeline + Metadata for each)
- **OpenAI rate limits:** 10,000 tokens/min (free tier), 2M tokens/min (paid tier)

### Scaling Strategies

**If processing > 200 documents/day:**

1. **Increase task queue frequency:**
   - From 10 minutes to 5 minutes
   - Doubles throughput capacity

2. **Increase batch size:**
   - From 10 to 20 tasks per run
   - Reduces overhead, improves efficiency

3. **Add dedicated agent instances:**
   - Separate Timeline and Metadata task queues
   - Parallel execution across agents

4. **Implement priority queues:**
   - High-priority: Recent SOUs
   - Low-priority: Historical backfill

**If hitting OpenAI rate limits:**

1. **Upgrade to paid tier:**
   - From 10K to 2M tokens/min
   - 200x capacity increase

2. **Implement request queueing:**
   - Rate limit at application level
   - Prevent 429 errors

3. **Switch to self-hosted LLM** (future):
   - Llama 3, Mistral, etc.
   - No rate limits, lower cost at scale

---

## Cost Management

### Current Cost Structure

**OpenAI Pricing (gpt-4o):**
- Input: $2.50 / 1M tokens
- Output: $10.00 / 1M tokens

**Average Cost per Document:**
- Timeline Agent: ~$0.02-0.04
- Metadata Agent: ~$0.03-0.05
- Total: ~$0.05-0.09 per complete analysis

**Monthly Projections:**
- 1000 documents: $50-90/month
- 5000 documents: $250-450/month
- 10000 documents: $500-900/month

### Cost Optimization

**1. Model Selection:**
- Use `gpt-4o-mini` for Timeline Agent: 87% cost reduction
- Keep `gpt-4o` for Metadata Agent (requires better reasoning)

**2. Prompt Optimization:**
- Remove redundant examples
- Focus on core extraction rules
- Target: 20-30% token reduction

**3. Batch Processing:**
- Process multiple documents in single API call (future)
- Amortize prompt overhead across documents

**4. Caching:**
- Implement result caching for repeated queries
- Skip re-extraction if document unchanged

**5. Budget Alerts:**
- Set daily budget: $20
- Set monthly budget: $400
- Pause processing if exceeded

---

## Emergency Procedures

### Emergency: OpenAI Quota Exceeded

**Symptoms:**
- All tasks failing with 429 errors
- Circuit breaker permanently open
- Daily budget exceeded

**Immediate Actions:**
1. Pause all cron jobs:
   ```sql
   SELECT cron.unschedule('head-detective-daily');
   SELECT cron.unschedule('task-queue-processor');
   ```

2. Assess pending task backlog:
   ```sql
   SELECT COUNT(*) FROM agent_tasks WHERE status = 'pending';
   ```

3. If backlog > 500, consider clearing old tasks:
   ```sql
   DELETE FROM agent_tasks 
   WHERE status = 'pending' 
     AND created_at < NOW() - INTERVAL '7 days';
   ```

4. Upgrade OpenAI tier or wait for quota reset
5. Resume cron jobs once quota available

### Emergency: Database Storage Full

**Symptoms:**
- Insert operations failing
- Supabase dashboard showing 100% storage

**Immediate Actions:**
1. Archive old timeline events:
   ```sql
   DELETE FROM timeline_events 
   WHERE created_at < NOW() - INTERVAL '1 year';
   ```

2. Archive old agent tasks:
   ```sql
   DELETE FROM agent_tasks 
   WHERE status IN ('completed', 'failed')
     AND completed_at < NOW() - INTERVAL '30 days';
   ```

3. Vacuum database:
   ```sql
   VACUUM FULL;
   ```

4. Upgrade storage tier if needed

### Emergency: Circuit Breaker Stuck Open

**Symptoms:**
- All requests blocked
- Error: "Circuit breaker is OPEN"
- Persists > 10 minutes

**Immediate Actions:**
1. This indicates sustained OpenAI API failures
2. Check OpenAI status: https://status.openai.com/
3. Wait for service recovery (circuit auto-resets after 60s)
4. If persists > 30 minutes, restart edge functions:
   ```bash
   supabase functions deploy agent-head-detective --no-verify-jwt
   supabase functions deploy agent-timeline --no-verify-jwt
   supabase functions deploy agent-metadata --no-verify-jwt
   ```

---

## Support Contacts

**OpenAI Support:**
- Status: https://status.openai.com/
- Support: https://help.openai.com/

**Supabase Support:**
- Status: https://status.supabase.com/
- Support: support@supabase.io

**Internal Team:**
- Phase Lead: [Name]
- On-Call Engineer: [Name]

---

## Appendix: Useful Queries

### Health Check Dashboard

```sql
-- Overall system health (last 24h)
SELECT 
  'Total Tasks' as metric,
  COUNT(*)::text as value
FROM agent_tasks
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
  'Completed' as metric,
  COUNT(*)::text as value
FROM agent_tasks
WHERE status = 'completed'
  AND completed_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
  'Failed' as metric,
  COUNT(*)::text as value
FROM agent_tasks
WHERE status = 'failed'
  AND completed_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
  'Avg Duration (s)' as metric,
  ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))))::text as value
FROM agent_tasks
WHERE status = 'completed'
  AND completed_at > NOW() - INTERVAL '24 hours';
```

### Cost Report (Monthly)

```sql
-- Estimated monthly cost by agent
SELECT 
  agent_name,
  COUNT(*) as tasks,
  COUNT(*) * 0.04 as estimated_cost_usd
FROM agent_tasks
WHERE status = 'completed'
  AND completed_at > DATE_TRUNC('month', NOW())
  AND agent_name IN ('agent-timeline', 'agent-metadata')
GROUP BY agent_name
ORDER BY estimated_cost_usd DESC;
```
