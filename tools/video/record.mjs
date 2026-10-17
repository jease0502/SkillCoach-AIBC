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
import { execFileSync } from 'node:child_process';
import { API, BUILD, FRAMES_DIR, HEIGHT, SITE, WIDTH, cueDurations, writeJson } from './paths.mjs';

// Character voices for the dialogue (Cloud Text-to-Speech, Chirp 3 HD), as in the app.
const VOICES = { trainee: 'Despina', customer: 'Algenib' };
const DIALOGUE_DIR = path.join(BUILD, 'dialogue');

async function tts(text, voice, file) {
  const token = process.env.GOOGLE_ACCESS_TOKEN;
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!token || !project) throw new Error('Set GOOGLE_ACCESS_TOKEN and GOOGLE_CLOUD_PROJECT for the dialogue voices');
  const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': project, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'en-US', name: `en-US-Chirp3-HD-${voice}` },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
    }),
  });
  if (!res.ok) throw new Error(`Text-to-Speech failed: ${res.status} ${await res.text()}`);
  fs.writeFileSync(file, Buffer.from((await res.json()).audioContent, 'base64'));
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());
}

/** The first sentence or two of a reply, so the dialogue stays short in the video. */
function opening(text, max = 150) {
  const sentences = text.match(/[^.!?]+[.!?]+["')]*\s*/g) ?? [text];
  let out = '';
  for (const sentence of sentences) {
    if (out && (out + sentence).length > max) break;
    out += sentence;
    if (out.length >= 60) break;
  }
  return out.trim() || text.slice(0, max);
}

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
    this.dialogue = [];
    this.voiceEnd = 0;
  }

  /** Speak a line in a character voice now (after any narration), and hold the next cue until it ends. */
  async say(role, text) {
    await this.quiet();
    fs.mkdirSync(DIALOGUE_DIR, { recursive: true });
    const file = path.join(DIALOGUE_DIR, `d${String(this.dialogue.length).padStart(2, '0')}-${role}.wav`);
    const dur = await tts(text, VOICES[role], file);
    const t = now();
    this.dialogue.push({ file, t, dur, role, text });
    this.voiceEnd = t + dur + CUE_GAP;
    console.log(`  ${role} says (${dur.toFixed(1)} s): ${text}`);
    return dur;
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
    writeJson(path.join(FRAMES_DIR, 'timeline.json'), { start: this.t0, end: now(), frames: this.frames, marks: this.marks, cuts: this.cuts, dialogue: this.dialogue });
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
  // Software WebGL so the 3D customer avatar renders in headless Chromium.
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
  // A sample trainee camera feed for the live-call beat (see README: FAKE_CAMERA).
  if (process.env.FAKE_CAMERA) args.push(`--use-file-for-fake-video-capture=${process.env.FAKE_CAMERA}`);
  const browser = await chromium.launch({ headless: !headed, args });
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, permissions: ['camera', 'microphone'] });
  await context.addInitScript(presentationScript, ZOOM);
  // Headless Chromium has no speech service: replace recognition with a stub that never hears anything.
  await context.addInitScript(() => {
    class SilentRecognition {
      start() {}
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }
    window.webkitSpeechRecognition = SilentRecognition;
    window.SpeechRecognition = SilentRecognition;
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (e) => console.log('pageerror:', e.message, (e.stack || '').split(/\n/).slice(0, 5).join(' | ')));

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
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(0.6);
    await moveTo(page, page.getByRole('link', { name: 'Sign in' }));
    await moveTo(page, page.getByRole('button', { name: 'Continue as guest' }));
    await page.getByRole('link', { name: /Guest/ }).waitFor({ timeout: 20_000 });
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
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(0.6);
    await moveTo(page, page.getByRole('link', { name: 'Scenarios', exact: true }).first());
    await moveTo(page, page.getByRole('button', { name: /^Start practice: Retirement/ }));
    await page.waitForURL(/\/practice\//, { timeout: 60_000 });
    const sessionId = page.url().split('/').pop();
    const lastCustomerLine = async () => {
      const s = await (await fetch(`${API}/api/sessions/${sessionId}`)).json();
      return [...s.turns].reverse().find((t) => t.role === 'customer')?.text ?? '';
    };
    const input = page.getByRole('textbox');
    await input.waitFor();
    await sleep(0.6);
    await rec.cue('c07_open');
    await rec.say('customer', await lastCustomerLine());
    await moveTo(page, input);
    await rec.say('trainee', LINES.guarantee);
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
    await rec.say('customer', opening(await lastCustomerLine()));
    await moveTo(page, page.getByLabel('Coach hints, newest first'), { click: false });
    await rec.quiet(-0.8);

    await rec.cue('c11_honest');
    await moveTo(page, input);
    await rec.say('trainee', LINES.honest);
    await input.pressSequentially(LINES.honest, { delay: TYPE_DELAY - 8 });
    await page.keyboard.press('Enter');
    await waitTurnDone(page);
    await rec.say('customer', opening(await lastCustomerLine()));
    const lastReply = page.locator('li[id^="turn-"]').last();
    const chip = lastReply.getByRole('list', { name: 'Sources' }).getByRole('button').first();
    if (await chip.count()) {
      await moveTo(page, chip);
      await sleep(1.8);
      await page.keyboard.press('Escape');
    }
    // ---------- Live call: camera, virtual background, on-device expression cues ----------
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(0.5);
    await moveTo(page, page.getByRole('switch', { name: /Live call/ }));
    await page.getByRole('img', { name: 'Your camera' }).waitFor({ timeout: 30_000 });
    await rec.cue('c11b_live');
    await moveTo(page, page.getByRole('radio', { name: 'Branch' }));
    await page.waitForFunction(() => document.body.innerText.includes('Expression now'), null, { timeout: 60_000 }).catch(() => {});
    await moveTo(page, page.getByRole('heading', { name: 'Camera and expression' }), { click: false, settle: 1.5 });
    await rec.quiet(-0.4);

    // The pipeline narration plays over a live turn, so the trace fills in on screen.
    await moveTo(page, input);
    await rec.say('trainee', LINES.discovery);
    await input.pressSequentially(LINES.discovery, { delay: TYPE_DELAY - 8 });
    await page.keyboard.press('Enter');
    await rec.cue('c12_pipeline');
    const pipeline = page.getByRole('heading', { name: 'Gemini pipeline, last turn' });
    // Center the trace card so the burned-in captions do not cover it.
    await pipeline.evaluate((h) => (h.closest('div.rounded-xl') ?? h).scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await sleep(0.9);
    await moveTo(page, pipeline, { click: false, settle: 0 });
    await waitTurnDone(page);
    await rec.say('customer', opening(await lastCustomerLine()));
    const deliveryCard = page.getByRole('heading', { name: 'Your delivery on camera' });
    await page.getByText(/Expression:/).waitFor({ timeout: 20_000 }).catch(() => {});
    await deliveryCard.evaluate((h) => (h.closest('div.rounded-xl') ?? h).scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await sleep(1.2);
    await moveTo(page, deliveryCard, { click: false, settle: 1.2 });
    await rec.quiet(-0.4);
    await page.getByRole('switch', { name: /End live call/ }).click();

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
  } catch (err) {
    await page.screenshot({ path: path.join(FRAMES_DIR, 'failure.png') }).catch(() => {});
    throw err;
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
