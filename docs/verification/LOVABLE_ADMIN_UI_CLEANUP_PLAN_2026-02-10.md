# Admin UI Cleanup Plan

**Date:** 2026-02-10  
**Author:** Lovable (Architectural Authority)  
**Message Type:** PROPOSAL | Phase: PROPOSAL

## Original Prompt (verbatim)

> Now that we have a more collected version of scraping and ingesting different types of documents (mainly using Riksdagen API), we should clean up the Admin UI to be clear and remove old pieces of technology no longer in use, move all the agent tasks to one singular tab, all the text extraction to one tab, all the scraping to one tab, and so on.

---

## 1. Current State Inventory

### Current Tab Structure (9 tabs)

| # | Tab | Components Rendered | Purpose |
|---|-----|-------------------|---------|
| 1 | **Validation** | `ValidationDashboard` | Data quality overview: doc counts, text coverage, timeline/entity coverage |
| 2 | **Riksdagen** | `PropositionRiksdagenScraperTest`, `DirectiveRiksdagenScraperTest` | Phase 6 Riksdagen API scrapers |
| 3 | **Parliament** | `CommitteeReportsScraperTest`, `CommitteeReportTextExtractor`, `LawsScraperTest` | Phase 5.4 committee reports + laws (mixes scraping AND extraction) |
| 4 | **Remisser** | `RemissDiscoveryDashboard`, `RemissvarTextExtractorTest`, `RemissvarStanceAnalyzerTest`, `RemissIndexScraperTest`, `ProcessRemissPagesTest`, `RemissEntityLinkerTest`, `EntityMatchApprovalQueue`, `SouUrlRepairTool`, `SouLagstiftningskedjaScraper`, `RemissScraperTest` | 10 components! Mixes scraping, extraction, linking, analysis, repair |
| 5 | **Propositions** | `PropositionScraperTest`, `PropositionTextExtractorTest`, `PropositionAgentTest` | Phase 5.2 pilot (old regeringen.se scraper) |
| 6 | **Batch** | `BatchTextExtractor`, `PropositionBatchProcessor` | Batch text extraction + proposition batch processing |
| 7 | **SOUs** | `DirectiveMetadataScraper`, `ScraperControls`, `StateMachineTest`, `DocumentTextExtractor`, `TimelineAgentV2Test`, `HeadDetectiveTest`, `MetadataAgentTest` | Original SOU pipeline (mixes scraping, extraction, agents, testing) |
| 8 | **Data** | `TaskQueueMonitor`, `ProcessList`, `DocumentList` | Data browsing + task queue |
| 9 | **System** | Static version info card | System status text |

### Component-by-Component Disposition

