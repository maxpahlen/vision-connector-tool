import { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';

export default function NetworkHelpSection() {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-dashed">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm hover:bg-muted/50 transition-colors rounded-lg">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium">Vad visar nätverket?</span>
            {open ? (
              <ChevronUp className="h-4 w-4 ml-auto text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 text-sm text-muted-foreground space-y-3">
            <p>
              <strong className="text-foreground">Entitetsnätverket</strong> visualiserar hur organisationer
              och andra aktörer samverkar i statliga remissprocesser. Varje <strong className="text-foreground">nod</strong> (cirkel)
              representerar en entitet – t.ex. en myndighet, intresseorganisation eller kommitté.
              En <strong className="text-foreground">kant</strong> (linje) mellan två noder innebär att de har
              deltagit i samma remissrunda, antingen som inbjudna remissinstanser eller genom att ha lämnat remissvar.
            </p>

            <div className="space-y-2">
              <p className="font-medium text-foreground">Kontroller</p>
              <ul className="list-disc list-inside space-y-1.5">
                <li>
                  <strong>Min. styrka</strong> – Filtrerar bort svaga kopplingar. Styrkan beräknas med{' '}
                  <em>Jaccard-koefficienten</em> (0–1), som mäter andelen gemensamma remisser i förhållande
                  till totalt antal remisser respektive entitet deltar i. Högre värde = starkare samband.
                </li>
                <li>
                  <strong>Max noder</strong> – Begränsar antalet noder som visas (max 200). De noder
                  med flest kopplingar prioriteras.
                </li>
                <li>
                  <strong>Entitetstyper</strong> – Filtrera vilka typer av aktörer som visas. Typer
                  utan data i nuvarande dataset markeras med "(ingen data)".
                </li>
                <li>
                  <strong>Frys / Starta</strong> – Pausar eller startar fysiksimuleringen.
                  När layouten är frusen kan du fortfarande dra enskilda noder.
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">Statistik</p>
              <ul className="list-disc list-inside space-y-1.5">
                <li>
                  <strong>Noder</strong> – Antal entiteter (cirklar) som visas i grafen.
                </li>
                <li>
                  <strong>Kanter</strong> – Antal kopplingar (linjer) mellan entiteterna.
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">Interaktion</p>
              <ul className="list-disc list-inside space-y-1.5">
                <li>
                  <strong>Dra en nod</strong> – Klicka och dra för att flytta en enskild entitet.
                </li>
                <li>
                  <strong>Panorera</strong> – Klicka och dra på bakgrunden för att flytta hela vyn.
                </li>
                <li>
                  <strong>Zooma</strong> – Använd scrollhjulet för att zooma in och ut.
                </li>
                <li>
                  <strong>Klicka på en nod</strong> – Navigerar till entitetens detaljsida.
                </li>
              </ul>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
