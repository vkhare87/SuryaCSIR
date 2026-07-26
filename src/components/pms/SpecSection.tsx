import { DynamicTable } from './DynamicTable';
import { WordCountTextarea } from './WordCountTextarea';
import type { SectionSpec } from '../../lib/pms/annexureSpecs';

interface Props {
  spec: SectionSpec;
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}

export function SpecSection({ spec, data, onChange }: Props) {
  const str = (key: string): string => (data[key] as string) ?? '';
  const set = (key: string, value: string) => onChange({ ...data, [key]: value });

  return (
    <div className="space-y-4">
      {spec.hint && <p className="text-sm text-text-muted">{spec.hint}</p>}

      {spec.kind === 'table' && (
        <DynamicTable
          columns={spec.columns}
          rows={(data.items as Record<string, string>[]) ?? []}
          onChange={rows => onChange({ ...data, items: rows })}
        />
      )}

      {spec.kind === 'text' && (
        <WordCountTextarea
          value={str('text')}
          onChange={text => onChange({ ...data, text })}
          maxWords={spec.maxWords}
          rows={8}
        />
      )}

      {spec.kind === 'fields' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {spec.fields.map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-text-muted mb-1">{f.label}</label>
              <input
                type={f.type ?? 'text'}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
                value={str(f.key)}
                onChange={e => set(f.key, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      {spec.kind === 'prompts' && (
        <div className="space-y-5">
          {spec.prompts.map(p => (
            <div key={p.key}>
              <label className="block text-sm font-medium text-text mb-1">{p.label}</label>
              <WordCountTextarea
                value={str(p.key)}
                onChange={v => set(p.key, v)}
                maxWords={p.maxWords ?? 300}
                rows={p.rows ?? 5}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
