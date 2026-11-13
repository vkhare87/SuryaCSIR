import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Mail, Phone, MapPin, Award, BookOpen, ChevronRight, GitBranch, FileText, TrendingUp, Edit, FileDown, AlertCircle,
} from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../contexts/ProfileContext';
import { useToast } from '../contexts/ToastContext';
import { Card, Badge } from '../components/ui/Cards';
import { Button } from '../components/ui/Button';
import { DocumentPanel } from '../components/ui/DocumentPanel';
import { Dossier } from '../components/layout/Dossier';
import { RelatedRail } from '../components/RelatedRail';
import { StaffFormModal } from '../components/StaffFormModal';
import ScientistProfile from '../components/ScientistProfile';
import { useCanEdit } from '../lib/permissions/canEdit';
import { getRetirementDate, formatDate, getAgeFromDOB, getServiceYears, getYearsInGrade, diffInDays } from '../utils/dateUtils';
import { buildScientistDossier } from '../lib/scientist/dossier';
import { buildScientistBrief } from '../lib/scientist/brief';
import { factYears, groupFacts, isExternalLink, OWN_PROFILE_FIELDS, type OwnProfileField } from '../lib/staff/profile';
import { friendlyError } from '../lib/errors';
import { ScoreHistoryCard } from '../components/pms/ScoreHistoryCard';
import { ExpertisePanel } from '../components/ExpertisePanel';
import { useBack } from '../utils/useBack';
import type { ProfileFact, ProfileIssue, StaffMember } from '../types';

const TRAJECTORY_FLAG_LABEL: Record<string, string> = {
  'output-rising': 'Output rising',
  'output-flat': 'Output flat',
  'output-declining': 'Output declining',
  'new-collaboration-cluster': 'New collaboration cluster',
  'supervision-load-up': 'High supervision load',
  'budget-overrun-history': 'Budget overrun history',
  'duty-days-below-90-candidate': 'Duty days below 90 — check rule',
};

const FIELD_LABEL: Record<OwnProfileField, string> = {
  Expertise: 'Specific expertise', CoreArea: 'Core area', Ext: 'Phone extension', orcid: 'ORCID iD', VidwanID: 'Vidwan ID',
};

const today = () => new Date().toISOString().slice(0, 10);
const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-terracotta/40';

// --- 1. The record, one line per fact, each opening what it came from ---
function FactLink({ f }: { f: ProfileFact }) {
  const body = (
    <>
      <div className="min-w-0">
        <p className="text-sm text-text truncate group-hover:text-terracotta" title={f.title}>{f.title}</p>
        {f.role && <p className="text-xs text-text-muted truncate">{f.role}</p>}
      </div>
      <span className="font-mono tabular-nums text-xs text-text-muted shrink-0">{factYears(f)}</span>
    </>
  );
  const cls = 'flex items-center justify-between gap-4 px-5 py-3 hover:bg-surface-hover transition-colors group';
  return isExternalLink(f.link)
    ? <a href={f.link} target="_blank" rel="noreferrer" className={cls}>{body}</a>
    : <Link to={f.link} className={cls}>{body}</Link>;
}

function RecordTab({ facts, error }: { facts: ProfileFact[] | null; error: string }) {
  if (error) return <p className="text-sm text-badge-danger-fg">{error}</p>;
  if (!facts) return <p className="text-sm text-text-muted">Loading the record…</p>;
  const groups = groupFacts(facts);
  if (groups.length === 0) return <p className="text-sm text-text-muted">No linked records yet. Names not yet tied to this person are listed under People Links.</p>;
  return (
    <>
      {groups.map(g => (
        <Card key={g.key} className="p-0 overflow-hidden">
          <h3 className="px-5 py-3 border-b border-border text-base font-[500] text-text font-serif">{g.label} ({g.facts.length})</h3>
          <div className="divide-y divide-border">
            {g.facts.map((f, i) => <FactLink key={`${f.recordType}:${f.recordId}:${i}`} f={f} />)}
          </div>
        </Card>
      ))}
    </>
  );
}

