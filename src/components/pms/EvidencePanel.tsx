import { useMemo } from 'react';
import { FileDown, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { useUserDirectory } from '../../hooks/useUserDirectory';
import { buildScientistDossier } from '../../lib/scientist/dossier';
import { buildScientistBrief } from '../../lib/scientist/brief';
import type { ClaimStatus } from '../../lib/scientist/claimMatch';
import type { TrajectoryFlag } from '../../lib/scientist/trajectory';
import type { PMSReport, PMSReportSection } from '../../types/pms';

// Evidence panel embedded in PMS evaluation screens. Cross-checks the
// appraisee's self-appraisal claims against institutional records and surfaces
// trajectory patterns — so the committee scores against facts, not just prose.
// It shows evidence; it never suggests a score.

const CLAIM_CHIP: Record<ClaimStatus, { label: string; cls: string }> = {
  'corroborated':       { label: 'Corroborated',        cls: 'bg-green-100 text-green-700' },
  'no-matching-record': { label: 'No matching record',  cls: 'bg-amber-100 text-amber-700' },
  'new-to-system':      { label: 'New to system',       cls: 'bg-blue-100 text-blue-700' },
};

const FLAG_LABEL: Record<TrajectoryFlag, string> = {
  'output-rising': 'Output rising',
  'output-flat': 'Output flat',
  'output-declining': 'Output declining',
  'new-collaboration-cluster': 'New collaboration cluster',
  'supervision-load-up': 'High supervision load',
  'budget-overrun-history': 'Budget overrun history',
  'duty-days-below-90-candidate': 'Duty days below 90 — check rule',
};

interface Props {
  report: PMSReport;
  sections: PMSReportSection[];
}

export function EvidencePanel({ report, sections }: Props) {
  const data = useData();
  const { users, loading } = useUserDirectory();

  // Resolve the appraisee (report.scientistId is an auth uid) to a staff row
  // via the directory (uid → email/name → staff), name-variant tolerant.
  const staffMember = useMemo(() => {
    const dir = users.find(u => u.userId === report.scientistId);
    if (!dir) return null;
    const email = (dir.email ?? '').toLowerCase();
    return (
      data.staff.find(s => email && (s.Email ?? '').toLowerCase() === email) ??
      (dir.name ? data.staff.find(s => s.Name === dir.name) : undefined) ??
      null
    );
  }, [users, report.scientistId, data.staff]);

  const dossier = useMemo(() => {
    if (!staffMember) return null;
    return buildScientistDossier({
      staffId: staffMember.ID,
      staff: data.staff,
      projects: data.projects,
      projectStaff: data.projectStaff,
      phDStudents: data.phDStudents,
      scientificOutputs: data.scientificOutputs,
      ipIntelligence: data.ipIntelligence,
      equipment: data.equipment,
      techTransfers: data.techTransfers,
      mous: data.mous,
      report,
      sections,
    });
  }, [staffMember, data, report, sections]);

  function downloadBrief() {
    if (!dossier) return;
    const md = buildScientistBrief(dossier);
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `brief_${dossier.member.ID}_${dossier.dataFreshness}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="p-4 bg-surface border border-border rounded-2xl text-sm text-text-muted">Loading evidence…</div>;
  }

  if (!staffMember || !dossier) {
    return (
      <div className="p-4 bg-surface border border-border rounded-2xl text-sm text-text-muted">
        Institutional evidence not available — the appraisee's account is not linked to a staff record.
      </div>
    );
  }

  const claims = dossier.claims;

  return (
    <div className="p-5 bg-surface border border-border rounded-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sm text-text">Institutional Evidence</h2>
          <p className="text-xs text-text-muted mt-0.5">
            <Link to={`/staff/${dossier.member.ID}`} className="text-[#c96442] hover:underline inline-flex items-center gap-1">
              {dossier.member.Name} <ExternalLink size={11} />
            </Link>
            {' · '}assembled {dossier.dataFreshness} · joins are name-based
          </p>
        </div>
        <button
          onClick={downloadBrief}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-text hover:bg-surface-hover transition-colors"
        >
          <FileDown size={13} /> Brief
        </button>
      </div>

      {/* Claim corroboration */}
      {claims && claims.claims.length > 0 ? (
        <div className="space-y-2">
          <div className="flex gap-3 text-xs text-text-muted">
            <span>{claims.corroborated} corroborated</span>
            <span>{claims.noMatchingRecord} no matching record</span>
            <span>{claims.newToSystem} new to system</span>
          </div>
          <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {claims.claims.map((c, i) => {
              const chip = CLAIM_CHIP[c.status];
              return (
                <div key={i} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-text truncate">{c.claimTitle}</p>
                    {c.matchedRecordLabel && (
                      <p className="text-xs text-text-muted truncate">{c.matchedRecordLabel}</p>
                    )}
                  </div>
                  <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${chip.cls}`}>
                    {chip.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-text-muted">No cross-checkable claims (publications, projects, IP) in the self-appraisal.</p>
      )}

      {/* Trajectory flags */}
      {dossier.trajectory.flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {dossier.trajectory.flags.map(f => (
            <span key={f} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-hover text-text-muted border border-border">
              {FLAG_LABEL[f]}
            </span>
          ))}
        </div>
      )}

      {/* Impact snapshot */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ['Pubs', dossier.impact.publications.length],
          ['Citations', dossier.impact.citationTotal],
          ['Patents', `${dossier.impact.grantedPatents}/${dossier.impact.ipAssets.length}`],
          ['Active proj.', dossier.present.activeProjects.length],
        ].map(([label, val]) => (
          <div key={label} className="bg-background rounded-lg p-2 border border-border">
            <div className="text-sm font-bold text-text">{val}</div>
            <div className="text-[10px] text-text-muted">{label}</div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-text-muted leading-relaxed">
        "No matching record" ≠ false — likeliest cause is a record never loaded into the system, not a fabricated claim.
        Evidence only; the committee assigns the score.
      </p>
    </div>
  );
}
