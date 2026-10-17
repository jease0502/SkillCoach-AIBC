// Dev check for live mode with Chromium's fake camera: starts a practice, turns on
// the live call, types one reply and waits for the delivery feedback card.
//   node live-check.mjs <out.png>
import { chromium } from 'playwright';
import { SITE } from './paths.mjs';

const out = process.argv[2];
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera', 'microphone'] });
const page = await context.newPage();
page.setDefaultTimeout(120_000);
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log('console:', m.text()));
await page.goto(`${SITE}/scenarios`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /^Start practice: SaaS/ }).click();
await page.waitForURL(/\/practice\//);
await page.getByRole('switch', { name: /Live call/ }).click();
await page.getByLabel('Your camera').waitFor();
await page.waitForTimeout(2500);
const input = page.getByRole('textbox');
await input.fill('Thanks for your time, Dana. Before we talk about price, how is your team using analytics today?');
await page.keyboard.press('Enter');
await page.getByText(/Expression:/).waitFor({ timeout: 60_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
console.log('session', page.url().split('/').pop());
console.log(await page.getByText(/Your delivery on camera/).locator('..').innerText());
await browser.close();
