import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useHome } from '../../contexts/HomeContext';
import { supabase } from '../../utils/supabaseClient';
import { Card } from '../../components/ui/Cards';
import { DoFirstStrip } from '../../components/home/common/DoFirstStrip';

interface EngagementSummary {
  engagement_id: string;
  person_name: string;
  project_no: string;
  position_code: string;
  from_on: string;
  to_on: string;
  days_left: number;
  emoluments: number | null;
  tenure_days_used: number;
  tenure_cap_days: number;
}

export function ProjectStaffView() {
  const { user } = useAuth();
  const { greeting, doNext, registerClaimedKeys } = useHome();
  const [engagement, setEngagement] = useState<EngagementSummary | null>(null);

  useEffect(() => {
    registerClaimedKeys(doNext ? [doNext.id] : []);
  }, [doNext, registerClaimedKeys]);

  useEffect(() => {
    let cancelled = false;
    if (!supabase || !user?.id) return;
    supabase.rpc('my_engagement').then(({ data, error }) => {
      if (cancelled || error || !Array.isArray(data) || data.length === 0) return;
      const r = data[0] as Record<string, unknown>;
      setEngagement({
        engagement_id: String(r.engagement_id ?? ''),
        person_name: String(r.person_name ?? ''),
        project_no: String(r.project_no ?? ''),
        position_code: String(r.position_code ?? ''),
        from_on: String(r.from_on ?? ''),
        to_on: String(r.to_on ?? ''),
        days_left: Number(r.days_left ?? 0),
        emoluments: r.emoluments != null ? Number(r.emoluments) : null,
        tenure_days_used: Number(r.tenure_days_used ?? 0),
        tenure_cap_days: Number(r.tenure_cap_days ?? 1825),
      });
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  return (
    <div className="space-y-6 pb-12">
      <section aria-label="Project staff greeting" className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-[500] font-serif text-text leading-snug">{greeting}</h1>
        {engagement && (
          <p className="text-xs text-text-muted font-mono tabular-nums">
            {engagement.position_code} · {engagement.project_no} · ends {engagement.to_on}
          </p>
        )}
      </section>

      <DoFirstStrip />

      {doNext && (
        <Card className="p-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Do this next</p>
            <p className="text-base font-medium text-text truncate">{doNext.label}</p>
            <p className="text-xs text-text-muted truncate">{doNext.detail}</p>
          </div>
          <Link
            to={doNext.link}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-terracotta hover:bg-terracotta-hover text-ivory text-sm font-semibold shrink-0"
          >
            Open <ArrowRight size={15} />
          </Link>
        </Card>
      )}

      {/* Two clocks: current contract + CSIR tenure cap */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Clock size={13} /> Clock 1 · Current contract
          </h2>
          {engagement ? (
            <>
              <p className="text-2xl font-mono tabular-nums text-text">
                {engagement.days_left} <span className="text-xs font-sans text-text-muted">days left</span>
              </p>
              <p className="text-xs text-text-muted font-mono tabular-nums">
                {engagement.from_on} → {engagement.to_on}
                {engagement.emoluments != null ? ` · ₹${engagement.emoluments.toLocaleString('en-IN')}/mo` : ''}
              </p>
            </>
          ) : (
            <p className="text-xs text-text-muted">No active engagement linked to this login yet.</p>
          )}
        </Card>

        <Card className="p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Briefcase size={13} /> Clock 2 · CSIR tenure cap
          </h2>
          {engagement ? (
            <>
              <p className="text-2xl font-mono tabular-nums text-text">
                {engagement.tenure_days_used} <span className="text-xs font-sans text-text-muted">/ {engagement.tenure_cap_days} days used</span>
              </p>
              <p className="text-xs text-text-muted font-mono tabular-nums">
                {Math.max(0, engagement.tenure_cap_days - engagement.tenure_days_used)} days remaining under CSIR cap
              </p>
            </>
          ) : (
            <p className="text-xs text-text-muted">Cap calculation activates once your engagement is linked.</p>
          )}
        </Card>
      </div>

      {/* Need something */}
      <Card className="p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Need something?</h2>
        <div className="flex flex-wrap gap-2">
          <Link to="/helpdesk/new?key=leave" className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text hover:bg-surface-hover">
            Ask leave
          </Link>
          <Link to="/helpdesk/new?key=letter" className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text hover:bg-surface-hover">
            Experience / pay letter
          </Link>
          <Link to="/me" className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text hover:bg-surface-hover">
            My profile
          </Link>
        </div>
      </Card>
    </div>
  );
}
