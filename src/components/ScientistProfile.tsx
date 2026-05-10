import { useState, useEffect } from 'react';
import { Badge } from './ui/Cards';
import { ExternalLink, BookOpen, Award, FlaskConical, Lightbulb, FileText, Bookmark, Hash, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { supabase } from '../utils/supabaseClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IrinsData {
  name?: string;
  designation?: string;
  division?: string;
  photo_url?: string;
  academic_ids?: { orcid?: string; scopus?: string; researcher_id?: string; google_scholar?: string };
  expertise?: string[];
  citations?: { total?: number; h_index?: number; crossref?: number };
  experience?: Array<{ period: string; role: string; division: string }>;
  qualifications?: Array<{ year: string; degree: string; institution: string }>;
  awards?: Array<{ year: string; title: string; awarding_body: string }>;
  patents?: Array<{ title: string; inventors?: string[]; number?: string; status?: string; filing_date?: string }>;
  publications?: Array<{ title: string; authors?: string[]; journal?: string; year?: string; doi?: string; type?: string }>;
  projects?: Array<{ title: string; funding_agency?: string; status?: string; role?: string; budget?: string; duration?: string }>;
  [key: string]: unknown;
}

interface Props {
  vidwanId: string;
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScientistProfile({ vidwanId, compact = false }: Props) {
  const [data, setData] = useState<IrinsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!vidwanId) {
      setLoading(false);
      setError('No VidwanID');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      if (!supabase) { setError('Database not configured'); setLoading(false); return; }
      const { data: row, error: err } = await supabase
        .from('irins_profiles')
        .select('profile_data')
        .eq('vidwan_id', vidwanId)
        .single();

      if (cancelled) return;
      if (err) {
        if (err.code === 'PGRST116') setError('Not synced yet');
        else setError(err.message);
        setData(null);
      } else {
        setData(row?.profile_data as IrinsData);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [vidwanId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted py-4">
        <Loader2 size={14} className="animate-spin" />
        Loading IRINS profile...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-text-muted py-2 italic">
        IRINS data: {error}.{' '}
        {vidwanId && (
          <a href={`https://ampri.irins.org/profile/${vidwanId}`} target="_blank" rel="noreferrer" className="text-[#c96442] hover:underline">
            View on IRINS <ExternalLink size={11} className="inline" />
          </a>
        )}
      </div>
    );
  }

  if (!data) return null;

  const pubCount = data.publications?.length ?? 0;
  const patentCount = data.patents?.length ?? 0;
  const awardCount = data.awards?.length ?? 0;
  const projectCount = data.projects?.length ?? 0;

  // --- Compact: summary badges ---
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {data.citations?.h_index && (
          <span className="px-2 py-0.5 bg-surface-hover rounded border border-border flex items-center gap-1">
            <Hash size={11} className="text-text-muted" /> h-index: {data.citations.h_index}
          </span>
        )}
        {pubCount > 0 && (
          <span className="px-2 py-0.5 bg-surface-hover rounded border border-border">
            {pubCount} publications
          </span>
        )}
        {patentCount > 0 && (
          <span className="px-2 py-0.5 bg-surface-hover rounded border border-border">
            {patentCount} patents
          </span>
        )}
        {awardCount > 0 && (
          <span className="px-2 py-0.5 bg-surface-hover rounded border border-border">
            {awardCount} awards
          </span>
        )}
        <a href={`https://ampri.irins.org/profile/${vidwanId}`} target="_blank" rel="noreferrer" className="text-[#c96442] hover:underline flex items-center gap-0.5 ml-1">
          IRINS <ExternalLink size={10} />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          {data.name && <h3 className="text-lg font-semibold text-text">{data.name}</h3>}
          {data.designation && <p className="text-sm text-text-muted">{data.designation}{data.division ? ` · ${data.division}` : ''}</p>}
        </div>
        <a href={`https://ampri.irins.org/profile/${vidwanId}`} target="_blank" rel="noreferrer" className="text-[#c96442] hover:underline text-xs flex items-center gap-1">
          Full IRINS profile <ExternalLink size={11} />
        </a>
      </div>

      {/* Metrics row */}
      {(data.citations || pubCount > 0 || patentCount > 0) && (
        <div className="flex flex-wrap gap-3">
          {data.citations?.h_index !== undefined && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-hover rounded-lg border border-border">
              <Hash size={13} className="text-text-muted" />
              <div>
                <span className="text-sm font-bold text-text font-mono">{data.citations.h_index}</span>
                <span className="text-[10px] text-text-muted ml-1">h-index</span>
              </div>
            </div>
          )}
          {data.citations?.total !== undefined && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-hover rounded-lg border border-border">
              <Bookmark size={13} className="text-text-muted" />
              <div>
                <span className="text-sm font-bold text-text font-mono">{data.citations.total.toLocaleString()}</span>
                <span className="text-[10px] text-text-muted ml-1">citations</span>
              </div>
            </div>
          )}
          {pubCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-hover rounded-lg border border-border">
              <BookOpen size={13} className="text-text-muted" />
              <span className="text-sm font-bold text-text font-mono">{pubCount}</span>
              <span className="text-[10px] text-text-muted">publications</span>
            </div>
          )}
          {patentCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-hover rounded-lg border border-border">
              <FlaskConical size={13} className="text-text-muted" />
              <span className="text-sm font-bold text-text font-mono">{patentCount}</span>
              <span className="text-[10px] text-text-muted">patents</span>
            </div>
          )}
        </div>
      )}

      {/* Expertise */}
      {data.expertise && data.expertise.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text mb-1.5 flex items-center gap-1.5">
            <Lightbulb size={12} /> Expertise
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.expertise.filter(Boolean).map((e, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 bg-surface-hover rounded-full border border-border text-text-muted">
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Awards */}
      {data.awards && data.awards.length > 0 && (
        <Section icon={<Award size={14} />} title={`Awards & Honours (${awardCount})`}>
          <div className="space-y-1.5">
            {data.awards.slice(0, 5).map((a, i) => (
              <p key={i} className="text-xs text-text-muted">
                <span className="text-[#c96442] font-mono">{a.year}</span>
                {a.year && ' '}
                {a.title}{a.awarding_body ? ` — ${a.awarding_body}` : ''}
              </p>
            ))}
            {awardCount > 5 && <p className="text-[11px] text-text-muted">+{awardCount - 5} more</p>}
          </div>
        </Section>
      )}

      {/* Publications */}
      {data.publications && data.publications.length > 0 && (
        <Section icon={<BookOpen size={14} />} title={`Recent Publications (${pubCount})`}>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {data.publications.slice(0, 10).map((pub, i) => (
              <div key={i} className="text-xs border-b border-border/50 pb-1.5 last:border-0">
                <p className="text-text">{pub.title}</p>
                <p className="text-text-muted mt-0.5">
                  {pub.journal && <span>{pub.journal}</span>}
                  {pub.year && <span className="text-[#c96442] ml-1">({pub.year})</span>}
                  {pub.type && <Badge variant="neutral" className="ml-1.5">{pub.type}</Badge>}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Patents */}
      {data.patents && data.patents.length > 0 && (
        <Section icon={<FlaskConical size={14} />} title={`Patents (${patentCount})`}>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {data.patents.slice(0, 5).map((pat, i) => (
              <div key={i} className="text-xs border-b border-border/50 pb-1.5 last:border-0">
                <p className="text-text">{pat.title}</p>
                <p className="text-text-muted mt-0.5 flex gap-2">
                  {pat.status && <span className={clsx(pat.status === 'Granted' ? 'text-emerald-600' : 'text-amber-600')}>{pat.status}</span>}
                  {pat.number && <span className="font-mono">#{pat.number}</span>}
                  {pat.filing_date && <span>Filed: {pat.filing_date}</span>}
                </p>
              </div>
            ))}
            {patentCount > 5 && <p className="text-[11px] text-text-muted">+{patentCount - 5} more</p>}
          </div>
        </Section>
      )}

      {/* Projects */}
      {data.projects && data.projects.length > 0 && (
        <Section icon={<FileText size={14} />} title={`Research Projects (${projectCount})`}>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {data.projects.slice(0, 5).map((pr, i) => (
              <div key={i} className="text-xs border-b border-border/50 pb-1.5 last:border-0">
                <p className="text-text">{pr.title}</p>
                <p className="text-text-muted mt-0.5">
                  {pr.status && <span>{pr.status}</span>}
                  {pr.funding_agency && <span> · {pr.funding_agency}</span>}
                  {pr.budget && <span> · ₹{Number(pr.budget).toLocaleString()}</span>}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Academic IDs */}
      {data.academic_ids && Object.values(data.academic_ids).some(Boolean) && (
        <Section icon={<Bookmark size={14} />} title="Academic IDs">
          <div className="flex flex-wrap gap-2 text-xs">
            {data.academic_ids.orcid && <IdBadge label="ORCID" value={data.academic_ids.orcid} href={`https://orcid.org/${data.academic_ids.orcid}`} />}
            {data.academic_ids.scopus && <IdBadge label="Scopus" value={data.academic_ids.scopus} href={`https://scopus.com/authid/detail.url?authorId=${data.academic_ids.scopus}`} />}
            {data.academic_ids.google_scholar && <IdBadge label="Google Scholar" value={data.academic_ids.google_scholar} href={`https://scholar.google.com/citations?user=${data.academic_ids.google_scholar}`} />}
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-text mb-2 flex items-center gap-1.5">{icon} {title}</p>
      {children}
    </div>
  );
}

function IdBadge({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-2 py-1 bg-surface-hover rounded border border-border hover:border-[#c96442]/30 transition-colors">
      <span className="text-text-muted">{label}:</span>
      <span className="text-[#c96442] font-mono">{value}</span>
      <ExternalLink size={10} className="text-text-muted" />
    </a>
  );
}
