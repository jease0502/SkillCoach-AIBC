// Composes media/demo.mp4 from the cards, the recorded screencast and the voiceover, and writes
// media/subtitles.srt. Captions and "shortened" labels are burned in.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BUILD, CARDS_DIR, FPS, FRAMES_DIR, HEIGHT, MEDIA, VO_DIR, WIDTH, cues, readJson } from './paths.mjs';

const LIMIT = 179.5;
const durations = readJson(path.join(VO_DIR, 'durations.json'));
const timeline = readJson(path.join(FRAMES_DIR, 'timeline.json'));
const list = cues().cues;
const byId = Object.fromEntries(list.map((c) => [c.id, c]));

const ffmpeg = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd: BUILD, stdio: 'inherit' });
const probe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());

// ---------- Screen recording: wall clock -> video time, with cut ranges removed ----------
const { start, end } = timeline;
const cuts = timeline.cuts.filter((c) => c.end > c.start).sort((a, b) => a.start - b.start);
const toVideo = (t) => {
  const c = Math.min(Math.max(t, start), end);
  let removed = 0;
  for (const cut of cuts) removed += Math.max(0, Math.min(c, cut.end) - cut.start);
  return c - start - removed;
};
const frames = timeline.frames.filter((f) => fs.existsSync(path.join(FRAMES_DIR, f.file))).sort((a, b) => a.t - b.t);
const concat = [];
for (let i = 0; i < frames.length; i++) {
  const a = Math.max(frames[i].t, start);
  const b = i + 1 < frames.length ? frames[i + 1].t : end;
  const d = toVideo(b) - toVideo(a);
  if (d > 0.0005) concat.push(`file 'frames/${frames[i].file}'\nduration ${d.toFixed(4)}`);
}
concat.push(`file 'frames/${frames.at(-1).file}'`);
fs.writeFileSync(path.join(BUILD, 'frames.txt'), concat.join('\n'));
const screenDur = toVideo(end);
console.log(`screen: ${screenDur.toFixed(1)} s after removing ${cuts.length} cut(s)`);
ffmpeg(['-f', 'concat', '-safe', '0', '-i', 'frames.txt', '-vf', `scale=${WIDTH}:${HEIGHT}:flags=lanczos,fps=${FPS},format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', 'screen.mp4']);

// ---------- Cards ----------
const LEAD_IN = 0.8;
const card = (name, cueId, tail) => ({ name, cueId, dur: LEAD_IN + durations[cueId] + tail });
const title = card('title', 'c01_title', 0.9);
const arch = card('arch', 'c17_arch', 0.8);
const endCard = card('end', 'c18_end', 2.6);
for (const c of [title, arch, endCard]) {
  ffmpeg([
    '-loop', '1', '-framerate', String(FPS), '-t', c.dur.toFixed(3), '-i', path.join(CARDS_DIR, `${c.name}.png`),
    '-vf', `fade=t=in:st=0:d=0.4,fade=t=out:st=${(c.dur - 0.4).toFixed(3)}:d=0.4,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-r', String(FPS), `card-${c.name}.mp4`,
  ]);
}

// ---------- Voiceover placement ----------
const screenAt = title.dur;
const archAt = screenAt + screenDur;
const endAt = archAt + arch.dur;
const total = endAt + endCard.dur;
const placed = [
  { id: 'c01_title', at: LEAD_IN },
  ...timeline.marks.map((m) => ({ id: m.id, at: screenAt + toVideo(m.t) })),
  { id: 'c17_arch', at: archAt + LEAD_IN },
  { id: 'c18_end', at: endAt + LEAD_IN },
];

