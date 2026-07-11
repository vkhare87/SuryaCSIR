import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge } from '../components/ui/Cards';
import { InstrumentForm } from '../components/InstrumentForm';
import { RelatedRail, type RailSection } from '../components/RelatedRail';
import { amcStatus, AMC_CARD_COLORS, AMC_TEXT_COLORS, findStaffByName } from '../utils/dateUtils';
import {
  ArrowLeft, MapPin, Wrench, CalendarClock, AlertTriangle,
  CheckCircle2, Clock, Package, DollarSign, Users, FlaskConical,
  Edit,
} from 'lucide-react';

const ADMIN_ROLES = ['SystemAdmin', 'MasterAdmin', 'HRAdmin'] as const;

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-border last:border-0">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <span className="text-sm font-medium text-text text-right max-w-[60%]">{value ?? '—'}</span>
    </div>
  );
}

export default function InstrumentDetail() {
  const { uInsID } = useParams<{ uInsID: string }>();
  const navigate = useNavigate();
  const { equipment, labs, staff, projects } = useData();
  const { user } = useAuth();

  const [editOpen, setEditOpen] = useState(false);

  const instrument = useMemo(
    () => equipment.find(e => e.UInsID === uInsID),
    [equipment, uInsID]
  );

  const lab = useMemo(
    () => instrument?.lab_id ? labs.find(l => l.id === instrument.lab_id) : undefined,
    [instrument, labs]
  );

  const relatedSections: RailSection[] = useMemo(() => {
    const div = instrument?.Division;
    if (!div) return [];
    return [
      { title: 'Staff in division', kind: 'staff', ids: staff.filter(s => s.Division === div).map(s => s.ID).slice(0, 25) },
      { title: 'Projects in division', kind: 'project', ids: projects.filter(p => p.DivisionCode === div).map(p => p.ProjectID).slice(0, 25) },
    ];
  }, [instrument, staff, projects]);

  const isAdmin = user && (ADMIN_ROLES as readonly string[]).includes(user.activeRole);

  if (!instrument) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
        <p className="text-text-muted">Instrument not found.</p>
        <button
          onClick={() => navigate('/facilities')}
          className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors"
        >
          Back to Instruments
        </button>
      </div>
    );
  }

  const statusVariant = (ws: string): 'success' | 'warning' | 'danger' | 'neutral' => {
    if (ws === 'Working') return 'success';
    if (ws === 'Under Maintenance') return 'warning';
    if (ws === 'Not Working') return 'danger';
    return 'neutral';
  };

  const amc = amcStatus(instrument.amc_end_date);

  const manager = findStaffByName(staff, instrument.IndenterName);
  const operator = findStaffByName(staff, instrument.OperatorName);

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/facilities')}
            className="p-2 hover:bg-surface-hover rounded-full transition-colors text-text-muted hover:text-text"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-[500] text-text font-serif">Instrument Profile</h1>
            <p className="text-text-muted text-sm">Scientific Instrument Record</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RelatedRail sections={relatedSections} />
          {isAdmin && (
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors text-text"
            >
              <Edit size={14} />
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT COLUMN */}
        <div className="lg:col-span-1 space-y-4">

          {/* Identity card */}
          <Card className="border-t-4 border-[#c96442] relative overflow-hidden pt-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#d97757]/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <div className="flex flex-col items-center text-center space-y-3 z-10 relative">
              <div className="w-16 h-16 rounded-full bg-surface-hover border-4 border-background flex items-center justify-center ring-2 ring-border">
                <FlaskConical size={28} className="text-[#c96442]" />
              </div>
              <div>
                <h2 className="text-lg font-[500] text-text font-serif leading-snug">{instrument.Name}</h2>
                {instrument.instrument_code && (
                  <p className="text-xs font-mono text-[#c96442] mt-1">{instrument.instrument_code}</p>
                )}
                <div className="mt-2 flex justify-center gap-2 flex-wrap">
                  <Badge variant={statusVariant(instrument.WorkingStatus)}>
                    {instrument.WorkingStatus === 'Working' && <CheckCircle2 size={11} className="inline mr-1" />}
                    {instrument.WorkingStatus === 'Under Maintenance' && <Clock size={11} className="inline mr-1" />}
                    {instrument.WorkingStatus === 'Not Working' && <AlertTriangle size={11} className="inline mr-1" />}
                    {instrument.WorkingStatus}
                  </Badge>
                  {instrument.Division && <Badge variant="neutral">{instrument.Division}</Badge>}
                </div>
              </div>
            </div>
          </Card>

          {/* Identification card */}
          <Card>
            <div className="flex items-center gap-2 text-[10px] font-semibold text-[#c96442] uppercase tracking-[0.2em] mb-3">
              <Package size={13} />
              Identification
            </div>
            <InfoRow label="UInsID"          value={instrument.UInsID} />
            <InfoRow label="Instrument Code" value={instrument.instrument_code} />
            <InfoRow label="Serial Number"   value={instrument.serial_number} />
            <InfoRow label="Manufacturer"    value={instrument.manufacturer} />
            <InfoRow label="Year Manufactured" value={instrument.year_of_manufacture} />
          </Card>

          {/* AMC card */}
          <div className={`rounded-xl border p-4 ${AMC_CARD_COLORS[amc]}`}>
            <div className="flex items-center gap-2 mb-2">
              <CalendarClock size={14} className={AMC_TEXT_COLORS[amc]} />
              <span className={`text-[10px] font-black uppercase tracking-widest ${AMC_TEXT_COLORS[amc]}`}>AMC Status</span>
            </div>
            <div className={`text-base font-bold ${AMC_TEXT_COLORS[amc]}`}>
              {amc === 'expired' && 'EXPIRED'}
              {amc === 'expiring' && 'EXPIRING SOON'}
              {amc === 'ok' && 'VALID'}
              {amc === 'none' && 'No AMC recorded'}
            </div>
            {instrument.amc_end_date && (
              <div className={`text-xs mt-1 ${AMC_TEXT_COLORS[amc]}`}>End date: {instrument.amc_end_date}</div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-2 space-y-5">

          {/* Location card */}
          <Card>
            <div className="flex items-center gap-2 text-[10px] font-semibold text-[#c96442] uppercase tracking-[0.2em] mb-3">
              <MapPin size={13} />
              Location
            </div>
            <InfoRow label="Division"     value={instrument.Division} />
            <InfoRow label="Lab"          value={lab?.lab_name ?? (instrument.lab_id || undefined)} />
            <InfoRow label="Location"     value={instrument.Location} />
            <InfoRow label="Movable"      value={instrument.Movable} />
            <InfoRow label="Req / Installation" value={instrument.RequirementInstallation} />
            <InfoRow label="End Use"      value={instrument.EndUse} />
          </Card>

          {/* Procurement card */}
          <Card>
            <div className="flex items-center gap-2 text-[10px] font-semibold text-[#c96442] uppercase tracking-[0.2em] mb-3">
              <DollarSign size={13} />
              Procurement
            </div>
            <InfoRow label="Procurement Date" value={instrument.procurement_date} />
            <InfoRow
              label="Purchase Cost"
              value={instrument.purchase_cost != null
                ? `₹ ${instrument.purchase_cost.toLocaleString('en-IN')}`
                : undefined}
            />
            <InfoRow label="Indenter / Manager" value={instrument.IndenterName} />
            <InfoRow label="Justification"      value={instrument.Justification} />
          </Card>

          {/* People card */}
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-border bg-surface flex items-center gap-2">
              <Users size={16} className="text-[#c96442]" />
              <h3 className="text-sm font-[500] text-text font-serif">Associated Personnel</h3>
            </div>
            <div className="divide-y divide-border">
              {[
                { role: 'Manager / Indenter', member: manager, name: instrument.IndenterName },
                { role: 'Operator', member: operator, name: instrument.OperatorName },
              ].map(({ role, member, name }) => (
                <div key={role} className="p-4 flex items-center justify-between gap-4">
                  <div className="text-xs text-text-muted font-medium w-28 shrink-0">{role}</div>
                  {member ? (
                    <Link
                      to={`/staff/${member.ID}`}
                      className="flex items-center gap-2 flex-1 group"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#c96442]/10 flex items-center justify-center font-bold text-sm text-[#c96442] shrink-0">
                        {member.Name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-text group-hover:text-[#c96442] transition-colors">{member.Name}</div>
                        <div className="text-xs text-text-muted">{member.Designation}</div>
                      </div>
                    </Link>
                  ) : (
                    <span className="text-sm text-text-muted flex-1">{name || '—'}</span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Remark */}
          {instrument.Remark && (
            <Card>
              <div className="flex items-center gap-2 text-[10px] font-semibold text-[#c96442] uppercase tracking-[0.2em] mb-2">
                <Wrench size={13} />
                Remark
              </div>
              <p className="text-sm text-text-muted leading-relaxed">{instrument.Remark}</p>
            </Card>
          )}

        </div>
      </div>

      {editOpen && (
        <InstrumentForm instrument={instrument} onClose={() => setEditOpen(false)} />
      )}
    </div>
  );
}
