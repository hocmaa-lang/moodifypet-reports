// Organic dashboard, keyword view — keyword-level. One row per keyword, one cell
// per day, colour = rank band. Sequential single hue (light -> dark = worse -> better),
// with reserved neutrals for "not ranking" and "no crawl" so the two never blur.
const fs = require('fs');
// Shown on the page so a reader's screenshot says which template they are looking at
// (a cached older copy vs. the current one). Bump it whenever the template changes;
// it is deliberately NOT a timestamp, which would make every refresh look "changed".
const TEMPLATE_VERSION = 'v2026-10-03a';
const P = JSON.parse(fs.readFileSync(process.argv[2] + '/payload.json', 'utf8'));

// attach the per-day gap flags onto each product so the client can grey those columns
for (const p of P.products) p.flags = p.trend.map(t => t.gap ? 2 : (t.partial ? 1 : 0));

// Marked days (e.g. Fri/Sat/Sun) are drawn as a column band BEHIND the cells rather
// than as a change to any cell's own colour — the cell colour is the rank and must
// keep meaning exactly one thing.
const MARK = P.markDays || [];
const MARKLBL = P.markLabel || (MARK.length ? 'marked days' : '');

const html = `<!doctype html><html lang="en" translate="no" class="notranslate"><head><meta charset="utf-8"><meta name="google" content="notranslate">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${P.brandTitle} — keyword rank by day</title>
<style>
:root{
  --bg:#F6F7F9;--surface:#FFFFFF;--line:#E1E4E9;--grid:#EDEFF3;
  --ink:#171A1E;--ink2:#4A5158;--ink3:#7C858E;
  /* Ordinal rank ramp — five DISTINCT hues, not one hue in five tints.
     A single-hue ramp failed the dataviz validator here (adjacent bands ΔE 9.6,
     floor is 15) and clients could not read it. Hues run blue -> cyan -> magenta
     -> orange -> red: ordered, and deliberately green-free, because green and
     orange are indistinguishable under deuteranopia (ΔE 1.7 when tested).
     Validated light on #FFFFFF: all five checks PASS. Re-run
     dataviz/scripts/validate_palette.js before touching any of these. */
  --r1:#1D4ED8;--r2:#06B6D4;--r3:#C026D3;--r4:#F97316;--r5:#B91C1C;
  --none:#EDEFF3;--gap:#CDD2D9;
  --good:#1F7A4C;--bad:#B0402C;
  --mark:rgba(194,98,10,.17);--markink:#9A5308;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0F1114;--surface:#16191D;--line:#282D34;--grid:#1C2026;
  --ink:#EAEDF1;--ink2:#A7AFB8;--ink3:#767E87;
  /* Dark steps are SELECTED, not a flip of the light ramp: the validator's dark
     lightness band is L 0.48-0.67, so the bright pastels you would reach for all
     fail it. Same five hues, retuned into that band against surface #16191D. */
  --r1:#2563EB;--r2:#0891B2;--r3:#C026D3;--r4:#F0761A;--r5:#B02525;
  --none:#191D22;--gap:#343A42;
  --good:#4CBF87;--bad:#E0785F;
  --mark:rgba(217,118,47,.20);--markink:#E09355;
}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);
  font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:28px 18px 60px}
.wrap{max-width:1240px;margin:0 auto}
h1{font-size:25px;letter-spacing:-.02em}
.sub{color:var(--ink2);font-size:13.5px;margin-top:3px}
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:20px 0 14px}
button,select,input{font:inherit;font-size:13.5px;color:var(--ink);background:var(--surface);
  border:1px solid var(--line);border-radius:7px;padding:7px 13px;cursor:pointer}
button.on{background:var(--ink);color:var(--surface);border-color:var(--ink)}
input{cursor:text;min-width:190px}
.spacer{flex:1}
.asinbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:18px 0 0;padding:10px 12px;
  background:var(--surface);border:1px solid var(--line);border-radius:9px;max-width:560px}
.asinbar label{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2)}
.asinbar input{flex:1 1 200px;min-width:0;font-size:15px;text-transform:uppercase;letter-spacing:.04em;
  font-variant-numeric:tabular-nums;border-width:2px}
.asinbar input:focus{outline:none;border-color:var(--r1)}
.asinbar button{padding:6px 10px}
.count{color:var(--ink3);font-size:12.5px}
.key{display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--ink2);
  margin:0 0 14px}
.key span{display:flex;align-items:center;gap:5px}
.key i{width:16px;height:12px;border-radius:2px;display:block;border:1px solid var(--grid)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:11px;overflow:hidden}
.scroll{overflow-x:auto}
table{border-collapse:separate;border-spacing:0;width:100%;font-size:13px}
th{position:sticky;top:0;background:var(--surface);z-index:2;text-align:left;color:var(--ink3);
  font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;padding:9px 8px;
  border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:0 8px;border-bottom:1px solid var(--grid);height:30px;white-space:nowrap}
tr:hover td{background:color-mix(in srgb,var(--ink) 4%,transparent)}
.kw{max-width:270px;overflow:hidden;text-overflow:ellipsis;font-weight:500}
.pr{font-size:10.5px;color:var(--ink3);text-transform:uppercase;letter-spacing:.05em}
td.n{text-align:right;font-variant-numeric:tabular-nums}
.strip{padding:0!important}
/* Explicit full-row height so the marked-day band spans the row and forms one
   continuous column stripe through the table, visible above and below each cell. */
.strip div{display:flex;gap:1px;padding:0 8px;height:30px;align-items:center;
  background-repeat:no-repeat}
.c{width:11px;height:17px;border-radius:2px;flex:0 0 auto;
  box-shadow:inset 0 0 0 1px rgba(128,128,128,.18)}
.up{color:var(--good);font-weight:600}.dn{color:var(--bad);font-weight:600}.fl{color:var(--ink3)}
.badge{display:inline-block;min-width:26px;text-align:center;padding:1px 6px;border-radius:20px;
  font-size:11.5px;font-weight:600;color:#fff}
.tt{position:fixed;pointer-events:none;opacity:0;transition:opacity .08s;background:var(--surface);
  border:1px solid var(--line);border-radius:7px;padding:7px 10px;font-size:12.5px;
  box-shadow:0 6px 20px rgba(0,0,0,.18);z-index:9;white-space:nowrap}
.tt b{display:block}
.note{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--ink3);
  border-radius:8px;padding:11px 15px;margin:16px 0 0;font-size:13px;color:var(--ink2)}
.note b{color:var(--ink)}
.greet{font-size:13px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--ink3);font-weight:600;margin-bottom:6px}
.greet b{color:var(--ink);font-weight:600}
.dates{display:flex;gap:1px;padding:6px 8px 2px;font-size:9.5px;color:var(--ink3)}
.dates span{width:11px;flex:0 0 auto;text-align:center;overflow:visible}
.dows{display:flex;gap:1px;padding:2px 8px 0;font-size:9px;color:var(--ink3);
  background-repeat:no-repeat;letter-spacing:0}
.dows span{width:11px;flex:0 0 auto;text-align:center;font-weight:600}
.dows span.m{color:var(--markink);font-weight:800}
</style></head><body><div class="wrap">
<div class="note" id="diag" translate="no" style="display:none;margin:0 0 14px;border-left-color:var(--bad)"></div>
<div class="greet" id="greet"></div>
<h1>${P.brandTitle} — keyword rank, day by day</h1>
<div class="sub">${P.marketplace} · ${P.dates[0]} → ${P.built} · Data Dive Rank Radar · one cell = one day
  <span style="color:var(--ink3);font-size:11px"> · page ${TEMPLATE_VERSION}</span></div>

<div class="asinbar">
  <label for="asin">Search by ASIN</label>
  <input id="asin" list="asins" placeholder="e.g. ${(P.products[0]&&P.products[0].asin)||"B0XXXXXXXX"}" autocomplete="off" spellcheck="false">
  <datalist id="asins"></datalist>
  <button type="button" id="asinclr" title="Clear">✕</button>
</div>
<div class="bar">
  <button data-p="all" class="on">All products</button>
  ${P.products.map(p => `<button data-p="${p.key}">${p.short}</button>`).join('')}
  <input id="q" placeholder="filter keywords…">
  <select id="scope" title="Which keywords to list">
    <option value="ranked"${P.showAll?'':' selected'}>Ranking keywords only</option>
    <option value="all"${P.showAll?' selected':''}>All tracked keywords</option>
  </select>
  <select id="sort">
    <option value="sv">Sort: search volume</option>
    <option value="best">Sort: best rank</option>
    <option value="now">Sort: latest rank</option>
    <option value="move">Sort: biggest move</option>
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
  <span><i style="background:var(--gap);background-image:repeating-linear-gradient(45deg,transparent,transparent 2px,rgba(128,128,128,.5) 2px,rgba(128,128,128,.5) 3px)"></i>no crawl</span>
  ${MARK.length ? `<span style="color:var(--markink);font-weight:600"><i style="background:var(--mark);border-color:var(--markink)"></i>${MARKLBL}</span>` : ''}
</div>

<div class="note" id="asinnote" style="display:none;margin:0 0 12px"></div>

<div class="card"><div class="scroll"><table>
  <thead><tr>
    <th>Keyword</th><th class="n">Vol</th><th id="ruler">Rank each day →</th>
    <th class="n">First</th><th class="n">Now</th><th class="n">Best</th><th class="n">Move</th>
  </tr></thead><tbody id="rows"></tbody></table></div></div>

<div class="note"><b>Hatched cells are days the tracker did not run</b> — every keyword
returned 101 that day, which is the signature of a crawl that never fired, not of a
product leaving Amazon. They are drawn differently from a plain "not ranking" cell on
purpose. <b>First</b> and <b>Now</b> are the first and last days that actually carry data,
so a gap at either edge never fakes a move.${MARK.length ? `
<b>The tinted columns are ${MARKLBL}</b> — the letter row above the grid names every day
(S M T W T F S). The tint sits <i>behind</i> the cells and never changes a cell's colour,
so a cell still reads as nothing but its rank.` : ''}</div>
</div>
<div class="tt" id="tt"></div>
<script>
var BRAND=${JSON.stringify(P.teamName || P.brandTitle)};
(function(){var h=new Date().getHours();
  var g=h<12?'Good morning':(h<18?'Good afternoon':'Good evening');
  var el=document.getElementById('greet');
  if(el) el.innerHTML=g+', <b>'+BRAND+' team</b>';})();
const DATA=${JSON.stringify(P)};
const DOWNAME=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DOWLTR=['S','M','T','W','T','F','S'];
// One cell occupies 11px + a 1px flex gap = a 12px pitch, after 8px of left padding.
// Painting the marked days as hard-stop bands on the row's own background puts the
// stripe BEHIND the cells: it shows through the gaps and the 6.5px above and below
// each 17px cell, so it reads as one continuous column without touching cell colour.
const CELL=11, PITCH=12, PAD=8;
function markCSS(marks){
  if(!marks) return 'none';
  const s=[];
  marks.forEach((m,i)=>{ if(!m) return;
    const a=PAD+i*PITCH, b=a+CELL;
    s.push('transparent '+a+'px','var(--mark) '+a+'px','var(--mark) '+b+'px','transparent '+b+'px');});
  return s.length?'linear-gradient(to right,'+s.join(',')+')':'none';
}
const band=r=>r==null?'var(--none)':r<=3?'var(--r1)':r<=10?'var(--r2)':r<=20?'var(--r3)':r<=50?'var(--r4)':'var(--r5)';
const badge=r=>r==null?'<span class="fl">—</span>'
  :'<span class="badge" style="background:'+band(r)+';color:'+(r<=20?'#fff':'var(--ink)')+'">'+r+'</span>';
const tt=document.getElementById('tt');
const show=(e,h)=>{tt.innerHTML=h;tt.style.opacity=1;const r=tt.getBoundingClientRect();
  tt.style.left=Math.min(e.clientX+13,innerWidth-r.width-8)+'px';
  tt.style.top=Math.max(e.clientY-r.height-11,6)+'px';};
const hide=()=>tt.style.opacity=0;

// flatten every keyword of every product into one list
const ALL=[];
DATA.products.forEach(p=>p.rows.forEach(r=>ALL.push({...r,pk:p.key,pn:p.short,
  dates:p.dates,flags:p.flags,dow:p.dow,mark:p.mark,markCSS:markCSS(p.mark),
  cov:p.coverage.withData})));

// ASIN search. A radar tracks one variation FAMILY, so a sibling ASIN named in the
// product's name ("family also covers …") resolves to that radar — and the page says
// so, rather than implying the sibling has a radar of its own.
const ASINRE=/B0[A-Z0-9]{8}/g;
const ASINMAP={};   // asin -> {pk, via}  (via = the radar's own ASIN when reached through the family)
DATA.products.forEach(p=>{
  if(p.asin) ASINMAP[p.asin]={pk:p.key,via:null,pn:p.short};
  (p.name.match(ASINRE)||[]).forEach(a=>{ if(!ASINMAP[a]) ASINMAP[a]={pk:p.key,via:p.asin,pn:p.short}; });
});
document.getElementById('asins').innerHTML=Object.entries(ASINMAP)
  .map(([a,v])=>'<option value="'+a+'">'+v.pn+(v.via?' (family of '+v.via+')':'')+'</option>').join('');
const PASIN=Object.fromEntries(DATA.products.map(p=>[p.key,p.asin||'']));

let filt='all',sort='sv',q='',aq='',LAST=0,scope=document.getElementById('scope').value;
function asinMatch(pk){
  if(!aq) return true;
  return Object.entries(ASINMAP).some(([a,v])=>v.pk===pk&&a.includes(aq));
}
function asinNote(){
  const el=document.getElementById('asinnote');
  if(!aq){el.style.display='none';return;}
  const hits=Object.entries(ASINMAP).filter(([a])=>a.includes(aq));
  el.style.display='block';
  if(!hits.length){el.innerHTML='<b>'+aq+'</b> is not tracked in this dashboard — no Rank Radar covers it.';return;}
  if(hits.length===1&&hits[0][0]===aq){const v=hits[0][1];
    el.innerHTML=v.via?'<b>'+aq+'</b> is tracked through <b>'+v.via+'</b> ('+v.pn+') — same variation family, so Amazon ranks them together and these rows are its ranks too.'
      :'<b>'+aq+'</b> — '+v.pn+'.';return;}
  el.innerHTML='Matching ASINs: '+hits.map(([a,v])=>'<b>'+a+'</b> ('+v.pn+(v.via?', via '+v.via:'')+')').join(' · ');
}
function render(){
  asinNote();
  let list=ALL.filter(r=>(filt==='all'||r.pk===filt)&&(scope==='all'||r.days>0)&&asinMatch(r.pk)
    &&(!q||r.kw.toLowerCase().includes(q)));
  const key={sv:r=>-r.sv,best:r=>r.best==null?999:r.best,now:r=>r.end==null?999:r.end,
             move:r=>r.delta==null?999:r.delta};
  list.sort((a,b)=>key[sort](a)-key[sort](b));
  if(aq&&!list.length&&Object.keys(ASINMAP).some(a=>a.includes(aq)))
    document.getElementById('asinnote').innerHTML+=' <b>No keyword has ranked for it in this window yet</b>'+
      ' — a newly created radar fills in after its first crawls.';
  LAST=list.length;
  const nr=list.filter(r=>r.days>0).length;
  document.getElementById('cnt').textContent=scope==='all'?list.length+' keywords tracked · '+nr+' ranking at least once':list.length+' keywords ranking at least once';
  document.getElementById('rows').innerHTML=list.map(r=>{
    const cells=r.series.map((v,i)=>{
      const f=r.flags[i];
      const st=f===2
        ? 'background:var(--gap);background-image:repeating-linear-gradient(45deg,transparent,transparent 2px,rgba(128,128,128,.5) 2px,rgba(128,128,128,.5) 3px)'
        : 'background:'+band(v)+(f===1?';opacity:.55':'');
      const lbl=f===2?'no crawl':(v==null?'not ranking':'rank '+v+(f===1?' · partial crawl':''));
      const dn=r.dow?DOWNAME[r.dow[i]]:'';
      const hd=dn?r.dates[i]+' · '+dn:r.dates[i];
      return '<i class="c" style="'+st+'" data-h="<b>'+hd+'</b>'+lbl+'"></i>';}).join('');
    const mv=r.delta==null?'<span class="fl">—</span>'
      :r.delta===0?'<span class="fl">0</span>'
      :r.delta<0?'<span class="up">▲ '+(-r.delta)+'</span>':'<span class="dn">▼ '+r.delta+'</span>';
    return '<tr><td class="kw" title="'+r.kw.replace(/"/g,'&quot;')+'">'+r.kw+
      (filt==='all'||aq?'<div class="pr">'+r.pn+(PASIN[r.pk]?' · '+PASIN[r.pk]:'')+'</div>':'')+'</td>'+
      '<td class="n">'+r.sv.toLocaleString()+'</td>'+
      '<td class="strip"><div style="background-image:'+r.markCSS+'">'+cells+'</div></td>'+
      '<td class="n">'+badge(r.start)+'</td><td class="n">'+badge(r.end)+'</td>'+
      '<td class="n">'+badge(r.best)+'</td><td class="n">'+mv+'</td></tr>';}).join('');
  // An empty product must say WHY it is empty. A brand-new radar has no crawl at all
  // yet, which is not the same thing as a product that ranks nowhere — and a bare
  // empty table read to the client as "something is wrong with these ASINs".
  if(!list.length&&filt!=='all'&&!q){
    const p=DATA.products.find(x=>x.key===filt);
    // coverage.days===0: the radar returned no measurements at all (new, never crawled).
    // days>0 but withData===0: crawled every day and EVERY keyword came back "not found" —
    // build.js files those as gaps, but a whole window of them means the listing is not
    // showing in search at all (suppressed, inactive, out of stock), not a missed crawl.
    const id=p?(p.short+(p.asin?' ('+p.asin+')':'')):'';
    const msg=!p?'':p.coverage.days===0
      ?'<b>No crawl yet for '+id+'.</b> This Rank Radar is new — Data Dive has not measured it yet, '+
        'not even as "not ranking". Rows appear here after its first crawl, usually within 24–48 hours of creation.'
      :p.coverage.withData===0
      ?'<b>'+id+' was not found in the top 100 for ANY tracked keyword on ANY of '+p.coverage.days+' days.</b> '+
        'The tracker ran, but the listing never appeared in search. That pattern usually means the listing is inactive, '+
        'suppressed or out of stock — check it in Seller Central.'
      :'<b>'+id+' did not rank in the top 100 for any tracked keyword in this window</b> ('+p.coverage.withData+' crawled days).';
    if(msg) document.getElementById('rows').innerHTML='<tr><td colspan="7" style="white-space:normal;padding:18px 14px;color:var(--ink2);height:auto">'+msg+'</td></tr>';
  }
}
document.querySelectorAll('.bar button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.bar button').forEach(x=>x.classList.remove('on'));
  // Product and ASIN are two ways to pick the same thing, so choosing one clears the
  // other. Stacked, "ASIN of product A" + "product B" matched nothing and the table
  // went blank — which reads as a frozen page, not as an empty filter.
  document.getElementById('asin').value='';aq='';
  b.classList.add('on');filt=b.dataset.p;render();}));
document.getElementById('sort').addEventListener('change',e=>{sort=e.target.value;render();});
document.getElementById('scope').addEventListener('change',e=>{scope=e.target.value;render();});
document.getElementById('q').addEventListener('input',e=>{q=e.target.value.toLowerCase();render();});
// ONE delegated listener for the tooltip. This used to bind mousemove + mouseleave on
// every cell and re-bind all of them on every filter click — ~25,000 listeners for
// 400 keywords x 30 days, rebuilt per click. A client reported the view "stuck" and
// unclickable; the per-cell binding is the part that scales with the data.
(function(){const rows=document.getElementById('rows');
  rows.addEventListener('mousemove',e=>{const c=e.target.closest&&e.target.closest('.c');if(c)show(e,c.dataset.h);else hide();});
  rows.addEventListener('mouseleave',hide);})();
document.getElementById('asin').addEventListener('input',e=>{aq=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(aq&&filt!=='all'){filt='all';document.querySelectorAll('.bar button').forEach(x=>x.classList.toggle('on',x.dataset.p==='all'));}
  render();});
document.getElementById('asinclr').addEventListener('click',()=>{const i=document.getElementById('asin');i.value='';aq='';render();i.focus();});

// date ruler in the strip header, aligned cell-for-cell with the rows below.
// The weekday letter row is what actually names the marked days — the band alone
// tells you a column is special but not which day it is.
function ruler(){
  const p0=DATA.products[0], d=p0.dates, dow=p0.dow, mk=p0.mark;
  const dows=dow?'<div class="dows" style="background-image:'+markCSS(mk)+'">'+
    dow.map((w,i)=>'<span class="'+(mk&&mk[i]?'m':'')+'">'+DOWLTR[w]+'</span>').join('')+'</div>':'';
  document.getElementById('ruler').innerHTML='Rank each day \\u2192'+dows+'<div class="dates">'+
    d.map((x,i)=>'<span>'+((i%5===0||i===d.length-1)?x.slice(5):'')+'</span>').join('')+'</div>';
}
function greet(){var h=new Date().getHours();
  var g=h<12?'Good morning':(h<18?'Good afternoon':'Good evening');
  var el=document.getElementById('greet');if(el) el.innerHTML=g+', <b>'+BRAND+' team</b>';}
ruler();render();

// Self-repair. A client saw the table, scrolled, and watched every row, the greeting
// and the date ruler vanish while the static text stayed (with its quotes rewritten).
// That is something outside the page — browser auto-translate being the usual suspect —
// rewriting the DOM after load. The page is marked translate="no", but if anything
// still wipes what the script built, rebuild it rather than leave a blank table.
// Compare against what render() actually DREW (LAST), never against the counter text:
// a translator may rewrite that text instead of deleting it, and then a text-based
// check sees "something there" and never repairs.
let WIPES=0;
(function(){
  let t=null;
  const check=()=>{t=null;
    const rows=document.getElementById('rows');
    if(!rows) return;
    const have=rows.querySelectorAll('tr').length;
    if((LAST>0&&have<LAST)||!document.querySelector('#ruler .dates')){
      WIPES++;ruler();render();greet();diag();
    } else if(!document.getElementById('greet').textContent) greet();
  };
  new MutationObserver(()=>{ if(!t) t=setTimeout(check,250); })
    .observe(document.body,{childList:true,subtree:true,characterData:true});
  setInterval(()=>{check();diag();},2000);
})();

// Diagnostic banner. The "rows vanish on scroll" report could not be reproduced in a
// clean Chrome, and nothing in this page listens to scroll — so the cause is outside
// it. Name the cause on screen instead of guessing: translators leave fingerprints
// (Google: html.translated-ltr/rtl and a rewritten lang; Microsoft/Edge: _msttexthash
// attributes; both: <font> wrappers), and WIPES counts outside deletions of the table.
function translated(){
  const h=document.documentElement;
  if(/translated-(ltr|rtl)/.test(h.className)) return 'Google Translate';
  if(h.lang&&!/^en/i.test(h.lang)) return 'page translation (language set to '+h.lang+')';
  if(document.querySelector('[_msttexthash],[_msthash]')) return 'Microsoft Edge Translator';
  if(document.querySelector('font[style*="vertical-align"]')) return 'a page translator';
  return null;
}
function diag(){
  const el=document.getElementById('diag');if(!el) return;
  const tr=translated();
  if(!tr&&!WIPES){el.style.display='none';return;}
  el.style.display='block';
  el.innerHTML='<b>⚠ '+(tr?'Your browser is translating this page ('+tr+').':'Something outside this page cleared the table '+WIPES+'×.')+'</b> '+
    (tr?'That is what makes the data disappear. Click the translate icon in the address bar and choose '+
      '<b>"Show original"</b> / <b>"Never translate this site"</b>, then reload. ':
      'It was rebuilt automatically. If it keeps happening, disable browser extensions for this site (translation, reader or ad-block) and reload. ')+
    '<span dir="rtl" lang="he" style="display:block;margin-top:4px">'+(tr
      ?'הדפדפן מתרגם את הדף — זה מה שמעלים את הנתונים. לחץ על אייקון התרגום בשורת הכתובת ובחר "הצג מקור" / "אף פעם אל תתרגם את האתר הזה", ורענן.'
      :'משהו מחוץ לדף מחק את הטבלה ('+WIPES+' פעמים) והיא נבנתה מחדש. אם זה חוזר — כבה תוספים לאתר הזה (תרגום, קריאה, חוסם פרסומות) ורענן.')+'</span>';
}
diag();
</script></body></html>`;
fs.writeFileSync(process.argv[2] + '/keywords.html', html);
console.log('keywords.html', fs.statSync(process.argv[2] + '/keywords.html').size, 'bytes');
