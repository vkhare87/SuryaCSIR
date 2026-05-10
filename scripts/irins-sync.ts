/**
 * IRINS Profile Sync Script
 *
 * Fetches scientist profiles from ampri.irins.org via Playwright,
 * extracts all data (publications, patents, awards, projects, etc.),
 * and upserts to Supabase irins_profiles table.
 *
 * Usage:
 *   SUPABASE_URL=https://... SUPABASE_SERVICE_KEY=... npx tsx scripts/irins-sync.ts
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npx tsx scripts/irins-sync.ts --vidwan=625235,284424
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IrinsProfile {
  name: string;
  designation: string;
  division: string;
  photo_url: string;
  academic_ids: {
    orcid: string;
    scopus: string;
    researcher_id: string;
    google_scholar: string;
  };
  expertise: string[];
  citations: {
    total: number;
    h_index: number;
    crossref: number;
  };
  experience: Array<{
    period: string;
    role: string;
    division: string;
  }>;
  qualifications: Array<{
    year: string;
    degree: string;
    institution: string;
  }>;
  awards: Array<{
    year: string;
    title: string;
    awarding_body: string;
  }>;
  patents: Array<{
    title: string;
    inventors: string[];
    number: string;
    status: string;
    filing_date: string;
  }>;
  publications: Array<{
    title: string;
    authors: string[];
    journal: string;
    year: string;
    doi: string;
    type: string;
  }>;
  projects: Array<{
    title: string;
    funding_agency: string;
    status: string;
    role: string;
    budget: string;
    duration: string;
  }>;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const IRINS_BASE = 'https://ampri.irins.org';
const CONCURRENCY = 3; // max parallel browsers

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function text(el: Element | null): string {
  return el?.textContent?.trim().replace(/\s+/g, ' ') ?? '';
}

function parseNum(s: string): number {
  const m = s.replace(/,/g, '').match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

// ---------------------------------------------------------------------------
// Scraper
// ---------------------------------------------------------------------------

async function scrapeProfile(vidwanId: string): Promise<IrinsProfile | null> {
  const url = `${IRINS_BASE}/profile/${vidwanId}`;
  console.log(`  → ${url}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);

  try {
    await page.goto(url, { waitUntil: 'networkidle' });

    // Wait for the main profile content to render
    await page.waitForSelector('body', { timeout: 15_000 });
    // Give JS-rendered sections time to load
    await page.waitForTimeout(3000);

    const profile: IrinsProfile = await page.evaluate((baseUrl: string) => {
      const $ = (sel: string) => document.querySelector(sel);
      const $$ = (sel: string) => Array.from(document.querySelectorAll(sel));
      const txt = (el: Element | null) => el?.textContent?.trim().replace(/\s+/g, ' ') ?? '';

      // ---------- Identity ----------
      const name = txt($('.profile-name, .faculty-name, h1')).split('\n')[0].trim()
        || document.title.replace(/.*\||IRINS/g, '').trim();
      const designation = txt($('.designation, .faculty-designation, .profile-designation'));
      const division = txt($('.department, .faculty-department, .profile-department'));
      const photo = ($('img[src*="profile_images"]') as HTMLImageElement | null)?.src || '';

      // ---------- Academic IDs ----------
      const ids: IrinsProfile['academic_ids'] = { orcid: '', scopus: '', researcher_id: '', google_scholar: '' };
      $$('a[href]').forEach(a => {
        const h = a.getAttribute('href') || '';
        if (h.includes('orcid.org')) ids.orcid = h.replace(/.*orcid\.org\//, '');
        if (h.includes('scopus.com')) ids.scopus = h.match(/authorId=(\d+)/)?.[1] || '';
        if (h.includes('google.scholar') || h.includes('scholar.google')) ids.google_scholar = h.match(/user=([\w-]+)/)?.[1] || '';
        if (h.includes('webofscience') || h.includes('researcherid')) ids.researcher_id = h.match(/rid\/([\w-]+)/)?.[1] || h.match(/RID=([\w-]+)/)?.[1] || '';
      });

      // ---------- Citation metrics ----------
      let totalCit = 0, hIdx = 0, crossrefCit = 0;
      $$('span, div, strong').forEach(el => {
        const t = txt(el);
        const mCit = t.match(/(\d[\d,]*)\s*(?:total\s*)?citation/i);
        const mH = t.match(/[hH][-\s]?index\s*:?\s*(\d+)/);
        const mCr = t.match(/(\d[\d,]*)\s*crossref/i);
        if (mCit) totalCit = parseInt(mCit[1].replace(/,/g, ''), 10);
        if (mH) hIdx = parseInt(mH[1], 10);
        if (mCr) crossrefCit = parseInt(mCr[1].replace(/,/g, ''), 10);
      });

      // ---------- Expertise ----------
      const expertise: string[] = [];
      $$('.expertise-area li, .expertise-area span, .expertise-keywords, .keywords').forEach(el => {
        const t = txt(el);
        if (t.length > 2) expertise.push(...t.split(',').map(s => s.trim()).filter(Boolean));
      });

      // ---------- Tab panel extraction helper ----------
      function extractTable(panelId: string): string[][] {
        const panel = document.getElementById(panelId);
        if (!panel) return [];
        const rows: string[][] = [];
        panel.querySelectorAll('tr').forEach(tr => {
          const cells = Array.from(tr.querySelectorAll('td, th')).map(td => txt(td));
          if (cells.length) rows.push(cells);
        });
        return rows;
      }

      // Try clicking tabs to trigger JS content loading
      $$('a[href*="_panel"]').forEach(tab => {
        const href = tab.getAttribute('href') || '';
        if (href.startsWith('#')) {
          const target = document.getElementById(href.slice(1));
          if (target) {
            (tab as HTMLElement).click();
          }
        }
      });

      // ---------- Experience ----------
      const experience: IrinsProfile['experience'] = [];
      const expRows = extractTable('experience_information_panel');
      expRows.forEach(row => {
        if (row.length >= 2) {
          experience.push({ period: row[0], role: row[1] || '', division: row[2] || '' });
        }
      });
      // Fallback: look for text patterns
      if (!experience.length) {
        const expPanel = document.getElementById('experience_information_panel');
        if (expPanel) {
          const items = expPanel.querySelectorAll('li, .item, .experience-item');
          items.forEach(item => {
            experience.push({ period: txt(item), role: '', division: '' });
          });
        }
      }

      // ---------- Qualifications ----------
      const qualifications: IrinsProfile['qualifications'] = [];
      const qualRows = extractTable('education_information_panel');
      qualRows.forEach(row => {
        if (row.length >= 2) {
          qualifications.push({ year: row[0], degree: row[1], institution: row[2] || '' });
        }
      });

      // ---------- Awards ----------
      const awards: IrinsProfile['awards'] = [];
      const awardRows = extractTable('honours_information_panel');
      awardRows.forEach(row => {
        if (row.length >= 1) {
          awards.push({ year: row[0] || '', title: row[1] || row[0], awarding_body: row[2] || '' });
        }
      });
      // Fallback: parse list items
      if (!awards.length) {
        const awardPanel = document.getElementById('honours_information_panel');
        if (awardPanel) {
          const items = awardPanel.querySelectorAll('li, .award-item');
          items.forEach(item => {
            const t = txt(item);
            const ym = t.match(/^(\d{4})/);
            awards.push({ year: ym?.[1] || '', title: t, awarding_body: '' });
          });
        }
      }

      // ---------- Patents ----------
      const patents: IrinsProfile['patents'] = [];
      const patentPanel = document.getElementById('pt_information_panel');
      if (patentPanel) {
        const items = patentPanel.querySelectorAll('.patent-item, li, .item, .publication-item');
        items.forEach(item => {
          const t = txt(item);
          const titleMatch = t.match(/^(.*?)(?:Patent\s*(?:No|Number|#)[.:]?\s*([\w,\-]+))?/i);
          const statusMatch = t.match(/(Granted|Filed|Pending|Published)/i);
          const dateMatch = t.match(/(?:Filed|Filing date|Date)[:\s]*([\d\-/]+)/i);
          patents.push({
            title: titleMatch?.[1]?.trim() || t.split(',')[0],
            inventors: [],
            number: titleMatch?.[2] || '',
            status: statusMatch?.[1] || '',
            filing_date: dateMatch?.[1] || '',
          });
        });
      }
      // Fallback: extract from text
      if (!patents.length) {
        // Patents may be in a publications-style list
        $$('.publication-list li, .list-group-item').forEach(item => {
          const t = txt(item);
          if (t.match(/patent|granted|filed/i)) {
            patents.push({ title: t, inventors: [], number: '', status: '', filing_date: '' });
          }
        });
      }

      // ---------- Research Projects ----------
      const projects: IrinsProfile['projects'] = [];
      const projPanel = document.getElementById('rp_information_panel');
      if (projPanel) {
        const items = projPanel.querySelectorAll('li, .item, .project-item');
        items.forEach(item => {
          const t = txt(item);
          const statusMatch = t.match(/(Ongoing|Completed|Current)/i);
          projects.push({
            title: t,
            funding_agency: '',
            status: statusMatch?.[1] || '',
            role: '',
            budget: '',
            duration: '',
          });
        });
      }

      // ---------- Publications ----------
      const publications: IrinsProfile['publications'] = [];
      const pubPanel = document.getElementById('pb_information_panel');
      if (pubPanel) {
        // Try clicking sort/load triggers
        const loadBtn = pubPanel.querySelector('button, .load-more, .show-all');
        if (loadBtn) (loadBtn as HTMLElement).click();
      }
      // Collect publication items from common patterns
      $$('.publication-item, .pub-item, .list-group-item, .publications li').forEach(item => {
        const t = txt(item);
        if (t.length < 10) return;
        const yearMatch = t.match(/(\d{4})/);
        const doiMatch = t.match(/(10\.\d{4,}\/[\w.\-/:;()]+)/i);
        const typeMatch = t.match(/(Journal Article|Book Chapter|Conference|Review|Letter|Editorial)/i);
        publications.push({
          title: t.substring(0, 120),
          authors: [],
          journal: '',
          year: yearMatch?.[1] || '',
          doi: doiMatch?.[1] || '',
          type: typeMatch?.[1] || '',
        });
      });

      return {
        name, designation, division,
        photo_url: photo,
        academic_ids: ids,
        expertise,
        citations: { total: totalCit, h_index: hIdx, crossref: crossrefCit },
        experience, qualifications, awards, patents, publications, projects,
      } as IrinsProfile;
    }, IRINS_BASE);

    console.log(`  ✓ ${profile.name || vidwanId} — ${profile.publications.length} pubs, ${profile.patents.length} patents`);
    return profile;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ Failed: ${msg}`);
    return null;
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const vidwanFilter = process.argv.find(a => a.startsWith('--vidwan='))?.split('=')[1];

  // ---------- Load staff list ----------
  console.log('Loading staff list from Supabase...');
  const { data: staff, error } = await supabase
    .from('staff')
    .select('"ID", "StaffName", "VidwanID"')
    .eq('Group', 'Scientific')
    .neq('VidwanID', '')
    .not('VidwanID', 'is', null)
    .order('StaffName', { ascending: true });

  if (error) {
    console.error('Failed to load staff:', error.message);
    process.exit(1);
  }

  let scientists = staff || [];

  if (vidwanFilter) {
    const ids = vidwanFilter.split(',').map(s => s.trim());
    scientists = scientists.filter(s => ids.includes(s.VidwanID));
    console.log(`Filtered to ${scientists.length} scientists (--vidwan=${vidwanFilter})`);
  } else {
    console.log(`Found ${scientists.length} scientific staff with VidwanID`);
  }

  if (!scientists.length) {
    console.log('Nothing to sync.');
    return;
  }

  // ---------- Create sync log entry ----------
  const { data: logEntry, error: logErr } = await supabase
    .from('irins_sync_log')
    .insert({ triggered_by: process.env.GITHUB_ACTIONS ? 'cron' : 'manual' })
    .select('id')
    .single();

  if (logErr) {
    console.error('Failed to create sync log:', logErr.message);
    // Continue anyway
  }
  const logId = logEntry?.id;

  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ vidwan: string; name: string; error: string }> = [];

  // ---------- Sync each scientist ----------
  for (let i = 0; i < scientists.length; i++) {
    const s = scientists[i];
    const vidwanId = s.VidwanID;
    const name = s.StaffName || vidwanId;
    console.log(`\n[${i + 1}/${scientists.length}] ${name} (${vidwanId})`);

    const profile = await scrapeProfile(vidwanId);
    if (!profile) {
      failed++;
      errors.push({ vidwan: vidwanId, name, error: 'Scrape returned null' });
      continue;
    }

    // Upsert to irins_profiles
    const { error: upsertErr } = await supabase
      .from('irins_profiles')
      .upsert({
        vidwan_id: vidwanId,
        profile_data: profile as unknown as Record<string, unknown>,
        synced_at: new Date().toISOString(),
      });

    if (upsertErr) {
      console.error(`  ✗ Upsert failed: ${upsertErr.message}`);
      failed++;
      errors.push({ vidwan: vidwanId, name, error: upsertErr.message });
    } else {
      succeeded++;
    }
  }

  // ---------- Finalize sync log ----------
  const finalStatus = failed === 0 ? 'success' : succeeded > 0 ? 'partial' : 'failed';
  const completedAt = new Date().toISOString();

  if (logId) {
    await supabase
      .from('irins_sync_log')
      .update({
        status: finalStatus,
        completed_at: completedAt,
        total_scientists: scientists.length,
        succeeded,
        failed,
        error_details: errors.length ? errors : null,
      })
      .eq('id', logId);
  }

  // ---------- Summary ----------
  console.log('\n' + '='.repeat(50));
  console.log(`Sync complete: ${succeeded} succeeded, ${failed} failed`);
  if (errors.length) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  ${e.name} (${e.vidwan}): ${e.error}`));
  }
  console.log('='.repeat(50));

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
