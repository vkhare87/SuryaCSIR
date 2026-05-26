import { createClient } from '@supabase/supabase-js';
import { fetchProfileHtml, fetchAllPublications, fetchCitationsJson } from './fetcher';
import { assembleProfile } from './parser';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY'); process.exit(1); }

const supabase = createClient(url, key);
const onlyVidwan = process.argv.find((a) => a.startsWith('--vidwan='))?.split('=')[1];

interface StaffRow { ID: string; StaffName: string; VidwanID: string }

async function main() {
  const { data: staff, error } = await supabase
    .from('staff')
    .select('"ID","StaffName","VidwanID"')
    .eq('Group', 'Scientific')
    .neq('VidwanID', '')
    .not('VidwanID', 'is', null)
    .order('StaffName');
  if (error) { console.error('staff load failed:', error.message); process.exit(1); }

  let list = (staff ?? []) as StaffRow[];
  if (onlyVidwan) {
    const ids = onlyVidwan.split(',').map((s) => s.trim());
    list = list.filter((s) => ids.includes(s.VidwanID));
  }
  console.log(`Syncing ${list.length} scientist(s)`);

  const { data: log } = await supabase
    .from('irins_sync_log')
    .insert({ triggered_by: 'manual', total_scientists: list.length })
    .select('id').single();

  let succeeded = 0, failed = 0;
  const errors: Array<{ vidwan: string; name: string; error: string }> = [];

  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const id = s.VidwanID;
    process.stdout.write(`[${i + 1}/${list.length}] ${s.StaffName} (${id}) ... `);
    try {
      const pageHtml = await fetchProfileHtml(id);
      const pubPages = await fetchAllPublications(id, { delayMs: 200 });
      const citationsJson = await fetchCitationsJson(id);
      const profile = assembleProfile(pageHtml, pubPages, citationsJson);

      if (profile._meta.status === 'parse_empty') {
        console.log('parse_empty (skipped upsert)');
        failed++; errors.push({ vidwan: id, name: s.StaffName, error: 'parse_empty' });
        continue;
      }

      const { error: upErr } = await supabase.from('irins_profiles').upsert({
        vidwan_id: id,
        profile_data: profile,
        synced_at: profile._meta.synced_at,
      });
      if (upErr) throw new Error(upErr.message);
      console.log(`ok (${profile.publications.length} pubs, h-index ${profile.citations.h_index ?? '-'})`);
      succeeded++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`FAIL ${msg}`);
      failed++; errors.push({ vidwan: id, name: s.StaffName, error: msg });
    }
  }

  if (log?.id) {
    await supabase.from('irins_sync_log').update({
      status: failed === 0 ? 'success' : succeeded > 0 ? 'partial' : 'failed',
      completed_at: new Date().toISOString(),
      succeeded, failed,
      error_details: errors.length ? errors : null,
    }).eq('id', log.id);
  }
  console.log(`\nDone: ${succeeded} ok, ${failed} failed`);
  if (failed > 0 && succeeded === 0) process.exit(1);
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
