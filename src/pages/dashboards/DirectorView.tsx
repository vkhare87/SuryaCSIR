import { useMemo } from 'react';
import { Users, Briefcase, BookOpen, Wrench, Microscope } from 'lucide-react';
import { motion } from 'framer-motion';
import { useData } from '../../contexts/DataContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';
import { EntityLink } from '../../components/EntityLink';
import { LivingBriefHeader, timeOfDayGreeting } from '../../components/dashboard/LivingBriefHeader';
import { Sparkline } from '../../components/viz/Sparkline';
import { fadeUp, staggerChildren } from '../../utils/motion';
import { useCountUp } from '../../utils/useCountUp';
import { ThresholdControls } from '../../components/dashboard/ThresholdControls';
import { AttentionStrip } from '../../components/dashboard/AttentionStrip';
import { ProjectFinanceSection } from '../../components/dashboard/ProjectFinanceSection';
import { ResearchSection } from '../../components/dashboard/ResearchSection';
import { EquipmentOpsSection } from '../../components/dashboard/EquipmentOpsSection';
import { DEFAULT_THRESHOLDS } from '../../utils/directorMetrics';
import { useDirectorThresholds } from '../../hooks/useDirectorThresholds';
import { instituteFreshness, type DivisionFreshness } from '../../lib/divisions/freshness';
import { isActiveProject } from '../../lib/projects/stage';

const FRESHNESS_BADGE: Record<DivisionFreshness['staleness'], string> = {
  fresh: 'bg-surface-hover text-archive-green border border-archive-green/30',
  aging: 'bg-badge-warning-bg text-badge-warning-fg border border-badge-warning-fg/25',
  stale: 'bg-badge-danger-bg text-badge-danger-fg border border-badge-danger-fg/25',
  empty: 'bg-surface-hover text-text-muted border border-border',
};

function yearlySeries(years: number[], count = 6): number[] {
  const valid = years.filter(y => y >= 2000 && y <= 2100);
  if (valid.length === 0) return [];
  const maxYear = Math.max(...valid);
  const buckets: number[] = [];
  for (let y = maxYear - count + 1; y <= maxYear; y++) {
    buckets.push(valid.filter(v => v === y).length);
  }
  return buckets;
}

