// Synthesizes the voiceover, one WAV per cue, and records each cue's duration.
//
//   node synth.mjs           Google Cloud Text-to-Speech (needs gcloud auth, see README)
//   node synth.mjs --draft   Offline draft voice (Windows SAPI) for timing tests only
//
// Options: --voice en-US-Neural2-J   --rate 1.05   --only c08_guard,c09_send_anyway
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { MEDIA, VO_DIR, cues, writeJson } from './paths.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const draft = args.includes('--draft');
const { cues: list, voice: defaultVoice, speakingRate: defaultRate } = cues();
const voice = flag('--voice') ?? defaultVoice;
const rate = Number(flag('--rate') ?? defaultRate ?? 1);
const only = flag('--only')?.split(',');

fs.mkdirSync(VO_DIR, { recursive: true });

// voiceover.txt is the human-readable script, kept next to the video.
fs.writeFileSync(
  path.join(MEDIA, 'voiceover.txt'),
  [
    'SkillCoach demo video: voiceover script (en-US)',
    `Voice: ${voice}, speaking rate ${rate}. One paragraph per cue, in order.`,
    '',
    ...list.map((c) => `[${c.id}]\n${c.text}\n`),
  ].join('\n'),
);

const probeSeconds = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());

function gcloud(argv) {
  return execFileSync('gcloud', argv, { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
}

async function synthGoogle(todo) {
  const token = process.env.GOOGLE_ACCESS_TOKEN ?? gcloud(['auth', 'print-access-token']);
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? gcloud(['config', 'get-value', 'project']);
  for (const c of todo) {
    const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': project, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        input: { text: c.text },
        voice: { languageCode: 'en-US', name: voice },
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate: rate },
      }),
    });
    if (!res.ok) throw new Error(`Text-to-Speech failed for ${c.id}: ${res.status} ${await res.text()}`);
    const { audioContent } = await res.json();
    fs.writeFileSync(path.join(VO_DIR, `${c.id}.wav`), Buffer.from(audioContent, 'base64'));
    console.log('voiced', c.id);
  }
}

function synthDraft(todo) {
  const jobs = path.join(VO_DIR, 'draft-jobs.json');
  fs.writeFileSync(jobs, JSON.stringify(todo.map((c) => ({ text: c.text, out: path.join(VO_DIR, `${c.id}.wav`) }))));
  const ps = path.join(VO_DIR, 'draft.ps1');
  fs.writeFileSync(
    ps,
    [
      'Add-Type -AssemblyName System.Speech',
      `$jobs = Get-Content -Raw -Encoding UTF8 '${jobs}' | ConvertFrom-Json`,
      'foreach ($j in $jobs) {',
      '  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      '  $s.Rate = 1',
      '  $s.SetOutputToWaveFile($j.out)',
      '  $s.Speak($j.text)',
      '  $s.Dispose()',
      '}',
    ].join('\r\n'),
  );
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps], { stdio: 'inherit' });
}

const todo = list.filter((c) => !only || only.includes(c.id));
if (draft) synthDraft(todo);
else await synthGoogle(todo);

const durations = {};
for (const c of list) {
  const file = path.join(VO_DIR, `${c.id}.wav`);
  if (fs.existsSync(file)) durations[c.id] = Math.round(probeSeconds(file) * 1000) / 1000;
}
writeJson(path.join(VO_DIR, 'durations.json'), durations);
writeJson(path.join(VO_DIR, 'source.json'), { engine: draft ? 'draft (Windows SAPI)' : `Google Cloud TTS ${voice}`, rate });
const total = Object.values(durations).reduce((a, b) => a + b, 0);
console.log(`${Object.keys(durations).length} cues, ${total.toFixed(1)} s of speech (${draft ? 'draft voice' : voice})`);
