// Competitive rank matrix — rows = keywords, columns = ASINs, colour = rank band.
// Source is Data Dive `get_niche_keywords` (asinRanks), NOT Rank Radar. That means
// this is a SNAPSHOT at the niche's latestResearchDate, not a time series. Say so on
// the page — a reader who assumes it is daily history will misread a single bad day
// as a trend, and there is no trend here to read.
//
//   node page_matrix.js <config.json>
//
// config.matrix = { file, ours:[asin], labels:{asin:"Brand · 24\""}, nicheLabel }
const fs = require('fs');
const path = require('path');

const CFG = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const M = CFG.matrix;
if (!M) { console.error('config has no "matrix" block'); process.exit(1); }

const src = path.isAbsolute(M.file) ? M.file : path.join(CFG.spillDir, M.file);
const NK = JSON.parse(fs.readFileSync(src, 'utf8'));

const OURS = M.ours || [];
const LBL = M.labels || {};

// Column order: ours first, then competitors by how much of the niche they cover —
// strongest rival next to us, so the gap is the first thing the eye lands on.
const cols = Object.keys(NK.keywords[0].asinRanks);
const covered = a => NK.keywords.filter(k => k.asinRanks[a] != null).length;
const rivals = cols.filter(a => !OURS.includes(a)).sort((x, y) => covered(y) - covered(x));
const order = [...OURS.filter(a => cols.includes(a)), ...rivals];

// 101 is Data Dive's "not found" sentinel, same as in Rank Radar. Never a position.
const clean = r => (r == null || r > 100) ? null : r;

const rows = NK.keywords.map(k => ({
  kw: k.keyword,
  sv: k.searchVolume,
  rel: typeof k.relevancy === 'number' ? k.relevancy : null,
  r: order.map(a => clean(k.asinRanks[a])),
})).sort((a, b) => b.sv - a.sv);

// headline counts, our side only
const ourIdx = order.map((a, i) => OURS.includes(a) ? i : -1).filter(i => i >= 0);
const bestOurs = row => {
  const v = ourIdx.map(i => row.r[i]).filter(x => x != null);
  return v.length ? Math.min(...v) : null;
};
const stat = {
  total: rows.length,
  sv: rows.reduce((a, r) => a + r.sv, 0),
  any: rows.filter(r => bestOurs(r) != null).length,
  t10: rows.filter(r => { const b = bestOurs(r); return b != null && b <= 10; }).length,
  t50: rows.filter(r => { const b = bestOurs(r); return b != null && b <= 50; }).length,
};
stat.svAny = rows.filter(r => bestOurs(r) != null).reduce((a, r) => a + r.sv, 0);

const PAY = {
  brandTitle: CFG.brandTitle, teamName: CFG.teamName || CFG.brandTitle,
  marketplace: CFG.marketplace, nicheLabel: M.nicheLabel || '',
  researched: (NK.latestResearchDate || '').slice(0, 10),
  order, ours: OURS, labels: LBL, rows, stat,
};

