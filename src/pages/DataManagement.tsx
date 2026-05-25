import React, { useState } from 'react';
import { MapPin, Tags } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '../components/ui/Cards';
import { DatabaseBuilderPanel } from '../components/DatabaseBuilderPanel';
import { supabase } from '../utils/supabaseClient';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import type { DivisionInfo, ProjectStaff, PhDStudent, ContractStaff } from '../types';

// ---------------------------------------------------------------------------
// StaffMappingPanel
// ---------------------------------------------------------------------------

type MappingSubTab = 'projectStaff' | 'phd' | 'contract';

interface StaffMappingPanelProps {
  divisions: DivisionInfo[];
  staff: import('../types').StaffMember[];
  projectStaff: ProjectStaff[];
  phDStudents: PhDStudent[];
  contractStaff: ContractStaff[];
  onSaved: () => Promise<void>;
}

function StaffMappingPanel({ divisions, staff, projectStaff, phDStudents, contractStaff, onSaved }: StaffMappingPanelProps) {
  const [subTab, setSubTab] = useState<MappingSubTab>('projectStaff');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftDivision, setDraftDivision] = useState('');
  const [draftAttached, setDraftAttached] = useState('');

  const openRow = (id: string, currentDivision: string, currentAttached: string) => {
    setExpandedId(id); setDraftDivision(currentDivision); setDraftAttached(currentAttached);
  };
  const closeRow = () => { setExpandedId(null); setDraftDivision(''); setDraftAttached(''); };

  const saveProjectStaff = async (id: string) => {
    if (!supabase) return;
    setSavingId(id);
    await supabase.from('project_staff').update({ DivisionCode: draftDivision, PIName: draftAttached }).eq('id', id);
    await onSaved(); setSavingId(null); closeRow();
  };
  const savePhD = async (enrollmentNo: string) => {
    if (!supabase) return;
    setSavingId(enrollmentNo);
    await supabase.from('phd_students').update({ DivisionCode: draftDivision, SupervisorName: draftAttached }).eq('EnrollmentNo', enrollmentNo);
    await onSaved(); setSavingId(null); closeRow();
  };
  const saveContract = async (id: string) => {
    if (!supabase) return;
    setSavingId(id);
    await supabase.from('contract_staff').update({ Division: draftDivision, AttachedToStaffID: draftAttached }).eq('id', id);
    await onSaved(); setSavingId(null); closeRow();
  };

  const SUB_TABS: { key: MappingSubTab; label: string; count: number }[] = [
    { key: 'projectStaff', label: 'Project Staff', count: projectStaff.filter((p) => !p.DivisionCode).length },
    { key: 'phd', label: 'PhD Students', count: phDStudents.filter((p) => !p.DivisionCode).length },
    { key: 'contract', label: 'Contract Staff', count: contractStaff.filter((c) => !c.Division).length },
  ];

  const divSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white border border-border text-text text-sm rounded-lg p-2.5 outline-none focus:ring-[#3898ec] focus:border-[#3898ec]">
      <option value="">— Select Division —</option>
      {divisions.map((d) => <option key={d.divCode} value={d.divCode}>{d.divCode} — {d.divName}</option>)}
    </select>
  );
  const staffSelect = (value: string, onChange: (v: string) => void, useId = false) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white border border-border text-text text-sm rounded-lg p-2.5 outline-none focus:ring-[#3898ec] focus:border-[#3898ec]">
      <option value="">— Select Staff —</option>
      {staff.map((s) => <option key={s.ID} value={useId ? s.ID : s.Name}>{s.Name} ({s.Designation})</option>)}
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {SUB_TABS.map(({ key, label, count }) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={clsx('px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
              subTab === key ? 'bg-[#c96442] text-white' : 'bg-surface-hover text-text-muted hover:text-text')}>
            {label}
            {count > 0 && <span className={clsx('w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center',
              subTab === key ? 'bg-white/30 text-white' : 'bg-amber-500 text-white')}>{count > 9 ? '9+' : count}</span>}
          </button>
        ))}
      </div>

      {subTab === 'projectStaff' && (
        <Card><div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm">
          <thead><tr className="bg-surface-hover border-b border-border text-left">
            {['Name','Designation','Project','PI','Division',''].map(h => <th key={h} className="px-4 py-3 font-medium text-text-muted">{h}</th>)}
          </tr></thead>
          <tbody>{projectStaff.map((ps) => (
            <React.Fragment key={ps.id}>
              <tr className="border-b border-border last:border-0 hover:bg-surface-hover/50">
                <td className="px-4 py-3 font-medium text-text">{ps.StaffName}</td>
                <td className="px-4 py-3 text-text-muted">{ps.Designation}</td>
                <td className="px-4 py-3 text-text-muted">{ps.ProjectNo}</td>
                <td className="px-4 py-3 text-text-muted">{ps.PIName || '—'}</td>
                <td className="px-4 py-3">{ps.DivisionCode
                  ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">{ps.DivisionCode}</span>
                  : <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Untagged</span>}</td>
                <td className="px-4 py-3"><button onClick={() => expandedId === ps.id ? closeRow() : openRow(ps.id, ps.DivisionCode || '', ps.PIName || '')}
                  className="text-xs font-medium text-[#c96442] hover:underline">{expandedId === ps.id ? 'Cancel' : 'Edit'}</button></td>
              </tr>
              {expandedId === ps.id && <tr className="border-b border-border bg-[#faf9f5]"><td colSpan={6} className="px-4 py-4">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-[200px] space-y-1"><label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Division</label>{divSelect(draftDivision, setDraftDivision)}</div>
                  <div className="flex-1 min-w-[200px] space-y-1"><label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">PI Name</label>{staffSelect(draftAttached, setDraftAttached)}</div>
                  <button onClick={() => saveProjectStaff(ps.id)} disabled={savingId === ps.id}
                    className="px-5 py-2.5 bg-[#c96442] hover:bg-[#b5593b] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">{savingId === ps.id ? 'Saving...' : 'Save'}</button>
                </div>
              </td></tr>}
            </React.Fragment>
          ))}</tbody>
        </table></div></Card>
      )}

      {subTab === 'phd' && (
        <Card><div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm">
          <thead><tr className="bg-surface-hover border-b border-border text-left">
            {['Student','Specialization','Supervisor','Division',''].map(h => <th key={h} className="px-4 py-3 font-medium text-text-muted">{h}</th>)}
          </tr></thead>
          <tbody>{phDStudents.map((phd) => (
            <React.Fragment key={phd.EnrollmentNo}>
              <tr className="border-b border-border last:border-0 hover:bg-surface-hover/50">
                <td className="px-4 py-3 font-medium text-text">{phd.StudentName}</td>
                <td className="px-4 py-3 text-text-muted">{phd.Specialization}</td>
                <td className="px-4 py-3 text-text-muted">{phd.SupervisorName || '—'}</td>
                <td className="px-4 py-3">{phd.DivisionCode
                  ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">{phd.DivisionCode}</span>
                  : <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Untagged</span>}</td>
                <td className="px-4 py-3"><button onClick={() => expandedId === phd.EnrollmentNo ? closeRow() : openRow(phd.EnrollmentNo, phd.DivisionCode || '', phd.SupervisorName || '')}
                  className="text-xs font-medium text-[#c96442] hover:underline">{expandedId === phd.EnrollmentNo ? 'Cancel' : 'Edit'}</button></td>
              </tr>
              {expandedId === phd.EnrollmentNo && <tr className="border-b border-border bg-[#faf9f5]"><td colSpan={5} className="px-4 py-4">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-[200px] space-y-1"><label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Division</label>{divSelect(draftDivision, setDraftDivision)}</div>
                  <div className="flex-1 min-w-[200px] space-y-1"><label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Supervisor</label>{staffSelect(draftAttached, setDraftAttached)}</div>
                  <button onClick={() => savePhD(phd.EnrollmentNo)} disabled={savingId === phd.EnrollmentNo}
                    className="px-5 py-2.5 bg-[#c96442] hover:bg-[#b5593b] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">{savingId === phd.EnrollmentNo ? 'Saving...' : 'Save'}</button>
                </div>
              </td></tr>}
            </React.Fragment>
          ))}</tbody>
        </table></div></Card>
      )}

      {subTab === 'contract' && (
        <Card><div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm">
          <thead><tr className="bg-surface-hover border-b border-border text-left">
            {['Name','Designation','Lab Code','Attached To','Division',''].map(h => <th key={h} className="px-4 py-3 font-medium text-text-muted">{h}</th>)}
          </tr></thead>
          <tbody>
            {contractStaff.map((cs) => (
              <React.Fragment key={cs.id}>
                <tr className="border-b border-border last:border-0 hover:bg-surface-hover/50">
                  <td className="px-4 py-3 font-medium text-text">{cs.Name}</td>
                  <td className="px-4 py-3 text-text-muted">{cs.Designation}</td>
                  <td className="px-4 py-3 text-text-muted">{cs.LabCode}</td>
                  <td className="px-4 py-3 text-text-muted">{cs.AttachedToStaffID || '—'}</td>
                  <td className="px-4 py-3">{cs.Division
                    ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">{cs.Division}</span>
                    : <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Untagged</span>}</td>
                  <td className="px-4 py-3"><button onClick={() => expandedId === cs.id ? closeRow() : openRow(cs.id, cs.Division || '', cs.AttachedToStaffID || '')}
                    className="text-xs font-medium text-[#c96442] hover:underline">{expandedId === cs.id ? 'Cancel' : 'Edit'}</button></td>
                </tr>
                {expandedId === cs.id && <tr className="border-b border-border bg-[#faf9f5]"><td colSpan={6} className="px-4 py-4">
                  <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px] space-y-1"><label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Division</label>{divSelect(draftDivision, setDraftDivision)}</div>
                    <div className="flex-1 min-w-[200px] space-y-1"><label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Attached To (Staff)</label>{staffSelect(draftAttached, setDraftAttached, true)}</div>
                    <button onClick={() => saveContract(cs.id)} disabled={savingId === cs.id}
                      className="px-5 py-2.5 bg-[#c96442] hover:bg-[#b5593b] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">{savingId === cs.id ? 'Saving...' : 'Save'}</button>
                  </div>
                </td></tr>}
              </React.Fragment>
            ))}
            {contractStaff.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-text-muted text-sm">No contract staff records yet. Import them via the Data Import tab.</td></tr>}
          </tbody>
        </table></div></Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DataManagement() {
  const { divisions, staff, projectStaff, phDStudents, contractStaff, refreshData } = useData();
  useAuth(); // ensure context is available

  const [activeTab, setActiveTab] = useState<'build' | 'mapping'>('build');

  const untaggedProjectStaff = projectStaff.filter((p) => !p.DivisionCode).length;
  const untaggedPhD = phDStudents.filter((p) => !p.DivisionCode).length;
  const untaggedContract = contractStaff.filter((c) => !c.Division).length;
  const totalUntagged = untaggedProjectStaff + untaggedPhD + untaggedContract;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-[500] text-text font-serif">Data Management</h1>
        <p className="text-text-muted mt-1">Import data and manage division assignments</p>
      </div>

      {/* Untagged banner */}
      {totalUntagged > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm cursor-pointer hover:bg-amber-100 transition-colors"
          onClick={() => setActiveTab('mapping')}>
          <Tags size={16} className="text-amber-600 shrink-0" />
          <span className="text-amber-800 font-medium">
            {totalUntagged} record{totalUntagged !== 1 ? 's' : ''} have no division assigned
            ({untaggedProjectStaff} project staff, {untaggedPhD} PhD students, {untaggedContract} contract staff).
          </span>
          <span className="ml-auto text-amber-600 font-semibold text-xs uppercase tracking-wide">Fix →</span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        <button onClick={() => setActiveTab('build')}
          className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'build' ? 'border-[#c96442] text-[#c96442]' : 'border-transparent text-text-muted hover:text-text')}>
          Build Database
        </button>
        <button onClick={() => setActiveTab('mapping')}
          className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
            activeTab === 'mapping' ? 'border-[#c96442] text-[#c96442]' : 'border-transparent text-text-muted hover:text-text')}>
          <MapPin size={14} />
          Staff Mapping
          {totalUntagged > 0 && (
            <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
              {totalUntagged > 9 ? '9+' : totalUntagged}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'mapping' && (
        <StaffMappingPanel divisions={divisions} staff={staff} projectStaff={projectStaff}
          phDStudents={phDStudents} contractStaff={contractStaff} onSaved={refreshData} />
      )}

      {activeTab === 'build' && <DatabaseBuilderPanel />}
    </div>
  );
}
