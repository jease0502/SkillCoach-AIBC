import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(TOOL_DIR, '..', '..');
export const MEDIA = path.join(ROOT, 'media');
export const BUILD = path.join(MEDIA, 'build');
export const VO_DIR = path.join(BUILD, 'vo');
export const FRAMES_DIR = path.join(BUILD, 'frames');
export const CARDS_DIR = path.join(BUILD, 'cards');

export const SITE = process.env.SKILLCOACH_WEB ?? 'https://skillcoach-aibc.web.app';
export const API = process.env.SKILLCOACH_API ?? 'https://skillcoach-api-506140624406.asia-east1.run.app';
export const REPO_URL = process.env.SKILLCOACH_REPO ?? '';

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;

export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export const writeJson = (p, v) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2));
};
export const cues = () => readJson(path.join(TOOL_DIR, 'cues.json'));

/** Seconds of audio per cue, from the synthesized voiceover, or a words-per-second estimate. */
export function cueDurations() {
  const file = path.join(VO_DIR, 'durations.json');
  if (fs.existsSync(file)) return readJson(file);
  const out = {};
  for (const c of cues().cues) out[c.id] = c.text.split(/\s+/).length / 2.5 + 0.3;
  return out;
}
