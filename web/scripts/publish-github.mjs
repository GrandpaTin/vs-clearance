// Publishes the committed project to its public GitHub repo (and so to GitHub Pages).
//   node web/scripts/publish-github.mjs "What changed"
//
// The public repo is a separate clone next to this project whose commits use GitHub's no-reply
// address, so the local history (and the email in it) never leaves this machine. Only files
// committed here are copied, so nothing gitignored (local.properties, web/data/) can leak.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = process.env.GITHUB_REPO || 'GrandpaTin/vs-clearance';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const clone = path.resolve(project, '..', REPO.split('/')[1] + '-public');
const message = process.argv[2] || 'Update';

const run = (cmd, args, cwd, opts = {}) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], ...opts });
const git = (args, cwd = clone, opts) => run('git', args, cwd, opts);

if (run('git', ['status', '--porcelain'], project).toString().trim()) {
  console.log('Note: uncommitted changes here are not published — commit them first if they should be.');
}

if (!fs.existsSync(path.join(clone, '.git'))) {
  const [login, id] = run('gh', ['api', 'user', '--jq', '.login + " " + (.id|tostring)'], project).toString().trim().split(' ');
  fs.mkdirSync(clone, { recursive: true });
  git(['init', '-b', 'main']);
  git(['config', 'user.name', login]);
  git(['config', 'user.email', `${id}+${login}@users.noreply.github.com`]);
  git(['remote', 'add', 'origin', `https://github.com/${REPO}.git`]);
  try { git(['fetch', 'origin', 'main']); git(['reset', 'origin/main']); } catch { /* new repo */ }
}

// Mirror the committed tree: copy every file at HEAD, remove anything that's gone.
const files = run('git', ['ls-tree', '-r', '-z', '--name-only', 'HEAD'], project).toString().split('\0').filter(Boolean);
const keep = new Set(files.map((f) => path.normalize(f)));
for (const f of files) {
  const dest = path.join(clone, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, run('git', ['show', `HEAD:${f}`], project, { maxBuffer: 256 * 1024 * 1024 }));
}
for (const f of git(['ls-files', '-z']).toString().split('\0').filter(Boolean)) {
  if (!keep.has(path.normalize(f))) fs.rmSync(path.join(clone, f), { force: true });
}

git(['add', '-A']);
if (!git(['status', '--porcelain']).toString().trim()) {
  console.log('Public repo already matches HEAD; nothing to publish.');
} else {
  git(['commit', '-q', '-m', message]);
  git(['push', '-u', 'origin', 'main'], clone, { stdio: 'inherit' });
  console.log(`Published to https://github.com/${REPO}`);
}
