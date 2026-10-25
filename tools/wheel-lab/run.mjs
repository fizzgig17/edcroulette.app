#!/usr/bin/env node
/**
 * Wheel lab: runs the REAL wheel grid (src/components/roulette-spinner.tsx) in a browser and
 * checks it, so layout and gesture changes can be seen before a phone build.
 *
 *   node tools/wheel-lab/run.mjs            build, screenshot every size, run the gesture checks
 *   node tools/wheel-lab/run.mjs --keep     leave the built page in /tmp/wheel-lab-dist
 *
 * It temporarily swaps in an in-memory collection (tools/wheel-lab/gear.lab.tsx) and a bare page
 * (wheel-lab.web.tsx), exports the website to /tmp, and puts everything back afterwards.
 * Screenshots go to /tmp/wheel-lab-shots. Exit code is 1 if any check fails.
 *
 * What it can't show: real touch and scrolling on a phone, haptics, sound, Android specifics.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DIST = '/tmp/wheel-lab-dist';
const SHOTS = '/tmp/wheel-lab-shots';
const GEAR = path.join(root, 'src/lib/gear.web.tsx');
const ROUTE = path.join(root, 'src/app/wheel-lab.web.tsx');
const ROUTE_STUB = path.join(root, 'src/app/wheel-lab.tsx'); // Expo Router wants a plain sibling of a .web file

function restore() {
  try {
    fs.rmSync(ROUTE, { force: true });
    fs.rmSync(ROUTE_STUB, { force: true });
    execSync('git checkout -- src/lib/gear.web.tsx package.json', { cwd: root, stdio: 'ignore' });
  } catch {
    /* nothing to restore */
  }
}
process.on('exit', restore);
process.on('SIGINT', () => process.exit(130));