export function DirectorView() {
  const { staff, projects, phDStudents, equipment, scientificOutputs, divisions, ipIntelligence, mous, techTransfers } = useData();
  const { thresholds, setThresholds } = useDirectorThresholds();

  const freshnessList = useMemo(
    () => instituteFreshness(divisions, {
      staff, projects, scientificOutputs, ipIntelligence, mous, techTransfers, phDStudents,
    }),
    [divisions, staff, projects, scientificOutputs, ipIntelligence, mous, techTransfers, phDStudents],
  );

  const freshnessByDiv = useMemo(
    () => new Map(freshnessList.map((f) => [f.divCode, f])),
    [freshnessList],
  );

  const activeProjects = useMemo(() => projects.filter(isActiveProject).length, [projects]);

  const avgFreshness = useMemo(() => {
    if (freshnessList.length === 0) return null;
    const total = freshnessList.reduce((acc, f) => acc + f.completeness, 0);
    return Math.round(total / freshnessList.length);
  }, [freshnessList]);

  const outputSeries = useMemo(
    () => yearlySeries(scientificOutputs.map(o => o.year)),
    [scientificOutputs],
  );

  const outputDelta = useMemo(() => {
    if (outputSeries.length < 2) return undefined;
    const prev = outputSeries[outputSeries.length - 2];
    const curr = outputSeries[outputSeries.length - 1];
    if (prev === 0) return undefined;
    return Math.round(((curr - prev) / prev) * 100);
  }, [outputSeries]);

  const projectSeries = useMemo(
    () => yearlySeries(projects.map(p => Number(p.StartDate?.slice(0, 4))).filter(Number.isFinite)),
    [projects],
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Living Editorial Brief (DESIGN.md R5) */}
      <LivingBriefHeader
        kicker="CSIR-AMPRI · Director's Cockpit"
        sentence={
          <>
            {timeOfDayGreeting()} —{' '}
            <span className="text-terracotta font-mono tabular-nums">{activeProjects}</span> active projects across{' '}
            <span className="font-mono tabular-nums">{divisions.length}</span> divisions,{' '}
            <span className="font-mono tabular-nums">{staff.length}</span> personnel, and{' '}
            <span className="font-mono tabular-nums">{scientificOutputs.length}</span> recorded scientific outputs.
          </>
        }
        pills={[
          ...(avgFreshness !== null
            ? [{ label: `${avgFreshness}% register completeness`, tone: (avgFreshness >= 80 ? 'positive' : 'warning') as 'positive' | 'warning', to: '/divisions' }]
            : []),
          { label: 'Explore Institute Graph', tone: 'accent', to: '/explore' },
          { label: 'Project Portfolio', tone: 'neutral', to: '/portfolio' },
        ]}
      />

      {/* Bento KPI grid — hero tile + telemetry tiles, staggered entry */}
      <motion.div
        variants={staggerChildren}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-[minmax(0,1fr)]"
      >
        <motion.div variants={fadeUp} className="col-span-2 lg:row-span-2">
          <HeroTile
            label="Active Projects"
            value={activeProjects}
            total={projects.length}
            sparkline={projectSeries}
          />
        </motion.div>
        <motion.div variants={fadeUp}>
          <KpiCard to="/staff" label="Total Staff" value={staff.length} icon={<Users size={18} />} sublabel="Permanent personnel" />
        </motion.div>
        <motion.div variants={fadeUp}>
          <KpiCard to="/phd" label="PhD Students" value={phDStudents.length} icon={<BookOpen size={18} />} sublabel="Enrolled scholars" />
        </motion.div>
        <motion.div variants={fadeUp}>
          <KpiCard to="/facilities" label="Equipment" value={equipment.length} icon={<Wrench size={18} />} sublabel="Instruments & facilities" />
        </motion.div>
        <motion.div variants={fadeUp}>
          <KpiCard
            to="/intelligence"
            label="Scientific Outputs"
            value={scientificOutputs.length}
            icon={<Microscope size={18} />}
            sublabel="Publications & IP"
            delta={outputDelta}
            sparkline={outputSeries.length >= 2 ? <Sparkline data={outputSeries} /> : undefined}
          />
        </motion.div>
      </motion.div>

      <ThresholdControls
        thresholds={thresholds}
        onChange={setThresholds}
        onReset={() => setThresholds(DEFAULT_THRESHOLDS)}
      />

      <AttentionStrip thresholds={thresholds} />
      <ProjectFinanceSection />
      <ResearchSection />
      <EquipmentOpsSection />

      {/* Division breakdown ledger table (DESIGN.md R6) */}
      <Card variant="raised" className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text uppercase tracking-widest">Division Register</h2>
          <span className="text-xs font-mono tabular-nums text-text-muted">{divisions.length} divisions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-hover/60 border-b border-border">
                <th className="pl-6 pr-3 py-3 text-left text-[10px] font-mono uppercase tracking-widest text-terracotta/70 w-10">#</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Division</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Name</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-text-muted">Strength</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-text-muted">Sanctioned</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-text-muted">Head of Division</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-text-muted">Freshness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {divisions.map((div, idx) => (
                <tr
                  key={div.divCode}
                  className="hover:bg-surface-hover/60 hover:shadow-[inset_3px_0_0_var(--color-terracotta)] transition-all"
                >
                  <td className="pl-6 pr-3 py-3.5 font-mono tabular-nums text-xs text-terracotta/75">
                    {String(idx + 1).padStart(2, '0')}
                  </td>
                  <td className="px-4 py-3.5 font-semibold font-mono text-xs">
                    <EntityLink kind="division" id={div.divCode} label={div.divCode} />
                  </td>
                  <td className="px-4 py-3.5 text-text font-medium">{div.divName}</td>
                  <td className="px-4 py-3.5 text-right text-text font-mono tabular-nums font-semibold">{div.divCurrentStrength}</td>
                  <td className="px-4 py-3.5 text-right text-text-muted font-mono tabular-nums">{div.divSanctionedstrength}</td>
                  <td className="px-4 py-3.5 text-right text-text-muted">{div.divHoD}</td>
                  <td className="px-6 py-3.5 text-right">
                    {(() => {
                      const f = freshnessByDiv.get(div.divCode);
                      if (!f) return <span className="text-text-muted">—</span>;
                      return (
                        <span
                          className={`inline-flex font-mono tabular-nums text-xs font-medium px-2 py-0.5 rounded-full ${FRESHNESS_BADGE[f.staleness]}`}
                          title={f.gaps.join('; ') || 'No gaps'}
                        >
                          {f.completeness}% · {f.staleness}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
              {divisions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-text-muted text-xs italic">
                    No division data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function HeroTile({ label, value, total, sparkline }: { label: string; value: number; total: number; sparkline: number[] }) {
  const counted = useCountUp(value, 1200);
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <Card variant="interactive" sheen className="relative h-full overflow-hidden flex flex-col justify-between bg-grain">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'var(--gradient-glow)' }} />
      <div className="relative flex items-center justify-between gap-2 text-terracotta">
        <div className="flex items-center gap-2">
          <Briefcase size={18} />
          <span className="text-xs font-semibold uppercase tracking-widest">{label}</span>
        </div>
        {sparkline.length >= 2 && (
          <div className="h-9 w-24 shrink-0">
            <Sparkline data={sparkline} />
          </div>
        )}
      </div>
      <div className="relative">
        <div className="font-serif text-6xl lg:text-7xl text-text tabular-nums leading-none">{counted.toLocaleString()}</div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-surface-hover overflow-hidden">
            <div className="h-full rounded-full [background:var(--gradient-brand)]" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-mono font-semibold text-text-muted tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1 text-xs text-text-muted">{value} active of {total} total projects</div>
      </div>
    </Card>
  );
}
