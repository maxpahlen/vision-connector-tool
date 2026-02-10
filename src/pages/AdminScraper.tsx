import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScraperControls } from '@/components/admin/ScraperControls';
import { StateMachineTest } from '@/components/admin/StateMachineTest';
import { TimelineAgentV2Test } from '@/components/admin/TimelineAgentV2Test';
import { HeadDetectiveTest } from '@/components/admin/HeadDetectiveTest';
import { MetadataAgentTest } from '@/components/admin/MetadataAgentTest';
import { PropositionAgentTest } from '@/components/admin/PropositionAgentTest';
import { TaskQueueMonitor } from '@/components/admin/TaskQueueMonitor';
import { ProcessList } from '@/components/admin/ProcessList';
import { DocumentList } from '@/components/admin/DocumentList';
import { DocumentTextExtractor } from '@/components/admin/DocumentTextExtractor';
import { BatchTextExtractor } from '@/components/admin/BatchTextExtractor';
import CommitteeReportTextExtractor from '@/components/admin/CommitteeReportTextExtractor';
import { RemissvarTextExtractorTest } from '@/components/admin/RemissvarTextExtractorTest';
import { PropositionRiksdagenScraperTest } from '@/components/admin/PropositionRiksdagenScraperTest';
import { DirectiveRiksdagenScraperTest } from '@/components/admin/DirectiveRiksdagenScraperTest';
import { CommitteeReportsScraperTest } from '@/components/admin/CommitteeReportsScraperTest';
import { LawsScraperTest } from '@/components/admin/LawsScraperTest';
import { RemissIndexScraperTest } from '@/components/admin/RemissIndexScraperTest';
import { RemissDiscoveryDashboard } from '@/components/admin/RemissDiscoveryDashboard';
import { ProcessRemissPagesTest } from '@/components/admin/ProcessRemissPagesTest';
import { RemissEntityLinkerTest } from '@/components/admin/RemissEntityLinkerTest';
import { RemissvarStanceAnalyzerTest } from '@/components/admin/RemissvarStanceAnalyzerTest';
import { EntityMatchApprovalQueue } from '@/components/admin/EntityMatchApprovalQueue';
import { ValidationDashboard } from '@/components/admin/ValidationDashboard';
import {
  BarChart3,
  Download,
  FileText,
  Bot,
  Activity,
  Settings,
  Info,
} from 'lucide-react';

function RunOrderGuidance({ steps }: { steps: string[] }) {
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertDescription>
        <strong>Run order:</strong>{' '}
        {steps.map((step, i) => (
          <span key={i}>
            {i > 0 && ' → '}
            <span className="font-medium">{step}</span>
          </span>
        ))}
      </AlertDescription>
    </Alert>
  );
}

export default function AdminScraper() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Control Panel</h1>
        <p className="text-muted-foreground mt-2">
          Monitor and control the document processing pipeline
        </p>
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="scraping" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Scraping
          </TabsTrigger>
          <TabsTrigger value="extraction" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Extraction
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Agents
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Monitoring
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            System
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6 mt-6">
          <ValidationDashboard />
        </TabsContent>

        {/* Scraping Tab — All document ingestion */}
        <TabsContent value="scraping" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Document Ingestion</CardTitle>
              <CardDescription>
                Scrape and ingest documents from Riksdagen API, regeringen.se, and other sources
              </CardDescription>
            </CardHeader>
          </Card>

          <RunOrderGuidance
            steps={[
              'Scrape index pages',
              'Process remiss pages',
              'Extract text (Extraction tab)',
              'Run agents (Agents tab)',
            ]}
          />

          <div className="grid gap-6">
            <PropositionRiksdagenScraperTest />
            <DirectiveRiksdagenScraperTest />
            <CommitteeReportsScraperTest />
            <LawsScraperTest />
            <ScraperControls />
            <RemissIndexScraperTest />
            <RemissDiscoveryDashboard />
            <ProcessRemissPagesTest />
          </div>
        </TabsContent>

        {/* Extraction Tab — All text extraction */}
        <TabsContent value="extraction" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Text Extraction</CardTitle>
              <CardDescription>
                Extract raw text content from PDFs and HTML sources for all document types
              </CardDescription>
            </CardHeader>
          </Card>

          <RunOrderGuidance
            steps={[
              'Scan for missing content',
              'Run batch extraction (or single-doc for debugging)',
              'Verify in Monitoring tab',
            ]}
          />

          <div className="grid gap-6">
            <BatchTextExtractor />
            <DocumentTextExtractor />
            <CommitteeReportTextExtractor />
            <RemissvarTextExtractorTest />
          </div>
        </TabsContent>

        {/* Agents Tab — All AI analysis + entity linking */}
        <TabsContent value="agents" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Agents &amp; Entity Linking</CardTitle>
              <CardDescription>
                Run AI analysis agents, entity linking, and stance analysis on extracted documents
              </CardDescription>
            </CardHeader>
          </Card>

          <RunOrderGuidance
            steps={[
              'Ensure text extraction is complete',
              'Run timeline / metadata / head detective agents',
              'Run entity linking',
              'Run stance analysis',
              'Review entity matches',
            ]}
          />

          <div className="grid gap-6">
            <TimelineAgentV2Test />
            <HeadDetectiveTest />
            <MetadataAgentTest />
            <PropositionAgentTest />
            <RemissEntityLinkerTest />
            <RemissvarStanceAnalyzerTest />
            <EntityMatchApprovalQueue />
          </div>
        </TabsContent>

        {/* Monitoring Tab — Data browsing + task queues */}
        <TabsContent value="monitoring" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Monitoring &amp; Data Explorer</CardTitle>
              <CardDescription>
                Browse processes, documents, and monitor task queue status
              </CardDescription>
            </CardHeader>
          </Card>

          <div className="grid gap-6">
            <TaskQueueMonitor />
            <ProcessList />
            <DocumentList />
          </div>
        </TabsContent>

        {/* System Tab — Tests + diagnostics */}
        <TabsContent value="system" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>System &amp; Diagnostics</CardTitle>
              <CardDescription>
                System health, state machine validation, and configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>• Riksdagen API scrapers: Propositions, Directives, Committee Reports, Laws</p>
                <p>• Batch Text Extractor: Unified multi-type extraction</p>
                <p>• AI Agents: Timeline v2, Head Detective, Metadata, Proposition</p>
                <p>• Stance Analysis: Keyword + AI hybrid classifier</p>
              </div>
            </CardContent>
          </Card>

          <StateMachineTest />
        </TabsContent>
      </Tabs>
    </div>
  );
}
