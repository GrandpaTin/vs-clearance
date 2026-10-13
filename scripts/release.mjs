// One command for a new version of the Android app:
//   node scripts/release.mjs --notes "Lists refresh again; updates install in-app"   (patch bump)
//   node scripts/release.mjs --minor --notes-file notes.md
//   options: --major | --minor | --patch (default) | --version 3.2.0 | --no-install | --dry-run
//
// 1. bumps versionName (version.properties) and picks a versionCode newer than the last release
// 2. builds the signed "everyone" APK + the owner build, runs the Android and web tests, and checks
//    the public APK carries no token
// 3. creates the GitHub release (notes + hidden versionCode) with the asset VS-Clearance.apk
// 4. rebuilds GitHub Pages so the website offers the new APK
// 5. mirrors the source to the public repo (web/scripts/publish-github.mjs)
// 6. installs the owner build on the phone over adb, if one is connected
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = 'GrandpaTin/vs-clearance';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const win = process.platform === 'win32';
const dry = flag('--dry-run');

const run = (cmd, a, o = {}) => execFileSync(cmd, a, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], ...o }).toString().trim();
const step = (n, text) => console.log(`\n[${n}/6] ${text}`);
const fail = (msg) => { console.error('\nRelease stopped: ' + msg); process.exit(1); };

// ------------------------------------------------------------------ preflight
const props = (file) => Object.fromEntries(
  (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/\\(.)/g, '$1')]; })
);
const local = props(path.join(root, 'local.properties'));
if (!local['release.storeFile'] || !fs.existsSync(local['release.storeFile'])) fail('no release.storeFile in local.properties — the signing key is required.');
if (run('git', ['status', '--porcelain'])) fail('commit or stash your changes first; a release is built from a clean tree.');
try { run('gh', ['auth', 'status']); } catch { fail('GitHub CLI isn\'t signed in (gh auth login).'); }
const notes = opt('--notes') ?? (opt('--notes-file') ? fs.readFileSync(opt('--notes-file'), 'utf8') : null);
if (!notes || !notes.trim()) fail('add --notes "what changed" (or --notes-file) — they show in the app\'s update dialog.');

