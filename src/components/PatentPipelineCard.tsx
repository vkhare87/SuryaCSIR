import { useMemo } from 'react';
import { FileBadge } from 'lucide-react';
import { Card } from './ui/Cards';
import { useData } from '../contexts/DataContext';
import { patentPipeline } from '../lib/intelligence/patents';

export function PatentPipelineCard() {
  const { ipIntelligence } = useData();
  const p = useMemo(() => patentPipeline(ipIntelligence), [ipIntelligence]);
  const stages = [
    { label: 'Filed', value: p.filed },
    { label: 'Published', value: p.published },
    { label: 'Granted', value: p.granted },
  ];
  const max = Math.max(p.filed, 1);
  return (
    <Card className="p-5 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
        <FileBadge className="h-4 w-4 text-text-muted" /> Patent pipeline
      </h3>
      {stages.map(s => (
        <div key={s.label} className="space-y-1">
          <div className="flex justify-between text-xs text-text-muted">
            <span>{s.label}</span><span>{s.value}</span>
          </div>
          <div className="h-2 rounded bg-surface-hover">
            <div className="h-2 rounded bg-brand-blue" style={{ width: `${(s.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
      <p className="text-xs text-text-muted">
        {p.medianMonthsToGrant !== null
          ? `Median filing → grant: ${p.medianMonthsToGrant} months`
          : 'No granted patents yet'}
      </p>
    </Card>
  );
}