// ---------- Captions (SRT for delivery, ASS for burn-in) ----------
function chunks(text) {
  const sentences = text.match(/[^.!?:]+[.!?:]+(\s|$)|[^.!?:]+$/g).map((s) => s.trim());
  const out = [];
  for (const s of sentences) {
    if (s.length <= 90) {
      out.push(s);
      continue;
    }
    const words = s.split(' ');
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > 80 && line) {
        out.push(line.trim());
        line = '';
      }
      line += ' ' + w;
    }
    if (line.trim()) out.push(line.trim());
  }
  return out;
}
const captions = [];
for (const p of placed) {
  const parts = chunks(byId[p.id].text);
  const chars = parts.reduce((a, s) => a + s.length, 0);
  let t = p.at;
  for (const s of parts) {
    const d = (durations[p.id] * s.length) / chars;
    captions.push({ from: t, to: t + d, text: s });
    t += d;
  }
}
const stamp = (s, sep) => {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`;
};
fs.writeFileSync(path.join(MEDIA, 'subtitles.srt'), captions.map((c, i) => `${i + 1}\n${stamp(c.from, ',')} --> ${stamp(c.to, ',')}\n${c.text}\n`).join('\n'));

const assTime = (s) => {
  const cs = Math.round(s * 100);
  return `${Math.floor(cs / 360000)}:${String(Math.floor((cs % 360000) / 6000)).padStart(2, '0')}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
const notes = cuts.map((c) => ({ from: screenAt + toVideo(c.start), to: screenAt + toVideo(c.start) + 2.6, text: `⏩ ${c.label}` }));
fs.writeFileSync(
  path.join(BUILD, 'captions.ass'),
  [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${WIDTH}`,
    `PlayResY: ${HEIGHT}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Caption,Segoe UI,46,&H00FFFFFF,&H00FFFFFF,&H60111827,&H60111827,1,0,0,0,100,100,0,0,3,14,0,2,200,200,46,1',
    'Style: Note,Segoe UI,34,&H00FFFFFF,&H00FFFFFF,&H30C53030,&H30C53030,1,0,0,0,100,100,0,0,3,12,0,9,60,60,110,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...captions.map((c) => `Dialogue: 0,${assTime(c.from)},${assTime(c.to)},Caption,,0,0,0,,${c.text}`),
    ...notes.map((n) => `Dialogue: 1,${assTime(n.from)},${assTime(n.to)},Note,,0,0,0,,${n.text}`),
  ].join('\n'),
);

// ---------- Final mix ----------
const inputs = ['-i', 'card-title.mp4', '-i', 'screen.mp4', '-i', 'card-arch.mp4', '-i', 'card-end.mp4'];
const audio = [];
placed.forEach((p, i) => {
  inputs.push('-i', path.join(VO_DIR, `${p.id}.wav`));
  const ms = Math.round(p.at * 1000);
  audio.push(`[${i + 4}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`);
});
const filter = [
  '[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[cat]',
  '[cat]subtitles=captions.ass[v]',
  ...audio,
  `${placed.map((_, i) => `[a${i}]`).join('')}amix=inputs=${placed.length}:normalize=0:dropout_transition=0,apad,atrim=0:${total.toFixed(3)}[a]`,
].join(';');
const out = path.join(MEDIA, 'demo.mp4');
ffmpeg([
  ...inputs,
  '-filter_complex', filter,
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
  out,
]);

// Overlap check: a cue that starts before the previous one ends means the recording ran ahead of the voice.
const sorted = [...placed].sort((a, b) => a.at - b.at);
for (let i = 1; i < sorted.length; i++) {
  const prevEnd = sorted[i - 1].at + durations[sorted[i - 1].id];
  if (sorted[i].at < prevEnd - 0.05) console.warn(`WARNING: ${sorted[i].id} overlaps ${sorted[i - 1].id} by ${(prevEnd - sorted[i].at).toFixed(2)} s`);
}
const final = probe(out);
const voice = readJson(path.join(VO_DIR, 'source.json'));
console.log(`demo.mp4: ${final.toFixed(1)} s (${Math.floor(final / 60)}:${String(Math.round(final % 60)).padStart(2, '0')}), voice: ${voice.engine}`);
if (final > LIMIT) console.warn(`WARNING: longer than ${LIMIT} s`);
