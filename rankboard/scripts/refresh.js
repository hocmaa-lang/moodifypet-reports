// One command for a RECURRING dashboard: re-pull, rebuild, re-seal, publish.
//
//   node refresh.js <config.json> [--push] [--days 30]
//
// This is the unattended path. It never asks anything, never mints a new password,
// and exits non-zero on anything that would ship a wrong or empty page to a client.
//
// What it does, in order:
//   1. pull.js   — fresh history from the Data Dive REST API into spillDir
//   2. run.js --seal — parse, build both views, RENDER-VERIFY them, seal to siteDir
//   3. git commit + push the sealed site (only with --push, and only if it changed)
//
// The client's URL and password are fixed by the config (seal.publish + passEnv),
// so a refresh replaces the contents behind the same link they already have.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const args = process.argv.slice(2);
const cfgPath = args.find(a => !a.startsWith('--') && a.endsWith('.json'));
if (!cfgPath) { console.error('usage: node refresh.js <config.json> [--push] [--days 30]'); process.exit(1); }
const WANT_PUSH = args.includes('--push');
// Publish even when the built pages are unchanged. Needed whenever something that
// is NOT in the plaintext changes — rotating the seal password being the case that
// matters: the pages are byte-identical, so the change-check would restore the old
// sealed files and the new password would never reach the client.
const WANT_FORCE = args.includes('--force');
const di = args.indexOf('--days');
const DAYS = di > -1 ? args[di + 1] : null;

const CFG = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
// Relative config paths resolve against the config file, not the cwd.
const CFGDIR = path.dirname(path.resolve(cfgPath));
const abs = p => path.resolve(CFGDIR, String(p).replace(/\\/g, '/')).replace(/\\/g, '/').replace(/\/$/, '');
const node = process.execPath;
const step = m => console.log('\n• ' + m);
const sh = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

// ------------------------------------------------------------- sanity first ---
// Catch the config mistakes that would otherwise surface as a confusing failure
// three steps later, or worse, as a quietly wrong page.
const problems = [];
if (!CFG.spillDir) problems.push('spillDir is missing');
if (!CFG.out) problems.push('out is missing');
for (const p of CFG.products) {
  if (!p.radarId) problems.push(`product "${p.short || p.key}" has no radarId — pull.js cannot fetch it`);
  if (!p.file) problems.push(`product "${p.short || p.key}" has no file`);
}
const seal = CFG.seal || {};
if (WANT_PUSH && !seal.siteDir) problems.push('--push needs seal.siteDir pointing at a git checkout');
if (WANT_PUSH && seal.siteDir && !fs.existsSync(abs(seal.siteDir)))
  problems.push(`seal.siteDir does not exist: ${abs(seal.siteDir)}`);
if (problems.length) {
  console.error('Config problems:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}

// ------------------------------------------------------------------- 1. pull --
step('Pulling fresh Rank Radar history');
const pullArgs = [path.join(HERE, 'pull.js'), cfgPath];
if (DAYS) pullArgs.push('--days', DAYS);
process.stdout.write(sh(node, pullArgs).toString());
if (CFG.monthly) {
  step('Pulling monthly history');
  process.stdout.write(sh(node, [path.join(HERE, 'pull_monthly.js'), cfgPath]).toString());
}

// ---------------------------------------------------------- 2. build + seal ---
step('Rebuilding and sealing');
process.stdout.write(sh(node, [path.join(HERE, 'run.js'), cfgPath, '--seal']).toString());

// ---------------------------------------------------------------- 3. publish --
if (!WANT_PUSH) {
  console.log('\n• Not pushing (no --push). Sealed files are in ' + seal.siteDir);
  process.exit(0);
}

step('Publishing');
const SITE = abs(seal.siteDir);
const git = a => sh('git', ['-C', SITE, ...a]).toString();

// Sealing uses a fresh random salt+IV every run, so the sealed bytes differ even
// when the data is identical. Diffing the ciphertext would therefore commit every
// single run. Diff the PLAINTEXT PAGES instead.
//
// Not payload.json: that is data only, so a change to the page template or to the
// hub config looked like "no change" and the run helpfully restored the previous
// pages — publishing the old layout over the new one. The built pages are the
// thing being shipped, so they are the thing to compare.
const OUTDIR = abs(CFG.out);
const sources = [...new Set((seal.publish || [{ src: 'dashboard.html' }, { src: 'keywords.html' }])
  .map(i => i.src))];
const stampFile = SITE + '/.rankboard-payload-sha';
const crypto = require('crypto');
const h = crypto.createHash('sha256');
for (const s of sources) h.update(s).update(fs.readFileSync(OUTDIR + '/' + s));
const sha = h.digest('hex');
const prev = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, 'utf8').trim() : '';

if (sha === prev && WANT_FORCE) {
  console.log('  Pages unchanged, but --force was given — publishing anyway.');
  console.log('  (Use this after rotating the password: the plaintext is identical,');
  console.log('   only the seal differs, so the normal check cannot see it.)');
}
if (sha === prev && !WANT_FORCE) {
  // Sealing already rewrote the pages with a new salt+IV even though the data is
  // the same. Throw that away and restore the committed bytes, so whatever a
  // deploy step uploads is exactly what the repo holds — otherwise the site and
  // the repo drift apart every quiet day and neither is obviously wrong.
  const published = (seal.publish || [{ as: 'organic.html' }, { as: 'keywords.html' }])
    .map(i => i.as || i.src);
  try { git(['checkout', '--', ...published]); } catch { /* first run: nothing committed yet */ }
  console.log('  Data is byte-identical to the last publish — nothing to push.');
  console.log('  Restored the committed pages so the site matches the repo.');
  console.log('  (The tracker had no new crawl. This is normal, not an error.)');
  process.exit(0);
}
fs.writeFileSync(stampFile, sha + '\n');

const status = git(['status', '--porcelain']);
if (!status.trim()) {
  console.log('  Nothing changed in the checkout — nothing to push.');
  process.exit(0);
}
git(['add', '-A']);
const built = new Date().toISOString().slice(0, 10);
git(['-c', 'user.email=' + (seal.gitEmail || 'noreply@example.com'),
     '-c', 'user.name=' + (seal.gitName || 'rankboard'),
     'commit', '-q', '-m', `Rankboard refresh ${built}`]);
git(['push', '-q', 'origin', 'HEAD']);
console.log('  Pushed. The client link now serves the refreshed data.');
console.log('  ' + (seal.publicUrl || '(set seal.publicUrl in the config to print it here)'));
