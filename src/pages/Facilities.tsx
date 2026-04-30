import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { Card, Badge, StatCard } from '../components/ui/Cards';
import { DataTable } from '../components/ui/DataTable';
import { 
  Dna, 
  MapPin, 
  Settings, 
  Wrench, 
  Search, 
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock
} from 'lucide-react';

export default function Facilities() {
  const { equipment, staff } = useData();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  const findStaffId = (name: string) => {
    if (!name || name === 'Self') return null;
    const clean = (n: string) => n.toLowerCase().replace(/^(dr\.|sh\.|smt\.)\s+/i, '').trim();
    const cleaned = clean(name);
    return staff.find(s => clean(s.Name) === cleaned || clean(s.Name).includes(cleaned) || cleaned.includes(clean(s.Name)))?.ID ?? null;
  };
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredEquipment = useMemo(() => {
    return equipment.filter(e => {
      const matchesSearch = 
        e.Name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        e.Location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.IndenterName.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'ALL' || e.WorkingStatus === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [equipment, searchTerm, statusFilter]);

  const workingCount = equipment.filter(e => e.WorkingStatus === 'Working').length;
  const maintenanceCount = equipment.filter(e => e.WorkingStatus === 'Under Maintenance').length;

  const columns = [
    {
      header: 'Equipment',
      cell: (e: any) => (
        <div>
          <div className="font-semibold text-text">{e.Name}</div>
          <div className="text-xs text-text-muted mt-0.5 font-mono">{e.UInsID}</div>
        </div>
      )
    },
    {
      header: 'Location',
      cell: (e: any) => (
        <div className="flex items-center gap-1.5 text-sm text-text-muted">
          <MapPin size={14} className="text-[#c96442]" />
          {e.Location}
        </div>
      )
    },
    {
      header: 'Manager / Operator',
      cell: (e: any) => {
        const managerId = findStaffId(e.IndenterName);
        const opId = findStaffId(e.OperatorName);
        return (
          <div className="text-sm">
            {managerId ? (
              <button onClick={() => navigate(`/staff/${managerId}`)} className="text-[#c96442] hover:underline font-medium text-left">
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
      }
    },
    {
      header: 'Status',
      cell: (e: any) => {
        let variant: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
        let Icon = CheckCircle2;
        
        if (e.WorkingStatus === 'Working') {
          variant = 'success';
        } else if (e.WorkingStatus === 'Under Maintenance') {
          variant = 'warning';
          Icon = Clock;
        } else {
          Icon = AlertTriangle;
        }

        return (
          <div className="flex items-center gap-2">
            <Badge variant={variant} className="flex items-center gap-1.5">
              <Icon size={12} />
              {e.WorkingStatus}
            </Badge>
          </div>
        );
      }
    },
    {
      header: 'Division',
      accessorKey: 'Division' as const,
      className: 'text-xs font-bold text-[#c96442] uppercase'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Facilities & Equipment</h1>
          <p className="text-text-muted mt-1">Resource inventory and operational status tracking</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search equipment, location..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm w-full sm:w-64"
            />
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-9 pr-8 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm appearance-none cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="Working">Working</option>
              <option value="Under Maintenance">Maintenance</option>
              <option value="Idle">Idle</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Assets" value={equipment.length} icon={<Settings />} />
        <StatCard title="Operational" value={workingCount} valueColor="text-emerald-500" icon={<CheckCircle2 />} trend={{ value: 92, label: 'uptime', isPositive: true }} />
        <StatCard title="Maintenance" value={maintenanceCount} valueColor="text-amber-500" icon={<Wrench />} />
      </div>

      <Card className="p-0 overflow-hidden">
        <DataTable 
          data={filteredEquipment}
          columns={columns}
          keyExtractor={(item) => item.UInsID}
        />
        
        <div className="p-4 border-t border-border bg-surface-hover text-xs text-text-muted flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Dna size={14} />
            Institutional Resource Management System
          </div>
          <span>{filteredEquipment.length} items found</span>
        </div>
      </Card>
    </div>
  );
}