// --- 2. The person's own fields and the items to confirm (own profile only) ---
function OwnProfileForm({ member, onSaved }: { member: StaffMember; onSaved: () => void }) {
  const { updateOwnProfile } = useProfile();
  const { refreshData } = useData();
  const { push } = useToast();
  const initial = useMemo(() => Object.fromEntries(OWN_PROFILE_FIELDS.map(k => [k, String(member[k] ?? '')])) as Record<OwnProfileField, string>, [member]);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = OWN_PROFILE_FIELDS.some(k => form[k] !== initial[k]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateOwnProfile(Object.fromEntries(OWN_PROFILE_FIELDS.filter(k => form[k] !== initial[k]).map(k => [k, form[k]])));
      await refreshData();
      push('Profile saved', 'success');
      onSaved();
    } catch (err) { push(friendlyError(err), 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Card>
      <h3 className="text-lg font-[500] mb-1 text-text font-serif">Your research fields</h3>
      <p className="text-xs text-text-muted mb-4">You keep these current. Everything else on this page comes from the institute's records.</p>
      <form onSubmit={e => void save(e)} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {OWN_PROFILE_FIELDS.map(k => (
          <label key={k} className={k === 'Expertise' ? 'text-xs text-text-muted md:col-span-2' : 'text-xs text-text-muted'}>
            {FIELD_LABEL[k]}
            {k === 'Expertise'
              ? <textarea className={input} rows={3} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} />
              : <input className={input} value={form[k]} placeholder={k === 'orcid' ? '0000-0002-1825-0097' : ''} onChange={e => setForm({ ...form, [k]: e.target.value })} />}
          </label>
        ))}
        <div className="md:col-span-2 text-right"><Button type="submit" disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save'}</Button></div>
      </form>
    </Card>
  );
}