const html = `<!doctype html><html lang="en" translate="no" class="notranslate"><head><meta charset="utf-8"><meta name="google" content="notranslate">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${PAY.brandTitle} — rank by ASIN vs competitors</title>
<style>
:root{
  --bg:#F7F6F2;--surface:#FFFFFF;--line:#E2DFD6;--grid:#EFECE4;
  --ink:#1B211E;--ink2:#4C5551;--ink3:#7F8A84;
  --r1:#0B5C3B;--r2:#1B7A50;--r3:#3E9A6C;--r4:#7DBB98;--r5:#BEDCC9;
  --none:#F0EDE6;
  --mine:#C2620A;--mineSoft:#FBF0E4;
  --good:#1F7A4C;--bad:#B0402C;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0E1310;--surface:#141A17;--line:#26302B;--grid:#1C2420;
  --ink:#EAEFEB;--ink2:#A9B4AE;--ink3:#77837D;
  --r1:#7BEFBB;--r2:#4FD094;--r3:#34A876;--r4:#2A8760;--r5:#2E6B51;
  --none:#1A211D;
  --mine:#D9762F;--mineSoft:#2A1E12;
  --good:#4CBF87;--bad:#E0785F;
}}
:root[data-theme="dark"]{
  --bg:#0E1310;--surface:#141A17;--line:#26302B;--grid:#1C2420;
  --ink:#EAEFEB;--ink2:#A9B4AE;--ink3:#77837D;
  --r1:#7BEFBB;--r2:#4FD094;--r3:#34A876;--r4:#2A8760;--r5:#2E6B51;
  --none:#1A211D;
  --mine:#D9762F;--mineSoft:#2A1E12;
  --good:#4CBF87;--bad:#E0785F;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);
  font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:28px 18px 60px}
.wrap{max-width:1240px;margin:0 auto}
h1{font-size:25px;letter-spacing:-.02em}
.sub{color:var(--ink2);font-size:13.5px;margin-top:3px}
.greet{font-size:13px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--ink3);font-weight:600;margin-bottom:6px}
.greet b{color:var(--ink);font-weight:600}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:11px;margin:20px 0 4px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:14px 16px}
.tile .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3)}
.tile .v{font-size:26px;font-weight:600;letter-spacing:-.02em;margin-top:3px;
  font-variant-numeric:tabular-nums}
.tile .n{font-size:12px;color:var(--ink2);margin-top:2px}
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:20px 0 14px}
button,select,input{font:inherit;font-size:13.5px;color:var(--ink);background:var(--surface);
  border:1px solid var(--line);border-radius:7px;padding:7px 13px;cursor:pointer}
button.on{background:var(--ink);color:var(--surface);border-color:var(--ink)}
input{cursor:text;min-width:190px}
.spacer{flex:1}
.count{color:var(--ink3);font-size:12.5px}
.key{display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--ink2);
  margin:0 0 14px}
.key span{display:flex;align-items:center;gap:5px}
.key i{width:16px;height:12px;border-radius:2px;display:block;border:1px solid var(--grid)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:11px;overflow:hidden}
.scroll{overflow-x:auto}
table{border-collapse:separate;border-spacing:0;font-size:13px}
th{position:sticky;top:0;background:var(--surface);z-index:2;text-align:left;color:var(--ink3);
  font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;padding:9px 6px;
  border-bottom:1px solid var(--line);white-space:nowrap;vertical-align:bottom}
/* Vertical headers: writing-mode rotates the text box itself, so the column keeps its
   narrow width without the transform/translate juggling that silently mis-lands. */
th.rot{height:132px;padding:0 0 8px;vertical-align:bottom;width:26px}
th.rot div{writing-mode:vertical-rl;transform:rotate(180deg);margin:0 auto;
  max-height:122px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-size:10.5px;letter-spacing:.04em}
th.me,td.me{background:var(--mineSoft)}
th.me div{color:var(--mine);font-weight:700}
td{padding:0 6px;border-bottom:1px solid var(--grid);height:29px;white-space:nowrap}
tr:hover td{background:color-mix(in srgb,var(--ink) 4%,transparent)}
tr:hover td.me{background:color-mix(in srgb,var(--mine) 12%,var(--mineSoft))}
th.kw,td.kw{position:sticky;left:0;background:var(--surface);z-index:3;
  max-width:260px;overflow:hidden;text-overflow:ellipsis;font-weight:500}
tr:hover td.kw{background:color-mix(in srgb,var(--ink) 4%,var(--surface))}
td.n{text-align:right;font-variant-numeric:tabular-nums}
td.cell{padding:0;text-align:center}
td.cell b{display:block;margin:3px auto;width:24px;height:22px;border-radius:3px;
  font-size:11px;font-weight:600;line-height:22px;
  box-shadow:inset 0 0 0 1px rgba(128,128,128,.18)}
.note{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--mine);
  border-radius:8px;padding:11px 15px;margin:16px 0 0;font-size:13px;color:var(--ink2)}
.note b{color:var(--ink)}
.tt{position:fixed;pointer-events:none;opacity:0;transition:opacity .08s;background:var(--surface);
  border:1px solid var(--line);border-radius:7px;padding:7px 10px;font-size:12.5px;
  box-shadow:0 6px 20px rgba(0,0,0,.18);z-index:9;white-space:nowrap}
.tt b{display:block}
</style></head><body><div class="wrap">
<div class="greet" id="greet"></div>
<h1>${PAY.brandTitle} — rank by ASIN, us vs. the shelf</h1>
<div class="sub">${PAY.marketplace}${PAY.nicheLabel ? ' · ' + PAY.nicheLabel : ''} ·
  Data Dive niche research, crawled ${PAY.researched} ·
  one column = one ASIN · <b>a single snapshot, not a trend</b></div>

<div class="tiles" id="tiles"></div>

<div class="bar">
  <button data-f="all" class="on">All keywords</button>
  <button data-f="gap">Where we don't rank</button>
  <button data-f="close">Where we're close (11–50)</button>
  <input id="q" placeholder="filter keywords…">
  <select id="sort">
    <option value="sv">Sort: search volume</option>
    <option value="mine">Sort: our rank</option>
    <option value="rel">Sort: relevancy</option>
  </select>
  <span class="spacer"></span><span class="count" id="cnt"></span>
</div>

<div class="key">
  <span><i style="background:var(--r1)"></i>1–3</span>
  <span><i style="background:var(--r2)"></i>4–10</span>
  <span><i style="background:var(--r3)"></i>11–20</span>
  <span><i style="background:var(--r4)"></i>21–50</span>
  <span><i style="background:var(--r5)"></i>51–100</span>
  <span><i style="background:var(--none)"></i>not ranking</span>
  <span><i style="background:var(--mineSoft);border-color:var(--mine)"></i>our column</span>
</div>

<div class="card"><div class="scroll"><table>
  <thead><tr id="head"></tr></thead><tbody id="rows"></tbody></table></div></div>

<div class="note"><b>This page is one crawl, not a history.</b> Data Dive re-researches a
niche on demand, so every number here is where each ASIN stood on ${PAY.researched}. The
day-by-day view lives in the Rank Radar dashboard, and it only covers the ASINs that have
a radar. <b>Columns are ASINs, not brands</b> — a rival with ten variants is ranked on the
one child shown here, so read a blank cell as "this ASIN does not rank", not "this brand
is absent". Rank, not sales.</div>
</div>
<div class="tt" id="tt"></div>
<script>
const D=${JSON.stringify(PAY)};
(function(){var h=new Date().getHours();
  var g=h<12?'Good morning':(h<18?'Good afternoon':'Good evening');
  document.getElementById('greet').innerHTML=g+', <b>'+D.teamName+' team</b>';})();

// Labels carry inch marks (18") and keywords carry apostrophes — both blow an
// unescaped HTML attribute apart. Escape once, here, and use it everywhere.
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const band=r=>r==null?'var(--none)':r<=3?'var(--r1)':r<=10?'var(--r2)':r<=20?'var(--r3)':r<=50?'var(--r4)':'var(--r5)';
const ink=r=>(r!=null&&r<=20)?'#fff':'var(--ink)';
const tt=document.getElementById('tt');
const show=(e,h)=>{tt.innerHTML=h;tt.style.opacity=1;const r=tt.getBoundingClientRect();
  tt.style.left=Math.min(e.clientX+13,innerWidth-r.width-8)+'px';
  tt.style.top=Math.max(e.clientY-r.height-11,6)+'px';};
const hide=()=>tt.style.opacity=0;

const mineIdx=D.order.map((a,i)=>D.ours.includes(a)?i:-1).filter(i=>i>=0);
const best=row=>{const v=mineIdx.map(i=>row.r[i]).filter(x=>x!=null);
  return v.length?Math.min.apply(null,v):null;};

document.getElementById('tiles').innerHTML=[
  ['Keywords in the niche',D.stat.total.toLocaleString(),
    D.stat.sv.toLocaleString()+' monthly searches'],
  ['We rank at all',D.stat.any.toLocaleString(),
    Math.round(D.stat.any/D.stat.total*100)+'% of the list · '+D.stat.svAny.toLocaleString()+' SV'],
  ['We rank top 50',D.stat.t50.toLocaleString(),
    Math.round(D.stat.t50/D.stat.total*100)+'% of the list'],
  ['We rank top 10',D.stat.t10.toLocaleString(),
    D.stat.t10===0?'not on page one anywhere':Math.round(D.stat.t10/D.stat.total*100)+'% of the list'],
].map(t=>'<div class="tile"><div class="k">'+t[0]+'</div><div class="v">'+t[1]+
  '</div><div class="n">'+t[2]+'</div></div>').join('');

document.getElementById('head').innerHTML=
  '<th class="kw">Keyword</th><th class="n">Vol</th>'+
  D.order.map(a=>{const me=D.ours.includes(a);
    return '<th class="rot'+(me?' me':'')+'" title="'+esc(a)+'"><div>'+
      esc(D.labels[a]||a)+'</div></th>';}).join('');

let filt='all',sort='sv',q='';
function render(){
  let list=D.rows.filter(r=>{
    if(q&&!r.kw.toLowerCase().includes(q))return false;
    const b=best(r);
    if(filt==='gap')return b==null;
    if(filt==='close')return b!=null&&b>10&&b<=50;
    return true;});
  const key={sv:r=>-r.sv,mine:r=>{const b=best(r);return b==null?999:b;},rel:r=>-(r.rel||0)};
  list.sort((a,b)=>key[sort](a)-key[sort](b));
  document.getElementById('cnt').textContent=list.length+' of '+D.rows.length+' keywords';
  document.getElementById('rows').innerHTML=list.map(r=>
    '<tr><td class="kw" title="'+r.kw.replace(/"/g,'&quot;')+'">'+r.kw+'</td>'+
    '<td class="n">'+r.sv.toLocaleString()+'</td>'+
    r.r.map((v,i)=>{const me=D.ours.includes(D.order[i]);
      return '<td class="cell'+(me?' me':'')+'"><b style="background:'+band(v)+';color:'+ink(v)+
        '" data-h="<b>'+(D.labels[D.order[i]]||D.order[i])+'</b>'+r.kw+' &middot; '+
        (v==null?'not ranking':'rank '+v)+'">'+(v==null?'':v)+'</b></td>';}).join('')+
    '</tr>').join('');
  document.querySelectorAll('td.cell b').forEach(c=>{
    c.addEventListener('mousemove',e=>show(e,c.dataset.h));
    c.addEventListener('mouseleave',hide);});
}
document.querySelectorAll('.bar button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.bar button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');filt=b.dataset.f;render();}));
document.getElementById('sort').addEventListener('change',e=>{sort=e.target.value;render();});
document.getElementById('q').addEventListener('input',e=>{q=e.target.value.toLowerCase();render();});
render();
</script></body></html>`;

const out = path.join(CFG.out, 'matrix.html');
fs.writeFileSync(out, html);
console.log('matrix.html', fs.statSync(out).size, 'bytes');
console.log('  ' + PAY.order.length + ' ASIN columns · ' + stat.total + ' keywords · crawled ' + PAY.researched);
console.log('  ours: rank at all ' + stat.any + '/' + stat.total +
            ' · top50 ' + stat.t50 + ' · top10 ' + stat.t10);