// --- build ------------------------------------------------------------------------------------
fs.rmSync(DIST, { recursive: true, force: true });
fs.copyFileSync(path.join(root, 'tools/wheel-lab/gear.lab.tsx'), GEAR);
fs.copyFileSync(path.join(root, 'tools/wheel-lab/wheel-lab.web.tsx'), ROUTE);
fs.writeFileSync(ROUTE_STUB, 'export default function WheelLabStub() {\n  return null;\n}\n');
console.log('Building the lab page...');
try {
  execSync(`CI=1 npx expo export --platform web --output-dir ${DIST}`, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
} catch (e) {
  console.error(String(e.stderr || e.message).split('\n').slice(-15).join('\n'));
  process.exit(1);
} finally {
  restore();
}

// --- serve ------------------------------------------------------------------------------------
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (p === '/wheel-lab' || p === '/wheel-lab/') p = '/wheel-lab.html';
  const file = path.join(DIST, p);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/wheel-lab`;

// --- checks -----------------------------------------------------------------------------------
const { chromium } = require('playwright');
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch();
const errors = [];

async function open(size) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${size.name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(`${size.name}: ${m.text()}`));
  await page.goto(url);
  await page.addStyleTag({ content: 'img{-webkit-user-drag:none} *{user-select:none;-webkit-user-select:none}' });
  await page.waitForSelector('[aria-label*="wheel:"]', { timeout: 30000 });
  await page.waitForTimeout(600);
  return { ctx, page };
}

const wheels = (page) => page.locator('[aria-label*=" wheel: "]');
const order = async (page) => (await wheels(page).evaluateAll((els) => els.map((e) => ({ label: e.getAttribute('aria-label'), x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y })))).sort((a, b) => Math.round(a.y / 60) - Math.round(b.y / 60) || a.x - b.x).map((w) => w.label.split(' wheel:')[0]);
const centre = async (loc) => {
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
};

// Screenshots at every size, with the default four wheels and with six.
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'ipad-portrait', width: 820, height: 1180 },
  { name: 'ipad-landscape', width: 1180, height: 820 },
  { name: 'foldable-open', width: 884, height: 1104 },
];
for (const size of SIZES) {
  const { ctx, page } = await open(size);
  await page.screenshot({ path: `${SHOTS}/${size.name}-4.png` });
  const box = await page.locator('[aria-label*=" wheel: "]').first().boundingBox();
  check(`${size.name}: wheels are square`, !!box && Math.abs(box.width - box.height) < 2, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'none');
  const vw = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check(`${size.name}: nothing wider than the screen`, vw);
  await ctx.close();
}

// Gestures, on a phone.
const phone = SIZES[0];
{
  const { ctx, page } = await open(phone);
  check('four starting wheels', (await wheels(page).count()) === 4, (await order(page)).join(', '));

  // Tap a wheel to lock it, again to unlock.
  const first = wheels(page).first();
  await first.click({ force: true });
  await page.waitForTimeout(700);
  check('tap locks a wheel', /locked/.test((await first.getAttribute('aria-label')) ?? ''));
  await first.click({ force: true });
  await page.waitForTimeout(700);
  check('tap again unlocks it', !/locked/.test((await first.getAttribute('aria-label')) ?? ''));

  // Double-tap: a list of that category opens with the current piece marked; choosing one locks the wheel on it.
  const shownBefore = ((await first.getAttribute('aria-label')) ?? '').replace(/^.* wheel: /, '');
  await first.dblclick({ force: true });
  await page.waitForTimeout(600);
  const opened = (await page.getByText(/^Choose a /).count()) > 0;
  const marked = await page.locator('[aria-label$=", current"]').count();
  const currentName = ((await page.locator('[aria-label$=", current"]').first().getAttribute('aria-label')) ?? '').replace(/, current$/, '');
  check('double-tap opens the list of that wheel\'s pieces', opened, `${marked} marked`);
  check('the wheel\'s current piece is the marked one', marked === 1 && currentName === shownBefore, `${currentName} / ${shownBefore}`);
  await page.screenshot({ path: `${SHOTS}/phone-picker.png` });
  const other = page.locator('[aria-label^="Choose a"]').first();
  const pick = page.locator('[role="button"][aria-label]:not([aria-label$=", current"]):not([aria-label^="Make "]):not([aria-label^="Remove "]):not([aria-label="Close"]):not([aria-label="Unlock this wheel"])').filter({ hasText: /\S/ });
  void other;
  const rows = await page.locator('[aria-label][role="button"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).filter((l) => l && !/^(Make |Remove |Close|Unlock|Done|Reset|Share|Spin|Stop)/.test(l) && !/ wheel: /.test(l) && !/, current$/.test(l)));
  void pick;
  const chosen = rows.find((l) => l && !/tab|Collection|Settings/i.test(l));
  if (chosen) await page.locator(`[aria-label="${chosen}"]`).first().click({ force: true });
  await page.waitForTimeout(500);
  const afterLabel = (await first.getAttribute('aria-label')) ?? '';
  check('choosing a piece locks the wheel on it', !!chosen && afterLabel.includes(chosen) && /locked/.test(afterLabel), afterLabel);
  await first.click({ force: true });
  await page.waitForTimeout(700);

  // Press and hold: everything wiggles, x on each wheel, + for a new one.
  // Spin first, so the wheels hold pieces that must travel with them when rearranged.
  await page.getByTestId('spin').click({ force: true });
  await page.waitForTimeout(9000);
  const labelsOf = async () => Object.fromEntries((await wheels(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).map((l) => [l.split(' wheel:')[0], l]));
  const spun = await labelsOf();
  let c = await centre(wheels(page).nth(1));
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const removes = await page.locator('[aria-label="Remove this wheel"]').count();
  check('press and hold starts editing (x on every wheel)', removes === 4, `${removes} x buttons`);
  check('a + appears for the next empty slot', (await page.getByText('Add a wheel').count()) > 0);
  await page.screenshot({ path: `${SHOTS}/phone-editing.png` });

  // Drag the first wheel to the third place.
  const before = await order(page);
  const a = await centre(wheels(page).nth(0));
  const targetBox = wheels(page).nth(2);
  const t = await centre(targetBox);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) await page.mouse.move(a.x + ((t.x - a.x) * i) / 12, a.y + ((t.y - a.y) * i) / 12, { steps: 2 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/phone-dragging.png` });
  await page.mouse.up();
  const spots = () => wheels(page).evaluateAll((els) => els.map((e) => [e.getAttribute('aria-label'), e.getBoundingClientRect().x, e.getBoundingClientRect().y]));
  await page.waitForTimeout(150);
  const early = await spots();
  await page.waitForTimeout(750);
  const late = await spots();
  const drift = Math.max(...early.map(([l, x, y]) => { const f = late.find((w) => w[0] === l); return f ? Math.hypot(f[1] - x, f[2] - y) : 999; }));
  check('after a drop the wheels settle where they were dropped (none fly across)', drift < 20, `largest move after 150ms: ${Math.round(drift)}px`);
  const after = await order(page);
  check('dragging reorders the wheels', before.join() !== after.join() && after[2] === before[0], `${before.join(' > ')}  =>  ${after.join(' > ')}`);

  // Done: the order must stay.
  await page.getByRole('button', { name: 'Done editing wheels' }).click({ force: true });
  await page.waitForTimeout(700);
  const saved = await order(page);
  check('the new order stays after Done', saved.join() === after.join(), saved.join(' > '));
  const afterMove = await labelsOf();
  check('each wheel keeps its piece when rearranged', Object.keys(spun).every((k) => afterMove[k] === spun[k]), JSON.stringify(Object.keys(spun).filter((k) => afterMove[k] !== spun[k])));

  // Edit again: change a wheel's category, remove one, add one.
  c = await centre(wheels(page).nth(3));
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.locator(`[aria-label^="${(await order(page))[0]} wheel:"]`).first().click({ force: true });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Wallet/ }).click({ force: true });
  await page.waitForTimeout(700);
  check('tapping a wheel while editing changes what it spins', (await order(page))[0] === 'Wallet', (await order(page)).join(', '));

  await page.locator('[aria-label="Remove this wheel"]').first().click({ force: true });
  await page.waitForTimeout(700);
  check('x removes a wheel', (await wheels(page).count()) === 3, `${await wheels(page).count()} wheels`);

  for (const cat of ['Watch', 'Keychain', 'Pry bar']) {
    await page.getByText('Add a wheel').first().click({ force: true });
    await page.waitForTimeout(400);
    if (!(await page.getByRole('button', { name: new RegExp(`^${cat}`) }).count())) await page.screenshot({ path: `${SHOTS}/debug-add-${cat}.png` });
    await page.getByRole('button', { name: new RegExp(`^${cat}`) }).click({ force: true, timeout: 5000 });
    await page.waitForTimeout(700);
  }
  const six = await order(page);
  check('+ adds wheels up to six', six.length === 6, six.join(', '));
  check('no + when there are six', (await page.getByText('Add a wheel').count()) === 0);
  await page.screenshot({ path: `${SHOTS}/phone-6-editing.png` });

  // A repeated category is allowed.
  await page.locator(`[aria-label^="${(await order(page))[0]} wheel:"]`).first().click({ force: true });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Watch/ }).click({ force: true });
  await page.waitForTimeout(700);
  const rep = await order(page);
  check('the same category can be on two wheels', rep.filter((x) => x === 'Watch').length === 2, rep.join(', '));

  // Done, then spin: every wheel ends with a piece and nothing errors.
  await page.getByRole('button', { name: 'Done editing wheels' }).click({ force: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/phone-6.png` });
  await page.getByTestId('spin').click({ force: true });
  await page.waitForTimeout(9000);
  const labels = await wheels(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check('a spin lands every wheel on a piece', labels.every((l) => l && !/: empty/.test(l)), labels.join(' | '));
  await page.screenshot({ path: `${SHOTS}/phone-after-spin.png` });
  await ctx.close();
}

await browser.close();
server.close();
check('no errors in the browser console', errors.length === 0, errors.slice(0, 3).join(' || '));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed. Screenshots: ${SHOTS}`);
process.exit(failed ? 1 : 0);
