// Compose a HUB page: one screen, a tab per dashboard.
//
//   node page_hub.js <out-dir> <config.json>
//
// Two kinds of tab, declared in the config's `hub.tabs`:
//   { "inline": "keywords.html" }  a page built in <out-dir>, embedded IN this file
//   { "url": "https://…" }         a live page, embedded in an iframe
//
// Why "inline" exists: the hub gets sealed behind a password, and a sealed page
// embedding another sealed page would ask the client for TWO passwords. Carrying
// the inner document inside the bundle means one password opens everything.
//
// The inner document is base64'd, not pasted in as markup — it is a complete HTML
// file with its own <script> tags, and nesting those raw ends the outer document
// at the first </script>.
const fs = require('fs');
const path = require('path');

const OUT = (process.argv[2] || '').replace(/\\/g, '/').replace(/\/$/, '');
const cfgPath = process.argv[3];
if (!OUT || !cfgPath) { console.error('usage: node page_hub.js <out-dir> <config.json>'); process.exit(1); }
const CFG = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const HUB = CFG.hub;
if (!HUB || !Array.isArray(HUB.tabs) || !HUB.tabs.length) {
  console.error('config has no hub.tabs — nothing to compose'); process.exit(1);
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const tabs = HUB.tabs.map((t, i) => {
  const o = { id: 't' + i, label: t.label || ('View ' + (i + 1)), sub: t.sub || '', note: t.note || '' };
  if (t.inline) {
    const p = OUT + '/' + t.inline;
    if (!fs.existsSync(p)) throw new Error('hub tab "' + o.label + '" wants ' + p + ' but it is not built');
    o.kind = 'inline';
    o.b64 = fs.readFileSync(p).toString('base64');
    o.bytes = fs.statSync(p).size;
    o.open = null;
  } else if (t.url) {
    o.kind = 'url'; o.url = t.url; o.open = t.url;
  } else throw new Error('hub tab "' + o.label + '" has neither inline nor url');
  return o;
});

const title = HUB.title || ((CFG.brandTitle || CFG.brand) + ' — dashboards');
const team = CFG.teamName || CFG.brandTitle || CFG.brand;

const page = `<!doctype html>
<html lang="en" translate="no" class="notranslate"><head><meta charset="utf-8"><meta name="google" content="notranslate">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="robots" content="noindex,nofollow">
<style>
:root{--paper:#F7F9F6;--panel:#EDF1EB;--chip:#FFFFFF;--ink:#16211A;--ink2:#3A493E;--muted:#66756A;
 --rule:#D3DCCE;--s1:#4E8C3E;--shadow:0 1px 2px rgba(22,33,26,.07),0 4px 12px rgba(22,33,26,.05);
 --mono:ui-monospace,"Cascadia Mono",Consolas,monospace;
 --sans:ui-sans-serif,"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
@media(prefers-color-scheme:dark){:root{--paper:#141A16;--panel:#1D251F;--chip:#252E27;--ink:#E6ECE4;
 --ink2:#BCC7B9;--muted:#8B9A8D;--rule:#2E3930;--s1:#57A247;--shadow:none}}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);
 display:flex;flex-direction:column;overflow:hidden}
header{flex:0 0 auto;padding:14px 20px 0;border-bottom:1px solid var(--rule);background:var(--panel)}
.top{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.eyebrow{font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;
 color:var(--muted);margin:0}
h1{font-size:19px;letter-spacing:-.02em;margin:0;font-weight:750}
.spacer{flex:1 1 auto}
.ext{font-size:12.5px;color:var(--muted);text-decoration:none;border:1px solid var(--rule);
 background:var(--chip);padding:5px 10px;border-radius:6px;white-space:nowrap}
.ext:hover{border-color:var(--s1);color:var(--ink)}
.ext[hidden]{display:none}
/* overflow-x:auto alone makes overflow-y compute to auto too, and the tabs'
   translateY(1px) overflowed by one pixel — so the tab row grew its own vertical
   scrollbar, a second scroll area clients read as the page being stuck. */
nav{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
nav::-webkit-scrollbar{display:none}
@media (max-height:820px){header{padding-top:8px}.top{margin-bottom:6px}h1{font-size:16px}
 button.tab{padding:6px 14px 7px}button.tab .s{display:none}}
button.tab{appearance:none;border:1px solid var(--rule);border-bottom:none;background:var(--panel);
 color:var(--ink2);font-family:var(--sans);cursor:pointer;padding:9px 16px 10px;
 border-radius:8px 8px 0 0;text-align:left;white-space:nowrap;transform:translateY(1px)}
button.tab:hover{color:var(--ink)}
button.tab[aria-selected=true]{background:var(--paper);color:var(--ink);font-weight:650;
 box-shadow:var(--shadow)}
button.tab .l{display:block;font-size:14px}
button.tab .s{display:block;font-size:11.5px;color:var(--muted);margin-top:1px}
button.tab[aria-selected=true] .s{color:var(--ink2)}
main{flex:1 1 auto;position:relative;min-height:0}
iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:var(--paper)}
iframe[hidden]{display:none}
.note{flex:0 0 auto;padding:7px 20px;font-size:12px;color:var(--muted);background:var(--panel);
 border-top:1px solid var(--rule)}
.note b{color:var(--ink2);font-weight:600}
.note{display:flex;gap:10px;align-items:baseline}
.note span{flex:1 1 auto}
.note button{appearance:none;border:0;background:none;color:var(--muted);cursor:pointer;font-size:13px;padding:0 2px}
.note[hidden]{display:none}
</style></head><body>
<header>
  <div class="top">
    <p class="eyebrow">${esc(team)} &middot; ${esc(CFG.marketplace || 'Amazon US')}</p>
    <h1>${esc(title)}</h1>
    <span class="spacer"></span>
    <a class="ext" id="ext" target="_blank" rel="noopener" hidden>Open this view in a new tab &nearr;</a>
  </div>
  <nav id="nav" role="tablist"></nav>
</header>
<main id="main"></main>
<p class="note" id="notebar"><span id="note"></span><button type="button" id="noteclose" title="Hide this note" aria-label="Hide this note">✕</button></p>
<script id="hubdata" type="application/json">${JSON.stringify(tabs.map(t => ({
  id: t.id, label: t.label, sub: t.sub, note: t.note, kind: t.kind, url: t.url || null, b64: t.b64 || null
})))}</script>
<script>
(function(){
  var TABS = JSON.parse(document.getElementById('hubdata').textContent);
  var nav = document.getElementById('nav'), main = document.getElementById('main'),
      ext = document.getElementById('ext'), note = document.getElementById('note');
  var frames = {};

  // An inline tab carries the whole document with it. Decode once, on first view,
  // so opening the hub does not pay for every tab.
  //
  // srcdoc, not a blob URL: the hub itself is already rendered inside a srcdoc
  // frame by the seal loader, and blob URLs are the thing that broke there. Using
  // srcdoc throughout means the whole chain needs no navigation and no blob.
  function fill(f, t){
    if (t.kind === 'url') { f.src = t.url; return; }
    var bin = atob(t.b64), n = bin.length, buf = new Uint8Array(n);
    for (var i = 0; i < n; i++) buf[i] = bin.charCodeAt(i);
    f.srcdoc = new TextDecoder('utf-8').decode(buf);
  }

  function show(id){
    TABS.forEach(function(t){
      var on = t.id === id;
      document.getElementById('btn-' + t.id).setAttribute('aria-selected', on ? 'true' : 'false');
      if (on && !frames[t.id]){
        var f = document.createElement('iframe');
        f.id = 'if-' + t.id;
        f.setAttribute('title', t.label);
        fill(f, t);
        main.appendChild(f);
        frames[t.id] = f;
      }
      if (frames[t.id]) frames[t.id].hidden = !on;
      if (on){
        if (t.kind === 'url'){ ext.href = t.url; ext.hidden = false; }
        else { ext.hidden = true; }
        note.innerHTML = t.note || '';
        // The note costs a row of height on every tab; a reader who has read it once
        // can close it, and it stays closed for this browser (storage may be blocked).
        var closed = false; try { closed = localStorage.getItem('hubNoteClosed') === '1'; } catch(e){}
        document.getElementById('notebar').hidden = closed || !t.note;
      }
    });
    try { history.replaceState(null, '', '#' + id); } catch(e){}
  }

  TABS.forEach(function(t){
    var b = document.createElement('button');
    b.className = 'tab'; b.id = 'btn-' + t.id; b.type = 'button';
    b.setAttribute('role','tab'); b.setAttribute('aria-selected','false');
    b.innerHTML = '<span class="l"></span><span class="s"></span>';
    b.querySelector('.l').textContent = t.label;
    b.querySelector('.s').textContent = t.sub;
    b.addEventListener('click', function(){ show(t.id); });
    nav.appendChild(b);
  });

  document.getElementById('noteclose').addEventListener('click', function(){
    document.getElementById('notebar').hidden = true;
    try { localStorage.setItem('hubNoteClosed', '1'); } catch(e){}
  });

  var want = (location.hash || '').replace('#','');
  show(TABS.some(function(t){ return t.id === want; }) ? want : TABS[0].id);

  // Marker for the automated render check: proves this script ran, which a static
  // search of the markup could not.
  var ok = document.createElement('span');
  ok.id = 'hubready'; ok.textContent = 'hub ready \\u00b7 ' + TABS.length + ' views';
  ok.style.cssText = 'position:absolute;left:-9999px';
  document.body.appendChild(ok);
})();
</script>
</body></html>`;

fs.writeFileSync(OUT + '/hub.html', page);
const kb = Math.round(Buffer.byteLength(page) / 1024);
console.log('hub.html ' + kb + 'KB  (' + tabs.map(t =>
  t.kind === 'inline' ? t.label + ' inlined ' + Math.round(t.bytes / 1024) + 'KB' : t.label + ' framed'
).join(' · ') + ')');
