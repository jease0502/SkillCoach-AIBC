// Dev check for live mode with Chromium's fake camera: starts a practice, turns on
// the live call, picks a background, types one reply and waits for the delivery card.
//   FAKE_VIDEO=face.mjpeg SKILLCOACH_WEB=http://localhost:3100 node live-check.mjs <out.png> [background]
import { chromium } from 'playwright';
import { SITE } from './paths.mjs';

const [out, background = 'Office'] = process.argv.slice(2);
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
if (process.env.FAKE_VIDEO) args.push(`--use-file-for-fake-video-capture=${process.env.FAKE_VIDEO}`);
const browser = await chromium.launch({ args });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['camera', 'microphone'] });
const page = await context.newPage();
page.setDefaultTimeout(180_000);
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log('console:', m.text().slice(0, 300)));
await page.goto(`${SITE}/scenarios`, { waitUntil: 'networkidle', timeout: 300_000 });
await page.getByRole('button', { name: /^Start practice: (SaaS|Pricing)/ }).first().click();
await page.waitForURL(/\/practice\//);
await page.getByRole('switch', { name: /Live call/ }).click();
await page.getByRole('img', { name: 'Your camera' }).waitFor();
await page.getByRole('radio', { name: background }).click();
await page.waitForFunction(() => document.body.innerText.includes('Expression now') || document.body.innerText.includes('No face in view'), null, { timeout: 120_000 });
await page.waitForTimeout(3000);
const input = page.getByRole('textbox');
await input.fill('Thanks for your time, Dana. Before we talk about price, how is your team using analytics today?');
await page.keyboard.press('Enter');
await page.getByText(/Expression:/).waitFor({ timeout: 90_000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: out, fullPage: true });
console.log('session', page.url().split('/').pop());
for (const h of ['Camera and expression', 'Your delivery on camera']) {
  console.log('---', h);
  console.log(await page.getByRole('heading', { name: h }).locator('..').innerText());
}
await browser.close();
