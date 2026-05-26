import { useState, useEffect, useCallback } from 'react';
import { Card, Badge } from '../components/ui/Cards';
import { RefreshCw, Cloud, ExternalLink, ChevronDown, ChevronRight, Search } from 'lucide-react';
import clsx from 'clsx';
import { supabase } from '../utils/supabaseClient';

// Raw staff row from Supabase (quoted CamelCase columns)
interface StaffRow {
  ID: string;
  StaffName: string;
  Designation: string;
  Division: string;
  VidwanID: string;
  Group: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IrinsProfile {
  vidwan_id: string;
  profile_data: Record<string, unknown>;
  synced_at: string;
}

interface SyncLogEntry {
  id: number;
  triggered_by: 'cron' | 'manual';
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  total_scientists: number;
  succeeded: number;
  failed: number;
  error_details: unknown;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IrinsSync() {
  const [profiles, setProfiles] = useState<IrinsProfile[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expandedScientist, setExpandedScientist] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // --- Load data ---
  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [profilesRes, logsRes, staffRes] = await Promise.all([
      supabase.from('irins_profiles').select('*').order('synced_at', { ascending: false }),
      supabase.from('irins_sync_log').select('*').order('started_at', { ascending: false }).limit(20),
      supabase.from('staff').select('*').eq('Group', 'Scientific').neq('VidwanID', '').not('VidwanID', 'is', null).order('StaffName'),
    ]);
    if (profilesRes.data) setProfiles(profilesRes.data);
    if (logsRes.data) setSyncLogs(logsRes.data);
    if (staffRes.data) setStaff(staffRes.data as StaffRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // --- Refresh ---
  // Phase 1: sync runs server-side via `npm run sync:irins`.
  // This button only refreshes the view. Phase 2 wires an Edge Function here.
  const triggerSync = async () => {
    setSyncing(true);
    try {
      await loadData();
    } finally {
      setSyncing(false);
    }
  };

  // --- Merge staff + profile data ---
  const profileMap = new Map(profiles.map(p => [p.vidwan_id, p]));
  const scientists = staff.map(s => ({
    ...s,
    profile: profileMap.get(s.VidwanID || ''),
  }));

  const filtered = scientists.filter(s =>
    !search || s.StaffName?.toLowerCase().includes(search.toLowerCase())
  );

  // --- Stats ---
  const lastSync = syncLogs[0];
  const syncedCount = profiles.length;
  const pendingCount = staff.length - syncedCount;

  // --- Helpers ---
  function profileDataCount(profile: IrinsProfile | undefined, key: string): number {
    const data = profile?.profile_data as Record<string, unknown> | undefined;
    return Array.isArray(data?.[key]) ? (data[key] as unknown[]).length : 0;
  }

  function timeAgo(t: string): string {
    const sec = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
    if (sec < 60) return 'just now';
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  }

  const statusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
      success: 'success', running: 'info', partial: 'warning', failed: 'danger',
    };
    return <Badge variant={variants[status] || 'neutral'}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl">
        <h1 className="text-2xl font-[500] text-text font-serif flex items-center gap-3">
          <Cloud size={24} className="text-[#c96442]" />
          IRINS Data Sync
        </h1>
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-[500] text-text font-serif flex items-center gap-3">
          <Cloud size={24} className="text-[#c96442]" />
          IRINS Data Sync
        </h1>
        <p className="text-text-muted mt-1">
          Scientist profiles mirrored from ampri.irins.org (publications, patents, awards, citations). Refresh runs server-side via the sync script.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Scientific Staff</p>
          <p className="text-2xl font-bold font-mono text-text mt-1">{staff.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Synced</p>
          <p className="text-2xl font-bold font-mono text-emerald-600 mt-1">{syncedCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Pending</p>
          <p className="text-2xl font-bold font-mono text-amber-600 mt-1">{pendingCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Last Sync</p>
          <p className="text-sm font-medium text-text mt-1">
            {lastSync
              ? <span className="flex items-center gap-1.5">{statusBadge(lastSync.status)} {timeAgo(lastSync.started_at)}</span>
              : 'Never'}
          </p>
        </Card>
      </div>

      {/* Sync Controls */}
      <Card className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#c96442] text-white rounded-lg text-sm font-semibold hover:bg-[#b5593b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Refreshing...' : 'Refresh'}
          </button>
          <span className="text-xs text-text-muted">
            Data is fetched server-side. Run <code className="font-mono">npm run sync:irins</code> to refresh profiles.
          </span>
        </div>
      </Card>

      {/* Last Sync Detail */}
      {lastSync && (
        <Card className="p-4 space-y-2">
          <p className="text-sm font-semibold text-text">Last Sync — {statusBadge(lastSync.status)}</p>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div><span className="text-text-muted">Started:</span> <span className="text-text">{new Date(lastSync.started_at).toLocaleString()}</span></div>
            <div><span className="text-text-muted">Succeeded:</span> <span className="text-emerald-600 font-mono">{lastSync.succeeded}</span></div>
            <div><span className="text-text-muted">Failed:</span> <span className="text-rose-600 font-mono">{lastSync.failed}</span></div>
          </div>
        </Card>
      )}

      {/* Search + Scientist List */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search scientists..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[#c96442]/30"
        />
      </div>

      <div className="space-y-2">
        {filtered.map(s => {
          const profile = s.profile;
          const expanded = expandedScientist === s.ID;
          const data = profile?.profile_data as Record<string, unknown> | undefined;
          const hasData = data && Object.keys(data).length > 2;

          return (
            <Card key={s.ID} className="p-0 overflow-hidden">
              <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-surface-hover transition-colors"
                onClick={() => setExpandedScientist(expanded ? null : s.ID || null)}
              >
                <div className={clsx('w-2 h-2 rounded-full shrink-0', profile ? 'bg-emerald-500' : 'bg-amber-400')} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text truncate">
                    {s.StaffName || 'Unknown'}
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {s.Designation} · {s.Division}
                  </p>
                </div>
                <a
                  href={`https://ampri.irins.org/profile/${s.VidwanID}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#c96442] hover:underline text-xs flex items-center gap-1"
                  onClick={e => e.stopPropagation()}
                >
                  VID-{s.VidwanID} <ExternalLink size={11} />
                </a>
                {profile && (
                  <span className="text-[10px] text-text-muted whitespace-nowrap">
                    {timeAgo(profile.synced_at)}
                  </span>
                )}
                <span className="text-xs text-text-muted font-mono">
                  {profileDataCount(profile, 'publications')}p · {profileDataCount(profile, 'patents')}t · {profileDataCount(profile, 'awards')}a
                </span>
                {expanded ? <ChevronDown size={15} className="text-text-muted" /> : <ChevronRight size={15} className="text-text-muted" />}
              </div>

              {expanded && (
                <div className="border-t border-border p-4 space-y-3">
                  {hasData ? (
                    <>
                      {/* Quick summary stats */}
                      {data && (
                        <div className="flex flex-wrap gap-3 text-xs">
                          {['publications', 'patents', 'awards', 'projects', 'experience', 'qualifications'].map(key => {
                            const count = Array.isArray(data[key]) ? (data[key] as unknown[]).length : 0;
                            return count > 0 ? (
                              <span key={key} className="px-2.5 py-1 bg-surface-hover rounded-lg border border-border capitalize">
                                {key}: <strong>{count}</strong>
                              </span>
                            ) : null;
                          })}
                          {data.citations != null && typeof data.citations === 'object' && (
                            <span className="px-2.5 py-1 bg-surface-hover rounded-lg border border-border">
                              h-index: <strong>{(data.citations as Record<string, number>).h_index || '-'}</strong>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Publications list */}
                      {data?.publications && Array.isArray(data.publications) && data.publications.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-text mb-1.5">Recent Publications</p>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {(data.publications as Array<{ title: string; year?: string; journal?: string }>).slice(0, 10).map((pub, i) => (
                              <p key={i} className="text-[11px] text-text-muted leading-relaxed">
                                <span className="text-text">{pub.title?.substring(0, 100)}{pub.title?.length && pub.title.length > 100 ? '...' : ''}</span>
                                {pub.year && <span className="text-[#c96442] ml-1">({pub.year})</span>}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Patents list */}
                      {data?.patents && Array.isArray(data.patents) && data.patents.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-text mb-1.5">Patents ({data.patents.length})</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(data.patents as Array<{ title: string; status?: string }>).slice(0, 5).map((p, i) => (
                              <span key={i} className="text-[11px] px-2 py-0.5 bg-surface-hover rounded border border-border text-text-muted">
                                {p.title?.substring(0, 60)}{p.title?.length && p.title.length > 60 ? '...' : ''}
                                {p.status && <span className="text-[#c96442] ml-1">[{p.status}]</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-text-muted italic">
                      No sync data yet. Trigger sync or wait for nightly GitHub Action run.
                    </p>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Sync History */}
      {syncLogs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-[500] text-text font-serif">Sync History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="text-left py-2 pr-4 font-medium">Time</th>
                  <th className="text-left py-2 pr-4 font-medium">Trigger</th>
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
                  <th className="text-right py-2 pr-4 font-medium">Total</th>
                  <th className="text-right py-2 pr-4 font-medium">OK</th>
                  <th className="text-right py-2 font-medium">Failed</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.map(log => (
                  <tr key={log.id} className="border-b border-border/50 text-text">
                    <td className="py-2 pr-4 whitespace-nowrap">{new Date(log.started_at).toLocaleString()}</td>
                    <td className="py-2 pr-4 capitalize">{log.triggered_by}</td>
                    <td className="py-2 pr-4">{statusBadge(log.status)}</td>
                    <td className="py-2 pr-4 text-right font-mono">{log.total_scientists}</td>
                    <td className="py-2 pr-4 text-right font-mono text-emerald-600">{log.succeeded}</td>
                    <td className="py-2 text-right font-mono text-rose-600">{log.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
