// Bundles public/core.js + userscript/overlay.js + overlay.css into one installable userscript:
//   public/vs-clearance.user.js   (served by the server; also works as a Tampermonkey/Userscripts install link)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const core = read('public/core.js').replace(/^export\s+/gm, '');
const overlay = read('userscript/overlay.js').replace(/^import[\s\S]*?from\s+'[^']+';\s*$/m, '').replace(/^\/\* global .*\*\/\s*$/m, '');
const css = read('userscript/overlay.css');
const base = process.env.PUBLIC_URL || 'https://dn.tail59aab8.ts.net:10000';

const header = `// ==UserScript==
// @name         VS Clearance — Vitamin Shoppe deal finder
// @namespace    vs-clearance
// @version      ${pkg.version}
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
${core}
${overlay}
})();
`;
fs.writeFileSync(path.join(root, 'public', 'vs-clearance.user.js'), out);
console.log(`wrote public/vs-clearance.user.js (${Math.round(out.length / 1024)} KB)`);
