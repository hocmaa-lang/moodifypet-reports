// Wrap an HTML document in a password gate whose protection is real:
// the body is AES-256-GCM ciphertext, the key is PBKDF2-SHA256(user:pass, 310k).
// Someone who downloads the page gets ciphertext, not the document.
const fs = require('fs');
const crypto = require('crypto');

const [, , src, out, title, user, pass, brand] = process.argv;
const ITER = 310000;                       // OWASP 2023 guidance for PBKDF2-SHA256

const plain = Buffer.from(fs.readFileSync(src, 'utf8'), 'utf8');
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(user + ':' + pass, salt, ITER, 32, 'sha256');
const c = crypto.createCipheriv('aes-256-gcm', key, iv);
const body = Buffer.concat([c.update(plain), c.final()]);
const tag = c.getAuthTag();
const b64 = Buffer.concat([body, tag]).toString('base64');

const page = `<!doctype html>
<html lang="en" translate="no" class="notranslate"><head><meta charset="utf-8"><meta name="google" content="notranslate">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="robots" content="noindex,nofollow">
<style>
:root{--paper:#F7F9F6;--panel:#EDF1EB;--ink:#16211A;--muted:#66756A;--rule:#D3DCCE;--s1:#4E8C3E;--crit:#A33B22;
 --mono:ui-monospace,"Cascadia Mono",Consolas,monospace;
 --sans:ui-sans-serif,"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
@media(prefers-color-scheme:dark){:root{--paper:#141A16;--panel:#1D251F;--ink:#E6ECE4;--muted:#8B9A8D;
 --rule:#2E3930;--s1:#57A247;--crit:#E0714D}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--paper);color:var(--ink);
 font-family:var(--sans);padding:24px}
.gate{width:100%;max-width:380px}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
h1{font-size:26px;line-height:1.15;letter-spacing:-.02em;margin:0 0 8px;font-weight:750}
p.sub{color:var(--muted);font-size:14px;margin:0 0 26px;line-height:1.5}
label{display:block;font-family:var(--mono);font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;
 color:var(--muted);margin:0 0 6px}
input{width:100%;padding:11px 13px;font-size:15px;font-family:var(--sans);color:var(--ink);
 background:var(--panel);border:1px solid var(--rule);margin-bottom:16px}
input:focus{outline:2px solid var(--s1);outline-offset:1px}
button{width:100%;padding:12px;font-size:15px;font-weight:650;font-family:var(--sans);cursor:pointer;
 background:var(--ink);color:var(--paper);border:none}
button:disabled{opacity:.55;cursor:progress}
.err{color:var(--crit);font-size:13.5px;min-height:20px;margin-top:12px;font-family:var(--mono)}
</style></head><body>
<div class="gate" id="gate">
  <p class="eyebrow">${(brand||"Client").toUpperCase()} &middot; confidential</p>
  <h1>${title}</h1>
  <p class="sub">This document contains confidential client data. Enter the credentials you were sent.</p>
  <form id="f">
    <label for="u">Username</label><input id="u" autocomplete="username" autocapitalize="off" spellcheck="false" required>
    <label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required>
    <button id="b" type="submit">Open document</button>
  </form>
  <div class="err" id="e" role="status" aria-live="polite"></div>
</div>
<script>
const SALT="${salt.toString('base64')}",IV="${iv.toString('base64')}",
      DATA="${b64}",ITER=${ITER};
const b2a=b=>Uint8Array.from(atob(b),c=>c.charCodeAt(0));
document.getElementById('f').addEventListener('submit',async ev=>{
  ev.preventDefault();
  const btn=document.getElementById('b'),err=document.getElementById('e');
  btn.disabled=true;err.textContent='Decrypting…';
  try{
    const pw=document.getElementById('u').value.trim()+':'+document.getElementById('p').value;
    const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey(
      {name:'PBKDF2',salt:b2a(SALT),iterations:ITER,hash:'SHA-256'},
      base,{name:'AES-GCM',length:256},false,['decrypt']);
    const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:b2a(IV)},key,b2a(DATA));
    const html=new TextDecoder().decode(clear);
    // Hand the decrypted document to a full-page iframe via srcdoc. It gets a
    // clean parse, runs its own <script>, and nothing leaves the browser.
    //
    // This used to be location.replace() onto a blob: URL. Current Chrome no
    // longer performs that top-level navigation, and it fails SILENTLY: the
    // decrypt succeeds, the navigation is dropped, and the gate sits on
    // "Decrypting…" for ever with no error. srcdoc needs no navigation at all,
    // and avoids the same class of blob restriction on Safari/iOS.
    document.body.innerHTML='';
    document.body.style.cssText='margin:0;padding:0;overflow:hidden;display:block';
    const f=document.createElement('iframe');
    f.setAttribute('title',document.title);
    f.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0';
    f.srcdoc=html;
    document.body.appendChild(f);
  }catch(_){
    err.textContent='Wrong username or password.';
    btn.disabled=false;
  }
});
</script></body></html>`;

fs.writeFileSync(out, page);
console.log(out + '  sealed  (' + (plain.length / 1024).toFixed(0) + 'KB plaintext -> ' + (page.length / 1024).toFixed(0) + 'KB page)');
