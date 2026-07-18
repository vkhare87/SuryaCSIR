import { SlidersHorizontal, ShieldCheck } from 'lucide-react';
import { UNCONTROLLABLE_PATHS } from '../../lib/access/featureControls';
import { RoleFeatureEditor } from '../../components/admin/RoleFeatureEditor';
import { FeatureRoleLookup } from '../../components/admin/FeatureRoleLookup';
import { GlobalFeatureKillSwitches } from '../../components/admin/GlobalFeatureKillSwitches';

export default function FeatureControls() {
  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif flex items-center gap-3">
          <SlidersHorizontal size={26} className="text-terracotta" /> Feature Controls
        </h1>
        <p className="text-text-muted mt-1 text-sm font-medium">
          Switch features off institute-wide or for specific roles. Absent entry = fully enabled.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface px-5 py-3 flex items-start gap-3 text-xs text-text-muted">
        <ShieldCheck size={15} className="text-terracotta shrink-0 mt-0.5" />
        <p>
          MasterAdmin is exempt from every control, and the dashboard + admin pages
          ({UNCONTROLLABLE_PATHS.join(', ')}) cannot be switched off — no self-lockout.
          These switches govern navigation and routes; row-level security on the data remains in force regardless.
        </p>
      </div>

      <RoleFeatureEditor />
      <FeatureRoleLookup />
      <GlobalFeatureKillSwitches />
    </div>
  );
}
