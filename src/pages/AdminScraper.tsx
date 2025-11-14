import { ScraperControls } from '@/components/admin/ScraperControls';
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
        <ScraperControls />
        <TaskQueueMonitor />
        <ProcessList />
        <DocumentList />
      </div>
    </div>
  );
}
