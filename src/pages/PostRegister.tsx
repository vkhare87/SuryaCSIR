import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { ClipboardList, Upload } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { Card, Badge } from '../components/ui/Cards';
import { Button } from '../components/ui/Button';
import {
  createPost, fillPost, importCareerEvents, loadDivisionStrength, loadPosts, setPostState, vacatePost,
  type DivisionStrength, type PostState, type SanctionedPost,
} from '../lib/people/api';
import { careerRowsFromSheet } from '../lib/people/careers';
import { parseFileRaw } from '../utils/dataMigration';
import { friendlyError } from '../lib/errors';

const input = 'rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-terracotta/40';
const today = () => new Date().toISOString().slice(0, 10);
const STATE_BADGE: Record<PostState, 'success' | 'warning' | 'info' | 'neutral' | 'danger'> = {
  FILLED: 'success', VACANT: 'warning', ADVERTISED: 'info', ABEYANCE: 'neutral', ABOLISHED: 'neutral',
};

export default function PostRegister() {
  const { user } = useAuth();
  const { staff, divisions } = useData();
  const { push } = useToast();
  const canEdit = !!user && (user.roles.includes('HRAdmin') || user.roles.includes('MasterAdmin'));
  const [posts, setPosts] = useState<SanctionedPost[]>([]);
  const [strength, setStrength] = useState<DivisionStrength[]>([]);
  const [division, setDivision] = useState('');
  const [busy, setBusy] = useState(false);
  const [newPost, setNewPost] = useState({ code: '', group: 'IV', level: '', designation: '', discipline: '', division: '', category: '', sanctionRef: '' });
  const [action, setAction] = useState<{ id: string; kind: 'fill' | 'vacate' | 'state'; staffId: string; on: string; text: string; state: Exclude<PostState, 'FILLED'> } | null>(null);

  const reload = useCallback(() => {
    Promise.all([loadPosts(), loadDivisionStrength()])
      .then(([p, s]) => { setPosts(p); setStrength(s); })
      .catch(e => push(friendlyError(e), 'error'));
  }, [push]);
  useEffect(() => { reload(); }, [reload]);

  // --- 1. Derived lists ---
  const staffName = useMemo(() => new Map(staff.map(s => [s.ID, s.Name])), [staff]);
  const shown = useMemo(() => posts.filter(p => !division || p.division_code === division), [posts, division]);
  const totals = useMemo(() => strength.reduce((t, s) => ({ sanctioned: t.sanctioned + s.sanctioned, filled: t.filled + s.filled, vacant: t.vacant + s.vacant }),
    { sanctioned: 0, filled: 0, vacant: 0 }), [strength]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); push(done, 'success'); setAction(null); reload(); }
    catch (e) { push(friendlyError(e), 'error'); }
    finally { setBusy(false); }
  };

  const add = (e: FormEvent) => { e.preventDefault(); void run(() => createPost(newPost), `Post ${newPost.code} added`).then(() => setNewPost({ ...newPost, code: '' })); };

  const doAction = (e: FormEvent) => {
    e.preventDefault();
    if (!action) return;
    if (action.kind === 'fill') void run(() => fillPost(action.id, action.staffId, action.on, action.text), 'Post filled');
    else if (action.kind === 'vacate') void run(() => vacatePost(action.id, action.on, action.text, ''), 'Post vacated');
    else void run(() => setPostState(action.id, action.state, action.text), 'Post updated');
  };

  const importCareers = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const parsed = await parseFileRaw(file);
    if (!parsed.success) { push(parsed.error ?? 'Could not read the file', 'error'); return; }
    const { events, bad } = careerRowsFromSheet(parsed.data ?? []);
    if (bad.length) push(`${bad.length} row(s) skipped: ${bad.slice(0, 3).map(b => `row ${b.row} ${b.reason}`).join('; ')}`, 'warning');
    if (events.length) void run(async () => push(`${await importCareerEvents(events)} career event(s) loaded`, 'success'), 'Import finished');
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif flex items-center gap-3">
            <ClipboardList size={26} className="text-terracotta" /> Sanctioned Posts
          </h1>
          <p className="text-text-muted mt-1 text-sm">One row per sanctioned post. Strength on every page comes from here.</p>
        </div>
        {canEdit && (
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface text-sm text-text cursor-pointer hover:bg-surface-hover">
            <Upload size={14} /> Load career events (Excel / CSV)
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => void importCareers(e)} />
          </label>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-3">
        {[['Sanctioned', totals.sanctioned], ['Filled', totals.filled], ['Vacant', totals.vacant]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border bg-surface px-4 py-3">
            <dt className="text-[10px] uppercase tracking-wider text-text-muted">{k}</dt>
            <dd className="text-2xl font-mono tabular-nums text-text">{v}</dd>
          </div>
        ))}
      </dl>
      {posts.length === 0 && (
        <p className="text-sm text-text-muted">The register is empty. {canEdit ? 'Add each post from its sanction order below.' : 'HR enters each post from its sanction order.'}</p>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
          <h2 className="text-base font-[500] text-text font-serif flex-1">Posts</h2>
          <select aria-label="Division" value={division} onChange={e => setDivision(e.target.value)} className={input}>
            <option value="">All divisions</option>
            {strength.map(s => <option key={s.division_code} value={s.division_code}>{s.division_code} · {s.filled}/{s.sanctioned}</option>)}
          </select>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-text-muted"><tr>
            <th className="text-left px-5 py-2">Post</th><th className="text-left">Designation</th><th className="text-left">Division</th>
            <th className="text-left">State</th><th className="text-left">Holder / vacant since</th><th className="px-5" />
          </tr></thead>
          <tbody className="divide-y divide-border">
            {shown.map(p => (
              <tr key={p.id}>
                <td className="px-5 py-2 font-mono text-xs">{p.post_code}</td>
                <td className="text-text">{p.designation}{p.discipline ? <span className="text-text-muted"> · {p.discipline}</span> : null}</td>
                <td className="text-text-muted">{p.division_code ?? '—'}</td>
                <td><Badge variant={STATE_BADGE[p.state]}>{p.state.toLowerCase()}</Badge></td>
                <td className="text-text-muted text-xs">{p.holder_staff_id ? staffName.get(p.holder_staff_id) ?? p.holder_staff_id : p.vacant_since ? `since ${p.vacant_since}` : '—'}</td>
                <td className="px-5 text-right text-xs whitespace-nowrap">
                  {canEdit && p.state !== 'ABOLISHED' && (p.state === 'FILLED'
                    ? <button className="text-terracotta hover:underline" onClick={() => setAction({ id: p.id, kind: 'vacate', staffId: '', on: today(), text: '', state: 'VACANT' })}>Vacate</button>
                    : <>
                        <button className="text-terracotta hover:underline mr-3" onClick={() => setAction({ id: p.id, kind: 'fill', staffId: '', on: today(), text: '', state: 'VACANT' })}>Fill</button>
                        <button className="text-text-muted hover:underline" onClick={() => setAction({ id: p.id, kind: 'state', staffId: '', on: today(), text: '', state: 'ADVERTISED' })}>Change state</button>
                      </>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {action && (
        <Card className="p-4">
          <form onSubmit={doAction} className="flex flex-wrap gap-2 items-end">
            <p className="w-full text-sm text-text">{posts.find(p => p.id === action.id)?.post_code} — {action.kind === 'fill' ? 'fill' : action.kind === 'vacate' ? 'vacate' : 'change state'}</p>
            {action.kind === 'fill' && (
              <select aria-label="Staff member" required value={action.staffId} onChange={e => setAction({ ...action, staffId: e.target.value })} className={input}>
                <option value="">Who holds it…</option>
                {staff.map(s => <option key={s.ID} value={s.ID}>{s.Name} · {s.ID}</option>)}
              </select>
            )}
            {action.kind === 'state' && (
              <select aria-label="State" value={action.state} onChange={e => setAction({ ...action, state: e.target.value as Exclude<PostState, 'FILLED'> })} className={input}>
                {(['VACANT', 'ADVERTISED', 'ABEYANCE', 'ABOLISHED'] as const).map(s => <option key={s} value={s}>{s.toLowerCase()}</option>)}
              </select>
            )}
            {action.kind !== 'state' && <input type="date" aria-label="With effect from" required value={action.on} onChange={e => setAction({ ...action, on: e.target.value })} className={input} />}
            <input aria-label={action.kind === 'vacate' ? 'Reason' : 'Order'} required value={action.text} onChange={e => setAction({ ...action, text: e.target.value })}
              placeholder={action.kind === 'vacate' ? 'Reason: retirement, promotion, transfer…' : 'Order reference'} className={`${input} flex-1 min-w-48`} />
            <Button type="submit" disabled={busy}>Save</Button>
            <Button type="button" variant="ghost" onClick={() => setAction(null)}>Cancel</Button>
          </form>
        </Card>
      )}

      {canEdit && (
        <Card className="p-4">
          <h2 className="text-sm font-medium text-text mb-3">Add a post</h2>
          <form onSubmit={add} className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input required placeholder="Post code" value={newPost.code} onChange={e => setNewPost({ ...newPost, code: e.target.value })} className={input} />
            <input required placeholder="Group (IV, III …)" value={newPost.group} onChange={e => setNewPost({ ...newPost, group: e.target.value })} className={input} />
            <input placeholder="Pay level" value={newPost.level} onChange={e => setNewPost({ ...newPost, level: e.target.value })} className={input} />
            <input required placeholder="Designation" value={newPost.designation} onChange={e => setNewPost({ ...newPost, designation: e.target.value })} className={input} />
            <input placeholder="Discipline" value={newPost.discipline} onChange={e => setNewPost({ ...newPost, discipline: e.target.value })} className={input} />
            <select aria-label="Division" value={newPost.division} onChange={e => setNewPost({ ...newPost, division: e.target.value })} className={input}>
              <option value="">No division</option>
              {divisions.map(d => <option key={d.divCode} value={d.divCode}>{d.divCode} · {d.divName}</option>)}
            </select>
            <input placeholder="Category (UR, SC …)" value={newPost.category} onChange={e => setNewPost({ ...newPost, category: e.target.value })} className={input} />
            <input placeholder="Sanction order" value={newPost.sanctionRef} onChange={e => setNewPost({ ...newPost, sanctionRef: e.target.value })} className={input} />
            <div className="col-span-2 md:col-span-4 text-right"><Button type="submit" disabled={busy}>Add post</Button></div>
          </form>
        </Card>
      )}
    </div>
  );
}