| Component | File | Lines | Workflow | Status | Recommendation |
|-----------|------|-------|----------|--------|---------------|
| `ValidationDashboard` | ValidationDashboard.tsx | 485 | QA/Monitoring | ✅ ACTIVE | **KEEP** — default tab |
| `PropositionRiksdagenScraperTest` | PropositionRiksdagenScraperTest.tsx | 196 | Scraping | ✅ ACTIVE | **MOVE** → Scraping tab |
| `DirectiveRiksdagenScraperTest` | DirectiveRiksdagenScraperTest.tsx | 198 | Scraping | ✅ ACTIVE | **MOVE** → Scraping tab |
| `CommitteeReportsScraperTest` | CommitteeReportsScraperTest.tsx | 178 | Scraping | ✅ ACTIVE | **MOVE** → Scraping tab |
| `LawsScraperTest` | LawsScraperTest.tsx | 233 | Scraping | ✅ ACTIVE | **MOVE** → Scraping tab |
| `RemissIndexScraperTest` | RemissIndexScraperTest.tsx | 366 | Scraping | ✅ ACTIVE | **MOVE** → Scraping tab |
| `ProcessRemissPagesTest` | ProcessRemissPagesTest.tsx | 288 | Scraping | ✅ ACTIVE | **MOVE** → Scraping tab |
| `ScraperControls` | ScraperControls.tsx | 100 | Scraping | ✅ ACTIVE | **MOVE** → Scraping tab |
| `SouLagstiftningskedjaScraper` | SouLagstiftningskedjaScraper.tsx | 291 | Scraping | ✅ ACTIVE | **MOVE** → Scraping tab |
| `BatchTextExtractor` | BatchTextExtractor.tsx | ~300 | Extraction | ✅ ACTIVE | **MOVE** → Extraction tab |
| `CommitteeReportTextExtractor` | CommitteeReportTextExtractor.tsx | 331 | Extraction | ✅ ACTIVE | **MOVE** → Extraction tab |
| `RemissvarTextExtractorTest` | RemissvarTextExtractorTest.tsx | 414 | Extraction | ✅ ACTIVE | **MOVE** → Extraction tab |
| `DocumentTextExtractor` | DocumentTextExtractor.tsx | 257 | Extraction | ✅ ACTIVE | **MOVE** → Extraction tab |
| `TimelineAgentV2Test` | TimelineAgentV2Test.tsx | 771 | Agent | ✅ ACTIVE | **MOVE** → Agents tab |
| `HeadDetectiveTest` | HeadDetectiveTest.tsx | 377 | Agent | ✅ ACTIVE | **MOVE** → Agents tab |
| `MetadataAgentTest` | MetadataAgentTest.tsx | 508 | Agent | ✅ ACTIVE | **MOVE** → Agents tab |
| `PropositionAgentTest` | PropositionAgentTest.tsx | 483 | Agent | ✅ ACTIVE | **MOVE** → Agents tab |
| `RemissvarStanceAnalyzerTest` | RemissvarStanceAnalyzerTest.tsx | 1133 | Agent/Analysis | ✅ ACTIVE | **MOVE** → Agents tab (includes StanceManualReview + KeywordSuggestionsManager) |
| `RemissEntityLinkerTest` | RemissEntityLinkerTest.tsx | 850 | Agent/Linking | ✅ ACTIVE | **MOVE** → Agents tab |
| `EntityMatchApprovalQueue` | EntityMatchApprovalQueue.tsx | 786 | Agent/Linking | ✅ ACTIVE | **MOVE** → Agents tab |
| `RemissDiscoveryDashboard` | RemissDiscoveryDashboard.tsx | 261 | Monitoring | ✅ ACTIVE | **MOVE** → Monitoring tab |
| `TaskQueueMonitor` | TaskQueueMonitor.tsx | 282 | Monitoring | ✅ ACTIVE | **MOVE** → Monitoring tab |
| `ProcessList` | ProcessList.tsx | 78 | Data Browse | ✅ ACTIVE | **MOVE** → Monitoring tab |
| `DocumentList` | DocumentList.tsx | 173 | Data Browse | ✅ ACTIVE | **MOVE** → Monitoring tab |
| `StateMachineTest` | StateMachineTest.tsx | 129 | System/Test | ✅ ACTIVE | **MOVE** → System tab |
| `PropositionScraperTest` | PropositionScraperTest.tsx | 207 | Scraping | ⚠️ LEGACY | **ARCHIVE** — superseded by `PropositionRiksdagenScraperTest` |
| `DirectiveMetadataScraper` | DirectiveMetadataScraper.tsx | 212 | Scraping | ⚠️ LEGACY | **ARCHIVE** — superseded by `DirectiveRiksdagenScraperTest` |
| `PropositionTextExtractorTest` | PropositionTextExtractorTest.tsx | 418 | Extraction | ⚠️ LEGACY | **ARCHIVE** — superseded by `BatchTextExtractor` |
| `PropositionBatchProcessor` | PropositionBatchProcessor.tsx | 531 | Batch | ⚠️ LEGACY | **ARCHIVE** — superseded by `BatchTextExtractor` |
| `RemissScraperTest` | RemissScraperTest.tsx | 251 | Scraping | ⚠️ LEGACY | **ARCHIVE** — SOU-linked remiss discovery, superseded by `RemissIndexScraperTest` |
| `SouUrlRepairTool` | SouUrlRepairTool.tsx | 355 | Repair | ⚠️ LEGACY | **ARCHIVE** — one-time repair tool, unlikely to be needed again |
| `IntegrationTest` | IntegrationTest.tsx | 755 | Testing | 🔴 UNUSED | **DELETE** — not rendered in AdminScraper, not imported anywhere active |
| `ScraperTest` | ScraperTest.tsx | 330 | Testing | 🔴 UNUSED | **DELETE** — not rendered in AdminScraper, not imported anywhere active |

