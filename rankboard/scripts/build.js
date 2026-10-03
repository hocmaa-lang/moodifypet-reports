// Organic-rank dashboard — parse each Data Dive Rank Radar spill into one compact
// payload. Rank 101 is Data Dive's "not ranking" sentinel, NOT a position: it must
// never be averaged as if it were rank 101.
//
//   node build.js <config.json>
//
const fs = require('fs');
const path = require('path');
if (!process.argv[2]) { console.error('usage: node build.js <config.json>'); process.exit(1); }
const CFG = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
// Config paths resolve against the config file's own directory, so a config can be
// relative and still work from any cwd (CI checks out to a different root).
const CFGDIR = path.dirname(path.resolve(process.argv[2]));
const abs = p => path.resolve(CFGDIR, String(p).replace(/\\/g, '/')).replace(/\\/g, '/');
const T = abs(CFG.spillDir).replace(/\/?$/, '/');
CFG.out = abs(CFG.out);
if (!fs.existsSync(CFG.out)) fs.mkdirSync(CFG.out, { recursive: true });
for (const p of CFG.products) {
  if (!fs.existsSync(T + p.file))
    throw new Error('spill not found for ' + p.short + ': ' + T + p.file);
}

const PRODUCTS = CFG.products;

const RANKED = r => r != null && r > 0 && r <= 100;   // 101 = not on page 1-ish at all

// Days to highlight as a column band, as JS getDay(): 0=Sun 1=Mon … 5=Fri 6=Sat.
// Empty = no marking, so every existing dashboard renders exactly as before.
const MARK = Array.isArray(CFG.markDays) ? CFG.markDays.map(Number) : [];
const DOW = d => new Date(d + 'T00:00:00Z').getUTCDay();

const out = { brand: CFG.brand, brandTitle: CFG.brandTitle || CFG.brand,
  teamName: CFG.teamName || CFG.brandTitle || CFG.brand,
  marketplace: CFG.marketplace || 'Amazon US', markDays: MARK,
  markLabel: CFG.markLabel || '', built: null, products: [], dates: [] };
const allDates = new Set();

