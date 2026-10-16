// Drives the live site with Playwright and records it as a JPEG screencast with wall-clock timestamps.
// Voiceover cues are paced from media/build/vo/durations.json, so run `node synth.mjs` (or --draft) first.
//
//   node record.mjs            full run
//   node record.mjs --headed   watch it in a visible browser
//
// Output: media/build/frames/*.jpg and media/build/frames/timeline.json (frames, cue marks, cut ranges).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { API, FRAMES_DIR, HEIGHT, SITE, WIDTH, cueDurations, writeJson } from './paths.mjs';

const ZOOM = 1.25;
const TYPE_DELAY = 32; // ms per character
const CUE_GAP = 0.35; // s of silence after each cue

const LINES = {
  guarantee: "Don't worry, this plan guarantees you 8% a year.",
  pressure: 'You need to sign today, the offer ends tonight.',
  honest:
    "I can't promise that. Historically the plan has averaged 5.2%, but past performance doesn't guarantee future results, and the value can go down as well as up.",
  discovery: "That's an important point. May I ask what you'd need that money for, and when?",
};

const now = () => Date.now() / 1000;
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

class Recorder {
  constructor(context, page) {
    this.context = context;
    this.page = page;
    this.durations = cueDurations();
    this.frames = [];
    this.marks = [];
    this.cuts = [];
    this.voiceEnd = 0;
  }

  async start() {
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
    fs.mkdirSync(FRAMES_DIR, { recursive: true });
    this.cdp = await this.context.newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', async (f) => {
      const file = `f${String(this.frames.length).padStart(6, '0')}.jpg`;
      this.frames.push({ file, t: f.metadata.timestamp });
      fs.writeFile(path.join(FRAMES_DIR, file), Buffer.from(f.data, 'base64'), () => {});
      await this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: WIDTH, maxHeight: HEIGHT });
    this.t0 = now();
  }

  async stop() {
    await this.cdp.send('Page.stopScreencast').catch(() => {});
    await sleep(0.5);
    writeJson(path.join(FRAMES_DIR, 'timeline.json'), { start: this.t0, end: now(), frames: this.frames, marks: this.marks, cuts: this.cuts });
    console.log(`recorded ${(now() - this.t0).toFixed(1)} s, ${this.frames.length} frames, ${this.cuts.length} cuts`);
  }

  /** Wait until the previous cue has finished speaking. */
  async quiet(extra = 0) {
    const wait = this.voiceEnd + extra - now();
    if (wait > 0) await sleep(wait);
  }

  /** Start a voiceover cue here (after the previous one finishes). */
  async cue(id) {
    if (!(id in this.durations)) throw new Error(`No duration for cue ${id}; run synth.mjs first`);
    await this.quiet();
    const t = now();
    this.marks.push({ id, t });
    this.voiceEnd = t + this.durations[id] + CUE_GAP;
    console.log(`  cue ${id} at ${(t - this.t0).toFixed(1)} s (${this.durations[id].toFixed(1)} s)`);
  }

  /** Run a slow server step; most of the wait is cut from the video and labeled as shortened. */
  async cut(label, fn, { keep = 1.6 } = {}) {
    await this.quiet();
    const start = now();
    const result = await fn();
    const end = now();
    if (end - start > keep + 1.5) this.cuts.push({ start: start + keep, end: end - 0.5, label: `${label}: ${Math.round(end - start)} s, shortened` });
    return result;
  }
}

/** A visible cursor (headless Chromium draws none) and the presentation zoom. */
function presentationScript(zoom) {
  const apply = () => {
    const root = document.documentElement;
    if (!root) return;
    root.style.zoom = String(zoom);
    if (!document.getElementById('__rec-style')) {
      const style = document.createElement('style');
      style.id = '__rec-style';
      // 100vh is scaled by the zoom, so the practice chat card would overflow the window.
      style.textContent = `.h-\\[calc\\(100vh-12rem\\)\\]{height:calc(${100 / zoom}vh - 15rem)!important}
        #__cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;zoom:${1 / zoom};width:30px;height:30px}
        #__cursor svg{filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}
        #__cursor .ring{position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;border:3px solid rgba(79,70,229,.85);opacity:0;transform:scale(.4)}
        #__cursor.down .ring{animation:__ring .45s ease-out}
        @keyframes __ring{0%{opacity:1;transform:scale(.4)}100%{opacity:0;transform:scale(1.6)}}
        html{scroll-behavior:smooth}`;
      root.appendChild(style);
    }
    if (!document.getElementById('__cursor')) {
      const c = document.createElement('div');
      c.id = '__cursor';
      c.innerHTML =
        '<span class="ring"></span><svg width="26" height="30" viewBox="0 0 26 30"><path d="M2 2v22l6-5 4 9 4-2-4-9h8z" fill="#0f172a" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
      const pos = JSON.parse(sessionStorage.getItem('__cursor') || '[960,540]');
      c.style.left = `${pos[0]}px`;
      c.style.top = `${pos[1]}px`;
      root.appendChild(c);
    }
  };
  apply();
  document.addEventListener('DOMContentLoaded', apply);
  addEventListener('load', apply);
  addEventListener(
    'mousemove',
    (e) => {
      const c = document.getElementById('__cursor');
      if (!c) return;
      c.style.left = `${e.clientX}px`;
      c.style.top = `${e.clientY}px`;
      sessionStorage.setItem('__cursor', JSON.stringify([e.clientX, e.clientY]));
    },
    true,
  );
  addEventListener(
    'mousedown',
    () => {
      const c = document.getElementById('__cursor');
      if (!c) return;
      c.classList.remove('down');
      void c.offsetWidth;
      c.classList.add('down');
    },
    true,
  );
}