// ------------------------------------------------------------------ 1. version
step(1, 'Version');
const versionFile = path.join(root, 'version.properties');
const current = props(versionFile).versionName || '3.0.0';
const [maj, min, pat] = current.split('.').map(Number);
const versionName = opt('--version') || (flag('--major') ? `${maj + 1}.0.0` : flag('--minor') ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`);
const pad = (n) => String(n).padStart(2, '0');
const d = new Date();
// Same scheme as app/build.gradle.kts: yyMMddHH + tens of minutes.
let versionCode = Number(`${pad(d.getFullYear() % 100)}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${Math.floor(d.getMinutes() / 10)}`);
let lastCode = 0;
try {
  const body = run('gh', ['api', `repos/${REPO}/releases/latest`, '--jq', '.body']);
  lastCode = Number((body.match(/versionCode:\s*(\d+)/) || [])[1] || 0);
} catch { /* no release yet */ }
if (versionCode <= lastCode) versionCode = lastCode + 1;
console.log(`  ${current} → ${versionName}  (versionCode ${versionCode}, last release ${lastCode || 'none'})`);
if (!dry) fs.writeFileSync(versionFile, `versionName=${versionName}\n`);

// ------------------------------------------------------------------ 2. build + tests + checks
step(2, 'Build, test and check');
const gradle = path.join(root, win ? 'gradlew.bat' : 'gradlew');
const env = { ...process.env, JAVA_HOME: process.env.JAVA_HOME || 'C:\\Users\\DN\\tools\\jdk-17' };
const g = spawnSync(gradle, ['assembleEveryoneRelease', 'assembleOwnerDebug', 'testOwnerDebugUnitTest', `-PversionCode=${versionCode}`, '--console=plain', '-q'],
  { cwd: root, env, stdio: 'inherit', shell: win });
if (g.status !== 0) { if (!dry) run('git', ['checkout', '--', 'version.properties']); fail('the Android build or tests failed.'); }
const w = spawnSync('npm', ['test'], { cwd: path.join(root, 'web'), stdio: 'inherit', shell: win });
if (w.status !== 0) { if (!dry) run('git', ['checkout', '--', 'version.properties']); fail('the web tests failed.'); }

const publicApk = path.join(root, 'app/build/outputs/apk/everyone/release/app-everyone-release.apk');
const ownerApk = path.join(root, 'app/build/outputs/apk/owner/debug/app-owner-debug.apk');
// The public APK must never carry a publish token, whatever the build settings say.
const secrets = [local['github.token'], local['share.token']];
try { secrets.push(JSON.parse(fs.readFileSync(path.join(root, 'web/data/config.json'), 'utf8')).token); } catch { /* no local server */ }
const py = `import sys, zipfile
z = zipfile.ZipFile(sys.argv[1]); s = [x.encode() for x in sys.argv[2:] if x]
hit = [n for n in z.namelist() if any(t in z.read(n) for t in s)]
print("\\n".join(hit))`;
const leaks = run(win ? 'python' : 'python3', ['-c', py, publicApk, ...secrets.filter(Boolean)]);
if (leaks) fail('a token was found in the public APK: ' + leaks);
console.log('  public APK checked: no tokens inside');

// ------------------------------------------------------------------ 3. GitHub release
step(3, 'GitHub release');
const tag = `v${versionName}`;
const body = `${notes.trim()}\n\n<!-- versionCode: ${versionCode} -->\n`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-release-'));
const asset = path.join(tmp, 'VS-Clearance.apk');
fs.copyFileSync(publicApk, asset);
fs.writeFileSync(path.join(tmp, 'notes.md'), body);
if (dry) {
  console.log(`  (dry run) would release ${tag} with ${(fs.statSync(asset).size / 1048576).toFixed(1)} MB APK`);
} else {
  run('git', ['commit', '-q', '-m', `Release ${tag}`, '--', 'version.properties']);
  run('gh', ['release', 'create', tag, asset, '--repo', REPO, '--title', `VS Clearance ${versionName}`, '--notes-file', path.join(tmp, 'notes.md')]);
  console.log(`  https://github.com/${REPO}/releases/tag/${tag}`);
}

// ------------------------------------------------------------------ 4 + 5. source mirror (its push rebuilds Pages)
step(4, 'Public source + website');
if (!dry) {
  const out = run(process.execPath, [path.join(root, 'web/scripts/publish-github.mjs'), `Release ${tag}: ${notes.trim().split('\n')[0].slice(0, 70)}`]);
  console.log('  ' + out.split('\n').pop());
  // Nothing new to push means no push-triggered build, so ask for one: the site must offer the new APK.
  if (/already matches/.test(out)) run('gh', ['workflow', 'run', 'pages.yml', '--repo', REPO]);
  // The local Tailscale server's download page too.
  spawnSync(process.execPath, [path.join(root, 'web/scripts/package.mjs')], { cwd: root, stdio: 'ignore' });
}
step(5, 'Website: https://grandpatin.github.io/vs-clearance/ (rebuilds in about a minute)');

// ------------------------------------------------------------------ 6. phone
step(6, 'Phone');
const adb = process.env.ADB || 'C:\\Users\\DN\\Android\\Sdk\\platform-tools\\adb.exe';
let devices = '';
try { devices = run(adb, ['devices']).split('\n').slice(1).filter((l) => /\tdevice$/.test(l)).map((l) => l.split('\t')[0]).join(' '); } catch { /* no adb */ }
if (flag('--no-install') || dry) console.log('  skipped');
else if (!devices) console.log('  no phone connected — it will offer the update in-app within a day (or via ⋮ › Check for updates)');
else {
  const r = spawnSync(adb, ['-s', devices.split(' ')[0], 'install', '-r', ownerApk], { encoding: 'utf8' });
  console.log('  ' + ((r.stdout || '') + (r.stderr || '')).trim().split('\n').pop());
  if (/UPDATE_INCOMPATIBLE|signatures do not match/i.test((r.stdout || '') + (r.stderr || ''))) {
    console.log('  The installed app was signed with an older key: uninstall it once, then: adb install ' + ownerApk);
  }
}
console.log(`\nDone: ${tag} (${versionCode}).`);
