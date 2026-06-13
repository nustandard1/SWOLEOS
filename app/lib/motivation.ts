// SWOLE/OS — load-screen motivation. Quotes + pro-tips shown briefly on app open.
// Roughly 1:1 quotes-to-tips so it stays interesting and occasionally useful.
// Add freely over time.

export interface Quote { text: string; author?: string; }

export const QUOTES: Quote[] = [
  { text: 'Build a body that commands respect.' },
  { text: 'No excuses. Just execution.' },
  { text: 'Quiet mouth. Loud weights.' },
  { text: 'Outwork your self-doubt.' },
  { text: 'Today, you are the hammer.' },
  { text: "Don't ask for a lighter burden — ask for broader shoulders." },
  { text: 'Violence of action.' },
  { text: 'Build. Dominate. Repeat.' },
  { text: 'You win in the dark, and shine in the light.' },
  { text: 'Be all in, or get the hell out.' },
  { text: 'There is no comfort in growth.' },
  { text: 'The iron will never lie to you.' },
  { text: 'Suffer today. Swole tomorrow.' },
  { text: 'The iron offers no shortcuts.' },
  { text: 'Beat the logbook.', author: 'Dante Trudel' },
  { text: 'The body will not grow unless it has a reason to.', author: 'Lee Haney' },
  { text: 'Progressive overload is the absolute law of muscle growth.' },
  { text: "I don't know where 85 or 90% is. I only know 0 and 100.", author: 'Dorian Yates' },
  { text: "Success isn't owed — it's leased, and the rent's due every single day.", author: 'Dorian Yates' },
  { text: 'You can have results, or excuses. Not both.', author: 'Arnold' },
  { text: "Resilience isn't magic — it's reps.", author: 'Josh Bryant' },
  { text: 'Strength is a skill — perfect reps, repeated relentlessly.', author: 'Josh Bryant' },
  { text: "You don't get bonus points for being tired, hungry, or wet.", author: 'Josh Bryant' },
  { text: 'The biggest, strongest dudes in the world log their training. For a reason.' },
  { text: 'The body reflects repeated behavior. So does the mind. So does your logbook…' },
  { text: 'Most people overestimate what they can do in a year and underestimate what they can do in ten.', author: 'Fred Hatfield' },
  { text: 'Intensity builds immensity.', author: 'Dorian Yates' },
  { text: 'The lesson is in the logbook.' },
  { text: 'The purpose of training is adaptation, not entertainment.' },
  { text: 'Sweat more in peace, bleed less in war.' },
  { text: 'The strength of the wolf is the pack. The strength of the pack is the wolf.' },
  { text: 'True character is revealed under load.' },
  { text: 'Waiting for motivation is a plan that never works.' },
  { text: 'Chase performance, not fatigue.', author: 'Christian Thibaudeau' },
];

export const PRO_TIPS: string[] = [
  'Mechanical tension drives muscle growth. The closer to true failure, the more tension.',
  'Build your own program from a template split in the TRAIN tab.',
  "Numbers don't lie. You're either getting stronger, or you aren't.",
  'The big 5 that matter: intensity, volume, frequency, consistency, exercise selection.',
  'A working set is RPE 8+. Junk volume below that barely counts.',
  'Double progression: beat the top of your rep range, then add load and reset.',
  'The logbook is your coach when no coach is present.',
  'Progression targets are listed in the logger. They are guides, not absolutes.',
  'Use the Intelligence tab to get deep insights into your training and physique.',
  'What levers can you pull? Volume, intensity, frequency.',
  "If performance isn't improving, something needs to change.",
  'Most plateaus are recovery problems disguised as training problems.',
  "Strong lifters don't guess. They track, analyze, assess and tweak — relentlessly.",
  'The biggest, strongest lifters in the world still use the big basic lifts. What do you think you should be doing?',
  'Volume and intensity are tools. Recovery determines how much of them you can use.',
  'The logbook should trend upward over months, not days.',
  'Get a body-comp scale and connect Apple Health for the most in-depth metrics.',
  "The body doesn't recognize exercises. It recognizes tension.",
];

export type Motivation =
  | { kind: 'quote'; text: string; author?: string }
  | { kind: 'tip'; text: string };

// ── Remote quotes (Supabase `motivation_quotes`) ─────────────────────────────
// Mike can add quotes/tips anytime from the dashboard — no app update. Remote rows
// EXTEND the bundled pools (never replace; the app always works offline). Cached in
// AsyncStorage so launches after the first pick from the freshest known set.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

let quotePool: Quote[] = [...QUOTES];
let tipPool: string[] = [...PRO_TIPS];
const CACHE_KEY = 'swoleos.motivation.v1';

function applyRows(rows: any[]) {
  const q: Quote[] = [];
  const t: string[] = [];
  for (const r of rows || []) {
    if (!r?.text) continue;
    if (r.kind === 'tip') t.push(r.text);
    else q.push({ text: r.text, author: r.author || undefined });
  }
  if (q.length) quotePool = [...QUOTES, ...q];
  if (t.length) tipPool = [...PRO_TIPS, ...t];
}

// Hydrate at import: cache first (instant), then network (freshens the cache).
(async () => {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) applyRows(JSON.parse(cached));
  } catch (e) { /* cache unreadable — bundled pool stands */ }
  try {
    const { data } = await supabase.from('motivation_quotes').select('kind, text, author').eq('active', true);
    if (data && data.length) {
      applyRows(data);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)).catch(() => {});
    }
  } catch (e) { /* offline — bundled/cached pool stands */ }
})();

// Pick a quote or a tip (~1:1). Caller passes a seed (e.g. Date.now()) so the
// app layer controls randomness — deterministic given seed + current pool.
export function pickMotivation(seed: number): Motivation {
  const useTip = seed % 2 === 0;
  if (useTip) {
    const tip = tipPool[Math.floor(seed / 2) % tipPool.length];
    return { kind: 'tip', text: tip };
  }
  const q = quotePool[Math.floor(seed / 2) % quotePool.length];
  return { kind: 'quote', text: q.text, author: q.author };
}
