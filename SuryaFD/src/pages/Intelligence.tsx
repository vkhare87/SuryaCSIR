import { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { Card, Badge, StatCard } from '../components/ui/Cards';
import { DataTable } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { supabase } from '../utils/supabaseClient';
import type { ScientificOutput, IPIntelligence } from '../types';
import {
  BarChart3,
  Lightbulb,
  BookOpen,
  Search,
  Filter,
  ExternalLink,
  Award,
  Plus,
  Trash2,
} from 'lucide-react';

export default function Intelligence() {
  const { scientificOutputs, ipIntelligence, refreshData } = useData();
  const [activeTab, setActiveTab] = useState<'publications' | 'ipr'>('publications');
  const [searchTerm, setSearchTerm] = useState('');

  // -------------------------------------------------------------------------
  // Modal state
  // -------------------------------------------------------------------------

  const [pubModalMode, setPubModalMode] = useState<'add' | 'edit' | null>(null);
  const [ipModalMode, setIPModalMode] = useState<'add' | 'edit' | null>(null);
  const [selectedPub, setSelectedPub] = useState<ScientificOutput | null>(null);
  const [selectedIP, setSelectedIP] = useState<IPIntelligence | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Publication form state
  const [pubForm, setPubForm] = useState({
    title: '',
    authors: '',
    journal: '',
    year: '',
    doi: '',
    impactFactor: '',
    citationCount: '',
    divisionCode: '',
  });

  // IP form state
  const [ipForm, setIPForm] = useState({
    title: '',
    type: 'Patent' as string,
    status: 'Filed' as string,
    filingDate: '',
    grantDate: '',
    inventors: '',
    divisionCode: '',
  });

  // -------------------------------------------------------------------------
  // Filtered data
  // -------------------------------------------------------------------------

  const filteredPubs = scientificOutputs.filter(
    (p) =>
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.authors.some((a) => a.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  const filteredIP = ipIntelligence.filter(
    (p) =>
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.inventors.some((i) => i.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  // -------------------------------------------------------------------------
  // Publication CRUD handlers
  // -------------------------------------------------------------------------

  const handlePubSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setIsSaving(true);
    const record = {
      title: pubForm.title,
      authors: pubForm.authors
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      journal: pubForm.journal,
      year: parseInt(pubForm.year, 10),
      doi: pubForm.doi || null,
      impact_factor: pubForm.impactFactor ? parseFloat(pubForm.impactFactor) : null,
      citation_count: pubForm.citationCount ? parseInt(pubForm.citationCount, 10) : null,
      division_code: pubForm.divisionCode,
    };
    if (pubModalMode === 'add') {
      const id = crypto.randomUUID();
      await supabase.from('scientific_outputs').insert({ id, ...record });
    } else if (selectedPub) {
      await supabase.from('scientific_outputs').update(record).eq('id', selectedPub.id);
    }
    await refreshData();
    setPubModalMode(null);
    setIsSaving(false);
  };

  const handlePubDelete = async () => {
    if (!supabase || !selectedPub) return;
    setIsSaving(true);
    await supabase.from('scientific_outputs').delete().eq('id', selectedPub.id);
    await refreshData();
    setPubModalMode(null);
    setDeleteConfirm(false);
    setIsSaving(false);
  };

  // -------------------------------------------------------------------------
  // IP CRUD handlers
  // -------------------------------------------------------------------------

  const handleIPSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setIsSaving(true);
    const record = {
      title: ipForm.title,
      type: ipForm.type,
      status: ipForm.status,
      filing_date: ipForm.filingDate,
      grant_date: ipForm.grantDate || null,
      inventors: ipForm.inventors
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      division_code: ipForm.divisionCode,
    };
    if (ipModalMode === 'add') {
      const id = crypto.randomUUID();
      await supabase.from('ip_intelligence').insert({ id, ...record });
    } else if (selectedIP) {
      await supabase.from('ip_intelligence').update(record).eq('id', selectedIP.id);
    }
    await refreshData();
    setIPModalMode(null);
    setIsSaving(false);
  };

  const handleIPDelete = async () => {
    if (!supabase || !selectedIP) return;
    setIsSaving(true);
    await supabase.from('ip_intelligence').delete().eq('id', selectedIP.id);
    await refreshData();
    setIPModalMode(null);
    setDeleteConfirm(false);
    setIsSaving(false);
  };

  // -------------------------------------------------------------------------
  // Column definitions
  // -------------------------------------------------------------------------

  const pubColumns = [
    {
      header: 'Title',
      cell: (p: ScientificOutput) => (
        <div className="max-w-md">
          <div className="font-semibold text-text leading-tight">{p.title}</div>
          <div className="text-xs text-text-muted mt-1 italic">
            {p.journal} ({p.year})
          </div>
        </div>
      ),
    },
    {
      header: 'Authors',
      cell: (p: ScientificOutput) => (
        <div className="text-xs text-text-muted">{p.authors.join(', ')}</div>
      ),
    },
    {
      header: 'Metrics',
      cell: (p: ScientificOutput) => (
        <div className="flex gap-2">
          <Badge variant="info">IF: {p.impactFactor}</Badge>
          <Badge variant="neutral">Citations: {p.citationCount}</Badge>
        </div>
      ),
    },
    {
      header: 'DOI',
      cell: (p: ScientificOutput) => (
        <a
          href={`https://doi.org/${p.doi}`}
          target="_blank"
          rel="noreferrer"
          className="text-[#c96442] hover:underline flex items-center gap-1 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={12} />
          View
        </a>
      ),
    },
  ];

  const ipColumns = [
    {
      header: 'Intellectual Property',
      cell: (p: IPIntelligence) => (
        <div className="max-w-md">
          <div className="font-semibold text-text leading-tight">{p.title}</div>
          <div className="text-xs text-text-muted mt-1 uppercase tracking-wider">{p.type}</div>
        </div>
      ),
    },
    {
      header: 'Inventors',
      cell: (p: IPIntelligence) => (
        <div className="text-xs text-text-muted">{p.inventors.join(', ')}</div>
      ),
    },
    {
      header: 'Status',
      cell: (p: IPIntelligence) => {
        let variant: 'success' | 'warning' | 'info' | 'neutral' = 'neutral';
        if (p.status === 'Granted') variant = 'success';
        if (p.status === 'Published') variant = 'info';
        if (p.status === 'Filed') variant = 'warning';
        return <Badge variant={variant}>{p.status}</Badge>;
      },
    },
    {
      header: 'Filing Date',
      accessorKey: 'filingDate' as const,
      className: 'text-sm text-text-muted font-mono',
    },
  ];

  // -------------------------------------------------------------------------
  // Shared input style
  // -------------------------------------------------------------------------

  const inputCls =
    'w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-[#c96442] focus:border-[#c96442]';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

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
        <StatCard
          title="Avg Impact Factor"
          value="6.8"
          valueColor="text-emerald-500"
          icon={<Award />}
        />
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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
              <Filter size={14} />
              Sorted by Latest
            </div>
            {/* Add button */}
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (activeTab === 'publications') {
                  setSelectedPub(null);
                  setPubForm({
                    title: '',
                    authors: '',
                    journal: '',
                    year: '',
                    doi: '',
                    impactFactor: '',
                    citationCount: '',
                    divisionCode: '',
                  });
                  setDeleteConfirm(false);
                  setPubModalMode('add');
                } else {
                  setSelectedIP(null);
                  setIPForm({
                    title: '',
                    type: 'Patent',
                    status: 'Filed',
                    filingDate: '',
                    grantDate: '',
                    inventors: '',
                    divisionCode: '',
                  });
                  setDeleteConfirm(false);
                  setIPModalMode('add');
                }
              }}
            >
              <Plus size={14} className="mr-1" />
              Add
            </Button>
          </div>
        </div>

        {activeTab === 'publications' ? (
          <DataTable
            data={filteredPubs}
            columns={pubColumns}
            keyExtractor={(item) => item.id}
            onRowClick={(pub) => {
              setSelectedPub(pub);
              setPubForm({
                title: pub.title,
                authors: pub.authors.join(', '),
                journal: pub.journal,
                year: String(pub.year),
                doi: pub.doi || '',
                impactFactor: pub.impactFactor != null ? String(pub.impactFactor) : '',
                citationCount: pub.citationCount != null ? String(pub.citationCount) : '',
                divisionCode: pub.divisionCode,
              });
              setDeleteConfirm(false);
              setPubModalMode('edit');
            }}
          />
        ) : (
          <DataTable
            data={filteredIP}
            columns={ipColumns}
            keyExtractor={(item) => item.id}
            onRowClick={(ip) => {
              setSelectedIP(ip);
              setIPForm({
                title: ip.title,
                type: ip.type,
                status: ip.status,
                filingDate: ip.filingDate,
                grantDate: ip.grantDate || '',
                inventors: ip.inventors.join(', '),
                divisionCode: ip.divisionCode,
              });
              setDeleteConfirm(false);
              setIPModalMode('edit');
            }}
          />
        )}

        <div className="p-4 border-t border-border bg-surface text-xs text-text-muted flex items-center gap-2">
          <BarChart3 size={14} />
          {activeTab === 'publications'
            ? `Total ${filteredPubs.length} journals matched`
            : `Total ${filteredIP.length} IP records matched`}
        </div>
      </Card>

      {/* -------------------------------------------------------------------- */}
      {/* Publication Modal (Add / Edit)                                        */}
      {/* -------------------------------------------------------------------- */}
      <Modal
        isOpen={pubModalMode !== null}
        onClose={() => setPubModalMode(null)}
        title={pubModalMode === 'add' ? 'Add Publication' : 'Edit Publication'}
      >
        <form onSubmit={handlePubSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Title *</label>
            <input
              required
              value={pubForm.title}
              onChange={(e) => setPubForm({ ...pubForm, title: e.target.value })}
              className={inputCls}
              placeholder="Publication title"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">
              Authors * (comma-separated)
            </label>
            <input
              required
              value={pubForm.authors}
              onChange={(e) => setPubForm({ ...pubForm, authors: e.target.value })}
              className={inputCls}
              placeholder="Author One, Author Two"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">Journal *</label>
              <input
                required
                value={pubForm.journal}
                onChange={(e) => setPubForm({ ...pubForm, journal: e.target.value })}
                className={inputCls}
                placeholder="Journal name"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">Year *</label>
              <input
                required
                type="number"
                value={pubForm.year}
                onChange={(e) => setPubForm({ ...pubForm, year: e.target.value })}
                className={inputCls}
                placeholder="2024"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">DOI</label>
            <input
              value={pubForm.doi}
              onChange={(e) => setPubForm({ ...pubForm, doi: e.target.value })}
              className={inputCls}
              placeholder="10.xxxx/xxxxx"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">
                Impact Factor
              </label>
              <input
                type="number"
                step="0.01"
                value={pubForm.impactFactor}
                onChange={(e) => setPubForm({ ...pubForm, impactFactor: e.target.value })}
                className={inputCls}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">Citations</label>
              <input
                type="number"
                value={pubForm.citationCount}
                onChange={(e) => setPubForm({ ...pubForm, citationCount: e.target.value })}
                className={inputCls}
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">
              Division Code *
            </label>
            <input
              required
              value={pubForm.divisionCode}
              onChange={(e) => setPubForm({ ...pubForm, divisionCode: e.target.value })}
              className={inputCls}
              placeholder="DIV-001"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : pubModalMode === 'add' ? 'Add Publication' : 'Save Changes'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPubModalMode(null)}>
              Cancel
            </Button>
          </div>

          {/* Delete section inside Edit modal */}
          {pubModalMode === 'edit' && (
            <div className="border-t border-border pt-4 mt-2">
              {!deleteConfirm ? (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setDeleteConfirm(true)}
                  disabled={isSaving}
                >
                  <Trash2 size={14} className="mr-1" />
                  Delete Publication
                </Button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-rose-600">Are you sure?</span>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={handlePubDelete}
                    disabled={isSaving}
                  >
                    Yes, Delete
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setDeleteConfirm(false)}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </form>
      </Modal>

      {/* -------------------------------------------------------------------- */}
      {/* IP Intelligence Modal (Add / Edit)                                    */}
      {/* -------------------------------------------------------------------- */}
      <Modal
        isOpen={ipModalMode !== null}
        onClose={() => setIPModalMode(null)}
        title={ipModalMode === 'add' ? 'Add IP Asset' : 'Edit IP Asset'}
      >
        <form onSubmit={handleIPSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Title *</label>
            <input
              required
              value={ipForm.title}
              onChange={(e) => setIPForm({ ...ipForm, title: e.target.value })}
              className={inputCls}
              placeholder="IP title"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">Type *</label>
              <select
                required
                value={ipForm.type}
                onChange={(e) => setIPForm({ ...ipForm, type: e.target.value })}
                className={inputCls}
              >
                <option value="Patent">Patent</option>
                <option value="Copyright">Copyright</option>
                <option value="Design">Design</option>
                <option value="Trademark">Trademark</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">Status *</label>
              <select
                required
                value={ipForm.status}
                onChange={(e) => setIPForm({ ...ipForm, status: e.target.value })}
                className={inputCls}
              >
                <option value="Filed">Filed</option>
                <option value="Published">Published</option>
                <option value="Granted">Granted</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">
                Filing Date *
              </label>
              <input
                required
                type="date"
                value={ipForm.filingDate}
                onChange={(e) => setIPForm({ ...ipForm, filingDate: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">
                Grant Date
              </label>
              <input
                type="date"
                value={ipForm.grantDate}
                onChange={(e) => setIPForm({ ...ipForm, grantDate: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">
              Inventors * (comma-separated)
            </label>
            <input
              required
              value={ipForm.inventors}
              onChange={(e) => setIPForm({ ...ipForm, inventors: e.target.value })}
              className={inputCls}
              placeholder="Inventor One, Inventor Two"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">
              Division Code *
            </label>
            <input
              required
              value={ipForm.divisionCode}
              onChange={(e) => setIPForm({ ...ipForm, divisionCode: e.target.value })}
              className={inputCls}
              placeholder="DIV-001"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : ipModalMode === 'add' ? 'Add IP Asset' : 'Save Changes'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setIPModalMode(null)}>
              Cancel
            </Button>
          </div>

          {/* Delete section inside Edit modal */}
          {ipModalMode === 'edit' && (
            <div className="border-t border-border pt-4 mt-2">
              {!deleteConfirm ? (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setDeleteConfirm(true)}
                  disabled={isSaving}
                >
                  <Trash2 size={14} className="mr-1" />
                  Delete IP Asset
                </Button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-rose-600">Are you sure?</span>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={handleIPDelete}
                    disabled={isSaving}
                  >
                    Yes, Delete
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setDeleteConfirm(false)}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
