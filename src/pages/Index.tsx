import Header from "@/components/layout/Header";
import ScraperTest from "@/components/admin/ScraperTest";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="mb-4 text-4xl font-bold">SOU Policy Radar</h1>
          <p className="text-xl text-muted-foreground">
            Track and analyze Swedish legislative processes in real-time
          </p>
        </div>
        
        <div className="max-w-6xl mx-auto">
          <ScraperTest />
        </div>
      </main>
    </div>
  );
};

export default Index;
