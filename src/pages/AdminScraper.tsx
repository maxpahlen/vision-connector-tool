import { ScraperControls } from '@/components/admin/ScraperControls';
import { StateMachineTest } from '@/components/admin/StateMachineTest';
import { TimelineAgentTest } from '@/components/admin/TimelineAgentTest';
import { TimelineAgentV2Test } from '@/components/admin/TimelineAgentV2Test';
import { HeadDetectiveTest } from '@/components/admin/HeadDetectiveTest';
import { MetadataAgentTest } from '@/components/admin/MetadataAgentTest';
import { IntegrationTest } from '@/components/admin/IntegrationTest';
import { TaskQueueMonitor } from '@/components/admin/TaskQueueMonitor';
import { ProcessList } from '@/components/admin/ProcessList';
import { DocumentList } from '@/components/admin/DocumentList';

export default function AdminScraper() {
  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Scraper Control Panel</h1>
        <p className="text-muted-foreground mt-2">
          Monitor and control the document scraping and extraction pipeline
        </p>
      </div>

      <div className="grid gap-6">
        <div className="grid gap-6 md:grid-cols-2">
          <ScraperControls />
          <StateMachineTest />
        </div>
        <IntegrationTest />
        <TimelineAgentV2Test />
        <TimelineAgentTest />
        <HeadDetectiveTest />
        <MetadataAgentTest />
        <TaskQueueMonitor />
        <ProcessList />
        <DocumentList />
      </div>
    </div>
  );
}
