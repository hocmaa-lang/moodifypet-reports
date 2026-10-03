// One command: parse -> build both views -> verify they actually rendered -> optionally seal.
//
//   node run.js <config.json> [--seal] [--open]
//
// Exits non-zero if a page renders empty, so a broken build cannot reach a client.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const args = process.argv.slice(2);
const cfgPath = args.find(a => !a.startsWith('--'));
if (!cfgPath) { console.error('usage: node run.js <config.json> [--seal] [--open]'); process.exit(1); }
const WANT_SEAL = args.includes('--seal');
const WANT_OPEN = args.includes('--open');

const CFG = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
// Resolve config paths against the CONFIG's own directory, so a config may use
// relative paths and still work from any cwd. This is not cosmetic: a relative
// `out` produced "file://./..." below, which Chrome resolves to nothing and
// renders as a blank page — the render check then fails on a perfectly good build.
const CFGDIR = path.dirname(path.resolve(cfgPath));
const abs = p => path.resolve(CFGDIR, String(p).replace(/\\/g, '/')).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = abs(CFG.out);
const node = process.execPath;
const run = (script, ...rest) =>
  execFileSync(node, [path.join(HERE, script), ...rest], { encoding: 'utf8' });

const step = m => console.log('\n\u2022 ' + m);

// ---------------------------------------------------------------- 1. parse ----
step('Parsing Rank Radar spills');
process.stdout.write(run('build.js', cfgPath));

// ---------------------------------------------------------------- 2. pages ----
step('Building pages');
process.stdout.write(run('page_summary.js', OUT));
process.stdout.write(run('page_keywords.js', OUT));
// Monthly progress needs pull_monthly.js to have run; it only builds when asked for.
if (CFG.monthly) process.stdout.write(run('page_monthly.js', path.resolve(cfgPath)));
// The hub embeds the pages above, so it must be composed after them.
if (CFG.hub) process.stdout.write(run('page_hub.js', OUT, path.resolve(cfgPath)));

// -------------------------------------------------- 3. verify they rendered ---
// The whole point: a page can be syntactically fine and still render blank because
// its script threw. Render it for real and assert the content the script produces.
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(p => fs.existsSync(p));

// Needles must match the DOM as written, not as displayed — these labels are
// upper-cased by CSS, so searching for the uppercase form always fails.
const CHECKS = {
  'keywords.html': 'keywords ranking at least once',
  'dashboard.html': 'search vol in top 10',
};
// data-ready is set on <body> by the page's own script as its last act, so it only
// appears in the dumped DOM when every table and the chart rendered without throwing.
if (CFG.monthly) CHECKS['monthly.html'] = 'monthly ready';
// The hub's tab bar is built by script; "hub ready" only appears if that ran.
if (CFG.hub) CHECKS['hub.html'] = 'hub ready';

if (!CHROME) {
  console.log('\n\u26a0  Chrome not found — SKIPPED the render check. Open both files and look before sending.');
} else {
  step('Verifying the pages actually render');
  for (const [file, needle] of Object.entries(CHECKS)) {
    // --no-sandbox is required on CI runners and harmless locally.
    // pathToFileURL, not string concatenation: "file:///" + an absolute POSIX path
    // yields file:////home/... on Linux, which is not the same file.
    const fileUrl = require('url').pathToFileURL(OUT + '/' + file).href;
    const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=5000',
      '--user-data-dir=' + OUT + '/.chrome-verify', '--dump-dom', fileUrl],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    // --dump-dom serialises <script> contents too, so a plain search matches the
    // string literal in the source and passes on a totally broken page. Strip the
    // scripts first: what is left is only what the page actually produced.
    const rendered = dom.replace(/<script[\s\S]*?<\/script>/gi, '');
    const ok = rendered.includes(needle);
    const greet = (dom.match(/Good (morning|afternoon|evening), <b>[^<]*<\/b>/) || ['—'])[0];
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${file}  (${greet})`);
    if (!ok) {
      console.error(`\nFAILED: ${file} rendered without its content. Its script did not run —` +
        `\nopen it in a browser and read the console before shipping anything.`);
      process.exit(2);
    }
  }
}

// ----------------------------------------------------------------- 4. seal ----
if (WANT_SEAL) {
  step('Sealing');
  const W = ['sorrel','harrow','umber','bracken','marram','teasel','vetch','cedar','flint','quartz',
             'thistle','pebble','cinder','lichen','bramble','juniper','alder','rowan','gorse','sedge'];
  const pick = () => Array.from({length:4}, () => W[Math.floor(Math.random()*W.length)]).join('-')
    + '-' + (10 + Math.floor(Math.random()*90));
  const seal = CFG.seal || {};
  const user = seal.user || CFG.brand;
  const creds = {};
  // Which pages ship, and under what name on the site. Default is both views.
  // A recurring client link usually publishes ONE page as index.html.
  const publish = seal.publish ||
    [{ src: 'dashboard.html', as: 'organic.html' }, { src: 'keywords.html', as: 'keywords.html' }];
  for (const item of publish) {
    const file = item.src, out = item.as || item.src;
    // A refresh must not mint a new password \u2014 the client already has the old one.
    // passEnv is the CI path (password lives in a secret, never in the repo). A
    // declared passEnv that is empty is a HARD STOP: falling through to a random
    // password would lock the client out of a URL that still resolves.
    let pass, fromEnv = false;
    if (item.passEnv) {
      pass = process.env[item.passEnv];
      if (!pass) {
        console.error(`\nFAILED: seal.publish declares passEnv "${item.passEnv}" for ${out} but that` +
          `\nenvironment variable is empty. Refusing to seal with a fresh random password \u2014` +
          `\nthat would change the client's password while the link kept working.`);
        process.exit(3);
      }
      fromEnv = true;
    } else {
      pass = (seal.passwords && seal.passwords[file]) || pick();
    }
    // Never echo a secret-sourced password: these logs are public in CI.
    creds[out] = fromEnv ? `(from $${item.passEnv} \u2014 unchanged)` : pass;
    const title = item.title || (CFG.brandTitle || CFG.brand) + (file === 'keywords.html'
      ? ' \u2014 keyword rank by day' : ' \u2014 organic rank');
    // Without a siteDir the sealed copy would overwrite the plain page it was made
    // from — prefix it instead, so the readable original survives for the next edit.
    const dest = seal.siteDir ? abs(seal.siteDir) + '/' + out : OUT + '/sealed_' + out;
    process.stdout.write(run('seal.js', OUT + '/' + file, dest, title, user, pass, CFG.brandTitle || CFG.brand));
  }
  console.log('\n  CREDENTIALS — send the link and the password on separate channels');
  console.log('  username: ' + user);
  for (const [f, p] of Object.entries(creds)) console.log('  ' + f.padEnd(15) + p);
  if (!seal.siteDir) console.log('\n  (no seal.siteDir in config — sealed files were written next to the plain ones)');
}

// ------------------------------------------------------------------ 5. done ---
step('Done');
console.log('  ' + OUT + '/keywords.html   <- lead with this one');
console.log('  ' + OUT + '/dashboard.html');
if (WANT_OPEN && process.platform === 'win32') {
  execFileSync('cmd', ['/c', 'start', '', OUT.replace(/\//g,'\\') + '\\keywords.html'], { stdio: 'ignore' });
}
