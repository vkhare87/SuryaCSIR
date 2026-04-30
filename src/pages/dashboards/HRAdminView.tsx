import { useNavigate } from 'react-router-dom';
import { Users, Network } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';

export function HRAdminView() {
  const { staff, divisions } = useData();
  const navigate = useNavigate();

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
            HR Administration
          </h1>
          <p className="text-[#87867f] mt-1 text-sm font-medium">
            Manage staff records and personnel information
          </p>
        </div>
        <button
          onClick={() => navigate('/staff')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#c96442] text-[#faf9f5] text-sm font-semibold rounded-[8px] hover:bg-[#b5593b] transition-colors shadow-[0px_0px_0px_1px_#b5593b]"
        >
          + Add Staff
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md">
        <KpiCard
          label="Total Staff"
          value={staff.length}
          icon={<Users size={18} />}
          sublabel="Permanent personnel"
        />
        <KpiCard
          label="Divisions"
          value={divisions.length}
          icon={<Network size={18} />}
          sublabel="Active divisions"
        />
      </div>

      {/* Staff Table */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f0eee6]">
          <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">All Staff</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f5f4ed]">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Name</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Designation</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Division</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Group</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Email</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0eee6]">
              {staff.map(s => (
                <tr key={s.ID} className="hover:bg-[#f5f4ed] transition-colors">
                  <td className="px-6 py-3 text-[#4d4c48] font-medium">{s.Name}</td>
                  <td className="px-6 py-3 text-[#87867f]">{s.Designation}</td>
                  <td className="px-6 py-3 text-[#87867f] font-mono text-xs">{s.Division}</td>
                  <td className="px-6 py-3 text-[#87867f]">{s.Group}</td>
                  <td className="px-6 py-3 text-[#87867f] font-mono text-xs">{s.Email}</td>
                  <td className="px-6 py-3">
                    <button
                      onClick={() => navigate(`/staff/${s.ID}`)}
                      className="text-[#c96442] text-xs font-semibold hover:text-[#b5593b] hover:underline transition-colors"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[#87867f] text-xs italic">
                    No staff records found.
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
