import type { Persona } from './types';

/**
 * 3D customer avatars: Microsoft Rocketbox characters (MIT licence) exported to VRM 1.0
 * and slimmed for the web by tools/avatars/slim_vrm.py. Files live in public/avatars/.
 */
const MODELS = {
  youngMan: 'Male_Adult_10',
  youngWoman: 'Female_Adult_03',
  man: 'Business_Male_02',
  woman: 'Business_Female_03',
  middleAgedWoman: 'Business_Female_03_40',
  olderMan: 'Business_Male_02_65',
  olderWoman: 'Business_Female_03_65',
} as const;

/** Seed personas name a preset in `avatar`. */
const PRESETS: Record<string, string> = {
  'preset-retiree': MODELS.olderMan,
  'preset-executive': MODELS.middleAgedWoman,
  'preset-casual': MODELS.youngMan,
};

/** Guess presentation from pronouns in the persona text; personas have no gender field. */
function looksFemale(p: Persona): boolean {
  const text = ` ${[p.summary, p.communication_style, ...(p.hidden_needs ?? []), ...(p.goals ?? [])].join(' ')} `.toLowerCase();
  const she = (text.match(/\b(she|her|hers|herself|mrs|ms)\b/g) ?? []).length;
  const he = (text.match(/\b(he|him|his|himself|mr)\b/g) ?? []).length;
  if (she !== he) return she > he;
  return /^(ms|mrs|miss)\.?\s/i.test(p.name);
}

export function avatarModelUrl(p: Persona): string {
  const preset = p.avatar ? PRESETS[p.avatar] : undefined;
  if (preset) return `/avatars/${preset}.vrm`;
  const female = looksFemale(p);
  const age = p.age ?? 40;
  let model: string;
  if (age < 33) model = female ? MODELS.youngWoman : MODELS.youngMan;
  else if (age < 55) model = female ? MODELS.middleAgedWoman : MODELS.man;
  else model = female ? MODELS.olderWoman : MODELS.olderMan;
  return `/avatars/${model}.vrm`;
}

export type AvatarMood = 'neutral' | 'happy' | 'relaxed' | 'angry' | 'sad' | 'surprised';

/** Facial mood from the customer-state meters and the last change. */
export function moodFromMeters(trust: number, patience: number, trustDelta?: number): AvatarMood {
  if (trustDelta !== undefined && trustDelta <= -8) return patience < 40 ? 'angry' : 'surprised';
  if (patience < 30) return 'angry';
  if (trust < 25) return 'sad';
  if (trust >= 70) return 'happy';
  if (trust >= 50) return 'relaxed';
  return 'neutral';
}
