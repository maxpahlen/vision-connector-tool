import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScraperControls } from '@/components/admin/ScraperControls';
import { StateMachineTest } from '@/components/admin/StateMachineTest';
import { TimelineAgentV2Test } from '@/components/admin/TimelineAgentV2Test';
import { HeadDetectiveTest } from '@/components/admin/HeadDetectiveTest';
import { MetadataAgentTest } from '@/components/admin/MetadataAgentTest';
import { TaskQueueMonitor } from '@/components/admin/TaskQueueMonitor';
import { ProcessList } from '@/components/admin/ProcessList';
import { DocumentList } from '@/components/admin/DocumentList';
import { DocumentTextExtractor } from '@/components/admin/DocumentTextExtractor';
import { PropositionScraperTest } from '@/components/admin/PropositionScraperTest';
import { PropositionTextExtractorTest } from '@/components/admin/PropositionTextExtractorTest';
import { PropositionAgentTest } from '@/components/admin/PropositionAgentTest';
import { PropositionBatchProcessor } from '@/components/admin/PropositionBatchProcessor';
import { PropositionRiksdagenScraperTest } from '@/components/admin/PropositionRiksdagenScraperTest';
import { DirectiveRiksdagenScraperTest } from '@/components/admin/DirectiveRiksdagenScraperTest';
import { RemissScraperTest } from '@/components/admin/RemissScraperTest';
import { RemissIndexScraperTest } from '@/components/admin/RemissIndexScraperTest';
import { RemissDiscoveryDashboard } from '@/components/admin/RemissDiscoveryDashboard';
import { ProcessRemissPagesTest } from '@/components/admin/ProcessRemissPagesTest';
import { RemissEntityLinkerTest } from '@/components/admin/RemissEntityLinkerTest';
import { RemissvarTextExtractorTest } from '@/components/admin/RemissvarTextExtractorTest';
import { RemissvarStanceAnalyzerTest } from '@/components/admin/RemissvarStanceAnalyzerTest';
import { EntityMatchApprovalQueue } from '@/components/admin/EntityMatchApprovalQueue';
import { SouLagstiftningskedjaScraper } from '@/components/admin/SouLagstiftningskedjaScraper';
import { SouUrlRepairTool } from '@/components/admin/SouUrlRepairTool';
import { DirectiveMetadataScraper } from '@/components/admin/DirectiveMetadataScraper';
import { ValidationDashboard } from '@/components/admin/ValidationDashboard';
import { CommitteeReportsScraperTest } from '@/components/admin/CommitteeReportsScraperTest';
import CommitteeReportTextExtractor from '@/components/admin/CommitteeReportTextExtractor';
import { LawsScraperTest } from '@/components/admin/LawsScraperTest';
import { FileText, Bot, Database, Settings, Play, FileSearch, BarChart3, Landmark, Globe } from 'lucide-react';

