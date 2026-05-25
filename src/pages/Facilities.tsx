import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge } from '../components/ui/Cards';
import { DataTable } from '../components/ui/DataTable';
import { InstrumentForm } from '../components/InstrumentForm';
import { EmptyState } from '../components/ui/EmptyState';
import { InsightsStrip } from '../components/viz/InsightsStrip';
import { KpiTile } from '../components/viz/KpiTile';
import { MiniDonut } from '../components/viz/MiniDonut';
import { FilterChip } from '../components/viz/FilterChip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { useChartFilter } from '../utils/useChartFilter';
import { applyChartFilter } from '../utils/applyChartFilter';

const FacilitiesAnalytics = lazy(() => import('./FacilitiesAnalytics'));

const EQUIPMENT_DIM_LABELS: Record<string, string> = {
  status: 'Status',
  division: 'Division',
  lab: 'Lab',
};
import {
  FlaskConical,
  MapPin,
  Wrench,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  CalendarClock,
  BarChart3,
} from 'lucide-react';
import type { Equipment } from '../types';

function amcStatus(dateStr?: string): 'expired' | 'expiring' | 'ok' | 'none' {
  if (!dateStr) return 'none';
  const amc = new Date(dateStr);
  const today = new Date();
  const diffDays = Math.ceil((amc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 90) return 'expiring';
  return 'ok';
}

function AmcBadge({ dateStr }: { dateStr?: string }) {
  const status = amcStatus(dateStr);
  if (status === 'none') return <span className="text-xs text-text-muted">—</span>;
  const variants: Record<'expired' | 'expiring' | 'ok' | 'none', string> = {
    expired:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    expiring: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    ok:       'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    none:     '',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${variants[status]}`}>
      <CalendarClock size={10} />
      {dateStr}
    </span>
  );
}

const ADMIN_ROLES = ['SystemAdmin', 'MasterAdmin', 'HRAdmin'] as const;

export default function Facilities() {
  const { equipment, labs, staff, isLoading } = useData();
  const { user, hasPermission } = useAuth();
  const canUpload = hasPermission(['HRAdmin', 'SystemAdmin', 'MasterAdmin']);
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [divisionFilter, setDivisionFilter] = useState('ALL');
  const [amcFilter, setAmcFilter] = useState('ALL');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Equipment | null>(null);
  const { filter, clearFilter } = useChartFilter();

  const isAdmin = user && (ADMIN_ROLES as readonly string[]).includes(user.activeRole);

  const labMap = useMemo(() => new Map(labs.map(l => [l.id, l.lab_name])), [labs]);

  const divisions = useMemo(() => {
    const seen = new Set<string>();
    equipment.forEach(e => { if (e.Division) seen.add(e.Division); });
    return Array.from(seen).sort();
  }, [equipment]);

  const filteredEquipment = useMemo(() => {
    const base = equipment.filter(e => {
      const matchesSearch =
        e.Name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.instrument_code ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.manufacturer ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.Location ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.IndenterName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || e.WorkingStatus === statusFilter;
      const matchesDivision = divisionFilter === 'ALL' || e.Division === divisionFilter;
      const matchesAmc = amcFilter === 'ALL' || amcStatus(e.amc_end_date) === amcFilter;
      return matchesSearch && matchesStatus && matchesDivision && matchesAmc;
    });
    return applyChartFilter(base, filter, {
      status: (e) => e.WorkingStatus,
      division: (e) => e.Division,
      lab: (e) => e.lab_id,
    });
  }, [equipment, searchTerm, statusFilter, divisionFilter, amcFilter, filter]);

  const kpis = useMemo(() => ({
    total:    equipment.length,
    working:  equipment.filter(e => e.WorkingStatus === 'Working').length,
    maintenance: equipment.filter(e => e.WorkingStatus === 'Under Maintenance').length,
    amcExpired:  equipment.filter(e => amcStatus(e.amc_end_date) === 'expired').length,
    amcExpiring: equipment.filter(e => amcStatus(e.amc_end_date) === 'expiring').length,
  }), [equipment]);

  const statusMix = useMemo(() => {
    const notWorking = equipment.length - kpis.working - kpis.maintenance;
    return [
      { label: 'Working', value: kpis.working },
      { label: 'Maintenance', value: kpis.maintenance },
      { label: 'Down', value: Math.max(0, notWorking) },
    ];
  }, [equipment.length, kpis.working, kpis.maintenance]);

  const findStaffId = (name: string) => {
    if (!name) return null;
    const clean = (n: string) => n.toLowerCase().replace(/^(dr\.|sh\.|shri|smt\.)\s+/i, '').trim();
    const cleaned = clean(name);
    return staff.find(s => {
      const sc = clean(s.Name);
      return sc === cleaned || sc.includes(cleaned) || cleaned.includes(sc);
    })?.ID ?? null;
  };

  const columns = [
    {
      header: 'Instrument',
      cell: (e: Equipment) => (
        <button
          onClick={(ev) => { ev.stopPropagation(); navigate(`/facilities/${e.UInsID}`); }}
          className="text-left group"
        >
          <div className="font-semibold text-text group-hover:text-[#c96442] transition-colors">{e.Name}</div>
          <div className="text-xs text-text-muted mt-0.5 font-mono">
            {e.instrument_code ?? e.UInsID}
            {e.manufacturer && <span className="ml-1.5 text-text-muted/70">· {e.manufacturer}</span>}
          </div>
        </button>
      ),
    },
    {
      header: 'Lab / Location',
      cell: (e: Equipment) => (
        <div className="flex items-start gap-1.5 text-sm text-text-muted">
          <MapPin size={13} className="mt-0.5 text-[#c96442] shrink-0" />
          <div>
            {e.lab_id && labMap.get(e.lab_id) && (
              <div className="text-xs font-medium text-text">{labMap.get(e.lab_id)}</div>
            )}
            <div>{e.Location}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Manager / Operator',
      cell: (e: Equipment) => {
        const mgrId = findStaffId(e.IndenterName);
        const opId  = findStaffId(e.OperatorName);
        return (
          <div className="text-sm">
            {mgrId ? (
              <button onClick={() => navigate(`/staff/${mgrId}`)} className="text-[#c96442] hover:underline font-medium text-left">
                {e.IndenterName}
              </button>
            ) : (
              <div className="text-text">{e.IndenterName}</div>
            )}
            {opId ? (
              <button onClick={() => navigate(`/staff/${opId}`)} className="text-xs text-[#c96442] hover:underline block mt-0.5">
                Op: {e.OperatorName}
              </button>
            ) : (
              <div className="text-xs text-text-muted mt-0.5">Op: {e.OperatorName}</div>
            )}
          </div>
        );
      },
    },
    {
      header: 'AMC End',
      cell: (e: Equipment) => <AmcBadge dateStr={e.amc_end_date} />,
    },
    {
      header: 'Status',
      cell: (e: Equipment) => {
        let variant: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
        let Icon = CheckCircle2;
        if (e.WorkingStatus === 'Working') { variant = 'success'; }
        else if (e.WorkingStatus === 'Under Maintenance') { variant = 'warning'; Icon = Clock; }
        else { Icon = AlertTriangle; variant = 'danger'; }
        return (
          <Badge variant={variant} className="flex items-center gap-1.5 whitespace-nowrap">
            <Icon size={12} />
            {e.WorkingStatus}
          </Badge>
        );
      },
    },
    {
      header: 'Division',
      accessorKey: 'Division' as const,
      className: 'text-xs font-bold text-[#c96442] uppercase',
    },
  ];

  const renderEquipmentCard = (e: Equipment) => {
    let variant: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
    if (e.WorkingStatus === 'Working') variant = 'success';
    else if (e.WorkingStatus === 'Under Maintenance') variant = 'warning';
    else variant = 'danger';
    return (
      <Card className="h-full flex flex-col bg-surface hover:bg-surface-hover hover:border-[#c96442]/50 transition-colors">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="font-bold text-text truncate" title={e.Name}>{e.Name}</h3>
            <div className="text-xs text-text-muted mt-0.5 font-mono truncate">{e.instrument_code ?? e.UInsID}</div>
          </div>
          <Badge variant={variant}>{e.WorkingStatus}</Badge>
        </div>
        <div className="pt-3 border-t border-border/50 text-xs text-text-muted space-y-1.5 mt-auto">
          <div className="flex items-center justify-between gap-2">
            <span>Location</span>
            <span className="text-text truncate max-w-[160px]" title={e.Location}>{e.Location}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Division</span>
            <span className="text-[#c96442] font-bold uppercase">{e.Division}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>AMC End</span>
            <AmcBadge dateStr={e.amc_end_date} />
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Instruments</h1>
          <p className="text-text-muted mt-1">Scientific instrument inventory and maintenance tracking</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setEditTarget(null); setFormOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#c96442] text-white rounded-lg hover:bg-[#b55a3a] transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            Add Instrument
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <InsightsStrip>
        <KpiTile
          label="Total"
          value={kpis.total}
          sublabel="instruments"
          icon={<FlaskConical size={16} />}
          accent="brand"
        >
          <MiniDonut data={statusMix} size={32} />
        </KpiTile>
        <KpiTile
          label="Operational"
          value={kpis.working}
          sublabel="working"
          icon={<CheckCircle2 size={16} />}
          accent="positive"
        />
        <KpiTile
          label="Maintenance"
          value={kpis.maintenance}
          sublabel="under maintenance"
          icon={<Wrench size={16} />}
          accent="warning"
        />
        <KpiTile
          label="AMC Expired"
          value={kpis.amcExpired}
          sublabel="action needed"
          icon={<AlertTriangle size={16} />}
          accent="negative"
        />
        <KpiTile
          label="AMC Expiring"
          value={kpis.amcExpiring}
          sublabel="within 90 days"
          icon={<CalendarClock size={16} />}
          accent="warning"
        />
      </InsightsStrip>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
          <input
            type="text"
            placeholder="Search name, code, manufacturer..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm w-full sm:w-64"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="pl-9 pr-8 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm appearance-none cursor-pointer"
          >
            <option value="ALL">All Status</option>
            <option value="Working">Working</option>
            <option value="Under Maintenance">Under Maintenance</option>
            <option value="Not Working">Not Working</option>
          </select>
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
          <select
            value={divisionFilter}
            onChange={e => setDivisionFilter(e.target.value)}
            className="pl-9 pr-8 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm appearance-none cursor-pointer"
          >
            <option value="ALL">All Divisions</option>
            {divisions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="relative">
          <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
          <select
            value={amcFilter}
            onChange={e => setAmcFilter(e.target.value)}
            className="pl-9 pr-8 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm appearance-none cursor-pointer"
          >
            <option value="ALL">All AMC</option>
            <option value="expired">Expired</option>
            <option value="expiring">Expiring (90d)</option>
            <option value="ok">Valid</option>
            <option value="none">No AMC</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="table">
        <TabsList>
          <TabsTrigger value="table">Table</TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 size={12} className="inline mr-1" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="mt-4 space-y-3">
          <FilterChip filter={filter} onClear={clearFilter} labelMap={EQUIPMENT_DIM_LABELS} />
          {!isLoading && equipment.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="No equipment registered"
              description="Equipment records haven't been loaded yet."
              action={canUpload ? { label: 'Upload via Data Management', to: '/data' } : undefined}
            />
          ) : (
            <Card className="p-0 overflow-hidden">
              <DataTable
                data={filteredEquipment}
                columns={columns}
                keyExtractor={item => item.UInsID}
                onRowClick={item => navigate(`/facilities/${item.UInsID}`)}
                renderGridItem={renderEquipmentCard}
              />
              <div className="p-4 border-t border-border bg-surface-hover text-xs text-text-muted flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <FlaskConical size={14} />
                  Institutional Instrument Management System
                </div>
                <span>{filteredEquipment.length} of {equipment.length} instruments</span>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <Suspense fallback={<div className="text-sm text-text-muted py-12 text-center">Loading analytics…</div>}>
            <FacilitiesAnalytics />
          </Suspense>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Modal */}
      {formOpen && (
        <InstrumentForm
          instrument={editTarget}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
