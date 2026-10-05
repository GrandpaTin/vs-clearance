// Renders public/icons/icon.svg to the PNG sizes iOS and Android home screens need.
// Uses Playwright with the installed Microsoft Edge (no browser download):
//   npx -y playwright-core@1 ...  or set PLAYWRIGHT_CORE to an existing install.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const icons = path.join(root, 'public', 'icons');
const core = process.env.PLAYWRIGHT_CORE || 'playwright-core';
const { chromium } = await import(core.includes(':') || core.startsWith('/') ? pathToFileURL(core).href : core);

const svg = fs.readFileSync(path.join(icons, 'icon.svg'), 'utf8');
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
// iOS rounds corners itself; maskable icons need the art inside the central 80 %.
// The background covers the whole 108-unit canvas, so the maskable version just shows more of it.
const jobs = [
  ['apple-touch-icon.png', 180, '18 18 72 72'], ['icon-192.png', 192, '18 18 72 72'],
  ['icon-512.png', 512, '18 18 72 72'], ['icon-maskable-512.png', 512, '9 9 90 90']
];
for (const [name, size, viewBox] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  const art = svg.replace('viewBox="18 18 72 72"', `viewBox="${viewBox}" width="${size}" height="${size}"`);
  await page.setContent(`<html><body style="margin:0">${art}</body></html>`);
  await page.screenshot({ path: path.join(icons, name), omitBackground: false });
  console.log('wrote', name);
}
await browser.close();