### Not rendered in AdminScraper but exist as files:

| Component | Status | Recommendation |
|-----------|--------|---------------|
| `StanceManualReview` | Used inside `RemissvarStanceAnalyzerTest` | KEEP (child component) |
| `KeywordSuggestionsManager` | Used inside `RemissvarStanceAnalyzerTest` | KEEP (child component) |
| `IntegrationTest` | Not imported anywhere | DELETE |
| `ScraperTest` | Not imported anywhere | DELETE |

---

## 2. Proposed Information Architecture

### New Tab Model (6 workflow-based tabs)

| # | Tab Name | Icon | Purpose | Components |
|---|----------|------|---------|------------|
| 1 | **Dashboard** | `BarChart3` | Data quality overview, default landing | `ValidationDashboard` |
| 2 | **Scraping** | `Globe` | All document ingestion scrapers | `PropositionRiksdagenScraperTest`, `DirectiveRiksdagenScraperTest`, `CommitteeReportsScraperTest`, `LawsScraperTest`, `RemissIndexScraperTest`, `ProcessRemissPagesTest`, `ScraperControls` (SOU index), `SouLagstiftningskedjaScraper` |
| 3 | **Extraction** | `FileText` | All text extraction pipelines | `BatchTextExtractor`, `DocumentTextExtractor`, `CommitteeReportTextExtractor`, `RemissvarTextExtractorTest` |
| 4 | **Agents** | `Bot` | All AI agents + entity linking + stance analysis | `HeadDetectiveTest`, `TimelineAgentV2Test`, `MetadataAgentTest`, `PropositionAgentTest`, `RemissvarStanceAnalyzerTest` (includes Manual Review + Keywords), `RemissEntityLinkerTest`, `EntityMatchApprovalQueue` |
| 5 | **Monitoring** | `Database` | Data browsing, task queues, remiss discovery | `TaskQueueMonitor`, `RemissDiscoveryDashboard`, `ProcessList`, `DocumentList` |
| 6 | **System** | `Settings` | System info, state machine test, legacy tools (hidden by default) | `StateMachineTest`, version info card |

### Mapping: Old Tab → New Tab

