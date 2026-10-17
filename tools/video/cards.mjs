// Renders the title, architecture and end cards to 1920x1080 PNGs in media/build/cards/.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { CARDS_DIR, HEIGHT, SITE, WIDTH } from './paths.mjs';

const REPO = process.env.SKILLCOACH_REPO ?? 'github.com/jease0502/SkillCoach-AIBC';

const logo = (size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#4f46e5"/><g fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" transform="translate(4 4)"><path d="M4 5h11a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H9l-4 3v-3.5A3 3 0 0 1 4 13z"/><path d="m8.5 10.5 2 2 4-4"/></g></svg>`;

const base = (body) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
body{width:${WIDTH}px;height:${HEIGHT}px;font-family:Inter,system-ui,sans-serif;color:#0f172a;background:#f8fafc;overflow:hidden;position:relative}
.glow{position:absolute;inset:0;background:radial-gradient(55% 60% at 85% 0%,#e0e7ff,transparent 70%),radial-gradient(40% 50% at 0% 100%,#eef2ff,transparent 70%)}
.wrap{position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 160px}
.eyebrow{display:inline-flex;align-items:center;gap:12px;font-size:26px;font-weight:600;color:#3730a3;background:#eef2ff;border:2px solid #c7d2fe;border-radius:999px;padding:10px 24px;width:max-content}
h1{font-size:120px;font-weight:800;letter-spacing:-.03em;line-height:1}
.tag{font-size:54px;font-weight:700;letter-spacing:-.02em;line-height:1.15}
.tag span{color:#4338ca}
.muted{color:#475569}
.mono{font-family:'JetBrains Mono',monospace}
.box{background:#fff;border:2px solid #e2e8f0;border-radius:24px;box-shadow:0 10px 30px -12px rgba(15,23,42,.18)}
</style></head><body><div class="glow"></div>${body}</body></html>`;

const cards = {
  title: base(`<div class="wrap" style="gap:40px">
    <div style="display:flex;align-items:center;gap:32px">${logo(120)}<h1>SkillCoach</h1></div>
    <p class="tag">Practice the conversation <span>before it counts.</span></p>
    <p style="font-size:34px" class="muted">AI role-play coach for customer-facing teams, grounded in your own knowledge.</p>
    <div class="eyebrow">AI Builder Cup 2026 &middot; Future of Work &middot; Built with Gemini on Google Cloud</div>
  </div>`),

  arch: base(`<div class="wrap" style="gap:44px;padding:0 120px">
    <p style="font-size:30px;font-weight:600;color:#4338ca">Architecture</p>
    <div style="display:grid;grid-template-columns:1fr 1.05fr 1.5fr;gap:36px;align-items:stretch">
      <div class="box" style="padding:36px">
        <p style="font-size:24px;font-weight:600" class="muted">Firebase Hosting &rarr; Cloud Run</p>
        <p style="font-size:40px;font-weight:700;margin-top:10px">Next.js web app</p>
        <p style="font-size:26px;margin-top:18px" class="muted">Practice, Compliance Guard, reports, manager view. Streamed replies over SSE.</p>
      </div>
      <div class="box" style="padding:36px">
        <p style="font-size:24px;font-weight:600" class="muted">Cloud Run &middot; asia-east1</p>
        <p style="font-size:40px;font-weight:700;margin-top:10px">FastAPI backend</p>
        <p style="font-size:26px;margin-top:18px" class="muted">Retrieval with gemini-embedding-001. Evidence verification. Compliance gate.</p>
        <p style="font-size:26px;margin-top:18px;font-weight:600">Firestore: documents, personas, sessions, reports</p>
      </div>
      <div class="box" style="padding:36px;border-color:#c7d2fe">
        <p style="font-size:24px;font-weight:600;color:#4338ca">Vertex AI &middot; 7 Gemini agent roles</p>
        <table style="margin-top:16px;font-size:27px;border-collapse:collapse;width:100%">
          ${[
            ['Persona builder', 'Gemini 4 Argon'],
            ['Customer persona', 'Gemini 4 Argon'],
            ['Report scorer', 'Gemini 4 Argon'],
            ['Compliance judge', 'Gemini 3.5 Flash-Lite'],
            ['Grounding check', 'Gemini 3.5 Flash-Lite'],
            ['Trust & patience', 'Gemini 3.5 Flash-Lite'],
            ['Coach', 'Gemini 3.5 Flash-Lite'],
          ]
            .map(([r, m]) => `<tr><td style="padding:7px 0;font-weight:600">${r}</td><td style="padding:7px 0;text-align:right" class="muted">${m}</td></tr>`)
            .join('')}
        </table>
      </div>
    </div>
    <p style="font-size:30px" class="muted">Every reply cites its source. Every score quotes the transcript. One high-risk violation fails the session.</p>
  </div>`),

  end: base(`<div class="wrap" style="gap:44px;align-items:center;text-align:center">
    <div style="display:flex;align-items:center;gap:28px">${logo(96)}<h1 style="font-size:96px">SkillCoach</h1></div>
    <p class="tag">Practice the conversation <span>before it counts.</span></p>
    <div class="box" style="padding:32px 48px;display:flex;flex-direction:column;gap:18px;font-size:32px">
      <p><span class="muted">Try it live</span>&nbsp;&nbsp;<span class="mono" style="font-weight:500">${SITE.replace(/^https?:\/\//, '')}</span></p>
      <p><span class="muted">Source</span>&nbsp;&nbsp;<span class="mono" style="font-weight:500">${REPO}</span></p>
    </div>
    <div class="eyebrow">AI Builder Cup 2026 &middot; Future of Work</div>
  </div>`),
};

fs.mkdirSync(CARDS_DIR, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
for (const [name, html] of Object.entries(cards)) {
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(CARDS_DIR, `${name}.png`) });
  console.log('card', name);
}
await browser.close();
