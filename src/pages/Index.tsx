import Header from "@/components/layout/Header";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="mb-4 text-4xl font-bold">SOU Policy Radar</h1>
          <p className="text-xl text-muted-foreground">
            Track and analyze Swedish legislative processes in real-time
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Database foundation is ready. Next: Data ingestion pipeline and AI agents.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Index;
