// Screenshots of the live site for the pitch deck: media/deck/live_*.png
//   node deck-shots.mjs [sessionIdOfAFinishedPractice]
// The Compliance Guard shot starts a practice session and leaves it with no
// trainee turns; delete such sessions afterwards.
import path from 'node:path';
import { chromium } from 'playwright';
import { MEDIA, SITE } from './paths.mjs';

const OUT = path.join(MEDIA, 'deck');
const finished = process.argv[2];
const GUARANTEE = "Don't worry, this plan guarantees you 8% a year.";

const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
if (process.env.FAKE_CAMERA) args.push(`--use-file-for-fake-video-capture=${process.env.FAKE_CAMERA}`);
const browser = await chromium.launch({ args });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, permissions: ['camera', 'microphone'] });
await context.addInitScript(() => {
  class SilentRecognition { start() {} stop() { this.onend?.(); } abort() { this.onend?.(); } }
  window.webkitSpeechRecognition = SilentRecognition;
  window.SpeechRecognition = SilentRecognition;
});
const page = await context.newPage();
page.setDefaultTimeout(120_000);

async function avatarReady() {
  await page.getByRole('img', { name: /practice customer/ }).first().waitFor();
  await page.waitForFunction(() => !document.body.innerText.includes('Loading avatar'));
  await page.waitForTimeout(2500);
}

async function shot(name, url, prepare) {
  if (url) await page.goto(`${SITE}${url}`, { waitUntil: 'networkidle' });
  if (prepare) await prepare();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `live_${name}.png`) });
  console.log('shot', name);
}

const scrollTo = (text) => async () => {
  await page.getByRole('heading', { name: text }).first().evaluate((h) => h.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -90));
};

await shot('home', '/');
await shot('knowledge', '/knowledge');
await shot('personas', '/personas');
await shot('persona_new', '/personas/new');
await shot('persona_detail', '/personas/persona-mr-tan');
await shot('scenarios', '/scenarios');
await shot('scenario_detail', '/scenarios/scenario-insurance-compliance');
await shot('dashboard', '/dashboard');
await shot('dashboard_details', null, async () => {
  await page.evaluate(() => window.scrollBy(0, 640));
});

if (finished) {
  await shot('practice_session', `/practice/${finished}`, avatarReady);
  await shot('report', `/reports/${finished}`, () => page.getByText(/COMPLIANCE (PASS|FAIL)/).waitFor());
  await shot('report_evidence', null, scrollTo(/Skills, with evidence/));
  await shot('report_violations', null, scrollTo(/Compliance violations/));
}

// Compliance Guard on a fresh practice session (nothing is sent).
await page.goto(`${SITE}/scenarios`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /^Start practice: Retirement/ }).click();
await page.waitForURL(/\/practice\//);
await avatarReady();
await shot('practice_start', null);
const input = page.getByRole('textbox');
await input.fill(GUARANTEE);
await page.keyboard.press('Enter');
await page.getByRole('button', { name: 'Send anyway' }).waitFor();
await shot('practice_guard', null);
console.log('guard session:', page.url().split('/').pop());

// Live call with the sample camera feed: virtual background and expression cues.
await page.getByRole('button', { name: 'Edit message' }).click();
await input.fill('');
await page.getByRole('switch', { name: /Live call/ }).click();
await page.getByRole('img', { name: 'Your camera' }).waitFor();
await page.getByRole('radio', { name: 'Branch' }).click();
await page.waitForFunction(() => document.body.innerText.includes('Expression now'), null, { timeout: 90_000 }).catch(() => {});
await page.waitForTimeout(2500);
await shot('practice_live', null);

await browser.close();
