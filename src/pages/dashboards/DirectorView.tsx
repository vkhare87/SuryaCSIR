import { useEffect, useState } from 'react';
import { Users, Briefcase, BookOpen, Wrench, Microscope } from 'lucide-react';
import { motion } from 'framer-motion';
import { useData } from '../../contexts/DataContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';
import { fadeUp, staggerChildren } from '../../utils/motion';
import { useCountUp } from '../../utils/useCountUp';
import { ThresholdControls } from '../../components/dashboard/ThresholdControls';
import { AttentionStrip } from '../../components/dashboard/AttentionStrip';
import { ProjectFinanceSection } from '../../components/dashboard/ProjectFinanceSection';
import { ResearchSection } from '../../components/dashboard/ResearchSection';
import { EquipmentOpsSection } from '../../components/dashboard/EquipmentOpsSection';
import {
  DEFAULT_THRESHOLDS,
  THRESHOLD_KEYS,
  type DirectorThresholds,
} from '../../utils/directorMetrics';

function loadThresholds(): DirectorThresholds {
  const read = (key: string, fallback: number) => {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    lowBurnPct: read(THRESHOLD_KEYS.lowBurnPct, DEFAULT_THRESHOLDS.lowBurnPct),
    endingDays: read(THRESHOLD_KEYS.endingDays, DEFAULT_THRESHOLDS.endingDays),
    amcDays: read(THRESHOLD_KEYS.amcDays, DEFAULT_THRESHOLDS.amcDays),
  };
}

export function DirectorView() {
  const { staff, projects, phDStudents, equipment, scientificOutputs, divisions } = useData();
  const [thresholds, setThresholds] = useState<DirectorThresholds>(loadThresholds);

  useEffect(() => {
    localStorage.setItem(THRESHOLD_KEYS.lowBurnPct, String(thresholds.lowBurnPct));
    localStorage.setItem(THRESHOLD_KEYS.endingDays, String(thresholds.endingDays));
    localStorage.setItem(THRESHOLD_KEYS.amcDays, String(thresholds.amcDays));
  }, [thresholds]);

  const activeProjects = projects.filter((p) => p.ProjectStatus === 'Active').length;

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
          Director's Dashboard
        </h1>
        <p className="text-[#87867f] mt-1 text-sm font-medium">
          CSIR-AMPRI — Institute-Wide Decision Cockpit
        </p>
      </div>

      {/* Bento KPI grid — hero tile + supporting counts, staggered entry */}
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
          />
        </motion.div>
        <motion.div variants={fadeUp}>
          <KpiCard label="Total Staff" value={staff.length} icon={<Users size={18} />} sublabel="Permanent personnel" />
        </motion.div>
        <motion.div variants={fadeUp}>
          <KpiCard label="PhD Students" value={phDStudents.length} icon={<BookOpen size={18} />} sublabel="Enrolled scholars" />
        </motion.div>
        <motion.div variants={fadeUp}>
          <KpiCard label="Equipment" value={equipment.length} icon={<Wrench size={18} />} sublabel="Instruments & facilities" />
        </motion.div>
        <motion.div variants={fadeUp}>
          <KpiCard label="Scientific Outputs" value={scientificOutputs.length} icon={<Microscope size={18} />} sublabel="Publications & IP" />
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

      {/* Division breakdown table (retained) */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f0eee6]">
          <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Division Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f5f4ed]">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Division</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Name</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Current Strength</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Sanctioned</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Head of Division</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0eee6]">
              {divisions.map((div) => (
                <tr key={div.divCode} className="hover:bg-[#f5f4ed] transition-colors">
                  <td className="px-6 py-4 font-semibold text-[#c96442] font-mono text-xs">{div.divCode}</td>
                  <td className="px-6 py-4 text-[#4d4c48] font-medium">{div.divName}</td>
                  <td className="px-6 py-4 text-right text-[#141413] font-semibold">{div.divCurrentStrength}</td>
                  <td className="px-6 py-4 text-right text-[#87867f]">{div.divSanctionedstrength}</td>
                  <td className="px-6 py-4 text-right text-[#4d4c48]">{div.divHoD}</td>
                </tr>
              ))}
              {divisions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[#87867f] text-xs italic">
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

function HeroTile({ label, value, total }: { label: string; value: number; total: number }) {
  const counted = useCountUp(value, 1200);
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <Card variant="interactive" className="relative h-full overflow-hidden flex flex-col justify-between bg-grain">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'var(--gradient-glow)' }} />
      <div className="relative flex items-center gap-2 text-terracotta">
        <Briefcase size={20} />
        <span className="text-xs font-semibold uppercase tracking-widest">{label}</span>
      </div>
      <div className="relative">
        <div className="font-serif text-6xl lg:text-7xl text-text tabular-nums leading-none">{counted.toLocaleString()}</div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-surface-hover overflow-hidden">
            <div className="h-full rounded-full [background:var(--gradient-brand)]" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-semibold text-text-muted tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1 text-xs text-text-muted">{value} active of {total} total projects</div>
      </div>
    </Card>
  );
}