async function moveTo(page, locator, { click = true, settle = 0.25 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Not visible: ${locator}`);
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 24), { steps: 22 });
  await sleep(settle);
  if (click) {
    await page.mouse.down();
    await sleep(0.06);
    await page.mouse.up();
  }
}

async function scrollBy(page, dy, seconds = 1.2) {
  await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), dy);
  await sleep(seconds);
}

/**
 * Wait for the `done` event of the turn just sent. The trace shows "First token" only after `done`,
 * and clears it when a new turn starts, so wait for it to go away first.
 */
async function waitTurnDone(page) {
  const stat = page.getByText('First token', { exact: true });
  await stat.waitFor({ state: 'hidden', timeout: 15_000 });
  await stat.waitFor({ timeout: 60_000 });
  await sleep(0.6);
}

async function prewarm() {
  await Promise.all([fetch(`${API}/api/scenarios`), fetch(`${API}/api/personas`), fetch(`${API}/api/dashboard`), fetch(`${SITE}/`), fetch(`${SITE}/dashboard`)]);
}

async function run() {
  const headed = process.argv.includes('--headed');
  await prewarm();
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await context.addInitScript(presentationScript, ZOOM);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  await page.goto(`${SITE}/`, { waitUntil: 'networkidle' });
  await page.getByText('Start practicing in one click').waitFor();
  await page.mouse.move(1200, 520);
  const rec = new Recorder(context, page);
  await rec.start();
  let personaId = null;

  try {
    // ---------- Landing ----------
    await sleep(0.8);
    await rec.cue('c02_landing');
    await moveTo(page, page.getByRole('link', { name: 'Try the 3-minute demo' }), { click: false });
    await sleep(2.5);
    await scrollBy(page, 560, 2);
    await rec.quiet(-0.6);

    // ---------- Knowledge ----------
    await moveTo(page, page.getByRole('link', { name: 'Knowledge', exact: true }).first());
    await page.getByText('Retirement Savings Plan brochure').first().waitFor();
    await rec.cue('c03_knowledge');
    await moveTo(page, page.getByText('Code of Conduct').first(), { click: false });
    await rec.quiet(-0.3);

    // ---------- Persona builder ----------
    await moveTo(page, page.getByRole('link', { name: 'Personas', exact: true }).first());
    await moveTo(page, page.getByRole('link', { name: /new persona|create a persona/i }).first());
    await rec.cue('c04_generate');
    await moveTo(page, page.getByRole('button', { name: /Find customers in my documents/ }));
    await moveTo(page, page.getByRole('checkbox', { name: /Retirement Savings Plan brochure/ }));
    await moveTo(page, page.getByRole('checkbox', { name: /Code of Conduct/ }));
    await moveTo(page, page.getByRole('button', { name: /Generate 3 drafts/ }));
    await rec.cut('Gemini persona generation', () => page.getByRole('heading', { name: 'Pick a customer to refine' }).waitFor({ timeout: 150_000 }));
    await sleep(0.4);
    await rec.cue('c05_sources');
    const firstDraft = page.getByRole('radio').first();
    await moveTo(page, firstDraft.getByRole('list', { name: 'Sources' }).getByRole('button').first());
    await sleep(2.2);
    await page.keyboard.press('Escape');
    await rec.quiet(-0.5);
    await moveTo(page, page.getByRole('button', { name: /^Use / }));
    await page.getByRole('button', { name: /Save and approve/ }).waitFor();
    await rec.cue('c06_approve');
    const sources = page.getByRole('complementary', { name: 'Review and save' });
    await moveTo(page, sources.getByRole('list', { name: 'Sources' }).getByRole('button').first());
    await sleep(1.6);
    await page.keyboard.press('Escape');
    await moveTo(page, page.getByRole('checkbox', { name: /I reviewed the sources/ }));
    await moveTo(page, page.getByRole('button', { name: /Save and approve/ }));
    await page.waitForURL((url) => /\/personas\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'), { timeout: 60_000 });
    personaId = page.url().split('/').pop();
    await rec.quiet(-0.4);

    // ---------- Practice: scenario B ----------
    await moveTo(page, page.getByRole('link', { name: 'Scenarios', exact: true }).first());
    await moveTo(page, page.getByRole('button', { name: /^Start practice: Retirement/ }));
    await page.waitForURL(/\/practice\//, { timeout: 60_000 });
    const input = page.getByRole('textbox');
    await input.waitFor();
    await sleep(0.6);
    await rec.cue('c07_open');
    await moveTo(page, input);
    await rec.quiet(-1.5);
    await input.pressSequentially(LINES.guarantee, { delay: TYPE_DELAY });
    await sleep(0.4);
    await page.keyboard.press('Enter');
    const sendAnyway = page.getByRole('button', { name: 'Send anyway' });
    await sendAnyway.waitFor({ timeout: 10_000 }).catch(() => {
      throw new Error('Compliance Guard did not appear (precheck slower than 2.5 s?). Pre-warm and run again.');
    });
    await rec.cue('c08_guard');
    await moveTo(page, page.getByRole('button', { name: 'Edit message' }), { click: false, settle: 1.5 });
    await rec.quiet(-0.2);
    await rec.cue('c09_send_anyway');
    await moveTo(page, sendAnyway);
    await waitTurnDone(page);
    await moveTo(page, page.getByLabel('Coach hints, newest first'), { click: false });
    await rec.quiet(-0.8);

    await moveTo(page, input);
    await input.pressSequentially(LINES.pressure, { delay: TYPE_DELAY });
    await page.keyboard.press('Enter');
    if (await sendAnyway.isVisible({ timeout: 3000 }).catch(() => false)) await moveTo(page, sendAnyway);
    await page.getByRole('list', { name: 'Compliance flags on this message' }).nth(1).waitFor({ timeout: 15_000 });
    await rec.cue('c10_pressure');
    await waitTurnDone(page);
    await rec.quiet(-0.3);

    await rec.cue('c11_honest');
    await moveTo(page, input);
    await input.pressSequentially(LINES.honest, { delay: TYPE_DELAY - 8 });
    await page.keyboard.press('Enter');
    await waitTurnDone(page);
    const lastReply = page.locator('li[id^="turn-"]').last();
    const chip = lastReply.getByRole('list', { name: 'Sources' }).getByRole('button').first();
    if (await chip.count()) {
      await moveTo(page, chip);
      await sleep(1.8);
      await page.keyboard.press('Escape');
    }
    // The pipeline narration plays over a live turn, so the trace fills in on screen.
    await rec.cue('c12_pipeline');
    await moveTo(page, input);
    await input.pressSequentially(LINES.discovery, { delay: TYPE_DELAY - 8 });
    await page.keyboard.press('Enter');
    const pipeline = page.getByRole('heading', { name: 'Gemini pipeline, last turn' });
    // Center the trace card so the burned-in captions do not cover it.
    await pipeline.evaluate((h) => (h.closest('div.rounded-xl') ?? h).scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await sleep(0.9);
    await moveTo(page, pipeline, { click: false, settle: 0 });
    await waitTurnDone(page);
    await rec.quiet(-0.4);

    // ---------- Report ----------
    await rec.cue('c13_end');
    await moveTo(page, page.getByRole('button', { name: 'End session' }));
    await rec.cut('Report generation', async () => {
      await page.waitForURL(/\/reports\//, { timeout: 120_000 });
      await page.getByText(/COMPLIANCE (PASS|FAIL)/).waitFor({ timeout: 120_000 });
    }, { keep: 1.8 });
    await page.mouse.move(700, 300, { steps: 15 });
    await sleep(0.8);
    await rec.cue('c14_gate');
    await moveTo(page, page.getByText(/COMPLIANCE (PASS|FAIL)/), { click: false });
    await rec.quiet(-0.5);
    await rec.cue('c15_evidence');
    await moveTo(page, page.getByRole('button', { name: /Turn \d+ →/ }).first());
    await sleep(3);
    await rec.quiet(-0.4);

    // ---------- Dashboard ----------
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(0.8);
    await moveTo(page, page.getByRole('link', { name: 'Dashboard', exact: true }).first());
    await page.getByText('Practice sessions', { exact: true }).waitFor();
    await sleep(0.4);
    await rec.cue('c16_dashboard');
    await moveTo(page, page.getByText(/Includes sample team data|Ready to go live/).first(), { click: false });
    await sleep(2.2);
    await scrollBy(page, 520, 2.2);
    await scrollBy(page, 520, 2.2);
    await rec.quiet(0.4);
  } finally {
    await rec.stop();
    if (personaId) {
      const res = await fetch(`${API}/api/personas/${personaId}`, { method: 'DELETE' }).catch((e) => e);
      console.log(`cleanup: deleted generated persona ${personaId}:`, res.status ?? res.message);
    }
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