for (const p of PRODUCTS) {
  const kws = JSON.parse(fs.readFileSync(T + p.file, 'utf8'));
  const byDate = {};      // date -> {t10,t50,t100,sv10,sv50}
  const rows = [];

  // The API returns `ranks` UNSORTED for some keywords (observed on the MCP path:
  // 1 of 55 on one radar, 6 of 19 on another). Everything downstream treats the
  // array as a time series against a shared date header, so an unsorted row is
  // silently scrambled against its own dates. pull.js sorts on the REST path;
  // this is the chokepoint both paths share, so it has to happen here too.
  let resorted = 0;
  for (const k of kws) {
    const before = k.ranks.map(r => r.date).join();
    k.ranks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (k.ranks.map(r => r.date).join() !== before) resorted++;
  }
  if (resorted) console.log(`  RESORTED ${resorted} keyword series for ${p.short}`);

  for (const k of kws) {
    const sv = k.searchVolume || 0;
    const series = k.ranks.map(r => ({ d: r.date, r: RANKED(r.organicRank) ? r.organicRank : null }));
    series.forEach(s => allDates.add(s.d));

    for (const s of series) {
      const b = byDate[s.d] || (byDate[s.d] = { t10: 0, t50: 0, t100: 0, sv10: 0, sv50: 0, svTot: 0 });
      if (s.r == null) continue;
      b.t100++; b.svTot += sv;
      if (s.r <= 50) { b.t50++; b.sv50 += sv; }
      if (s.r <= 10) { b.t10++; b.sv10 += sv; }
    }

    const seen = series.filter(s => s.r != null);
    const first = seen.length ? seen[0] : null;
    const last = seen.length ? seen[seen.length - 1] : null;
    // first/last across the WHOLE window, using the window edges, not first-seen
    const startR = seen.length ? seen[0].r : null;
    const endR = seen.length ? seen[seen.length - 1].r : null;
    const best = seen.length ? Math.min(...seen.map(s => s.r)) : null;

    rows.push({
      kw: k.keyword, sv,
      start: startR, end: endR, best,
      days: seen.length, total: series.length,
      // delta: negative = improved (moved toward 1). null when either edge is unranked.
      delta: (startR != null && endR != null) ? endR - startR : null,
      series: series.map(s => s.r),
    });
  }

  const dates = Object.keys(byDate).sort();

  // A day where EVERY tracked keyword reads 101 is a crawl that did not run, not a
  // day the product vanished from Amazon. Verified in the raw payload: gap days are
  // uniformly 101 across all keywords, real days show a spread. Plotting these as
  // zero invents a collapse. Partial crawls get flagged, not dropped.
  const counts = dates.map(d => byDate[d].t100);
  const ranked = counts.filter(c => c > 0).sort((a, b) => a - b);
  const median = ranked.length ? ranked[Math.floor(ranked.length / 2)] : 0;
  const trend = dates.map(d => {
    const b = byDate[d];
    const gap = b.t100 === 0;
    const partial = !gap && median > 0 && b.t100 < median * 0.45;
    return { d, ...b, gap, partial };
  });
  const live = trend.filter(t => !t.gap && !t.partial);

  out.products.push({
    ...p,
    kwCount: kws.length,
    dates,
    dow: dates.map(DOW),
    mark: dates.map(d => MARK.includes(DOW(d))),
    trend,
    coverage: { days: trend.length, withData: live.length,
                gaps: trend.filter(t => t.gap).map(t => t.d),
                partials: trend.filter(t => t.partial).map(t => t.d) },
    first: live[0] || null,
    last: live[live.length - 1] || null,
    rows: rows.sort((a, b) => b.sv - a.sv),
    svTracked: rows.reduce((s, r) => s + r.sv, 0),
  });
}

out.dates = [...allDates].sort();
out.built = out.dates[out.dates.length - 1];
fs.writeFileSync(CFG.out + '/payload.json', JSON.stringify(out));

// --- console summary so the numbers are visible before the page is built ------
for (const p of out.products) {
  const a = p.first, z = p.last; if(!a||!z){console.log(p.short,"NO DATA");continue;}
  console.log(`\n${p.short}  (${p.asin})  ${p.kwCount} keywords tracked, ${p.svTracked.toLocaleString()} SV`);
  console.log(`  window ${p.dates[0]} -> ${p.dates[p.dates.length-1]} | days with data ${p.coverage.withData}/${p.coverage.days} | gaps ${p.coverage.gaps.length} | partial ${p.coverage.partials.length}`);
  console.log(`  first live day ${a.d} -> last ${z.d}`);
  console.log(`  ranking at all : ${a.t100} -> ${z.t100}`);
  console.log(`  top 50         : ${a.t50} -> ${z.t50}   (SV ${a.sv50.toLocaleString()} -> ${z.sv50.toLocaleString()})`);
  console.log(`  top 10         : ${a.t10} -> ${z.t10}   (SV ${a.sv10.toLocaleString()} -> ${z.sv10.toLocaleString()})`);
  const moved = p.rows.filter(r => r.delta != null && r.delta !== 0);
  const up = moved.filter(r => r.delta < 0).sort((x, y) => x.delta - y.delta).slice(0, 3);
  const dn = moved.filter(r => r.delta > 0).sort((x, y) => y.delta - x.delta).slice(0, 3);
  console.log('  biggest gains :', up.map(r => `${r.kw} ${r.start}->${r.end}`).join(' | ') || '—');
  console.log('  biggest drops :', dn.map(r => `${r.kw} ${r.start}->${r.end}`).join(' | ') || '—');
  const never = p.rows.filter(r => r.days === 0).length;
  console.log(`  never ranked in window: ${never}/${p.kwCount}`);
}