| Old Tab | Old Components | New Tab |
|---------|---------------|---------|
| Validation | `ValidationDashboard` | **Dashboard** |
| Riksdagen | `PropositionRiksdagenScraperTest`, `DirectiveRiksdagenScraperTest` | **Scraping** |
| Parliament | `CommitteeReportsScraperTest` | **Scraping** |
| Parliament | `CommitteeReportTextExtractor` | **Extraction** |
| Parliament | `LawsScraperTest` | **Scraping** |
| Remisser | `RemissIndexScraperTest`, `ProcessRemissPagesTest`, `SouLagstiftningskedjaScraper` | **Scraping** |
| Remisser | `RemissvarTextExtractorTest` | **Extraction** |
| Remisser | `RemissvarStanceAnalyzerTest`, `RemissEntityLinkerTest`, `EntityMatchApprovalQueue` | **Agents** |
| Remisser | `RemissDiscoveryDashboard` | **Monitoring** |
| Remisser | `RemissScraperTest`, `SouUrlRepairTool` | **ARCHIVE** |
| Propositions | `PropositionScraperTest`, `PropositionTextExtractorTest` | **ARCHIVE** |
| Propositions | `PropositionAgentTest` | **Agents** |
| Batch | `BatchTextExtractor` | **Extraction** |
| Batch | `PropositionBatchProcessor` | **ARCHIVE** |
| SOUs | `ScraperControls` | **Scraping** |
| SOUs | `DocumentTextExtractor` | **Extraction** |
| SOUs | `TimelineAgentV2Test`, `HeadDetectiveTest`, `MetadataAgentTest` | **Agents** |
| SOUs | `DirectiveMetadataScraper` | **ARCHIVE** |
| SOUs | `StateMachineTest` | **System** |
| Data | `TaskQueueMonitor`, `ProcessList`, `DocumentList` | **Monitoring** |
| System | Version info | **System** |

### Default Tab: **Dashboard**

Rationale: First thing an operator wants to see is overall data health before running any pipelines.

---

## 3. Legacy/Superseded Technology Plan

### Components to Archive

| Component | Superseded By | Safe to Archive? |
|-----------|--------------|-----------------|
| `PropositionScraperTest` | `PropositionRiksdagenScraperTest` | ✅ Yes — Riksdagen API is primary source |
| `DirectiveMetadataScraper` | `DirectiveRiksdagenScraperTest` | ✅ Yes — metadata now comes from Riksdagen API |
| `PropositionTextExtractorTest` | `BatchTextExtractor` | ✅ Yes — batch tool handles all doc types |
| `PropositionBatchProcessor` | `BatchTextExtractor` | ✅ Yes — batch tool is unified replacement |
| `RemissScraperTest` | `RemissIndexScraperTest` + `ProcessRemissPagesTest` | ✅ Yes — SOU-linked approach superseded by index approach |
| `SouUrlRepairTool` | One-time repair tool | ✅ Yes — repair was completed |

### Components to Delete (unused, not rendered)

| Component | Reason |
|-----------|--------|
| `IntegrationTest` | Not imported or rendered anywhere |
| `ScraperTest` | Not imported or rendered anywhere |

### Archive-First Policy

1. **Phase B** moves legacy components to a `src/components/admin/_archive/` folder
2. Components remain in the codebase for 30 days safety window
3. After 30 days with no usage, delete in **Phase C**
4. If a hidden dependency is discovered during Phase B, move component back to active

### Rollback Strategy

- All changes are git-tracked; any archival can be reverted with `git checkout`
- No database or edge function changes are involved — this is purely UI reorganization
- If a legacy component is needed again, restore from `_archive/` folder

---

## 4. UX Clarity Improvements

### Duplicate Controls to Remove

| Duplicate | Keep | Remove |
|-----------|------|--------|
| `PropositionTextExtractorTest` (single-doc extraction) | `BatchTextExtractor` (handles all types) | `PropositionTextExtractorTest` |
| `PropositionBatchProcessor` (prop-only batch) | `BatchTextExtractor` (unified batch) | `PropositionBatchProcessor` |
| `PropositionScraperTest` (regeringen.se) | `PropositionRiksdagenScraperTest` (riksdagen.se) | `PropositionScraperTest` |

### Consolidation Opportunities

| Current | Proposed |
|---------|----------|
| `DocumentTextExtractor` (SOU/Dir single) + `BatchTextExtractor` (all types batch) | Keep both — different use cases (debug single vs batch all) |
| `RemissEntityLinkerTest` + `EntityMatchApprovalQueue` | Keep both in Agents — linker runs pipeline, queue reviews results |

### Run Order Guidance (per new tab)

Each tab should include a short guidance card at the top:

