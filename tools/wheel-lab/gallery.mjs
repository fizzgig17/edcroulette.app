#!/usr/bin/env node
/**
 * Layout gallery: screenshots the real wheel grid at rest and while editing, for 1 to 6 wheels, on a phone, a phone
 * sideways, an iPad (both ways) and an open foldable. Screenshots go to /tmp/wheel-gallery.
 *   node tools/wheel-lab/gallery.mjs
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DIST = '/tmp/wheel-gallery-dist';
const OUT = '/tmp/wheel-gallery';
const GEAR = path.join(root, 'src/lib/gear.web.tsx');
const ROUTE = path.join(root, 'src/app/wheel-lab.web.tsx');
const STUB = path.join(root, 'src/app/wheel-lab.tsx');
const restore = () => {
  try {
    fs.rmSync(ROUTE, { force: true });
    fs.rmSync(STUB, { force: true });
    execSync('git checkout -- src/lib/gear.web.tsx package.json', { cwd: root, stdio: 'ignore' });
  } catch {}
};
process.on('exit', restore);
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(path.join(root, 'tools/wheel-lab/gear.lab.tsx'), GEAR);
fs.copyFileSync(path.join(root, 'tools/wheel-lab/wheel-lab.web.tsx'), ROUTE);
fs.writeFileSync(STUB, 'export default function WheelLabStub() {\n  return null;\n}\n');
try {
  execSync(`CI=1 npx expo export --platform web --output-dir ${DIST}`, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
} finally {
  restore();
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (p === '/wheel-lab' || p === '/wheel-lab/') p = '/wheel-lab.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] ?? 'application/octet-stream' }).end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/wheel-lab`;
const { chromium } = require('playwright');
const browser = await chromium.launch();

const SIZES = [
  { name: 'phone', width: 390, height: 844, w: 800 },
  { name: 'phone-landscape', width: 844, height: 390, w: 800 },
  { name: 'ipad-portrait', width: 820, height: 1180, w: 820 },
  { name: 'ipad-landscape-pane', width: 1180, height: 820, w: 560 }, // the iPad's left half (the 50/50 split)
  { name: 'foldable-open', width: 884, height: 1104, w: 884 },
];
const ADD = ['Watch', 'Multi-tool', 'Pry bar'];
for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${base}?w=${size.w}`);
  await page.addStyleTag({ content: 'img{-webkit-user-drag:none} *{user-select:none}' });
  await page.waitForSelector('[aria-label*="wheel:"]', { timeout: 30000 });
  await page.waitForTimeout(600);
  const wheels = () => page.locator('[aria-label*=" wheel: "]');
  const hold = async () => {
    const b = await wheels().first().boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await page.waitForTimeout(500);
  };
  const done = async () => {
    await page.getByRole('button', { name: 'Done editing wheels' }).click({ force: true });
    await page.waitForTimeout(700);
  };
  const shot = async (n, mode) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${size.name}-${n}-${mode}.png` });
  };
  // Three wheels to start: shoot, edit, shoot; remove down to one, then build up to six.
  await shot(3, 'rest');
  await hold();
  await shot(3, 'editing');
  const states = [];
  for (const n of [2, 1]) {
    await page.locator('[aria-label="Remove this wheel"]').first().click({ force: true });
    await page.waitForTimeout(700);
    await shot(n, 'editing');
    states.push(n);
  }
  await done();
  await shot(1, 'rest');
  await hold();
  let n = 1;
  for (const cat of ADD) {
    await page.getByText('Add a wheel').first().click({ force: true });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: new RegExp(`^${cat}`) }).click({ force: true, timeout: 5000 });
    await page.waitForTimeout(700);
    n += 1;
    await shot(n, 'editing');
    if (n === 2) {
      await done();
      await shot(2, 'rest');
      await hold();
    }
  }
  // n is 4 now; add two more.
  for (const cat of ['Flashlight', 'Pen']) {
    await page.getByText('Add a wheel').first().click({ force: true });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: new RegExp(`^${cat}`) }).click({ force: true, timeout: 5000 });
    await page.waitForTimeout(700);
    n += 1;
    await shot(n, 'editing');
  }
  await done();
  await shot(6, 'rest');
  await ctx.close();
  console.log('done', size.name);
}
await browser.close();
server.close();
