import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { DataTable } from '../components/ui/DataTable';
import { Card } from '../components/ui/Cards';
import { Badge } from '../components/ui/Cards';
import { Search, Filter } from 'lucide-react';
import { TableSkeleton } from '../components/ui/Skeleton';

export default function HumanCapital() {
  const { staff, divisions } = useData();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDivision, setSelectedDivision] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  // Simulate data fetch effect for polish demo (only once)
  useState(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  });

  const filteredStaff = useMemo(() => {
    return staff.filter(member => {
      const searchStr = searchTerm.toLowerCase();
      const matchesSearch = 
        (member.Name?.toLowerCase() || '').includes(searchStr) || 
        (member.Designation?.toLowerCase() || '').includes(searchStr) ||
        (member.ID || '').includes(searchTerm);
      
      const matchesDivision = selectedDivision === 'ALL' || member.Division === selectedDivision;
      
      return matchesSearch && matchesDivision;
    });
  }, [staff, searchTerm, selectedDivision]);

  const columns = [
    {
      header: 'Staff ID',
      accessorKey: 'ID' as const,
      className: 'w-24 font-mono text-text-muted',
    },
    {
      header: 'Name & Designation',
      cell: (member: any) => (
        <div>
          <div className="font-semibold text-text">{member.Name}</div>
          <div className="text-xs text-text-muted mt-0.5">{member.Designation}</div>
        </div>
      ),
    },
    {
      header: 'Division',
      accessorKey: 'Division' as const,
      cell: (member: any) => {
        const divInfo = divisions.find(d => d.divCode === member.Division);
        return (
          <Badge variant="info">
            {divInfo ? divInfo.divCode : member.Division}
          </Badge>
        );
      }
    },
    {
      header: 'Group',
      accessorKey: 'Group' as const,
      cell: (member: any) => (
        <Badge variant={member.Group === 'Scientific' ? 'success' : 'neutral'}>
          {member.Group}
        </Badge>
      )
    },
    {
      header: 'Contact',
      cell: (member: any) => (
        <div className="text-sm">
          <div className="text-[#c96442] truncate max-w-[200px]" title={member.Email}>{member.Email}</div>
          <div className="text-xs text-text-muted mt-0.5">Ext: {member.Ext}</div>
        </div>
      ),
    }
  ];

  const renderStaffCard = (member: any) => {
    const divInfo = divisions.find(d => d.divCode === member.Division);
    return (
      <Card className="h-full flex flex-col bg-surface hover:bg-surface-hover hover:border-[#c96442]/50 transition-colors pointer-events-none group-hover:bg-surface-hover">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-[#c96442]/10 text-[#c96442] flex items-center justify-center font-bold text-lg shrink-0 ring-4 ring-background">
            {member.Name?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-text truncate" title={member.Name}>{member.Name}</h3>
            <div className="text-sm text-[#c96442] font-medium mt-0.5 truncate">{member.Designation}</div>
          </div>
        </div>
        
        <div className="space-y-3 mt-auto mb-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">
              {divInfo ? divInfo.divCode : member.Division}
            </Badge>
            <Badge variant={member.Group === 'Scientific' ? 'success' : 'neutral'}>
              {member.Group}
            </Badge>
          </div>
        </div>
        
        <div className="pt-4 border-t border-border/50 text-xs text-text-muted space-y-1.5 mt-auto">
          <div className="flex items-center justify-between">
            <span>Staff ID</span>
            <span className="font-mono font-medium text-text">{member.ID}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Email</span>
            <span className="text-[#c96442] truncate max-w-[150px]" title={member.Email}>{member.Email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Extension</span>
            <span className="text-text">{member.Ext || 'N/A'}</span>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Human Capital</h1>
          <p className="text-text-muted mt-1">Staff Directory and Division Assignments</p>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search staff, ID..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm w-full sm:w-64"
            />
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="pl-9 pr-8 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm appearance-none cursor-pointer"
            >
              <option value="ALL">All Divisions</option>
              {divisions.map(d => (
                <option key={d.divCode} value={d.divCode}>{d.divCode} - {d.divName}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-8">
            <TableSkeleton />
          </div>
        ) : (
          <>
            <DataTable 
              data={filteredStaff}
              columns={columns}
              keyExtractor={(item) => item.ID}
              onRowClick={(item) => navigate(`/staff/${item.ID}`)}
              itemsPerPage={12}
              renderGridItem={renderStaffCard}
              className="border-0 shadow-none bg-transparent"
            />
          </>
        )}
      </Card>
    </div>
  );
}
