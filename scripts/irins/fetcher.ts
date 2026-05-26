const BASE = 'https://ampri.irins.org';
const UA = 'Mozilla/5.0 (compatible; SURYA-IRINS-Sync/1.0)';

type FetchImpl = typeof fetch;
interface Opts { fetchImpl?: FetchImpl; maxPages?: number; delayMs?: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchProfileHtml(expertId: string, fetchImpl: FetchImpl = fetch): Promise<string> {
  const res = await fetchImpl(`${BASE}/profile/${expertId}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`profile ${expertId}: HTTP ${res.status}`);
  return res.text();
}

export async function fetchCitationsJson(expertId: string, fetchImpl: FetchImpl = fetch): Promise<string> {
  try {
    const res = await fetchImpl(`${BASE}/profile/getgooglecitation`, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ expert_id: expertId }).toString(),
    });
    return res.ok ? res.text() : '{}';
  } catch {
    return '{}';
  }
}

export async function fetchAllPublications(expertId: string, opts: Opts = {}): Promise<string[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxPages = opts.maxPages ?? 100;
  const delayMs = opts.delayMs ?? 0;
  const pages: string[] = [];
  for (let page = 0; page < maxPages; page++) {
    const res = await fetchImpl(`${BASE}/profile/get_publication`, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        expert_id: expertId, current_page: String(page), sort_by: 'year', direction: 'desc',
      }).toString(),
    });
    const html = res.ok ? await res.text() : '';
    if (!html.includes('<h2>')) break;
    pages.push(html);
    if (delayMs) await sleep(delayMs);
  }
  return pages;
}
