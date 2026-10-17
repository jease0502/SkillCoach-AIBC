// Dev check in WebKit (Safari's engine): the video customer must be painted and playing.
//   node webkit-check.mjs <out.png> [scenario regex]
import { webkit } from 'playwright';
import { SITE } from './paths.mjs';

const [out, scenario = 'Support'] = process.argv.slice(2);
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(90_000);
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`${SITE}/scenarios`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: new RegExp(`^Start practice: ${scenario}`) }).click();
await page.waitForURL(/\/practice\//);
await page.waitForTimeout(6000);
const state = await page.evaluate(() =>
  [...document.querySelectorAll('video')].map((v) => ({
    src: v.currentSrc.split('/').pop(),
    opacity: getComputedStyle(v).opacity,
    paused: v.paused,
    time: +v.currentTime.toFixed(2),
    ready: v.readyState,
    h: Math.round(v.getBoundingClientRect().height),
  })),
);
console.log(JSON.stringify(state));
await page.screenshot({ path: out });
console.log('session', page.url().split('/').pop());
await browser.close();
