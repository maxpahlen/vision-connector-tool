import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, FileText, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

const pdfUrlSchema = z.object({
  pdfUrl: z.string()
    .trim()
    .url({ message: "Please enter a valid URL" })
    .refine((url) => url.toLowerCase().endsWith('.pdf'), {
      message: "URL must point to a PDF file"
    })
});

type PdfUrlForm = z.infer<typeof pdfUrlSchema>;

interface ExtractionResult {
  success: boolean;
  text?: string;
  metadata?: {
    pageCount?: number;
    textLength?: number;
    byteSize?: number;
  };
  error?: string;
}

const PdfTest = () => {
  const [isExtracting, setIsExtracting] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);

  const form = useForm<PdfUrlForm>({
    resolver: zodResolver(pdfUrlSchema),
    defaultValues: {
      pdfUrl: ""
    }
  });

  const onSubmit = async (data: PdfUrlForm) => {
    setIsExtracting(true);
    setResult(null);

    try {
      const { data: extractionData, error } = await supabase.functions.invoke('process-sou-pdf', {
        body: { pdfUrl: data.pdfUrl }
      });

      if (error) throw error;

      setResult(extractionData);
      
      if (extractionData.success) {
        toast.success("PDF extracted successfully");
      } else {
        toast.error(extractionData.error || "Extraction failed");
      }
    } catch (error: any) {
      console.error('Extraction error:', error);
      toast.error(error.message || "Failed to extract PDF");
      setResult({
        success: false,
        error: error.message || "Unknown error occurred"
      });
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">PDF Extraction Test</h1>
            <p className="text-muted-foreground">
              Test the PDF extraction service by providing a URL to a PDF document
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Extract PDF Content</CardTitle>
              <CardDescription>
                Enter a URL pointing to a publicly accessible PDF file
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="pdfUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>PDF URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://example.com/document.pdf"
                            {...field}
                            disabled={isExtracting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <Button type="submit" disabled={isExtracting} className="w-full">
                    {isExtracting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Extracting...
                      </>
                    ) : (
                      <>
                        <FileText className="mr-2 h-4 w-4" />
                        Extract PDF
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {result && (
            <Card>
              <CardHeader>
                <CardTitle>Extraction Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.success ? (
                  <>
                    {result.metadata && (
                      <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                        <div>
                          <p className="text-sm text-muted-foreground">Pages</p>
                          <p className="text-2xl font-bold">{result.metadata.pageCount || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Characters</p>
                          <p className="text-2xl font-bold">{result.metadata.textLength?.toLocaleString() || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Size</p>
                          <p className="text-2xl font-bold">
                            {result.metadata.byteSize 
                              ? `${(result.metadata.byteSize / 1024).toFixed(1)} KB`
                              : 'N/A'}
                          </p>
                        </div>
                      </div>
                    )}

                    {result.text && (
                      <div>
                        <h3 className="text-lg font-semibold mb-2">Extracted Text</h3>
                        <ScrollArea className="h-96 w-full rounded-md border p-4">
                          <pre className="text-sm whitespace-pre-wrap font-mono">
                            {result.text}
                          </pre>
                        </ScrollArea>
                      </div>
                    )}
                  </>
                ) : (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {result.error || "Failed to extract PDF content"}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default PdfTest;
