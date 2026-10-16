import { clsx, type ClassValue } from 'clsx';
import type { Severity } from './types';

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export function formatDate(iso: string, withTime = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : { year: 'numeric' }),
  });
}

export function initials(name: string): string {
  return name
    .replace(/^(mr|mrs|ms|dr)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

const avatarPalette = [
  'bg-indigo-100 text-indigo-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-900',
  'bg-sky-100 text-sky-800',
  'bg-rose-100 text-rose-800',
  'bg-violet-100 text-violet-800',
];

export function avatarClass(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return avatarPalette[h % avatarPalette.length];
}

export type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'brand';

export function scoreTone(score: number | null | undefined): Tone {
  if (score == null) return 'neutral';
  if (score >= 80) return 'good';
  if (score >= 60) return 'warn';
  return 'bad';
}

export function scoreLabel(score: number | null | undefined): string {
  const t = scoreTone(score);
  return t === 'good' ? 'Strong' : t === 'warn' ? 'Developing' : t === 'bad' ? 'Needs work' : 'Not scored';
}

export const severityTone: Record<Severity, Tone> = { high: 'bad', medium: 'warn', low: 'neutral' };

export function newId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 7)}`;
}

export function difficultyLabel(n: number): string {
  return ['Very easy', 'Easy', 'Moderate', 'Hard', 'Expert'][Math.max(0, Math.min(4, n - 1))];
}