export default function AdminScraper() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Control Panel</h1>
        <p className="text-muted-foreground mt-2">
          Monitor and control the document processing pipeline
        </p>
      </div>

      <Tabs defaultValue="validation" className="w-full">
        <TabsList className="grid w-full grid-cols-9">
          <TabsTrigger value="validation" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Validation
          </TabsTrigger>
          <TabsTrigger value="riksdagen" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Riksdagen
          </TabsTrigger>
          <TabsTrigger value="parliament" className="flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            Parliament
          </TabsTrigger>
          <TabsTrigger value="remiss" className="flex items-center gap-2">
            <FileSearch className="h-4 w-4" />
            Remisser
          </TabsTrigger>
          <TabsTrigger value="propositions" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Propositions
          </TabsTrigger>
          <TabsTrigger value="batch" className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            Batch
          </TabsTrigger>
          <TabsTrigger value="sou" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            SOUs
          </TabsTrigger>
          <TabsTrigger value="data" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Data
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            System
          </TabsTrigger>
        </TabsList>

        {/* Validation Dashboard Tab - Phase Reset */}
        <TabsContent value="validation" className="space-y-6 mt-6">
          <ValidationDashboard />
        </TabsContent>

        {/* Riksdagen API Tab - Phase 6 */}
        <TabsContent value="riksdagen" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Phase 6: Riksdagen API Migration</CardTitle>
              <CardDescription>
                Migrate Propositions and Directives ingestion from regeringen.se to the structured riksdagen.se Open Data API.
                Target corpus: ~31,598 propositions + ~6,361 directives from historical archives.
              </CardDescription>
            </CardHeader>
          </Card>
          
          <div className="grid gap-6">
            <PropositionRiksdagenScraperTest />
            <DirectiveRiksdagenScraperTest />
          </div>
        </TabsContent>

        {/* Parliament Tab - Phase 5.4 */}
        <TabsContent value="parliament" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Phase 5.4: Committee Reports + Laws</CardTitle>
              <CardDescription>
                Scrape betänkanden (committee reports) and SFS (laws) from riksdagen.se Open Data API.
                Committee reports include proposition cross-references and parliament decision timeline events.
              </CardDescription>
            </CardHeader>
          </Card>
          
          <div className="grid gap-6">
            <CommitteeReportsScraperTest />
            <CommitteeReportTextExtractor />
            <LawsScraperTest />
          </div>
        </TabsContent>

        {/* Remisser Tab - Phase 5.3 */}
        <TabsContent value="remiss" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Phase 5.3: Remisser + Remissvar</CardTitle>
              <CardDescription>
                Primary strategy: Scrape remiss index → Match to SOUs by title. 
                Secondary (limited): Find remiss links via SOU Lagstiftningskedja.
              </CardDescription>
            </CardHeader>
          </Card>
          
          <RemissDiscoveryDashboard />
          <RemissvarTextExtractorTest />
          <RemissvarStanceAnalyzerTest />
          <RemissIndexScraperTest />
          <ProcessRemissPagesTest />
          <RemissEntityLinkerTest />
          <EntityMatchApprovalQueue />
          <SouUrlRepairTool />
          <SouLagstiftningskedjaScraper />
          <RemissScraperTest />
        </TabsContent>

        {/* Propositions Tab - Phase 5.2 Pilot Focus */}
        <TabsContent value="propositions" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Phase 5.2: Proposition Pipeline (Pilot)</CardTitle>
              <CardDescription>
                Manual testing for pilot propositions: scraping, text extraction, and agent analysis
              </CardDescription>
            </CardHeader>
          </Card>
          
          <div className="grid gap-6">
            <PropositionScraperTest />
            <PropositionTextExtractorTest />
            <PropositionAgentTest />
          </div>
        </TabsContent>

        {/* Batch Processing Tab */}
        <TabsContent value="batch" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Batch Processing</CardTitle>
              <CardDescription>
                Process propositions in batches of 5: text extraction → process setup → Timeline Agent → Metadata Agent
              </CardDescription>
            </CardHeader>
          </Card>
          
          <PropositionBatchProcessor />
        </TabsContent>

        {/* SOU & Directives Tab */}
        <TabsContent value="sou" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>SOU & Directive Processing</CardTitle>
              <CardDescription>
                Original pipeline for Swedish Government Official Reports and directives
              </CardDescription>
            </CardHeader>
          </Card>
          
          <div className="grid gap-6">
            <DirectiveMetadataScraper />
            <div className="grid gap-6 md:grid-cols-2">
              <ScraperControls />
              <StateMachineTest />
            </div>
            <DocumentTextExtractor />
            <TimelineAgentV2Test />
            <HeadDetectiveTest />
            <MetadataAgentTest />
          </div>
        </TabsContent>

        {/* Data Explorer Tab */}
        <TabsContent value="data" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Data Explorer</CardTitle>
              <CardDescription>
                Browse processes, documents, and monitor task queues
              </CardDescription>
            </CardHeader>
          </Card>
          
          <div className="grid gap-6">
            <TaskQueueMonitor />
            <ProcessList />
            <DocumentList />
          </div>
        </TabsContent>

        {/* System Tab */}
        <TabsContent value="system" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>System Status</CardTitle>
              <CardDescription>
                System health, configuration, and diagnostics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                <p>• Remiss Scraper: v5.3.0 (SOU-linked remisser)</p>
                <p>• Metadata Agent: v2.2.0 (proposition-aware)</p>
                <p>• Timeline Agent: v2.2 (proposition events)</p>
                <p>• Proposition Scraper: v5.2.4 (diagnostic logging)</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
