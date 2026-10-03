// Pull Rank Radar history straight from the Data Dive REST API into spill files
// that build.js can read. This is what makes a refresh unattended: no MCP, no LLM,
// no harness spill — just HTTP.
//
//   node pull.js <config.json> [--days 30]
//
// Each product in the config needs a `radarId`. The file written is <key>.json in
// the config's spillDir, so `file` in the config must match (refresh.js enforces it).
//
// Two things this must always do, both learned the hard way:
//   1. UNWRAP `.data` — the REST API returns { data: [...] } while build.js wants
//      the bare array. The MCP server unwraps it for you; here nobody does.
//   2. SORT each keyword's ranks by date. The API has been observed returning them
//      unsorted, and build.js treats the array as a time series — an unsorted
//      series silently scrambles every heatmap row against its own date header.
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const cfgPath = args.find(a => !a.startsWith('--'));
if (!cfgPath) { console.error('usage: node pull.js <config.json> [--days 30]'); process.exit(1); }
const di = args.indexOf('--days');
const DAYS = di > -1 ? parseInt(args[di + 1], 10) : null;

const CFG = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
// Relative config paths resolve against the config file, not the cwd.
const CFGDIR = path.dirname(path.resolve(cfgPath));
const SPILL = path.resolve(CFGDIR, CFG.spillDir.replace(/\\/g, '/'))
  .replace(/\\/g, '/').replace(/\/?$/, '/');
const WINDOW = DAYS || CFG.days || 30;
const BASE = process.env.DATADIVE_BASE_URL || 'https://api.datadive.tools';

// Key from the environment first — that is the only path that exists in CI. The
// .claude.json fallback is a local convenience so a hand run needs no setup.
function apiKey() {
  if (process.env.DATADIVE_API_KEY) return process.env.DATADIVE_API_KEY;
  const home = process.env.USERPROFILE || process.env.HOME;
  const f = path.join(home || '', '.claude.json');
  if (fs.existsSync(f)) {
    const find = o => {
      if (!o || typeof o !== 'object') return null;
      if (o.mcpServers && o.mcpServers.datadive) return o.mcpServers.datadive;
      for (const k of Object.keys(o)) { const r = find(o[k]); if (r) return r; }
      return null;
    };
    const s = find(JSON.parse(fs.readFileSync(f, 'utf8')));
    if (s && s.env && s.env.DATADIVE_API_KEY) return s.env.DATADIVE_API_KEY;
  }
  throw new Error('No DATADIVE_API_KEY in the environment and none found in .claude.json');
}

const iso = d => d.toISOString().slice(0, 10);

// Since ~7 Sep 2026 the endpoint is paginated: { success, data: { currentPage,
// lastPage, total, data: [...] } }, 20 keywords a page by default, 100 max. Reading
// it as the old bare array saw 0 keywords and froze the board for three weeks.
// Walk every page with `currentPage` (not `page` — that one is silently ignored).
async function getRadar(id, key, startDate, endDate) {
  const out = [];
  for (let page = 1; page <= 200; page++) {
    const body = await getPage(id, key, startDate, endDate, page);
    if (Array.isArray(body)) return body;                     // old shape
    const d = body && body.data;
    if (Array.isArray(d)) return d;                           // old { data: [...] }
    if (!d || !Array.isArray(d.data)) return out;
    out.push(...d.data);
    if (!d.hasNext || page >= (d.lastPage || 1)) {
      if (d.total != null && out.length !== d.total)
        throw new Error(`radar ${id}: paged ${out.length} keywords, API says total ${d.total}`);
      return out;
    }
  }
  throw new Error(`radar ${id}: more than 200 pages`);
}

async function getPage(id, key, startDate, endDate, page) {
  const u = `${BASE}/v1/niches/rank-radars/${encodeURIComponent(id)}` +
            `?startDate=${startDate}&endDate=${endDate}&pageSize=100&currentPage=${page}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    let res;
    try {
      res = await fetch(u, { headers: { 'x-api-key': key, accept: 'application/json' } });
    } catch (e) {
      if (attempt === 4) throw e;
      await new Promise(r => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt === 4) throw new Error(`Data Dive returned ${res.status} for radar ${id}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Data Dive returned ${res.status} for radar ${id}: ${await res.text()}`);
    return res.json();
  }
}

(async () => {
  const key = apiKey();
  const end = process.env.RANKBOARD_END_DATE ? new Date(process.env.RANKBOARD_END_DATE) : new Date();
  const start = new Date(end.getTime() - (WINDOW - 1) * 86400000);
  const startDate = iso(start), endDate = iso(end);
  if (!fs.existsSync(SPILL)) fs.mkdirSync(SPILL, { recursive: true });

  console.log(`Pulling ${CFG.products.length} radar(s) ${startDate} -> ${endDate}`);
  let failed = 0;
  for (const p of CFG.products) {
    if (!p.radarId) { console.log(`  SKIP ${p.short} — no radarId in config`); failed++; continue; }
    let kws;
    try {
      kws = await getRadar(p.radarId, key, startDate, endDate);
    } catch (e) {
      console.error(`  FAIL ${p.short}: ${e.message}`);
      failed++;
      continue;
    }
    // An archived or deleted radar answers 200 with an empty list. Publishing that
    // would quietly drop a product from the client's dashboard, so treat it as a
    // failure and let the run abort rather than ship a smaller set.
    if (!kws.length) {
      console.error(`  FAIL ${p.short}: radar returned 0 keywords (archived, deleted, or wrong id?)`);
      failed++;
      continue;
    }
    // Sort defensively. See the header note — an unsorted series corrupts silently.
    let resorted = 0;
    for (const k of kws) {
      const before = k.ranks.map(r => r.date).join(',');
      k.ranks.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
      if (k.ranks.map(r => r.date).join(',') !== before) resorted++;
    }
    const days = kws.length ? kws[0].ranks.length : 0;
    const live = kws.reduce((n, k) =>
      n + k.ranks.filter(r => r.organicRank > 0 && r.organicRank <= 100).length, 0);
    fs.writeFileSync(SPILL + p.file, JSON.stringify(kws));
    console.log(`  OK   ${p.short.padEnd(26)} ${String(kws.length).padStart(4)} kw · ` +
      `${days} days · ${live} ranked cells` + (resorted ? ` · RESORTED ${resorted} keyword(s)` : ''));
  }
  if (failed) {
    console.error(`\n${failed} radar(s) did not pull. Refusing to rebuild on a partial set —` +
      `\na missing product would silently vanish from the client's dashboard.`);
    process.exit(3);
  }
  console.log('Pull complete.');
})().catch(e => { console.error(e.message || e); process.exit(1); });
