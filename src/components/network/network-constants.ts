export const TYPE_COLORS: Record<string, string> = {
  organization: 'hsl(210, 70%, 50%)',
  person: 'hsl(140, 60%, 45%)',
  committee: 'hsl(30, 80%, 55%)',
  government_body: 'hsl(260, 50%, 55%)',
  political_party: 'hsl(0, 65%, 55%)',
};

export const TYPE_LABELS: Record<string, string> = {
  organization: 'Organisation',
  person: 'Person',
  committee: 'Kommitté',
  government_body: 'Myndighet',
  political_party: 'Politiskt parti',
};

export function getNodeColor(type: string): string {
  return TYPE_COLORS[type] ?? 'hsl(var(--muted-foreground))';
}

export function getNodeRadius(degree: number, maxDegree: number): number {
  const min = 4;
  const max = 20;
  if (maxDegree === 0) return min;
  return min + ((degree / maxDegree) * (max - min));
}
