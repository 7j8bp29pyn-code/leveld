// End-to-end smoke test of the web build (local storage mode).
// Usage: npx expo export --platform web --output-dir dist && node e2e/smoke.mjs [screenshotDir]
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// CommonJS require honours NODE_PATH, so a globally installed Playwright works too
const { chromium } = createRequire(import.meta.url)('playwright');

const DIST = path.resolve('dist');
const SHOTS = process.argv[2];
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1, locale: 'de-DE' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
const id = (t) => page.getByTestId(t);
const shot = async (n) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
const step = (s) => console.log('✓', s);

try {
  await page.goto(url);
  await id('ob-start').click();
  await shot('01-onboarding');
  await id('ob-name').fill('Alex');
  await id('ob-next').click();
  await page.getByText('Besser schlafen').click();
  await id('ob-next').click();
  await id('ob-act-reading').click();
  await id('ob-act-sleep').click();
  await id('ob-custom-activity').fill('Pole Dance');
  await id('ob-custom-activity-add').click();
  await id('ob-act-meditation').click(); // 4th → guided mode puts it in backlog
  await shot('02-activities');
  await id('ob-next').click();
  await page.getByText('21:30').click();
  await id('ob-next').click();
  await id('ob-mode-guided').click();
  await page.getByText('Im geführten Modus starten die ersten 3').waitFor();
  await id('ob-finish').click();
  step('onboarding completed');

  await id('today-progress').waitFor();
  assert.match(await id('today-progress').innerText(), /0 von 3 erledigt/);
  await shot('03-today');
  await id('check-Pole Dance').click();
  await page.getByText('1 von 3 erledigt').waitFor();
  step('one-tap check');

  await page.reload();
  await page.getByText('1 von 3 erledigt').waitFor();
  step('persisted after reload');

  // skip "Lesen" via entry screen → not counted as failure
  await id('row-Lesen').click();
  await page.getByRole('button', { name: 'Auslassen' }).click();
  await page.getByText('zählen nicht als Scheitern').waitFor();
  await id('log-save').click();
  await page.getByText('1 von 2 erledigt').waitFor();
  step('skip excluded from daily total');

  // detailed entry for sleep with phase-1 → only check, no fields
  await id('row-Schlafroutine').click();
  await page.getByText('In dieser Phase wird nur abgehakt.').waitFor();
  await id('log-save').click();
  await page.getByText('2 von 2 erledigt').waitFor();
  await shot('04-today-done');
  step('entry via detail screen');

  // correction of a past day
  await id('day-prev').click();
  await id('day-label').getByText('Gestern').waitFor();
  await page.getByText('Für diesen Tag ist nichts geplant.').first().waitFor(); // habits start today
  await id('day-next').click();
  step('day navigation');

  // rename Pole Dance → Tennis, add a metric at phase 2
  await page.getByRole('tab', { name: /Gewohnheiten/ }).click();
  await page.getByText('Für später vorgemerkt').waitFor();
  await page.getByText('Meditation').waitFor();
  await id('habit-Pole Dance').click();
  await id('habit-name').fill('Tennis');
  await id('habit-save').click();
  await id('habit-Tennis').waitFor();
  step('rename');
  await shot('05-habits');

  await page.getByRole('tab', { name: /Heute/ }).click();
  await id('row-Tennis').click();
  await page.getByText('(Pole Dance)').waitFor(); // history keeps original name snapshot
  await page.goBack();
  step('history keeps snapshot');

  // Habit Depth: phase 2 + custom metric → field appears in entry form
  await page.getByRole('tab', { name: /Gewohnheiten/ }).click();
  await id('habit-Tennis').click();
  await page.getByText('Phase 2 · Stabilisieren').click();
  await id('add-field').click();
  await id('fd-label-1').fill('Aufschlagquote'); // index 0 = default "Dauer"
  await page.getByLabel('Einheit').nth(1).fill('%');
  await shot('05b-habit-editor');
  await id('habit-save').click();
  await id('habit-Tennis').getByText('Phase 2 · Stabilisieren').waitFor();
  await page.getByRole('tab', { name: /Heute/ }).click();
  await id('row-Tennis').click();
  await id('field-duration').fill('45');
  await id('field-aufschlagquote').fill('62,5');
  await shot('05c-log');
  await id('log-save').click();
  await id('row-Tennis').getByText('45 min · 62.5 %').waitFor();
  step('phase change reveals custom metric; value saved');

  // undo check
  await id('check-Tennis').click();
  await page.getByText('1 von 2 erledigt').waitFor();
  await id('check-Tennis').click();
  await page.getByText('2 von 2 erledigt').waitFor();
  step('undo / redo');

  await page.getByRole('tab', { name: /Fortschritt/ }).click();
  await id('overall-rate').waitFor();
  assert.equal((await id('overall-rate').innerText()).trim(), '100 %');
  await id('daily-chart').waitFor();
  await shot('06-progress');
  step('progress');

  await page.getByRole('tab', { name: /Mehr/ }).click();
  await id('storage-info').getByText('Lokal auf diesem Gerät').waitFor();
  await shot('07-more');
  await page.getByRole('checkbox', { name: 'English' }).click();
  await page.getByRole('tab', { name: /Today/ }).waitFor();
  await page.getByRole('checkbox', { name: 'Deutsch' }).click();
  await page.getByRole('tab', { name: /Heute/ }).waitFor();
  step('language switch de ↔ en');
  await id('delete-all').click();
  await id('ob-start').waitFor();
  step('delete all data → back to onboarding');

  const relevant = errors.filter((e) => !/favicon|DevTools/.test(e));
  assert.deepEqual(relevant, [], 'console errors');
  console.log('E2E PASSED');
} catch (e) {
  await page.screenshot({ path: 'e2e-failure.png' });
  console.error('E2E FAILED', e, errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
