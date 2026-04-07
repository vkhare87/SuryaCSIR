import { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { Card, Badge, StatCard } from '../components/ui/Cards';
import { DataTable } from '../components/ui/DataTable';
import { 
  BarChart3, 
  Lightbulb, 
  BookOpen, 
  Search, 
  Filter,
  ExternalLink,
  Award
} from 'lucide-react';

export default function Intelligence() {
  const { scientificOutputs, ipIntelligence } = useData();
  const [activeTab, setActiveTab] = useState<'publications' | 'ipr'>('publications');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPubs = scientificOutputs.filter(p => 
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.authors.some(a => a.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredIP = ipIntelligence.filter(p => 
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.inventors.some(i => i.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const pubColumns = [
    {
      header: 'Title',
      cell: (p: any) => (
        <div className="max-w-md">
          <div className="font-semibold text-text leading-tight">{p.title}</div>
          <div className="text-xs text-text-muted mt-1 italic">{p.journal} ({p.year})</div>
        </div>
      )
    },
    {
      header: 'Authors',
      cell: (p: any) => (
        <div className="text-xs text-text-muted">
          {p.authors.join(', ')}
        </div>
      )
    },
    {
      header: 'Metrics',
      cell: (p: any) => (
        <div className="flex gap-2">
          <Badge variant="info">IF: {p.impactFactor}</Badge>
          <Badge variant="neutral">Citations: {p.citationCount}</Badge>
        </div>
      )
    },
    {
      header: 'DOI',
      cell: (p: any) => (
        <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" className="text-[#c96442] hover:underline flex items-center gap-1 text-xs">
          <ExternalLink size={12} />
          View
        </a>
      )
    }
  ];

  const ipColumns = [
    {
      header: 'Intellectual Property',
      cell: (p: any) => (
        <div className="max-w-md">
          <div className="font-semibold text-text leading-tight">{p.title}</div>
          <div className="text-xs text-text-muted mt-1 uppercase tracking-wider">{p.type}</div>
        </div>
      )
    },
    {
      header: 'Inventors',
      cell: (p: any) => (
        <div className="text-xs text-text-muted">
          {p.inventors.join(', ')}
        </div>
      )
    },
    {
      header: 'Status',
      cell: (p: any) => {
        let variant: 'success' | 'warning' | 'info' | 'neutral' = 'neutral';
        if (p.status === 'Granted') variant = 'success';
        if (p.status === 'Published') variant = 'info';
        if (p.status === 'Filed') variant = 'warning';
        return <Badge variant={variant}>{p.status}</Badge>;
      }
    },
    {
      header: 'Filing Date',
      accessorKey: 'filingDate' as const,
      className: 'text-sm text-text-muted font-mono'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Institutional Intelligence</h1>
          <p className="text-text-muted mt-1">Scientific Output & IP Portfolio analysis</p>
        </div>
        
        <div className="flex bg-surface border border-border p-1 rounded-xl">
           <button 
             onClick={() => setActiveTab('publications')}
             className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'publications' ? 'bg-[#c96442] text-white' : 'text-text-muted hover:text-text'}`}
           >
             Publications
           </button>
           <button 
             onClick={() => setActiveTab('ipr')}
             className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'ipr' ? 'bg-[#c96442] text-white' : 'text-text-muted hover:text-text'}`}
           >
             IP Intelligence
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Publications" value={scientificOutputs.length} icon={<BookOpen />} />
        <StatCard title="Total IP Assets" value={ipIntelligence.length} icon={<Lightbulb />} />
        <StatCard title="Avg Impact Factor" value="6.8" valueColor="text-emerald-500" icon={<Award />} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row justify-between items-center gap-4 bg-surface-hover">
           <div className="relative w-full sm:w-64">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
             <input 
               type="text" 
               placeholder="Search..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="pl-9 pr-4 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm w-full"
             />
           </div>
           <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
             <Filter size={14} />
             Sorted by Latest
           </div>
        </div>

        {activeTab === 'publications' ? (
          <DataTable 
            data={filteredPubs}
            columns={pubColumns}
            keyExtractor={(item) => item.id}
          />
        ) : (
          <DataTable 
            data={filteredIP}
            columns={ipColumns}
            keyExtractor={(item) => item.id}
          />
        )}
        
        <div className="p-4 border-t border-border bg-surface text-xs text-text-muted flex items-center gap-2">
          <BarChart3 size={14} />
          {activeTab === 'publications' ? `Total ${filteredPubs.length} journals matched` : `Total ${filteredIP.length} IP records matched`}
        </div>
      </Card>
    </div>
  );
}
