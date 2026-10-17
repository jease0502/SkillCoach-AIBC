// Dev helper: screenshot the practice page's 3D avatar. node avatar-shot.mjs <practice-url> <out.png>
import { chromium } from 'playwright';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => ['error','warning'].includes(m.type()) && console.log('console:', m.text()));
await page.goto(url, { waitUntil: 'networkidle', timeout: 300000 });
page.setDefaultTimeout(300000);
if (!url.includes('/practice/')) {
  await page.getByRole('button', { name: process.env.SCENARIO ? new RegExp('^Start practice: ' + process.env.SCENARIO) : /^Start practice/ }).first().click();
  await page.waitForURL(/\/practice\//, { timeout: 60000 });
}
await page.getByRole('img', { name: /3D avatar/ }).waitFor({ timeout: 60000 });
await page.waitForFunction(() => !document.body.innerText.includes('Loading avatar'), null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
