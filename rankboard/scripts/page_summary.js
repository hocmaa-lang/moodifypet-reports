// Assemble the self-contained organic dashboard page from payload.json
const fs = require('fs');
const P = JSON.parse(fs.readFileSync(process.argv[2] + '/payload.json', 'utf8'));

// Categorical palette — validated with scripts/validate_palette.js:
//   light  #128F5E,#C2620A,#4169C4  on #FFFFFF  → all six checks PASS
//   dark   #25A473,#D9762F,#5F8CE0  on #141A17  → all six checks PASS
const html = `<!doctype html><html lang="en" translate="no" class="notranslate"><head><meta charset="utf-8"><meta name="google" content="notranslate">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${P.brandTitle} — organic rank dashboard</title>
<style>
:root{
  --bg:#F7F6F2; --surface:#FFFFFF; --line:#E2DFD6; --grid:#EDEAE2;
  --ink:#1B211E; --ink2:#4C5551; --ink3:#7C8681;
  --c1:#128F5E; --c2:#C2620A; --c3:#4169C4;
  --good:#1F7A4C; --bad:#B0402C; --flat:#7C8681;
  --markfill:rgba(194,98,10,.10); --markink:#9A5308;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0E1310; --surface:#141A17; --line:#26302B; --grid:#1E2621;
  --ink:#EAEFEB; --ink2:#A9B4AE; --ink3:#77837D;
  --c1:#25A473; --c2:#D9762F; --c3:#5F8CE0;
  --good:#4CBF87; --bad:#E0785F; --flat:#77837D;
  --markfill:rgba(217,118,47,.10); --markink:#E09355;
}}
:root[data-theme="dark"]{
  --bg:#0E1310; --surface:#141A17; --line:#26302B; --grid:#1E2621;
  --ink:#EAEFEB; --ink2:#A9B4AE; --ink3:#77837D;
  --c1:#25A473; --c2:#D9762F; --c3:#5F8CE0;
  --good:#4CBF87; --bad:#E0785F; --flat:#77837D;
  --markfill:rgba(217,118,47,.10); --markink:#E09355;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);
  font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  padding:32px 20px 64px}
.wrap{max-width:1080px;margin:0 auto}
h1{font-size:26px;letter-spacing:-.02em;margin-bottom:4px}
.sub{color:var(--ink2);font-size:14px}
.note{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--c2);
  border-radius:8px;padding:12px 16px;margin:20px 0 28px;font-size:13.5px;color:var(--ink2)}
.note b{color:var(--ink)}
section{background:var(--surface);border:1px solid var(--line);border-radius:12px;
  padding:22px 24px;margin-bottom:20px;overflow:hidden}
h2{font-size:17px;letter-spacing:-.01em;display:flex;align-items:center;gap:9px}
.dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto}
.asin{color:var(--ink3);font:12px ui-monospace,Consolas,monospace;font-weight:400;margin-left:auto}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:12px;margin:18px 0 22px}
.tile{border:1px solid var(--line);border-radius:9px;padding:12px 14px}
.tile .v{font-size:25px;font-weight:650;letter-spacing:-.02em;line-height:1.15}
.tile .l{font-size:11.5px;color:var(--ink3);text-transform:uppercase;letter-spacing:.07em;margin-top:3px}
.tile .d{font-size:12px;margin-top:5px;font-weight:600}
.up{color:var(--good)} .dn{color:var(--bad)} .fl{color:var(--flat)}
.chartwrap{overflow-x:auto}
svg{display:block}
.gl{stroke:var(--grid);stroke-width:1}
.ax{fill:var(--ink3);font-size:11px}
.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--ink2);margin:10px 0 2px}
.legend span{display:flex;align-items:center;gap:6px}
.legend i{width:14px;height:3px;border-radius:2px;display:block}
table{border-collapse:collapse;width:100%;font-size:13px;margin-top:6px}
th{text-align:left;color:var(--ink3);font-size:11px;text-transform:uppercase;letter-spacing:.06em;
  padding:7px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:7px 8px;border-bottom:1px solid var(--grid)}
td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tr:last-child td{border-bottom:0}
.kw{max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{display:inline-block;padding:1px 7px;border-radius:20px;font-size:11.5px;font-weight:600}
.p10{background:color-mix(in srgb,var(--c1) 16%,transparent);color:var(--c1)}
.p50{background:color-mix(in srgb,var(--c3) 15%,transparent);color:var(--c3)}
.pna{color:var(--ink3)}
details summary{cursor:pointer;color:var(--ink2);font-size:13px;margin-top:14px;
  padding:7px 0;border-top:1px solid var(--grid);user-select:none}
.tt{position:fixed;pointer-events:none;opacity:0;transition:opacity .1s;background:var(--surface);
  border:1px solid var(--line);border-radius:7px;padding:8px 11px;font-size:12.5px;
  box-shadow:0 6px 20px rgba(0,0,0,.16);z-index:9}
.tt b{display:block;margin-bottom:3px}
.greet{font-size:13px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--ink3);font-weight:600;margin-bottom:6px}
.greet b{color:var(--ink);font-weight:600}
footer{color:var(--ink3);font-size:12px;text-align:center;margin-top:28px}
</style></head><body><div class="wrap">

<div class="greet" id="greet"></div>
<h1>${P.brandTitle} — organic rank</h1>
<div class="sub">${P.marketplace} · ${P.dates.length}-day window ${P.dates[0]} → ${P.built} · source: Data Dive Rank Radar</div>

<div class="note"><b>Read the gaps as gaps.</b> The tracker did not crawl on every day
in this window. A day where <i>every</i> tracked keyword reads 101 is a crawl that did
not run — not a day the product left Amazon — and those days are drawn as breaks in
the line, never as zero. Every figure below is measured between the first and last
<i>day with data</i>, and each card states its own coverage.
<b>This is rank only.</b> It is not sales, and Data Dive carries no revenue for these ASINs.</div>

<div id="app"></div>
<footer>Ranks are organic positions. 101 = not found in the tracked result set.</footer>
</div>
<div class="tt" id="tt"></div>
<script>
var BRAND=${JSON.stringify(P.teamName || P.brandTitle)};
(function(){var h=new Date().getHours();
  var g=h<12?'Good morning':(h<18?'Good afternoon':'Good evening');
  var el=document.getElementById('greet');
  if(el) el.innerHTML=g+', <b>'+BRAND+' team</b>';})();
const DATA = ${JSON.stringify(P)};
const MARKLBL = ${JSON.stringify((P.markDays && P.markDays.length) ? (P.markLabel || 'marked days') : '')};
const DOWNAME = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const C = ['var(--c1)','var(--c2)','var(--c3)'];
const fmt = n => n.toLocaleString('en-US');
const tt = document.getElementById('tt');
const showTip = (e,h)=>{tt.innerHTML=h;tt.style.opacity=1;
  const r=tt.getBoundingClientRect();
  tt.style.left=Math.min(e.clientX+14,innerWidth-r.width-10)+'px';
  tt.style.top=Math.max(e.clientY-r.height-12,8)+'px';};
const hideTip = ()=>tt.style.opacity=0;

function delta(a,b){ // ranks: lower is better
  if(a==null||b==null) return '<span class="fl">—</span>';
  const d=b-a;
  if(d===0) return '<span class="fl">0</span>';
  return d<0 ? '<span class="up">▲ '+(-d)+'</span>' : '<span class="dn">▼ '+d+'</span>';
}
function deltaCount(a,b){ // counts: higher is better
  const d=b-a;
  if(d===0) return '<span class="fl">no change</span>';
  return d>0 ? '<span class="up">+'+d+'</span>' : '<span class="dn">'+d+'</span>';
}

function chart(p,ci){
  const W=980,H=210,L=38,R=12,T=12,B=26;
  const iw=W-L-R, ih=H-T-B;
  const pts=p.trend;
  const max=Math.max(6,...pts.map(t=>t.t100));
  const x=i=>L+(pts.length<2?iw/2:i*iw/(pts.length-1));
  const y=v=>T+ih-(v/max)*ih;

  // build line segments, breaking at gap/partial days so a missing crawl never
  // draws a plunge to zero
  const seg=(key)=>{
    const out=[]; let cur=[];
    pts.forEach((t,i)=>{
      if(t.gap||t.partial){ if(cur.length){out.push(cur);cur=[];} return; }
      cur.push([x(i),y(t[key])]);
    });
    if(cur.length)out.push(cur);
    return out.map(s=>'<path d="M'+s.map(q=>q[0].toFixed(1)+' '+q[1].toFixed(1)).join('L')+'"/>').join('');
  };

  const gridY=[0,.25,.5,.75,1].map(f=>{const v=Math.round(max*f);
    return '<line class="gl" x1="'+L+'" y1="'+y(v)+'" x2="'+(W-R)+'" y2="'+y(v)+'"/>'+
           '<text class="ax" x="'+(L-7)+'" y="'+(y(v)+4)+'" text-anchor="end">'+v+'</text>';}).join('');

  // Marked-day columns (e.g. Fri/Sat/Sun) sit under everything else, in their own
  // hue, so they never get confused with the grey no-crawl bands drawn next.
  const markBands=(p.mark||[]).map((m,i)=>{
    if(!m)return '';
    const w=pts.length<2?iw:iw/(pts.length-1);
    return '<rect x="'+(x(i)-w/2)+'" y="'+T+'" width="'+w+'" height="'+ih+
      '" fill="var(--markfill)"/>';}).join('');

  const gapBands=pts.map((t,i)=>{
    if(!t.gap&&!t.partial)return '';
    const w=pts.length<2?iw:iw/(pts.length-1);
    return '<rect x="'+(x(i)-w/2)+'" y="'+T+'" width="'+w+'" height="'+ih+
      '" fill="var(--ink3)" opacity="'+(t.gap?.10:.05)+'"/>';}).join('');

  const ticks=pts.map((t,i)=> (i%5===0||i===pts.length-1)
    ? '<text class="ax" x="'+x(i)+'" y="'+(H-8)+'" text-anchor="middle">'+t.d.slice(5)+'</text>' : '').join('');

  const hit=pts.map((t,i)=>{
    const w=pts.length<2?iw:iw/(pts.length-1);
    const lbl=t.gap?'<span style="color:var(--ink3)">no crawl this day</span>'
      :(t.partial?'<span style="color:var(--ink3)">partial crawl — '+t.t100+' keywords returned</span>'
      :'ranking '+t.t100+' · top 50 '+t.t50+' · top 10 '+t.t10);
    const hd=p.dow?t.d+' · '+DOWNAME[p.dow[i]]:t.d;
    return '<rect x="'+(x(i)-w/2)+'" y="'+T+'" width="'+w+'" height="'+ih+
      '" fill="transparent" data-h="<b>'+hd+'</b>'+lbl.replace(/"/g,'&quot;')+'"/>';}).join('');

  return '<div class="chartwrap"><svg viewBox="0 0 '+W+' '+H+'" width="100%" style="min-width:640px">'+
    markBands+gapBands+gridY+
    '<g fill="none" stroke="'+C[ci]+'" stroke-width="2" stroke-linecap="round" opacity=".32">'+seg('t100')+'</g>'+
    '<g fill="none" stroke="'+C[ci]+'" stroke-width="2" stroke-linecap="round" opacity=".62" stroke-dasharray="5 3">'+seg('t50')+'</g>'+
    '<g fill="none" stroke="'+C[ci]+'" stroke-width="2.5" stroke-linecap="round">'+seg('t10')+'</g>'+
    ticks+'<g class="hit">'+hit+'</g></svg></div>'+
    '<div class="legend">'+
      '<span><i style="background:'+C[ci]+'"></i>top 10</span>'+
      '<span><i style="background:'+C[ci]+';opacity:.62"></i>top 50</span>'+
      '<span><i style="background:'+C[ci]+';opacity:.32"></i>ranking at all</span>'+
      '<span><i style="background:var(--ink3);opacity:.35;height:10px;width:10px;border-radius:2px"></i>no / partial crawl</span>'+
      (MARKLBL?'<span style="color:var(--markink)"><i style="background:var(--markfill);height:10px;width:10px;border-radius:2px;outline:1px solid var(--markink)"></i>'+MARKLBL+'</span>':'')+
    '</div>';
}

function table(p){
  const rows=p.rows.filter(r=>r.days>0);
  const cell=r=>{
    const pill=v=> v==null?'<span class="pna">—</span>'
      : '<span class="pill '+(v<=10?'p10':(v<=50?'p50':''))+'">'+v+'</span>';
    return '<tr><td class="kw" title="'+r.kw.replace(/"/g,'&quot;')+'">'+r.kw+'</td>'+
      '<td class="n">'+fmt(r.sv)+'</td>'+
      '<td class="n">'+pill(r.start)+'</td><td class="n">'+pill(r.end)+'</td>'+
      '<td class="n">'+pill(r.best)+'</td>'+
      '<td class="n">'+delta(r.start,r.end)+'</td>'+
      '<td class="n">'+r.days+'/'+p.coverage.withData+'</td></tr>';};
  return '<table><thead><tr><th>Keyword</th><th class="n">Search vol</th>'+
    '<th class="n">First</th><th class="n">Latest</th><th class="n">Best</th>'+
    '<th class="n">Move</th><th class="n">Days seen</th></tr></thead><tbody>'+
    rows.map(cell).join('')+'</tbody></table>';
}

document.getElementById('app').innerHTML = DATA.products.map((p,ci)=>{
  if(!p.first) return '';
  const a=p.first,z=p.last;
  const cov=p.coverage;
  const never=p.rows.filter(r=>r.days===0).length;
  return '<section>'+
    '<h2><span class="dot" style="background:'+C[ci]+'"></span>'+p.name+
      '<span class="asin">'+p.asin+'</span></h2>'+
    '<div class="tiles">'+
      '<div class="tile"><div class="v">'+z.t10+'</div><div class="l">top 10</div>'+
        '<div class="d">'+deltaCount(a.t10,z.t10)+'</div></div>'+
      '<div class="tile"><div class="v">'+z.t50+'</div><div class="l">top 50</div>'+
        '<div class="d">'+deltaCount(a.t50,z.t50)+'</div></div>'+
      '<div class="tile"><div class="v">'+z.t100+'</div><div class="l">ranking at all</div>'+
        '<div class="d">of '+p.kwCount+' tracked</div></div>'+
      '<div class="tile"><div class="v">'+fmt(z.sv10)+'</div><div class="l">search vol in top 10</div>'+
        '<div class="d fl">of '+fmt(p.svTracked)+' tracked</div></div>'+
      '<div class="tile"><div class="v">'+never+'</div><div class="l">never ranked</div>'+
        '<div class="d fl">in this window</div></div>'+
    '</div>'+
    chart(p,ci)+
    '<div class="note" style="margin:16px 0 0;border-left-color:'+C[ci]+'">'+
      '<b>Coverage:</b> '+cov.withData+' of '+cov.days+' days carry a full crawl'+
      (cov.gaps.length?' · '+cov.gaps.length+' day(s) with no crawl':'')+
      (cov.partials.length?' · '+cov.partials.length+' partial':'')+
      '. Measured '+a.d+' → '+z.d+'.</div>'+
    '<details><summary>All '+p.rows.filter(r=>r.days>0).length+' keywords that ranked at least once</summary>'+
      table(p)+'</details>'+
  '</section>';}).join('');

document.querySelectorAll('.hit rect').forEach(r=>{
  r.addEventListener('mousemove',e=>showTip(e,r.dataset.h));
  r.addEventListener('mouseleave',hideTip);
});
</script></body></html>`;

fs.writeFileSync(process.argv[2] + '/dashboard.html', html);
console.log('dashboard.html', fs.statSync(process.argv[2] + '/dashboard.html').size, 'bytes');