**Scraping tab:**
> Run order: 1) SOU Index → 2) Propositions (Riksdagen) → 3) Directives (Riksdagen) → 4) Committee Reports → 5) Laws → 6) Remiss Index → 7) Process Remiss Pages → 8) Lagstiftningskedja (optional)

**Extraction tab:**
> Run order: 1) Batch Text Extractor (handles all types) → 2) Use single-doc extractors only for debugging specific documents

**Agents tab:**
> Run order: 1) Head Detective (stage detection) → 2) Timeline Agent v2 → 3) Metadata Agent → 4) Proposition Agent → 5) Entity Linker → 6) Stance Analyzer → 7) Entity Match Approval Queue (review)

---

## 5. Execution Plan (Phased)

### Phase A: Non-Breaking Re-Grouping

**Scope:** Rewrite `AdminScraper.tsx` with new 6-tab layout, moving all active components to their workflow-based tabs. No components deleted.

**Changes:**
- Rewrite `AdminScraper.tsx` tab structure (6 tabs instead of 9)
- Add run-order guidance cards to each tab
- Remove legacy components from rendering (but keep imports/files)
- Estimated effort: Single file change (`AdminScraper.tsx`)

**Verification:**
- [ ] All 6 tabs render without errors
- [ ] Every active component is accessible in its new tab
- [ ] No component was accidentally removed from rendering
- [ ] Tab navigation works correctly
- [ ] Run-order guidance cards display correctly

### Phase B: Deprecation + Archival of Legacy Tools

**Scope:** Move archived components to `_archive/` folder. Delete truly unused components.

**Changes:**
- Create `src/components/admin/_archive/` directory
- Move 6 legacy components to `_archive/`:
  - `PropositionScraperTest.tsx`
  - `DirectiveMetadataScraper.tsx`
  - `PropositionTextExtractorTest.tsx`
  - `PropositionBatchProcessor.tsx`
  - `RemissScraperTest.tsx`
  - `SouUrlRepairTool.tsx`
- Delete 2 unused components:
  - `IntegrationTest.tsx`
  - `ScraperTest.tsx`
- Remove all unused imports from `AdminScraper.tsx`

**Verification:**
- [ ] Build compiles with no errors
- [ ] No broken imports
- [ ] All active tabs still functional
- [ ] Archived components accessible in `_archive/` folder

### Phase C: Final Cleanup (30 days after Phase B)

**Scope:** Delete archived components if no issues reported.

**Changes:**
- Delete `src/components/admin/_archive/` directory and contents
- Update documentation to remove references to deleted components

**Verification:**
- [ ] Build compiles
- [ ] No references to deleted files remain in codebase

---

## 6. Verification Plan

### Lovable-Runs (Data-Layer)

- [ ] No database changes needed (pure UI reorganization)
- [ ] No edge function changes needed
- [ ] No RLS changes needed

### Codex/Lovable-Runs (UI)

- [ ] `AdminScraper.tsx` compiles without errors
- [ ] All 6 tabs render and switch correctly
- [ ] Every active component renders in its correct tab
- [ ] No console errors on tab navigation
- [ ] Run-order guidance cards visible in Scraping, Extraction, Agents tabs
- [ ] Legacy components no longer rendered

### Capability Preservation Matrix

