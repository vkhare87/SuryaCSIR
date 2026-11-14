import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { Card, Badge } from './ui/Cards';
import { Button } from './ui/Button';
import {
  backfillLegacy, checkEngagement, createSelection, engage, linkLegacy, loadEngagements, loadLegacyPending, loadPersons, savePerson,
  type LegacyPending, type PsEngagement, type PsPerson, type RuleCheck,
} from '../lib/people/api';
import { friendlyError } from '../lib/errors';

const input = 'rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-terracotta/40';
const blankPerson = { name: '', born_on: '', category: 'GEN', gender: '', phd_registered_on: '', thesis_submitted_on: '', abroad_last_5y: false, antecedents_verified_on: '' };
const blankSel = { projectId: '', position: '', mode: 'SELECTION', ncsRef: '', advertOn: '', chair: '', member1: '', member2: '', exigencyNote: '', waitlistUntil: '', from: '', to: '' };

/**
 * Project staff engaged by the §3.3 rules (PME and HR). Every rule is checked
 * before the engagement is recorded; the server refuses any that fails.
 */
export function ProjectEngagementsPanel() {
  const { projects } = useData();
  const { push } = useToast();
  const [persons, setPersons] = useState<PsPerson[]>([]);
  const [engagements, setEngagements] = useState<PsEngagement[]>([]);
  const [pending, setPending] = useState<LegacyPending[]>([]);
  const [personId, setPersonId] = useState('');
  const [p, setP] = useState(blankPerson);
  const [s, setS] = useState(blankSel);
  const [checks, setChecks] = useState<RuleCheck[] | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    Promise.all([loadPersons(), loadEngagements(), loadLegacyPending()])
      .then(([a, b, c]) => { setPersons(a); setEngagements(b); setPending(c); })
      .catch(e => push(friendlyError(e), 'error'));
  }, [push]);
  useEffect(() => { reload(); }, [reload]);

  const nameOf = useMemo(() => new Map(persons.map(x => [x.id, x.name])), [persons]);
  const projectName = useMemo(() => new Map(projects.map(x => [x.ProjectID, x.ProjectNo])), [projects]);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try { await fn(); if (done) push(done, 'success'); reload(); }
    catch (e) { push(friendlyError(e), 'error'); }
    finally { setBusy(false); }
  };

  // Save the person (new or edited), then check every rule for this engagement.
  const doCheck = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await savePerson(personId || null, {
        ...p, born_on: p.born_on || null, phd_registered_on: p.phd_registered_on || null,
        thesis_submitted_on: p.thesis_submitted_on || null, antecedents_verified_on: p.antecedents_verified_on || null,
      });
      setPersonId(id);
      setChecks(await checkEngagement(id, s.projectId, s.position, s.from, s.to, null));
      reload();
    } catch (err) { push(friendlyError(err), 'error'); }
    finally { setBusy(false); }
  };

  const doEngage = () => void run(async () => {
    const committee = [
      ...(s.chair ? [{ name: s.chair, role: 'CHAIR' as const }] : []),
      ...[s.member1, s.member2].filter(Boolean).map(name => ({ name, role: 'MEMBER' as const })),
    ];
    const selectionId = await createSelection({
      projectId: s.projectId, position: s.position, mode: s.mode, ncsRef: s.ncsRef, advertOn: s.advertOn || null,
      committee, exigencyNote: s.exigencyNote, waitlistUntil: s.waitlistUntil || null,
    });
    await engage(selectionId, personId, s.from, s.to);
    setChecks(null); setPersonId(''); setP(blankPerson); setS(blankSel);
  }, 'Engagement recorded');

  const pickPerson = (id: string) => {
    setPersonId(id);
    setChecks(null);
    const x = persons.find(y => y.id === id);
    setP(x ? {
      name: x.name, born_on: x.born_on ?? '', category: x.category ?? 'GEN', gender: x.gender ?? '', phd_registered_on: x.phd_registered_on ?? '',
      thesis_submitted_on: x.thesis_submitted_on ?? '', abroad_last_5y: x.abroad_last_5y, antecedents_verified_on: x.antecedents_verified_on ?? '',
    } : blankPerson);
  };

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <Card className="p-4 space-y-2">
          <h3 className="text-sm font-medium text-text">Older records to sort out ({pending.length})</h3>
          <p className="text-xs text-text-muted">Each name below is on more than one old row. If it is one person, link the rows; tenure then counts across projects.</p>
          <ul className="divide-y divide-border text-sm">
            {pending.map(r => (
              <li key={r.name_key} className="py-2 flex items-center justify-between gap-3">
                <span className="text-text">{r.names.join(' / ')} <span className="text-xs text-text-muted">· {r.projects.join(', ')}</span></span>
                <Button variant="secondary" disabled={busy} onClick={() => void run(() => linkLegacy(r.legacy_ids), 'Linked as one person')}>One person</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-medium text-text">Engage a person</h3>
          <Button variant="ghost" disabled={busy} onClick={() => void run(async () => push(`${await backfillLegacy()} older record(s) brought in`, 'success'))}>
            Bring in older records
          </Button>
        </div>
        <form onSubmit={e => void doCheck(e)} className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <select aria-label="Person" value={personId} onChange={e => pickPerson(e.target.value)} className={input}>
              <option value="">New person…</option>
              {persons.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <input required placeholder="Name" value={p.name} onChange={e => setP({ ...p, name: e.target.value })} className={input} />
            <label className="text-xs text-text-muted">Date of birth<input type="date" value={p.born_on} onChange={e => setP({ ...p, born_on: e.target.value })} className={`block w-full ${input}`} /></label>
            <select aria-label="Category" value={p.category} onChange={e => setP({ ...p, category: e.target.value })} className={input}>
              {['GEN', 'SC', 'ST', 'OBC', 'EWS', 'PwBD'].map(c => <option key={c}>{c}</option>)}
            </select>
            <select aria-label="Gender" value={p.gender} onChange={e => setP({ ...p, gender: e.target.value })} className={input}>
              <option value="">Gender…</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
            </select>
            <label className="text-xs text-text-muted">PhD registered<input type="date" value={p.phd_registered_on} onChange={e => setP({ ...p, phd_registered_on: e.target.value })} className={`block w-full ${input}`} /></label>
            <label className="text-xs text-text-muted">Thesis submitted<input type="date" value={p.thesis_submitted_on} onChange={e => setP({ ...p, thesis_submitted_on: e.target.value })} className={`block w-full ${input}`} /></label>
            <label className="text-xs text-text-muted flex items-center gap-2 mt-4">
              <input type="checkbox" checked={p.abroad_last_5y} onChange={e => setP({ ...p, abroad_last_5y: e.target.checked })} />Abroad in the last 5 years
            </label>
            {p.abroad_last_5y && (
              <label className="text-xs text-text-muted">Antecedents verified on<input type="date" value={p.antecedents_verified_on} onChange={e => setP({ ...p, antecedents_verified_on: e.target.value })} className={`block w-full ${input}`} /></label>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border-t border-border pt-3">
            <select aria-label="Project" required value={s.projectId} onChange={e => setS({ ...s, projectId: e.target.value })} className={input}>
              <option value="">Project…</option>
              {projects.map(x => <option key={x.ProjectID} value={x.ProjectID}>{x.ProjectNo} · {x.ProjectName}</option>)}
            </select>
            <input required placeholder="Position (JRF, SRF, PA-II …)" value={s.position} onChange={e => setS({ ...s, position: e.target.value })} className={input} />
            <select aria-label="How selected" value={s.mode} onChange={e => setS({ ...s, mode: e.target.value })} className={input}>
              <option value="SELECTION">Selection committee</option><option value="WAITLIST">From the waitlist</option><option value="DIRECT">Direct engagement</option>
            </select>
            {s.mode === 'SELECTION' && <input placeholder="NCS portal posting ref." value={s.ncsRef} onChange={e => setS({ ...s, ncsRef: e.target.value })} className={input} />}
            {s.mode !== 'DIRECT' && (
              <>
                <input placeholder="Committee chair" value={s.chair} onChange={e => setS({ ...s, chair: e.target.value })} className={input} />
                <input placeholder="Member" value={s.member1} onChange={e => setS({ ...s, member1: e.target.value })} className={input} />
                <input placeholder="Member" value={s.member2} onChange={e => setS({ ...s, member2: e.target.value })} className={input} />
                <label className="text-xs text-text-muted">Advertised on<input type="date" value={s.advertOn} onChange={e => setS({ ...s, advertOn: e.target.value })} className={`block w-full ${input}`} /></label>
              </>
            )}
            {s.mode === 'WAITLIST' && <label className="text-xs text-text-muted">Waitlist valid until<input type="date" value={s.waitlistUntil} onChange={e => setS({ ...s, waitlistUntil: e.target.value })} className={`block w-full ${input}`} /></label>}
            {s.mode === 'DIRECT' && <input placeholder="Why direct engagement (exigency)" value={s.exigencyNote} onChange={e => setS({ ...s, exigencyNote: e.target.value })} className={`${input} md:col-span-2`} />}
            <label className="text-xs text-text-muted">From<input type="date" required value={s.from} onChange={e => setS({ ...s, from: e.target.value })} className={`block w-full ${input}`} /></label>
            <label className="text-xs text-text-muted">To<input type="date" required value={s.to} onChange={e => setS({ ...s, to: e.target.value })} className={`block w-full ${input}`} /></label>
          </div>
          <Button type="submit" variant="secondary" disabled={busy}>Save person and check the rules</Button>
        </form>
        {checks && (
          <div className="border-t border-border pt-3 space-y-2">
            <ul className="text-sm space-y-1">
              {checks.map(c => (
                <li key={c.rule} className="flex items-start gap-2">
                  <Badge variant={c.ok === false ? 'danger' : c.ok ? 'success' : 'warning'}>{c.ok === false ? 'No' : c.ok ? 'Yes' : 'Unknown'}</Badge>
                  <span className="text-text">{c.detail}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-text-muted">The selection rules (quorum, NCS, waitlist, direct) are checked again with the selection when you engage.</p>
            <Button disabled={busy || checks.some(c => c.ok === false && c.rule !== 'selection')} onClick={doEngage}>Record selection and engage</Button>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <h3 className="px-5 py-3 border-b border-border text-sm font-medium text-text">Engagements ({engagements.length})</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-text-muted"><tr>
            <th className="text-left px-5 py-2">Person</th><th className="text-left">Project</th><th className="text-left">Position</th><th className="text-left px-5">Dates</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {engagements.map(e => (
              <tr key={e.id}>
                <td className="px-5 py-2 text-text">{nameOf.get(e.person_id) ?? '—'}</td>
                <td className="text-text-muted">{projectName.get(e.project_id) ?? e.project_id}</td>
                <td className="text-text-muted">{e.position_code}{!e.selection_id && <span className="text-xs"> · older record</span>}</td>
                <td className="px-5 font-mono text-xs">{e.from_on} → {e.to_on}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
