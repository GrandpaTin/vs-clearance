// Bundles public/core.js + userscript/overlay.js + overlay.css into one installable userscript:
//   public/vs-clearance.user.js   (served by the server; also works as a Tampermonkey/Userscripts install link)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Userscript managers only update when @version goes up: app version + commit count does on every change.
const appVersion = (fs.readFileSync(path.join(root, '..', 'version.properties'), 'utf8').match(/versionName=([\d.]+)/) || [])[1] || '3.1.0';
let build = process.env.USERSCRIPT_BUILD;
if (!build) { try { build = execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: root }).toString().trim(); } catch { build = '0'; } }
const version = `${appVersion}.${build}`;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const core = read('public/core.js').replace(/^export\s+/gm, '');
const overlay = read('userscript/overlay.js').replace(/^import[\s\S]*?from\s+'[^']+';\s*$/m, '').replace(/^\/\* global .*\*\/\s*$/m, '');
const css = read('userscript/overlay.css');
const base = process.env.PUBLIC_URL || 'https://grandpatin.github.io/vs-clearance';

const header = `// ==UserScript==
// @name         VS Clearance — Vitamin Shoppe deal finder
// @namespace    vs-clearance
// @version      ${version}
// @description  Every Vitamin Shoppe clearance deal with real cart prices, your store's shelf stock, filters, and an AI review prompt.
// @match        https://www.vitaminshoppe.com/*
// @run-at       document-idle
// @inject-into  page
// @grant        none
// @noframes
// @downloadURL  ${base}/vs-clearance.user.js
// @updateURL    ${base}/vs-clearance.user.js
// @homepageURL  ${base}/
// ==/UserScript==
`;

const out = `${header}
(() => {
'use strict';
const __VSX_CSS__ = ${JSON.stringify(css)};
const __VSX_VERSION__ = ${JSON.stringify(version)};
const __VSX_HOME__ = ${JSON.stringify(base + '/')};
${core}
${overlay}
})();
`;
fs.writeFileSync(path.join(root, 'public', 'vs-clearance.user.js'), out);
console.log(`wrote public/vs-clearance.user.js (${Math.round(out.length / 1024)} KB)`);
