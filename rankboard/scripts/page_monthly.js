// Monthly progress view — one number per ASIN per month, then the keywords behind it.
//
//   node page_monthly.js <config.json>        (reads <spillDir>/monthly/*.json from pull_monthly.js)
//
// What a month means here: every keyword gets ONE value per month, the median organic
// rank over that month's crawled days, with not-ranking days counted as 101 (see
// pull_monthly.js for why). A keyword is "top 10 in May" if its median in May is ≤10.
// Band counts use only keywords on the radar TODAY, so archiving or adding keywords
// changes every month alike and the months stay comparable; keywords added recently
// simply have no value in the months before they were tracked, and the page says so.
const fs = require('fs');
const path = require('path');

const cfgPath = process.argv[2];
const CFG = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const CFGDIR = path.dirname(path.resolve(cfgPath));
const abs = p => path.resolve(CFGDIR, String(p).replace(/\\/g, '/')).replace(/\\/g, '/').replace(/\/$/, '');
const MDIR = abs(CFG.spillDir) + '/monthly';
const OUT = abs(CFG.out);

const MNAME = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const today = new Date();
const curKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;

// A keyword counts in a month only if it was measured on enough of that month's crawl
// days. Without this, keywords added yesterday carried ONE day of data into the month
// and a single lucky day was scored as a whole month — on PeleTrade that inflated
// Lavazza Blue from 34 to 48 "top 10" overnight. 7 days, or every crawl day the month
// had if it had fewer (the first week of a month-to-date column).
const MIN_DAYS = 7;
const enough = (v, M) => !!(v && M && v.n >= Math.min(MIN_DAYS, M.crawlDays));

// month keys = union across products, from the configured start to now
const monthSet = new Set();
const products = CFG.products.map(p => {
  const f = `${MDIR}/${p.key}.json`;
  if (!fs.existsSync(f)) throw new Error(`missing ${f} — run pull_monthly.js first`);
  const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  Object.keys(c.months).forEach(m => monthSet.add(m));
  return { p, c };
});
let months = [...monthSet].sort();
// Trim leading months where no product had a single crawl: empty columns say nothing.
while (months.length && products.every(({ c }) => !(c.months[months[0]] || {}).crawlDays)) months.shift();

const P = {
  brandTitle: CFG.brandTitle || CFG.brand, teamName: CFG.teamName || CFG.brandTitle,
  marketplace: CFG.marketplace || 'Amazon US', built: today.toISOString().slice(0, 10),
  months: months.map(m => ({ key: m, label: MNAME[+m.slice(5) - 1] + ' ' + m.slice(2, 4), mtd: m === curKey })),
  products: products.map(({ p, c }) => {
    const kws = (c.keywords || []).slice().sort((a, b) => b.sv - a.sv);
    const totalSv = kws.reduce((s, k) => s + k.sv, 0);
    const stats = months.map(m => {
      const M = c.months[m];
      if (!M || !M.crawlDays) return null;
      let t10 = 0, t50 = 0, t100 = 0, sv10 = 0, sv50 = 0, withData = 0;
      for (const k of kws) {
        const v = M.kw[k.kw];
        if (!enough(v, M)) continue;
        withData++;
        if (v.med <= 10) { t10++; sv10 += k.sv; }
        if (v.med <= 50) { t50++; sv50 += k.sv; }
        if (v.med <= 100) t100++;
      }
      return { t10, t50, t100, sv10, sv50, withData, crawl: M.crawlDays };
    });
    const rows = kws.map(k => ({
      kw: k.kw, sv: k.sv,
      m: months.map(m => { const v = c.months[m] && c.months[m].kw[k.kw];
        return enough(v, c.months[m]) ? [v.med > 100 ? null : Math.round(v.med), v.best, v.ranked, v.n] : 0; }),
    }));
    return { key: p.key, short: p.short, name: p.name, asin: p.asin,
      kwCount: kws.length, totalSv, stats, rows };
  }),
};