| Capability | Before (tab) | After (tab) | Status |
|------------|-------------|-------------|--------|
| Scrape propositions (Riksdagen) | Riksdagen | Scraping | ✅ |
| Scrape directives (Riksdagen) | Riksdagen | Scraping | ✅ |
| Scrape committee reports | Parliament | Scraping | ✅ |
| Scrape laws | Parliament | Scraping | ✅ |
| Scrape remiss index | Remisser | Scraping | ✅ |
| Process remiss pages | Remisser | Scraping | ✅ |
| Scrape SOU index | SOUs | Scraping | ✅ |
| Lagstiftningskedja scraper | Remisser | Scraping | ✅ |
| Batch text extraction (all types) | Batch | Extraction | ✅ |
| Committee report text extraction | Parliament | Extraction | ✅ |
| Remissvar text extraction | Remisser | Extraction | ✅ |
| SOU/Directive text extraction | SOUs | Extraction | ✅ |
| Head Detective | SOUs | Agents | ✅ |
| Timeline Agent v2 | SOUs | Agents | ✅ |
| Metadata Agent | SOUs | Agents | ✅ |
| Proposition Agent | Propositions | Agents | ✅ |
| Stance Analyzer + Manual Review + Keywords | Remisser | Agents | ✅ |
| Entity Linker | Remisser | Agents | ✅ |
| Entity Match Approval | Remisser | Agents | ✅ |
| Validation dashboard | Validation | Dashboard | ✅ |
| Task queue monitor | Data | Monitoring | ✅ |
| Remiss discovery dashboard | Remisser | Monitoring | ✅ |
| Process list | Data | Monitoring | ✅ |
| Document list | Data | Monitoring | ✅ |
| State machine test | SOUs | System | ✅ |
| System version info | System | System | ✅ |

---

## Tab Matrix Mockup

```
┌──────────────────────────────────────────────────────────┐
│  [Dashboard] [Scraping] [Extraction] [Agents] [Monitor] [System] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  SCRAPING TAB:                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 📋 Run order: SOU Index → Props → Dirs → ...    │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─── Riksdagen Propositions ───┐                       │
│  │ Session: [2024/25 ▼] Batch: [20] [Scrape]       │    │
│  └──────────────────────────────┘                       │
│  ┌─── Riksdagen Directives ─────┐                       │
│  │ Session: [2024/25 ▼] Batch: [20] [Scrape]       │    │
│  └──────────────────────────────┘                       │
│  ┌─── Committee Reports ────────┐                       │
│  ┌─── Laws ─────────────────────┐                       │
│  ┌─── Remiss Index ─────────────┐                       │
│  ┌─── Process Remiss Pages ─────┐                       │
│  ┌─── SOU Index Scraper ────────┐                       │
│  ┌─── Lagstiftningskedja ───────┐                       │
│                                                          │
│  EXTRACTION TAB:                                        │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 📋 Run Batch Extractor first, single-doc for     │    │
│  │    debugging only                                │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─── Batch Text Extractor (all types) ─────────┐      │
│  ┌─── Committee Report Extractor ───────────────┐      │
│  ┌─── Remissvar Text Extractor ─────────────────┐      │
│  ┌─── Single Document Extractor (debug) ────────┐      │
│                                                          │
│  AGENTS TAB:                                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 📋 Run order: Head Detective → Timeline →        │    │
│  │    Metadata → Proposition → Entity Linker →      │    │
│  │    Stance Analyzer → Approval Queue              │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─── Head Detective ──────────────────────────┐       │
│  ┌─── Timeline Agent v2 ──────────────────────┐       │
│  ┌─── Metadata Agent ─────────────────────────┐       │
│  ┌─── Proposition Agent ──────────────────────┐       │
│  ┌─── Stance Analyzer + Manual Review ────────┐       │
│  ┌─── Entity Linker ─────────────────────────┐       │
│  ┌─── Entity Match Approval Queue ───────────┐       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Success Criteria

- [x] Every current admin component has a disposition (keep/move/archive/delete)
- [ ] Admin UI structure is understandable by operation type
- [ ] Legacy tooling is clearly isolated or archived
- [ ] Text extraction tools are in one place
- [ ] Agent tools are in one place
- [ ] Scraping tools are in one place
- [ ] Plan is executable in small safe increments
- [ ] No loss of functionality in first pass

---

## Sign-Off

| Role | Name | Status | Date |
|------|------|--------|------|
| Proposer | Lovable | ✅ Complete | 2026-02-10 |
| Approver | Max | Pending | — |
| Executor | Lovable (Phase A) | Pending | — |
