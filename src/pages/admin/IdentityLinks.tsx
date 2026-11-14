import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, RefreshCw } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { Card, Badge } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { friendlyError } from '../../lib/errors';
import { personNamesMatch } from '../../utils/analytics';
import type { IdentityLinkGap } from '../../types';

const KIND_LABEL: Record<string, string> = {
  OUTPUT: 'Paper author',
  IP: 'IP inventor',
  'projects.PrincipalInvestigator': 'Project PI',
  'phd_students.SupervisorName': 'PhD supervisor',
  'phd_students.CoSupervisorName': 'PhD co-supervisor',
  'project_staff.StaffName': 'Project staff',
  'staff.user_id': 'Staff without a login',
};

export default function IdentityLinks() {
  const { staff, scientificOutputs, ipIntelligence, identityLinkGaps, setIdentityLink, runIdentityAutolink } = useData();
  const { push } = useToast();
  const [gaps, setGaps] = useState<IdentityLinkGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setGaps(await identityLinkGaps()); setError(''); }
    catch (err) { setError(friendlyError(err)); }
    finally { setLoading(false); }
  }, [identityLinkGaps]);

  useEffect(() => { void load(); }, [load]);

  // --- 1. Record titles for the author / inventor rows ---
  const titles = useMemo(() => new Map<string, string>([
    ...scientificOutputs.map(o => [`OUTPUT:${o.id}`, o.title] as [string, string]),
    ...ipIntelligence.map(i => [`IP:${i.id}`, i.title] as [string, string]),
  ]), [scientificOutputs, ipIntelligence]);

  // --- 2. Likely people for each name (same match the server counts) ---
  const candidates = useMemo(() => new Map(gaps.map(g => [
    `${g.kind}:${g.recordId}:${g.pos}`,
    staff.filter(s => personNamesMatch(s.Name, g.name)),
  ])), [gaps, staff]);

  const link = async (g: IdentityLinkGap, staffId: string) => {
    if (g.pos === null || !staffId) return;
    const key = `${g.kind}:${g.recordId}:${g.pos}`;
    setBusy(key);
    try {
      await setIdentityLink(g.kind as 'OUTPUT' | 'IP', g.recordId, g.pos, staffId);
      setGaps(prev => prev.filter(x => `${x.kind}:${x.recordId}:${x.pos}` !== key));
    } catch (err) { push(friendlyError(err), 'error'); }
    finally { setBusy(''); }
  };

  const autolink = async () => {
    setBusy('auto');
    try { push(`${await runIdentityAutolink()} names linked`, 'success'); await load(); }
    catch (err) { push(friendlyError(err), 'error'); }
    finally { setBusy(''); }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif flex items-center gap-3">
            <Link2 size={26} className="text-terracotta" /> People Links
          </h1>
          <p className="text-text-muted mt-1 text-sm font-medium">
            Names SURYA could not tie to one staff member. A name is linked by itself only when exactly one person carries it.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void autolink()} disabled={busy === 'auto'}>
          <RefreshCw size={14} className="mr-1.5 inline" /> Link unambiguous names
        </Button>
      </div>

      {error && <p className="text-sm text-badge-danger-fg">{error}</p>}

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-text-muted uppercase tracking-wide border-b border-border">
            <tr><th className="text-left px-6 py-3">Where</th><th className="text-left px-3 py-3">Name</th><th className="text-left px-3 py-3">Record</th><th className="text-left px-6 py-3">Who is it?</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {gaps.map((g, i) => {
              const key = `${g.kind}:${g.recordId}:${g.pos}`;
              const people = candidates.get(key) ?? [];
              return (
                <tr key={`${key}:${i}`}>
                  <td className="px-6 py-2"><Badge variant="neutral">{KIND_LABEL[g.kind] ?? g.kind}</Badge></td>
                  <td className="px-3 py-2 text-text">{g.name}</td>
                  <td className="px-3 py-2 text-xs text-text-muted">
                    <span className="font-mono">{g.recordId}</span>{titles.get(`${g.kind}:${g.recordId}`) ? ` · ${titles.get(`${g.kind}:${g.recordId}`)}` : ''}
                  </td>
                  <td className="px-6 py-2">
                    {g.pos === null ? (
                      <span className="text-xs text-text-muted">{g.candidates > 1 ? `${g.candidates} staff share this name — fix in Data Management` : 'Fix in Data Management'}</span>
                    ) : (
                      <select aria-label={`Staff member for ${g.name}`} disabled={busy === key} defaultValue=""
                        onChange={e => void link(g, e.target.value)}
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text">
                        <option value="" disabled>Choose…</option>
                        {people.map(s => <option key={s.ID} value={s.ID}>{s.Name} · {s.ID}{s.Division ? ` · ${s.Division}` : ''}</option>)}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && gaps.length === 0 && !error && (
              <tr><td colSpan={4} className="px-6 py-6 text-center text-text-muted">Nothing to decide. Every name is linked or external.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