const html = `<!doctype html><html lang="en" translate="no" class="notranslate"><head><meta charset="utf-8"><meta name="google" content="notranslate">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${P.brandTitle} — monthly organic progress</title>
<style>
:root{
  --bg:#F6F7F9;--surface:#FFFFFF;--line:#E1E4E9;--grid:#EDEFF3;
  --ink:#171A1E;--ink2:#4A5158;--ink3:#7C858E;
  /* Same validated five-hue rank ramp as the day-by-day heatmap, so a colour means
     the same rank band on every page of this dashboard. */
  --r1:#1D4ED8;--r2:#06B6D4;--r3:#C026D3;--r4:#F97316;--r5:#B91C1C;
  --none:#EDEFF3;--gap:#CDD2D9;
  --good:#1F7A4C;--bad:#B0402C;
  --heat:29,78,216;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0F1114;--surface:#16191D;--line:#282D34;--grid:#1C2026;
  --ink:#EAEDF1;--ink2:#A7AFB8;--ink3:#767E87;
  --r1:#2563EB;--r2:#0891B2;--r3:#C026D3;--r4:#F0761A;--r5:#B02525;
  --none:#191D22;--gap:#343A42;
  --good:#4CBF87;--bad:#E0785F;
  --heat:96,140,240;
}}
:root[data-theme="dark"]{
  --bg:#0F1114;--surface:#16191D;--line:#282D34;--grid:#1C2026;
  --ink:#EAEDF1;--ink2:#A7AFB8;--ink3:#767E87;
  --r1:#2563EB;--r2:#0891B2;--r3:#C026D3;--r4:#F0761A;--r5:#B02525;
  --none:#191D22;--gap:#343A42;--good:#4CBF87;--bad:#E0785F;--heat:96,140,240;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);
  font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:28px 16px 60px}
.wrap{max-width:1240px;margin:0 auto}
h1{font-size:25px;letter-spacing:-.02em}
h2{font-size:17px;margin:34px 0 4px;letter-spacing:-.01em}
.sub{color:var(--ink2);font-size:13.5px;margin-top:3px}
.greet{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3);font-weight:600;margin-bottom:6px}
.greet b{color:var(--ink);font-weight:600}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:14px 0 12px}
button,select{font:inherit;font-size:13.5px;color:var(--ink);background:var(--surface);
  border:1px solid var(--line);border-radius:7px;padding:6px 12px;cursor:pointer}
button.on{background:var(--ink);color:var(--surface);border-color:var(--ink)}
.lbl{font-size:12px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em;margin-right:4px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:11px;overflow:hidden}
.scroll{overflow-x:auto}
table{border-collapse:separate;border-spacing:0;width:100%;font-size:13px}
th{background:var(--surface);text-align:left;color:var(--ink3);font-size:10.5px;text-transform:uppercase;
  letter-spacing:.06em;padding:9px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
th.m,td.m{text-align:center}
td{padding:6px 8px;border-bottom:1px solid var(--grid);white-space:nowrap}
tr:last-child td{border-bottom:0}
.pn{font-weight:600}.as{font-size:11px;color:var(--ink3);font-variant-numeric:tabular-nums}
.cell{display:inline-block;min-width:58px;padding:4px 6px;border-radius:6px;font-variant-numeric:tabular-nums;line-height:1.2}
.cell b{font-size:15px}.cell small{display:block;font-size:10.5px;opacity:.75}
.nod{color:var(--ink3);font-size:12px}
.d{font-weight:600;font-variant-numeric:tabular-nums}.up{color:var(--good)}.dn{color:var(--bad)}.fl{color:var(--ink3)}
.mtd{font-size:9.5px;color:var(--ink3);display:block;letter-spacing:.02em;text-transform:none}
.chart{padding:14px 14px 6px}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--ink2);padding:0 14px 12px}
.legend span{display:flex;gap:5px;align-items:center}.legend i{width:12px;height:12px;border-radius:2px;display:block}
.badge{display:inline-block;min-width:30px;text-align:center;padding:2px 6px;border-radius:20px;font-size:12px;font-weight:600}
.kw{max-width:300px;overflow:hidden;text-overflow:ellipsis;font-weight:500}
td.n{text-align:right;font-variant-numeric:tabular-nums}
.note{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--ink3);border-radius:8px;
  padding:11px 15px;margin:16px 0 0;font-size:13px;color:var(--ink2)}
.note b{color:var(--ink)}
.asinbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0 10px;padding:10px 12px;
  background:var(--surface);border:1px solid var(--line);border-radius:9px;max-width:560px}
.asinbar label{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2)}
.asinbar input{flex:1 1 200px;min-width:0;font:inherit;font-size:15px;color:var(--ink);background:var(--surface);
  border:2px solid var(--line);border-radius:7px;padding:6px 10px;text-transform:uppercase;letter-spacing:.04em}
.asinbar input:focus{outline:none;border-color:var(--r1)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:0 0 12px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:11px 14px}
.tile .k{font-size:11px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em}
.tile .v{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.tile .s{font-size:12px;color:var(--ink2)}
svg text{fill:var(--ink3);font-size:11px}
</style></head><body><div class="wrap">
<div class="greet" id="greet"></div>
<h1>${P.brandTitle} — organic progress, month by month</h1>
<div class="sub">${P.marketplace} · ${P.months.length ? P.months[0].label + ' → ' + P.months[P.months.length - 1].label : ''} · Data Dive Rank Radar · built ${P.built}</div>

<h2>Every ASIN, every month</h2>
<div class="bar"><span class="lbl">Count</span>
  <button data-m="t10" class="on">Keywords in top 10</button>
  <button data-m="t50">Keywords in top 50</button>
  <button data-m="t100">Ranking at all (top 100)</button>
  <button data-m="sv50">Search volume in top 50</button>
</div>
<div class="card"><div class="scroll"><table id="grid"></table></div></div>

<h2 id="dh">ASIN detail</h2>
<div class="asinbar">
  <label for="asin">Search by ASIN</label>
  <input id="asin" list="asins" placeholder="e.g. ${(CFG.products[0]&&CFG.products[0].asin)||"B0XXXXXXXX"}" autocomplete="off" spellcheck="false">
  <datalist id="asins"></datalist>
  <button type="button" id="asinclr" title="Clear">✕</button>
</div>
<div class="note" id="asinnote" style="display:none;margin:0 0 10px"></div>
<div class="bar" id="pbar"></div>
<div id="tiles" class="tiles"></div>
<div class="card"><div class="chart"><svg id="chart" width="100%" height="220" role="img" aria-label="Keywords by rank band per month"></svg></div>
<div class="legend"><span><i style="background:var(--r2)"></i>Top 10</span><span><i style="background:var(--r4)"></i>11–50</span><span><i style="background:var(--r5)"></i>51–100</span></div></div>
<div class="bar" style="margin-top:16px"><span class="lbl">Keywords</span>
  <select id="sort"><option value="sv">Sort: search volume</option><option value="imp">Sort: most improved</option>
  <option value="now">Sort: best rank now</option></select>
  <button id="onlyr" class="on">Only keywords that ranked</button></div>
<div class="card"><div class="scroll"><table id="kt"></table></div></div>

<div class="note"><b>How a month is measured.</b> Each keyword gets one number per month: its
<b>median</b> organic rank across the days Data Dive crawled that month, counting days it did not
appear as "not ranking". A keyword that touched #8 on three days and was absent the rest does
<i>not</i> count as top 10 — its typical position that month was nowhere. Days the tracker did not
run at all are left out, so a missed crawl never drags a month down.
<b>The current month is month-to-date.</b> Counts use only the keywords tracked today, so every
month is measured on the same list; a keyword counts in a month only once it has been measured
on at least ${MIN_DAYS} of that month's days, so a keyword added recently shows "—" until then. <b>This is rank, not sales.</b></div>
</div>
<script>
var BRAND=${JSON.stringify(P.teamName || P.brandTitle)};
(function(){var h=new Date().getHours();var g=h<12?'Good morning':(h<18?'Good afternoon':'Good evening');
  var el=document.getElementById('greet');if(el)el.innerHTML=g+', <b>'+BRAND+' team</b>';})();
const D=${JSON.stringify(P)};
const MON=D.months;
const fmt=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?Math.round(n/1e3)+'K':String(n);
const band=r=>r==null?'var(--none)':r<=3?'var(--r1)':r<=10?'var(--r2)':r<=20?'var(--r3)':r<=50?'var(--r4)':'var(--r5)';
const badge=r=>r==null?'<span class="fl">—</span>':'<span class="badge" style="background:'+band(r)+';color:'+(r<=20?'#fff':'var(--ink)')+'">'+r+'</span>';
const dl=(v,rev)=>v==null?'<span class="fl">—</span>':v===0?'<span class="d fl">0</span>':
  ((rev?v<0:v>0)?'<span class="d up">▲ '+Math.abs(v)+'</span>':'<span class="d dn">▼ '+Math.abs(v)+'</span>');
// last month with data, and the one before it with data
function lastTwo(st){const idx=st.map((s,i)=>s?i:-1).filter(i=>i>=0);return [idx[idx.length-1],idx[idx.length-2],idx[0]];}

let metric='t10';
function grid(){
  const val=(s)=>s?(metric==='sv50'?s.sv50:s[metric]):null;
  const maxAll=Math.max(1,...D.products.flatMap(p=>p.stats.map(s=>val(s)||0)));
  let h='<thead><tr><th>ASIN</th>'+MON.map(m=>'<th class="m">'+m.label+(m.mtd?'<span class="mtd">to date</span>':'')+'</th>').join('')+
    '<th class="m">vs prev month</th><th class="m">vs first month</th></tr></thead><tbody>';
  for(const p of D.products){
    const [l,pr,f]=lastTwo(p.stats);
    h+='<tr><td><div class="pn">'+p.short+'</div><div class="as">'+p.asin+' · '+p.kwCount+' kw</div></td>';
    p.stats.forEach(s=>{
      if(!s){h+='<td class="m"><span class="nod">—</span></td>';return;}
      const v=val(s), a=v/maxAll;
      const txt=metric==='sv50'?fmt(v):v;
      // A month resting on only a few crawl days is flagged in the cell itself, not
      // just in the tooltip — one day of data must not read like a whole month.
      const sub=s.crawl<7?'only '+s.crawl+(s.crawl===1?' day':' days'):
        metric==='sv50'?(p.totalSv?Math.round(100*v/p.totalSv)+'% of SV':''):s.withData+' w/ data';
      h+='<td class="m"><span class="cell" style="background:rgba(var(--heat),'+(0.06+0.5*a).toFixed(2)+');color:'+(a>0.55?'#fff':'var(--ink)')+'" title="'+s.crawl+' crawl days"><b>'+txt+'</b><small>'+sub+'</small></span></td>';});
    const d=(i,j)=>(i==null||j==null)?null:(val(p.stats[i])-val(p.stats[j]));
    const show=x=>x==null?'<span class="fl">—</span>':metric==='sv50'?(x===0?'<span class="d fl">0</span>':'<span class="d '+(x>0?'up':'dn')+'">'+(x>0?'▲ ':'▼ ')+fmt(Math.abs(x))+'</span>'):dl(x);
    h+='<td class="m">'+show(d(l,pr))+'</td><td class="m">'+show(d(l,f))+'</td></tr>';
  }
  document.getElementById('grid').innerHTML=h+'</tbody>';
}
document.querySelectorAll('[data-m]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('[data-m]').forEach(x=>x.classList.remove('on'));b.classList.add('on');metric=b.dataset.m;grid();}));

let cur=D.products.findIndex(p=>p.stats.some(Boolean));if(cur<0)cur=0;
let ksort='sv',onlyR=true;
document.getElementById('pbar').innerHTML=D.products.map((p,i)=>'<button data-i="'+i+'">'+p.short+'</button>').join('');
document.querySelectorAll('#pbar button').forEach(b=>b.addEventListener('click',()=>{cur=+b.dataset.i;detail();}));
document.getElementById('sort').addEventListener('change',e=>{ksort=e.target.value;detail();});
document.getElementById('onlyr').addEventListener('click',e=>{onlyR=!onlyR;e.target.classList.toggle('on',onlyR);detail();});

function detail(){
  const p=D.products[cur];
  document.querySelectorAll('#pbar button').forEach(b=>b.classList.toggle('on',+b.dataset.i===cur));
  document.getElementById('dh').textContent='ASIN detail — '+p.name+' ('+p.asin+')';
  const [l,pr,f]=lastTwo(p.stats);
  const T=(k,v,s)=>'<div class="tile"><div class="k">'+k+'</div><div class="v">'+v+'</div><div class="s">'+s+'</div></div>';
  if(l==null){document.getElementById('tiles').innerHTML=T('Status','New','Radar created recently — the first month fills in as crawls arrive.');}
  else{const s=p.stats[l],q=pr!=null?p.stats[pr]:null,o=p.stats[f];
    const ch=(a,b)=>b==null?'':(a-b===0?'no change':(a>b?'▲ ':'▼ ')+Math.abs(a-b));
    document.getElementById('tiles').innerHTML=
      T('Top 10 · '+MON[l].label,s.t10,q?ch(s.t10,q.t10)+' vs '+MON[pr].label:'first month')+
      T('Top 50 · '+MON[l].label,s.t50,q?ch(s.t50,q.t50)+' vs '+MON[pr].label:'first month')+
      T('Since '+MON[f].label,(s.t50-o.t50>=0?'+':'')+(s.t50-o.t50),'keywords in top 50 ('+o.t50+' → '+s.t50+')')+
      T('Search vol in top 50',fmt(s.sv50),p.totalSv?Math.round(100*s.sv50/p.totalSv)+'% of '+fmt(p.totalSv)+' tracked':'');}
  // stacked bars: top10 / 11-50 / 51-100 per month
  const svg=document.getElementById('chart'),W=svg.clientWidth||900,H=220,pl=34,pb=26,pt=10;
  const n=MON.length,bw=Math.min(46,(W-pl-10)/n*0.62),mx=Math.max(4,...p.stats.map(s=>s?s.t100:0));
  const y=v=>H-pb-(H-pb-pt)*v/mx;let g='';
  for(let t=0;t<=4;t++){const v=Math.round(mx*t/4),yy=y(v);g+='<line x1="'+pl+'" x2="'+(W-6)+'" y1="'+yy+'" y2="'+yy+'" stroke="var(--grid)"/><text x="'+(pl-6)+'" y="'+(yy+4)+'" text-anchor="end">'+v+'</text>';}
  MON.forEach((m,i)=>{const cx=pl+(W-pl-10)*(i+0.5)/n,x=cx-bw/2,s=p.stats[i];
    g+='<text x="'+cx+'" y="'+(H-8)+'" text-anchor="middle">'+m.label+(m.mtd?'*':'')+'</text>';
    if(!s){g+='<text x="'+cx+'" y="'+(H-pb-6)+'" text-anchor="middle">–</text>';return;}
    const segs=[[s.t10,'var(--r2)','Top 10'],[s.t50-s.t10,'var(--r4)','11–50'],[s.t100-s.t50,'var(--r5)','51–100']];let base=0;
    segs.forEach(([v,c,lab])=>{if(v<=0)return;const y1=y(base+v),y0=y(base);
      g+='<rect x="'+x+'" y="'+y1+'" width="'+bw+'" height="'+Math.max(0,y0-y1-1)+'" rx="2" fill="'+c+'"><title>'+m.label+' · '+lab+': '+v+'</title></rect>';base+=v;});
    g+='<text x="'+cx+'" y="'+(y(s.t100)-4)+'" text-anchor="middle" style="fill:var(--ink2);font-weight:600">'+s.t100+'</text>';});
  svg.innerHTML=g;
  // keyword table
  let rows=p.rows.slice();
  const lastIdx=l;const firstIdx=r=>r.m.findIndex(v=>v&&v[0]!=null);
  const now=r=>lastIdx==null||!r.m[lastIdx]?null:r.m[lastIdx][0];
  const imp=r=>{const fi=firstIdx(r);if(fi<0)return null;const a=r.m[fi][0],b=now(r);return (b==null?101:b)-a;};
  if(onlyR)rows=rows.filter(r=>r.m.some(v=>v&&v[0]!=null));
  if(ksort==='imp')rows.sort((a,b)=>(imp(a)??999)-(imp(b)??999));
  else if(ksort==='now')rows.sort((a,b)=>(now(a)??999)-(now(b)??999));
  let h='<thead><tr><th>Keyword</th><th class="n">Search vol</th>'+MON.map(m=>'<th class="m">'+m.label+(m.mtd?'<span class="mtd">to date</span>':'')+'</th>').join('')+'<th class="m">Change</th></tr></thead><tbody>';
  for(const r of rows){h+='<tr><td class="kw" title="'+r.kw.replace(/"/g,'&quot;')+'">'+r.kw+'</td><td class="n">'+r.sv.toLocaleString()+'</td>'+
    r.m.map((v,i)=>'<td class="m" title="'+(v?('median '+(v[0]??'not ranking')+(v[1]?' · best '+v[1]:'')+' · ranked '+v[2]+' of '+v[3]+' days'):'not tracked yet')+'">'+(v?badge(v[0]):'<span class="nod">·</span>')+'</td>').join('')+
    '<td class="m">'+dl(imp(r),true)+'</td></tr>';}
  if(!rows.length)h+='<tr><td colspan="'+(MON.length+3)+'" class="nod" style="padding:18px">No keyword has ranked yet in the tracked months.</td></tr>';
  document.getElementById('kt').innerHTML=h+'</tbody>';
}
// ASIN search: resolves an ASIN to the radar that measures it — its own, or the
// radar of its variation family (siblings are named in the product name).
const ASINMAP={};
D.products.forEach((p,i)=>{ if(p.asin) ASINMAP[p.asin]={i,via:null};
  (p.name.match(/B0[A-Z0-9]{8}/g)||[]).forEach(a=>{ if(!ASINMAP[a]) ASINMAP[a]={i,via:p.asin}; }); });
document.getElementById('asins').innerHTML=Object.entries(ASINMAP)
  .map(([a,v])=>'<option value="'+a+'">'+D.products[v.i].short+(v.via?' (family of '+v.via+')':'')+'</option>').join('');
function asinSearch(){
  const aq=document.getElementById('asin').value.toUpperCase().replace(/[^A-Z0-9]/g,'');
  const el=document.getElementById('asinnote');
  if(!aq){el.style.display='none';return;}
  const hits=Object.entries(ASINMAP).filter(([a])=>a.includes(aq));
  const idx=[...new Set(hits.map(([,v])=>v.i))];
  el.style.display='block';
  if(!hits.length){el.innerHTML='<b>'+aq+'</b> is not tracked in this dashboard — no Rank Radar covers it.';return;}
  if(idx.length>1){el.innerHTML='Matching ASINs: '+hits.map(([a,v])=>'<b>'+a+'</b> ('+D.products[v.i].short+')').join(' · ')+' — keep typing.';return;}
  cur=idx[0];detail();
  const exact=ASINMAP[aq], p=D.products[cur];
  el.innerHTML=exact&&exact.via
    ?'<b>'+aq+'</b> is measured through <b>'+exact.via+'</b> ('+p.short+') — same variation family, so Amazon ranks them together.'
    :'<b>'+(exact?aq:hits[0][0])+'</b> — '+p.short+(p.stats.some(Boolean)?'.':' — a new radar; its first month fills in after the first crawls.');
}
document.getElementById('asin').addEventListener('input',asinSearch);
document.getElementById('asinclr').addEventListener('click',()=>{const i=document.getElementById('asin');i.value='';asinSearch();i.focus();});
// Clicking a product button directly makes a typed ASIN stale — clear it.
document.getElementById('pbar').addEventListener('click',e=>{if(e.target.closest('button')){document.getElementById('asin').value='';document.getElementById('asinnote').style.display='none';}});

grid();detail();addEventListener('resize',detail);
document.body.dataset.ready='monthly ready';
</script></body></html>`;
fs.writeFileSync(OUT + '/monthly.html', html);
console.log('monthly.html', fs.statSync(OUT + '/monthly.html').size, 'bytes ·', P.months.length, 'months ·', P.products.length, 'products');
