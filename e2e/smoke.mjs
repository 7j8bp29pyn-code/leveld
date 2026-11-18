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
  await id('level-regular').click();                      // Q1: training level (self-assessment)
  await shot('01b-level');
  await id('ob-next').click();
  await page.getByText('Schlaf verbessern').click();      // Q2: goals (multi)
  await page.getByText('Kraft steigern').click();
  await id('ob-next').click();
  await id('start-existing_plan').click();                // Q3: start
  await id('ob-next').click();
  await id('checkin-consent').click();                    // details: everything optional, consent for check-in
  await shot('01c-details');
  await id('ob-next').click();
  await id('ob-act-reading').click();
  await id('ob-act-sleep').click();
  await id('ob-custom-activity').fill('Pole Dance');
  await id('ob-custom-activity-add').click();
  await id('ob-act-meditation').click(); // 5th incl. generated "Training" → backlog (guided limit for "regular" = 4)
  await shot('02-activities');
  await id('ob-next').click();
  await id('ob-skip').click();                            // rhythm: keep defaults
  await id('ob-rem-wake').click();                        // relative reminder: after waking up
  await id('ob-next').click();
  await id('ob-mode-guided').click();
  await page.getByText('Im geführten Modus starten die ersten 4').waitFor();
  await id('style-humorous').click();
  await id('ob-finish').click();
  step('onboarding with level, goals, start, consent, relative reminder, style');

  await id('today-progress').waitFor();
  assert.match(await id('today-progress').innerText(), /0 von 4 erledigt/);
  await id('checkin-card').waitFor();
  await shot('03-today');
  await id('quick-tired').click();                        // daily form: slightly tired
  await id('readiness-state-B').waitFor();
  await id('option-lighter').waitFor();
  await shot('03b-checkin-tired');
  await id('option-lighter').click();                     // lighter session → "adapted", counts as fulfilled
  await page.getByText('Light-Version läuft auch').waitFor(); // humorous style
  await page.getByText('1 von 4 erledigt').waitFor();
  step('check-in B → lighter session (adapted) with positive feedback');

  await id('check-Pole Dance').click();
  await page.getByText('Zack, Pole Dance erledigt').waitFor();
  await page.getByText('2 von 4 erledigt').waitFor();
  step('one-tap check');

  await page.reload();
  await page.getByText('2 von 4 erledigt').waitFor();
  step('persisted after reload');

  await id('row-Lesen').click();
  await page.getByRole('button', { name: 'Auslassen' }).click();
  await page.getByText('zählen nicht als Scheitern').waitFor();
  await id('log-save').click();
  await page.getByText('2 von 3 erledigt').waitFor();
  step('skip excluded from daily total');

  await id('row-Schlafroutine').click();
  await page.getByText('In dieser Phase wird nur abgehakt.').waitFor();
  await id('log-save').click();
  await page.getByText('3 von 3 erledigt').waitFor();
  await shot('04-today-done');
  step('entry via detail screen');

  // training entry: regular level → detailed fields + RPE visible
  await id('row-Training').click();
  await id('status-adapted').waitFor();
  await id('field-sets').waitFor();
  await id('rpe-6').click();
  await id('field-sets').fill('3');
  await id('log-save').click();
  await id('row-Training').getByText('3').first().waitFor();
  step('training details + RPE for regular level');

  // health check-in: fever → state D, conservative advice; red flag shows urgent hint
  await id('checkin-edit').click();
  await id('checkin-more').click();
  await id('redflag-chest_pain').click();
  await id('urgent').waitFor();
  await id('redflag-chest_pain').click();
  await id('symptom-fever').click();
  await id('readiness-sick').click();
  await shot('05a-checkin-fever');
  await id('checkin-save').click();
  await id('readiness-state-D').waitFor();
  await page.getByText('Bei Fieber rät LEVELD von Training ab').waitFor();
  step('fever → state D (no diagnosis), red flag → urgent medical hint');

  await id('day-prev').click();
  await id('day-label').getByText('Gestern').waitFor();
  await page.getByText('Für diesen Tag ist nichts geplant.').first().waitFor();
  await id('day-next').click();
  step('day navigation');

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
  await page.getByText('(Pole Dance)').waitFor();
  await page.goBack();
  step('history keeps snapshot');

  await page.getByRole('tab', { name: /Gewohnheiten/ }).click();
  await id('habit-Tennis').click();
  await page.getByRole('radio', { name: /Phase 2 · Stabilisieren/ }).click();
  await id('add-field').click();
  await id('fd-label-1').fill('Aufschlagquote');
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

  await id('check-Tennis').click();
  await page.getByText('2 von 3 erledigt').waitFor();
  await id('check-Tennis').click();
  await page.getByText('3 von 3 erledigt').waitFor();
  step('undo / redo');

  await page.getByRole('tab', { name: /Fortschritt/ }).click();
  await id('overall-rate').waitFor();
  assert.equal((await id('overall-rate').innerText()).trim(), '100 %');
  await id('recovery-stats').getByText('Angepasst: 1').waitFor();
  await id('daily-chart').waitFor();
  await shot('06-progress');
  step('progress counts adapted as fulfilled');

  await page.getByRole('tab', { name: /Mehr/ }).click();
  await id('storage-info').getByText('Lokal auf diesem Gerät').waitFor();
  await id('more-level-regular').waitFor();
  await id('health-consent').waitFor();
  await shot('07-more');
  await id('withdraw-consent').click();                  // confirm dialog auto-accepted
  await page.getByText('Keine Einwilligung').waitFor();
  step('withdraw health consent deletes check-ins');
  await page.getByRole('tab', { name: /Heute/ }).click();
  await id('checkin-card').waitFor({ state: 'detached' });
  // shift work: rotating shifts with a per-day plan
  await page.getByRole('tab', { name: /Mehr/ }).click();
  await id('open-rhythm').click();
  await id('rhythm-rotating').click();
  await id('rhythm-save').click();
  await page.getByText('Schichtplan (nächste 14 Tage)').waitFor();
  await page.locator('[data-testid^="shift-"][data-testid$="-night"]').first().click();
  await page.getByText('Aufstehen 14:00').first().waitFor();
  await shot('09-rhythm');
  await page.goBack();
  step('rotating shifts: day plan with night shift anchors');

  // training cycles: enable feature, create load block → shown on dashboard
  await id('feature-cycles').click();
  await id('open-cycles').click();
  await id('cycle-add').click();
  await id('cycle-name').fill('Block 1');
  await id('cphase-load').click();
  await id('cycle-save').click();
  await page.getByText('Block 1').waitFor();
  await page.goBack();
  await page.getByRole('tab', { name: /Heute/ }).click();
  await page.getByText('Aktuell: Belastungsphase').waitFor();
  step('training cycle phase visible on dashboard');

  await page.getByRole('tab', { name: /Mehr/ }).click();
  await page.getByRole('checkbox', { name: 'English' }).click();
  await page.getByRole('tab', { name: /Today/ }).waitFor();
  await page.getByRole('checkbox', { name: 'Deutsch' }).click();
  await page.getByRole('tab', { name: /Heute/ }).waitFor();
  step('language switch de ↔ en');
  await id('delete-all').click();
  await id('ob-start').waitFor();
  step('delete all data → back to onboarding');

  // --- existing user from the previous version: data stays, quick setup offered ---
  const d = new Date(); d.setHours(d.getHours() - 3);
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const v1 = {
    schemaVersion: 1,
    profile: { displayName: 'Kim', goals: [], habitBacklog: [], mode: 'custom', locale: 'de', timezone: 'Europe/Berlin', defaultReminderTime: null,
      phaseThreshold: 0.8, phaseWindowDays: 14, onboardingCompleted: true },
    habits: [{ id: 'h1', name: 'Tennis', category: 'training', icon: 'tennisball-outline', description: '', goal: '', scheduleType: 'daily',
      weekdays: [1, 2, 3, 4, 5, 6, 7], timesPerWeek: null, reminderTime: null, reminderEnabled: false, startDate: today, phase: 1,
      status: 'active', pausePeriods: [], sortOrder: 0, phaseSuggestionDismissedUntil: null, createdAt: 'x', updatedAt: 'x' }],
    fields: [],
    entries: [{ id: 'e1', habitId: 'h1', localDate: today, status: 'done', postponedTo: null, values: {}, fieldSnapshot: [],
      habitNameSnapshot: 'Tennis', note: '', completedAt: 'x', createdAt: 'x', updatedAt: 'x' }],
    phaseChanges: [],
  };
  await page.evaluate((data) => { localStorage.clear(); localStorage.setItem('leveld.v1.data', JSON.stringify(data)); }, v1);
  await page.reload();
  await page.getByText('Hallo, Kim').or(page.getByText('Guten Morgen, Kim')).or(page.getByText('Guten Abend, Kim')).waitFor();
  await page.getByText('1 von 1 erledigt').waitFor();
  await id('setup-card').waitFor();
  await shot('08-existing-user');
  await id('setup-open').click();
  await id('level-beginner').click();
  await id('setup-next').click();
  await id('setup-skip').click();          // goals skipped
  await id('start-habits_only').click();
  await id('setup-next').click();
  await id('mark-Tennis-training').click();
  await id('setup-next').click();
  await id('rhythm-early').click();
  await id('setup-next').click();
  await id('style-factual').click();
  await id('setup-save').click();
  await id('setup-card').waitFor({ state: 'detached' });
  await page.getByText('1 von 1 erledigt').waitFor();
  await id('row-Tennis').getByText('Training').waitFor();
  await page.reload();
  await page.getByText('1 von 1 erledigt').waitFor();
  assert.equal(await id('setup-card').count(), 0);
  step('existing user: data kept, quick setup adds level/rhythm/style, marks training');

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
