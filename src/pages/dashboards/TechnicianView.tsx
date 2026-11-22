import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Microscope, Wrench } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useHome } from '../../contexts/HomeContext';
import { supabase } from '../../utils/supabaseClient';
import { Card } from '../../components/ui/Cards';
import { DoFirstStrip } from '../../components/home/common/DoFirstStrip';

export function TechnicianView() {
  const { user } = useAuth();
  const { equipment } = useData();
  const { ownStaffId, greeting, doNext, todayIso, registerClaimedKeys } = useHome();
  const [inChargeIds, setInChargeIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    registerClaimedKeys(doNext ? [doNext.id] : []);
  }, [doNext, registerClaimedKeys]);

  useEffect(() => {
    let cancelled = false;
    if (!supabase || !ownStaffId) return;
    supabase
      .from('equipment_in_charge')
      .select('equipment_id')
      .eq('staff_id', ownStaffId)
      .then(({ data, error }) => {
        if (cancelled || error || !Array.isArray(data)) return;
        setInChargeIds(new Set(data.map((r) => String(r.equipment_id))));
      });
    return () => { cancelled = true; };
  }, [ownStaffId]);

  const myInstruments = useMemo(() => {
    if (inChargeIds.size > 0) {
      return equipment.filter((e) => inChargeIds.has(e.UInsID));
    }
    return user?.divisionCode ? equipment.filter((e) => e.Division === user.divisionCode) : equipment;
  }, [equipment, inChargeIds, user?.divisionCode]);

  const downList = useMemo(
    () => myInstruments.filter((e) => /down|fault|non/i.test(e.WorkingStatus)),
    [myInstruments],
  );
  const amcSoon = useMemo(() => {
    const [y, m, d] = todayIso.split('-').map(Number);
    const horizon = new Date(Date.UTC(y, m - 1, d + 60)).toISOString().slice(0, 10);
    return myInstruments.filter((e) => e.amc_end_date && e.amc_end_date >= todayIso && e.amc_end_date <= horizon);
  }, [myInstruments, todayIso]);

  return (
    <div className="space-y-6 pb-12">
      <section aria-label="Technician greeting" className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-[500] font-serif text-text leading-snug">{greeting}</h1>
        <p className="text-xs text-text-muted font-mono tabular-nums">
          {myInstruments.length} instruments · {downList.length} down · {amcSoon.length} AMC due within 60d
        </p>
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

      {/* Phone-first quick actions */}
      <Card className="p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <Wrench size={13} /> Quick entry
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Link to="/facilities" className="px-3 py-2.5 rounded-lg border border-border text-xs font-medium text-text hover:bg-surface-hover text-center">
            Log instrument use
          </Link>
          <Link to="/helpdesk/new?key=repair" className="px-3 py-2.5 rounded-lg border border-border text-xs font-medium text-text hover:bg-surface-hover text-center">
            Report a fault
          </Link>
          <Link to="/helpdesk/new?key=safety" className="px-3 py-2.5 rounded-lg border border-border text-xs font-medium text-text hover:bg-surface-hover text-center">
            Safety / calibration note
          </Link>
        </div>
      </Card>

      {/* My instruments */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Microscope size={13} /> My instruments
          </h2>
          <Link to="/facilities" className="text-xs text-text-muted hover:text-text hover:underline">
            See all ({myInstruments.length})
          </Link>
        </div>
        {myInstruments.length === 0 ? (
          <p className="text-xs text-text-muted">No instruments assigned to you or your division yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {myInstruments.slice(0, 6).map((inst) => {
              const isDown = /down|fault|non/i.test(inst.WorkingStatus);
              return (
                <li key={inst.UInsID} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs">
                  <Link to={`/facilities/${encodeURIComponent(inst.UInsID)}`} className="font-medium text-text hover:underline truncate">
                    <span className="font-mono text-text-muted mr-1.5">{inst.UInsID}</span>
                    {inst.Name}
                  </Link>
                  <span className={`font-mono shrink-0 inline-flex items-center gap-1 ${isDown ? 'text-danger' : 'text-archive-green'}`}>
                    {isDown && <AlertTriangle size={12} />}
                    {inst.WorkingStatus || 'Operational'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
