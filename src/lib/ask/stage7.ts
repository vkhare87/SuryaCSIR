import { supabase } from '../../utils/supabaseClient';
import type { Ticket } from '../../types';

export interface AskChartPoint {
  label: string;
  value: number;
}

export interface PinnedAskQuery {
  id: string;
  question: string;
  pinnedAt: string;
}

/**
 * Extract label/value pairs from structured Ask SURYA bullet or table lines (E2).
 * Matches lines like "- D1: 14" or "| D1 | 14 |".
 */
export function extractChartData(answerText: string): AskChartPoint[] {
  const points: AskChartPoint[] = [];
  for (const raw of answerText.split(/\r?\n/)) {
    const line = raw.trim();
    const bulletMatch = /^[-*]\s+([^:|]{2,40}):\s*([0-9]+(?:\.[0-9]+)?)\s*$/.exec(line);
    if (bulletMatch) {
      points.push({ label: bulletMatch[1].trim(), value: Number(bulletMatch[2]) });
      continue;
    }
    const tableMatch = /^\|\s*([^|]{2,40})\s*\|\s*([0-9]+(?:\.[0-9]+)?)\s*\|/.exec(line);
    if (tableMatch && !/^[-:\s]+$/.test(tableMatch[1])) {
      points.push({ label: tableMatch[1].trim(), value: Number(tableMatch[2]) });
    }
  }
  return points.length >= 2 ? points.slice(0, 12) : [];
}

export function matchResolvedFaqs(tickets: Ticket[], query: string, limit = 4): Ticket[] {
  const q = query.trim().toLowerCase();
  const resolved = tickets.filter((t) => t.status === 'Resolved' || t.status === 'Closed');
  if (!q) return resolved.slice(0, limit);
  const terms = q.split(/\s+/).filter((w) => w.length >= 3);
  if (terms.length === 0) return resolved.slice(0, limit);
  return resolved
    .filter((t) => {
      const hay = `${t.subject} ${t.description} ${t.category}`.toLowerCase();
      return terms.some((term) => hay.includes(term));
    })
    .slice(0, limit);
}

export async function loadPinnedQueries(userId: string): Promise<PinnedAskQuery[]> {
  if (!supabase || !userId) return [];
  const { data } = await supabase
    .from('user_profiles')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const list = prefs.pinnedQueries;
  return Array.isArray(list) ? (list as PinnedAskQuery[]) : [];
}

export async function savePinnedQueries(userId: string, next: PinnedAskQuery[]): Promise<void> {
  if (!supabase || !userId) return;
  const { data } = await supabase
    .from('user_profiles')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();
  const existing = ((data?.preferences ?? {}) as Record<string, unknown>);
  const { error } = await supabase
    .from('user_profiles')
    .update({ preferences: { ...existing, pinnedQueries: next } })
    .eq('user_id', userId);
  if (error) throw error;
}