function IssuesCard({ member, issues, onChanged }: { member: StaffMember; issues: ProfileIssue[]; onChanged: () => void }) {
  const { setIdentityLink } = useData();
  const { push } = useToast();
  if (issues.length === 0) return null;
  const claim = async (i: ProfileIssue) => {
    const [outputId, pos] = i.recordRef.split(':');
    try { await setIdentityLink('OUTPUT', outputId, Number(pos), member.ID); push('Added to your record', 'success'); onChanged(); }
    catch (err) { push(friendlyError(err), 'error'); }
  };
  return (
    <Card className="border-l-4 border-l-turmeric">
      <h3 className="text-lg font-[500] mb-1 text-text font-serif flex items-center gap-2"><AlertCircle size={18} className="text-turmeric" /> To confirm ({issues.length})</h3>
      <p className="text-xs text-text-muted mb-3">Where your profile and the records disagree. Claim what is yours; ask HR for the rest.</p>
      <ul className="divide-y divide-border">
        {issues.map(i => (
          <li key={`${i.kind}:${i.recordRef}`} className="py-2 flex items-center justify-between gap-3 text-sm">
            <span className="text-text">{i.detail}</span>
            {i.kind === 'OUTPUT_AUTHOR_UNLINKED' && <Button variant="secondary" onClick={() => void claim(i)}>This is me</Button>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function StaffDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const goBack = useBack('/staff');
  const canEdit = useCanEdit('hr');
  const { user } = useAuth();
  const { loadFacts, loadIssues } = useProfile();
  const { push } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [facts, setFacts] = useState<ProfileFact[] | null>(null);
  const [factsError, setFactsError] = useState('');
  const [issues, setIssues] = useState<ProfileIssue[]>([]);
  const { staff, divisions, projects, projectStaff, phDStudents, scientificOutputs, ipIntelligence, equipment, techTransfers, mous } = useData();

  const member = useMemo(() => staff.find(s => s.ID === id), [staff, id]);
  const isOwn = Boolean(member?.user_id && user?.id && member.user_id === user.id);

  // --- 3. Load the person's record and, for them or HR, what to confirm ---
  // Keyed on the id, not the member object: a data refresh must not refetch,
  // and going from one person to the next must never show the first one's
  // record under the second one's name.
  const memberId = member?.ID;
  const shown = useRef<string | undefined>(undefined);
  const reload = useCallback(() => {
    if (!memberId) return;
    if (shown.current !== memberId) { setFacts(null); setIssues([]); }
    shown.current = memberId;
    const current = () => shown.current === memberId;
    loadFacts(memberId).then(f => { if (current()) { setFacts(f); setFactsError(''); } })
      .catch(e => { if (current()) setFactsError(friendlyError(e)); });
    if (isOwn || canEdit) loadIssues(memberId).then(i => { if (current()) setIssues(i); }).catch(() => { if (current()) setIssues([]); });
  }, [memberId, isOwn, canEdit, loadFacts, loadIssues]);
  useEffect(() => { reload(); }, [reload]);

  const dossier = useMemo(() => id ? buildScientistDossier({
    staffId: id, staff, projects, projectStaff, phDStudents, scientificOutputs, ipIntelligence, equipment, techTransfers, mous,
  }) : null, [id, staff, projects, projectStaff, phDStudents, scientificOutputs, ipIntelligence, equipment, techTransfers, mous]);

  const numbers = useMemo(() => {
    const f = facts ?? [];
    const n = (s: ProfileFact['section']) => f.filter(x => x.section === s).length;
    return [
      { label: 'Active projects', value: f.filter(x => x.section === 'PROJECT' && (!x.dateTo || x.dateTo >= today())).length },
      { label: 'Publications', value: n('OUTPUT') },
      { label: 'PhD students', value: n('STUDENT') },
      { label: 'Patents & IP', value: n('IP') },
      { label: 'Instruments', value: n('EQUIPMENT') },
    ];
  }, [facts]);

  const rail = useMemo(() => [
    { title: 'Projects', kind: 'project' as const, ids: [...new Set((facts ?? []).filter(f => f.section === 'PROJECT').map(f => f.recordId))] },
  ], [facts]);

  if (!member) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <p className="text-text-muted mb-4">Staff member not found.</p>
        <Button onClick={() => navigate('/staff')} variant="secondary">Go Back</Button>
      </div>
    );
  }

  const division = divisions.find(d => d.divCode === member.Division);
  const reportsTo = member.ReportingID ? staff.find(s => s.ID === member.ReportingID) : null;
  const directReports = staff.filter(s => s.ReportingID === member.ID && s.ID !== member.ID);
  const age = getAgeFromDOB(member.DOB);
  const serviceYears = getServiceYears(member.DOJ);
  const yearsInGrade = getYearsInGrade(member.DoAPP);
  const retirementDate = getRetirementDate(member.DOB);
  const daysToRetirement = retirementDate ? diffInDays(retirementDate, new Date()) : null;
  const isRetiringSoon = daysToRetirement !== null && daysToRetirement > 0 && daysToRetirement <= 365;
  const uploadTier = canEdit ? 'institute' : 'owner';

  const downloadBrief = () => {
    if (!dossier) return;
    const url = URL.createObjectURL(new Blob([buildScientistBrief(dossier)], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `brief_${dossier.member.ID}_${dossier.dataFreshness}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async (kind: 'cv' | 'nomination') => {
    if (!facts) return;
    try {
      const [{ pdf }, { ProfileCv, NominationBrief }] = await Promise.all([import('@react-pdf/renderer'), import('../lib/staff/profilePdf')]);
      const doc = kind === 'cv' ? <ProfileCv member={member} facts={facts} /> : <NominationBrief member={member} facts={facts} />;
      const url = URL.createObjectURL(await pdf(doc).toBlob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kind}_${member.ID}_${today()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { push(friendlyError(err), 'error'); }
  };

  const btn = 'inline-flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-lg text-sm font-medium text-text hover:bg-surface-hover transition-colors disabled:opacity-50';

  const aside = (
    <>
      <Card className="border-t-4 border-t-terracotta flex flex-col pt-8">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-24 h-24 rounded-full bg-surface-hover flex items-center justify-center text-3xl font-bold text-terracotta ring-2 ring-border">
            {member.Name.charAt(0)}
          </div>
          <div className="flex justify-center gap-2 flex-wrap">
            <Badge variant={member.Group === 'Scientific' ? 'success' : 'neutral'}>Group: {member.Group}</Badge>
            <Badge variant="info">Level: {member.Level}</Badge>
            {member.Cat && <Badge variant="neutral">{member.Cat}</Badge>}
          </div>
          <div className="w-full h-px bg-border" />
          <div className="w-full text-left space-y-3 text-sm text-text-muted">
            <div className="flex items-start gap-3"><Mail size={16} className="mt-0.5 shrink-0" /><span className="truncate" title={member.Email}>{member.Email || 'No email provided'}</span></div>
            <div className="flex items-start gap-3"><Phone size={16} className="mt-0.5 shrink-0" /><span>Ext: {member.Ext || 'N/A'}</span></div>
            <div className="flex items-start gap-3"><MapPin size={16} className="mt-0.5 shrink-0" /><Link to="/divisions" className="hover:text-terracotta hover:underline">{division ? division.divName : member.Division}</Link></div>
            <div className="flex items-start gap-3"><Award size={16} className="mt-0.5 shrink-0" /><span>{member.HighestQualification}</span></div>
            {member.orcid && (
              <div className="flex items-start gap-3"><FileText size={16} className="mt-0.5 shrink-0" />
                <a href={`https://orcid.org/${member.orcid}`} target="_blank" rel="noreferrer" className="text-terracotta hover:underline font-mono">ORCID {member.orcid}</a></div>
            )}
            {member.VidwanID && (
              <div className="flex items-start gap-3"><FileText size={16} className="mt-0.5 shrink-0" />
                <a href={`https://vidwan.inflibnet.ac.in/profile/${member.VidwanID}`} target="_blank" rel="noreferrer" className="text-terracotta hover:underline">Vidwan: {member.VidwanID}</a></div>
            )}
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-terracotta uppercase tracking-[0.2em]"><TrendingUp size={14} /> Career</div>
        <div className="grid grid-cols-2 gap-3">
          {[['Age', age], ['Service', serviceYears], ['In grade', yearsInGrade]].map(([label, v]) => (
            <div key={label as string} className="bg-background rounded-xl p-3 border border-border">
              <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">{label}</div>
              <div className="text-xl font-mono tabular-nums text-text">{v ?? '--'}</div>
              <div className="text-[10px] text-text-muted">years</div>
            </div>
          ))}
          <div className={isRetiringSoon ? 'rounded-xl p-3 border bg-badge-danger-bg border-badge-danger-fg/25' : 'rounded-xl p-3 border bg-background border-border'}>
            <div className={isRetiringSoon ? 'text-[10px] font-semibold uppercase tracking-wider mb-1 text-badge-danger-fg' : 'text-[10px] font-semibold uppercase tracking-wider mb-1 text-text-muted'}>Retires</div>
            <div className="text-sm font-mono text-text">{retirementDate ? formatDate(retirementDate) : '--'}</div>
            {isRetiringSoon && <div className="text-[10px] text-badge-danger-fg font-bold mt-0.5">{daysToRetirement}d left</div>}
          </div>
        </div>
        <div className="pt-2 border-t border-border text-xs space-y-1.5 text-text-muted">
          <div className="flex justify-between"><span>Joined</span><span className="font-mono text-text">{member.DOJ || 'N/A'}</span></div>
          <div className="flex justify-between"><span>Current post from</span><span className="font-mono text-text">{member.DoAPP || 'N/A'}</span></div>
          <div className="flex justify-between"><span>Appointment</span><span className="text-text">{member.AppointmentType || 'N/A'}</span></div>
        </div>
      </Card>
    </>
  );

  const overview = (
    <>
      {isOwn && <IssuesCard member={member} issues={issues} onChanged={reload} />}
      {!isOwn && canEdit && issues.length > 0 && (
        <p className="text-xs text-text-muted">{issues.length} item(s) on this profile wait on the person to confirm.</p>
      )}
      {isOwn && <OwnProfileForm member={member} onSaved={reload} />}
      <ScoreHistoryCard staffId={member.ID} />

      {dossier && dossier.trajectory.flags.length > 0 && (
        <Card>
          <h3 className="text-lg font-[500] mb-3 text-text flex items-center gap-2 font-serif"><TrendingUp size={18} className="text-terracotta" /> Trajectory</h3>
          <div className="flex flex-wrap gap-1.5">
            {dossier.trajectory.flags.map(f => (
              <span key={f} className="text-xs font-medium px-2 py-1 rounded-full bg-surface-hover text-text-muted border border-border">{TRAJECTORY_FLAG_LABEL[f] ?? f}</span>
            ))}
          </div>
          <p className="text-[10px] text-text-muted mt-2">Descriptive patterns from institutional records — not a score. Assembled {dossier.dataFreshness}.</p>
        </Card>
      )}

      {!isOwn && (
        <Card>
          <h3 className="text-lg font-[500] mb-4 text-text flex items-center gap-2 font-serif"><BookOpen size={18} className="text-terracotta" /> Research & expertise</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8 text-sm">
            <div><p className="text-text-muted mb-1 font-medium">Core area</p><p className="text-text">{member.CoreArea || 'Not specified'}</p></div>
            <div><p className="text-text-muted mb-1 font-medium">Specific expertise</p><p className="text-text">{member.Expertise || 'Not specified'}</p></div>
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="p-5 border-b border-border flex items-center gap-2"><GitBranch size={18} className="text-text-muted" /><h3 className="text-base font-[500] text-text font-serif">Reporting</h3></div>
        <div className="p-5 space-y-5">
          <div>
            <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-3">Reports to</div>
            {reportsTo ? (
              <Link to={`/staff/${reportsTo.ID}`} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-surface-hover transition-all group">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-text group-hover:text-terracotta truncate">{reportsTo.Name}</div>
                  <div className="text-xs text-text-muted truncate">{reportsTo.Designation}</div>
                </div>
                <ChevronRight size={16} className="text-text-muted shrink-0" />
              </Link>
            ) : <p className="text-sm text-text-muted italic">No superior linked</p>}
          </div>
          {directReports.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-3">Direct reports ({directReports.length})</div>
              <div className="space-y-2">
                {directReports.map(s => (
                  <Link key={s.ID} to={`/staff/${s.ID}`} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-surface-hover transition-all group">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text group-hover:text-terracotta truncate">{s.Name}</div>
                      <div className="text-xs text-text-muted truncate">{s.Designation}</div>
                    </div>
                    <Badge variant={s.Group === 'Scientific' ? 'success' : 'neutral'} className="shrink-0">{s.Group}</Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </>
  );

  const documents = (
    <>
      <DocumentPanel entityType="staff_profile" entityId={member.ID} docType="expertise" accessTier={uploadTier}
        title="Expertise & CV Documents" canUpload={isOwn || canEdit} divisionCode={member.Division} />
      <DocumentPanel entityType="publication" entityId={member.ID} docType="full_text" accessTier={uploadTier}
        title="Publication Full-Texts" canUpload={isOwn || canEdit} divisionCode={member.Division} />
      {member.VidwanID && (
        <Card className="p-5">
          <h3 className="text-base font-[500] text-text font-serif mb-3">Research output (via IRINS)</h3>
          <ScientistProfile vidwanId={member.VidwanID} />
        </Card>
      )}
    </>
  );

  return (
    <>
      <Dossier
        kicker={isOwn ? 'My profile' : 'Staff profile'}
        title={member.Name}
        subtitle={`${member.Designation}${division ? ` · ${division.divName}` : ''}`}
        onBack={goBack}
        numbers={numbers}
        aside={aside}
        actions={
          <>
            <RelatedRail sections={rail} />
            <button className={btn} disabled={!facts} onClick={() => void downloadPdf('cv')}><FileDown size={14} /> CV</button>
            <button className={btn} disabled={!facts} onClick={() => void downloadPdf('nomination')}><FileDown size={14} /> Nomination brief</button>
            {dossier && <button className={btn} onClick={downloadBrief}><FileDown size={14} /> Brief</button>}
            {canEdit && <button className={btn} onClick={() => setEditOpen(true)}><Edit size={14} /> Edit</button>}
          </>
        }
        tabs={[
          { key: 'overview', label: 'Overview', content: overview },
          { key: 'record', label: 'Record', content: <RecordTab facts={facts} error={factsError} /> },
          { key: 'expertise', label: 'Expertise', content: <ExpertisePanel staffId={member.ID} isOwn={isOwn} note={member.Expertise || undefined} /> },
          { key: 'documents', label: 'Documents', content: documents },
        ]}
        askAbout={{ type: 'staff', id: member.ID }}
        timeline={{ entityType: 'staff', entityId: member.ID }}
      />
      {canEdit && <StaffFormModal isOpen={editOpen} onClose={() => setEditOpen(false)} staffMember={member} />}
    </>
  );
}
