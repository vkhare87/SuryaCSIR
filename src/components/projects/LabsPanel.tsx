import { useState } from 'react';
import { Card, Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import { rupees } from '../../lib/projects/heads';
import { addIpAgreement, setLab, type LabMoney } from '../../lib/projects/labs';
import { uploadProjectDocument } from '../../lib/projects/projectFileApi';
import { friendlyError } from '../../lib/errors';

const inputCls = 'px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text';

// EP1: sanctioned · received · spent · balance per lab, the labs on the
// project, and the §6.2 IP agreement. PME edits; everyone who sees the
// project sees the table.
export function LabsPanel({ projectId, labs, ipMissing, isOffice, onChanged }: {
  projectId: string; labs: LabMoney[]; ipMissing: boolean; isOffice: boolean; onChanged: () => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [role, setRole] = useState<'NODAL' | 'PARTICIPATING'>('PARTICIPATING');
  const [rc, setRc] = useState<File | null>(null);
  const [ipFile, setIpFile] = useState<File | null>(null);
  const [signedOn, setSignedOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const multi = labs.length > 1;

  const run = async (fn: () => Promise<unknown>, done: () => void) => {
    setBusy(true); setError('');
    try { await fn(); done(); await onChanged(); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-text flex-1">Labs</h3>
        {ipMissing && <Badge variant="warning">No IP agreement on file (§6.2)</Badge>}
      </div>
      {multi ? (
        <table className="w-full text-sm">
          <thead className="text-xs text-text-muted"><tr>
            <th className="text-left py-1">Lab</th><th className="text-right">Sanctioned</th><th className="text-right">Received</th>
            <th className="text-right">Spent</th><th className="text-right">Balance</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {labs.map(l => (
              <tr key={l.lab_code}>
                <td className="py-1.5 text-text">{l.lab_code} {l.role && <span className="text-xs text-text-muted">· {l.role === 'NODAL' ? 'nodal' : 'participating'}</span>}</td>
                <td className="text-right font-mono">{rupees(l.sanctioned)}</td><td className="text-right font-mono">{rupees(l.received)}</td>
                <td className="text-right font-mono">{rupees(l.spent)}</td><td className="text-right font-mono">{rupees(l.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-sm text-text-muted">Single-lab project (AMPRI).</p>}

      {isOffice && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex flex-wrap gap-2 items-center">
            <input aria-label="Lab code" placeholder="Lab code, e.g. NML" value={code} onChange={e => setCode(e.target.value.toUpperCase())} className={`${inputCls} w-40`} />
            <select aria-label="Lab role" value={role} onChange={e => setRole(e.target.value as 'NODAL' | 'PARTICIPATING')} className={inputCls}>
              <option value="PARTICIPATING">Participating</option><option value="NODAL">Nodal</option>
            </select>
            <label className="text-xs text-text-muted">RC approval (PDF, optional)
              <input type="file" accept="application/pdf" onChange={e => setRc(e.target.files?.[0] ?? null)} className="block text-sm text-text" />
            </label>
            <Button variant="secondary" disabled={!code || busy} onClick={() => void run(async () => {
              const doc = rc ? await uploadProjectDocument(projectId, 'other', rc) : null;
              await setLab(projectId, code, role, doc?.id ?? null);
            }, () => { setCode(''); setRc(null); })}>Add lab</Button>
          </div>
          {multi && (
            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-xs text-text-muted">Signed IP agreement (PDF)
                <input type="file" accept="application/pdf" onChange={e => setIpFile(e.target.files?.[0] ?? null)} className="block text-sm text-text" />
              </label>
              <input type="date" aria-label="Signed on" value={signedOn} onChange={e => setSignedOn(e.target.value)} className={inputCls} />
              <Button variant="secondary" disabled={!ipFile || !signedOn || busy} onClick={() => void run(async () => {
                const doc = await uploadProjectDocument(projectId, 'other', ipFile as File);
                await addIpAgreement(projectId, doc.id, signedOn);
              }, () => { setIpFile(null); setSignedOn(''); })}>Record IP agreement</Button>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </Card>
  );
}
