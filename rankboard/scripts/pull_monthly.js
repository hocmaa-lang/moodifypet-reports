// Pull Rank Radar history month by month and reduce it to ONE number per keyword per
// month — the input for the monthly progress view (page_monthly.js).
//
//   node pull_monthly.js <config.json>
//
// config.monthly = { since: "2026-01" }   // first calendar month to show
//
// Why a separate pull: the rank-radar endpoint refuses ranges over 90 days, and a
// monthly view wants a year. So this walks calendar months, one request chain each.
//
// The month value of a keyword is the MEDIAN organic rank over the month's crawled
// days, with "not ranking" days counted as 101. That is deliberate: a keyword that
// touched #8 on three days and was absent the other 27 did not "rank #8 in March" —
// its typical position was nowhere, and the median says so. `best` is kept alongside
// for the curious, but every band count on the page uses the median.
//
// Crawl gaps are handled exactly as in build.js: a day where EVERY keyword of the
// radar reads 101/null is a crawl that never ran, not a day the product vanished.
// Those days are dropped before the median, so a missed crawl cannot drag a month.
//
// Closed months never change, so they are cached in <spillDir>/monthly/ and only the
// current and previous month are re-pulled on a refresh (previous: late crawls land).
const fs = require('fs');
const path = require('path');

const cfgPath = process.argv[2];
if (!cfgPath) { console.error('usage: node pull_monthly.js <config.json>'); process.exit(1); }
const CFG = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const CFGDIR = path.dirname(path.resolve(cfgPath));
const SPILL = path.resolve(CFGDIR, CFG.spillDir.replace(/\\/g, '/')).replace(/\\/g, '/');
const MDIR = SPILL + '/monthly';
const BASE = process.env.DATADIVE_BASE_URL || 'https://api.datadive.tools';
const SINCE = (CFG.monthly && CFG.monthly.since) || null;
if (!SINCE) { console.error('config.monthly.since is missing (e.g. "2026-01")'); process.exit(1); }

function apiKey() {
  if (process.env.DATADIVE_API_KEY) return process.env.DATADIVE_API_KEY;
  const f = path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude.json');
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
const KEY = apiKey();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(u) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    let res;
    try { res = await fetch(u, { headers: { 'x-api-key': KEY, accept: 'application/json' } }); }
    catch (e) { if (attempt === 5) throw e; await sleep(2000 * attempt); continue; }
    if (res.status === 429 || res.status >= 500) {
      if (attempt === 5) throw new Error(`Data Dive ${res.status} on ${u}`);
      await sleep(3000 * attempt); continue;
    }
    if (!res.ok) throw new Error(`Data Dive ${res.status} on ${u}: ${await res.text()}`);
    return res.json();
  }
}

// Same paging contract as pull.js: { data: { data:[...], hasNext, lastPage, total } }.
async function radarRange(id, start, end) {
  const out = [];
  for (let page = 1; page <= 200; page++) {
    const body = await get(`${BASE}/v1/niches/rank-radars/${encodeURIComponent(id)}` +
      `?startDate=${start}&endDate=${end}&pageSize=100&currentPage=${page}`);
    const d = body && body.data;
    if (Array.isArray(d)) return d;
    if (!d || !Array.isArray(d.data)) return out;
    out.push(...d.data);
    if (!d.hasNext || page >= (d.lastPage || 1)) return out;
  }
  throw new Error(`radar ${id}: more than 200 pages`);
}

const iso = d => d.toISOString().slice(0, 10);
function months() {
  const [y0, m0] = SINCE.split('-').map(Number);
  const now = new Date();
  const list = [];
  for (let y = y0, m = m0; y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth() + 1); ) {
    const start = new Date(Date.UTC(y, m - 1, 1));
    const endMonth = new Date(Date.UTC(y, m, 0));
    const end = endMonth > now ? now : endMonth;
    list.push({ key: `${y}-${String(m).padStart(2, '0')}`, start: iso(start), end: iso(end),
      open: endMonth >= new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)) });
    m++; if (m > 12) { m = 1; y++; }
  }
  return list;
}

const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

// Reduce one month of raw radar data to per-keyword numbers.
function reduce(kws) {
  const days = new Map(); // date -> any keyword ranked (<101)?
  for (const k of kws) for (const r of k.ranks || []) {
    if (r.organicRank == null) continue;
    days.set(r.date, (days.get(r.date) || false) || (r.organicRank < 101));
  }
  const live = new Set([...days].filter(([, any]) => any).map(([d]) => d));
  const res = {};
  for (const k of kws) {
    const vals = [];
    let ranked = 0, best = null;
    for (const r of k.ranks || []) {
      if (!live.has(r.date)) continue;
      const v = (r.organicRank == null || r.organicRank > 100) ? 101 : r.organicRank;
      vals.push(v);
      if (v <= 100) { ranked++; best = best == null ? v : Math.min(best, v); }
    }
    if (!vals.length) continue;
    res[k.keyword] = { med: median(vals), best, ranked, n: vals.length };
  }
  return { crawlDays: live.size, kw: res };
}

(async () => {
  if (!fs.existsSync(MDIR)) fs.mkdirSync(MDIR, { recursive: true });
  const M = months();
  console.log(`Monthly pull ${M[0].key} -> ${M[M.length - 1].key} for ${CFG.products.length} radar(s)`);
  let failed = 0;
  for (const p of CFG.products) {
    const file = `${MDIR}/${p.key}.json`;
    const cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { months: {} };
    // A cache made for another radar id is worthless — the keyword sets differ.
    if (cache.radarId && cache.radarId !== p.radarId) cache.months = {};
    let current;
    try {
      // Current keyword list (with search volume) comes from the latest month; it is
      // what the page shows, so archived keywords drop out of every month alike and
      // the months stay comparable.
      const last = M[M.length - 1];
      current = await radarRange(p.radarId, last.start, last.end);
      if (!current.length) throw new Error('radar returned 0 keywords');
      const pulled = [];
      for (const m of M) {
        if (cache.months[m.key] && !m.open) continue;
        const raw = m === last ? current : await radarRange(p.radarId, m.start, m.end);
        cache.months[m.key] = reduce(raw);
        pulled.push(m.key);
      }
      cache.radarId = p.radarId;
      cache.keywords = current.map(k => ({ kw: k.keyword, sv: +k.searchVolume || 0 }));
      cache.pulledAt = new Date().toISOString();
      fs.writeFileSync(file, JSON.stringify(cache));
      const withData = M.filter(m => cache.months[m.key] && cache.months[m.key].crawlDays).map(m => m.key);
      console.log(`  OK   ${(p.short || p.key).padEnd(26)} ${current.length} kw · months with data: ` +
        `${withData.length ? withData[0] + ' → ' + withData[withData.length - 1] : 'none yet'}` +
        ` · pulled ${pulled.length}`);
    } catch (e) {
      console.error(`  FAIL ${p.short || p.key}: ${e.message}`);
      failed++;
    }
  }
  if (failed) {
    console.error(`\n${failed} radar(s) failed the monthly pull. Refusing to continue on a partial set.`);
    process.exit(1);
  }
  console.log('Monthly pull complete.');
})();
