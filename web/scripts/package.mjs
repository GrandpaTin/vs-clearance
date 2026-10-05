// Builds the userscript, then the shareable downloads in public/downloads/:
//   VS-Clearance.apk               (the 'everyone' Android build: no server or token inside)
//   VS-Clearance-project.zip       (whole project; no build output, secrets or node_modules)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.resolve(web, '..');
const downloads = path.join(web, 'public', 'downloads');
fs.mkdirSync(downloads, { recursive: true });

execFileSync(process.execPath, [path.join(web, 'scripts', 'build-userscript.mjs')], { stdio: 'inherit' });
fs.copyFileSync(path.join(project, 'LICENSE'), path.join(web, 'public', 'LICENSE.txt'));

// Never the 'owner' build: that one carries your server's publish token.
const apk = path.join(project, 'app', 'build', 'outputs', 'apk', 'everyone', 'debug', 'app-everyone-debug.apk');
if (fs.existsSync(apk)) {
  fs.copyFileSync(apk, path.join(downloads, 'VS-Clearance.apk'));
  console.log('copied VS-Clearance.apk');
} else {
  console.log('no everyone APK yet: run gradlew assembleEveryoneDebug');
}

// The zip is exactly the project's source as git sees it (tracked + new, minus .gitignore), so it
// can't silently drop a folder or pick up build output, and the publish token is checked for.
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: project })
  .toString('utf8').split('\0').filter((f) => f && fs.existsSync(path.join(project, f)));
const forbidden = files.filter((f) => /(^|\/)(local\.properties|config\.json|snapshot\.json)$/.test(f) || f.endsWith('.apk'));
if (forbidden.length) throw new Error('Refusing to zip private files: ' + forbidden.join(', '));
const cfg = path.join(web, 'data', 'config.json');
const token = fs.existsSync(cfg) ? JSON.parse(fs.readFileSync(cfg, 'utf8')).token : null;
if (token) {
  const leaks = files.filter((f) => fs.readFileSync(path.join(project, f)).includes(token));
  if (leaks.length) throw new Error('Publish token found in: ' + leaks.join(', '));
}
const list = path.join(downloads, '.zip-files.txt');
fs.writeFileSync(list, files.join('\n'));
const zip = path.join(downloads, 'VS-Clearance-project.zip');
const py = `
import os, sys, zipfile
root, out, listfile = sys.argv[1], sys.argv[2], sys.argv[3]
names = [l for l in open(listfile, encoding='utf-8').read().split('\\n') if l]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for rel in names:
        z.write(os.path.join(root, rel), 'VS-Clearance/' + rel)
print('wrote', out, len(names), 'files,', os.path.getsize(out) // 1024, 'KB')
`;
execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', py, project, zip, list], { stdio: 'inherit' });
fs.unlinkSync(list);
