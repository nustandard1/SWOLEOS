// @ts-nocheck
// SWOLE OS — Apple Health (HealthKit) data layer.
// Wraps @kingstinct/react-native-healthkit. The native module ONLY exists in a real
// build (dev/preview/production) — it's absent in Expo Go — so everything here is
// lazily required and fully guarded: in Expo Go (or on Android) it just no-ops and
// reports "unavailable" instead of crashing. Feeds bodyComp.ts.
import { Platform } from 'react-native';

let HK = null; // null = not yet tried, false = unavailable, object = the module
function hk() {
  if (HK !== null) return HK;
  try { HK = require('@kingstinct/react-native-healthkit'); } catch (e) { HK = false; }
  return HK;
}

export function isHealthAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  const k = hk();
  try { return !!(k && k.isHealthDataAvailable && k.isHealthDataAvailable()); } catch (e) { return false; }
}

// Read-only access — body composition + recovery signals.
const READ_TYPES = [
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierLeanBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKCategoryTypeIdentifierSleepAnalysis',
];

// Prompts the iOS Health permission sheet. Returns true if the call went through.
// (HealthKit never tells you what the user granted — you just read and see what comes back.)
export async function requestHealthPermissions(): Promise<boolean> {
  const k = hk();
  if (!k || !isHealthAvailable()) return false;
  try {
    await k.requestAuthorization({ toRead: READ_TYPES });
    // Mark that the user has been through the connect flow (HealthKit never reports what
    // was granted) — lets the Home onboarding stop nudging "Sync Apple Health".
    try { require('@react-native-async-storage/async-storage').default.setItem('swoleos_health_connected', 'true'); } catch (e) { /* ignore */ }
    return true;
  } catch (e) { return false; }
}

async function quantitySeries(identifier, unit) {
  const k = hk();
  if (!k || !k.queryQuantitySamples) return [];
  const run = async (u) => {
    const opts: any = { limit: 500 };
    if (u) opts.unit = u;
    const samples = await k.queryQuantitySamples(identifier, opts);
    return (samples || [])
      .map((s) => ({ date: new Date(s.startDate).getTime(), value: s.quantity }))
      .filter((x) => x.value != null && !Number.isNaN(x.value));
  };
  // Try the preferred unit; if that unit string isn't accepted, fall back to default
  // units rather than returning nothing (we'd rather have data than a silent blank).
  try { return await run(unit); }
  catch (e) { try { return await run(undefined); } catch (e2) { return []; } }
}

// Body-comp series for bodyComp.ts. Weight/lean in lbs; body fat normalized to %.
export async function getBodyMetrics() {
  if (!isHealthAvailable()) return { weight: [], leanMass: [], bodyFat: [] };
  const [weight, leanMass, bfRaw] = await Promise.all([
    quantitySeries('HKQuantityTypeIdentifierBodyMass', 'lb'),
    quantitySeries('HKQuantityTypeIdentifierLeanBodyMass', 'lb'),
    quantitySeries('HKQuantityTypeIdentifierBodyFatPercentage', undefined), // default = fraction 0–1
  ]);
  const bodyFat = bfRaw.map((s) => ({ date: s.date, value: s.value <= 1 ? s.value * 100 : s.value }));
  // Most smart scales write WEIGHT + BODY FAT % but NOT a discrete "Lean Body Mass"
  // entry. When the direct metric is absent, derive it: lean = weight × (1 − bf%).
  // (That's the textbook definition of fat-free mass — same thing HealthKit stores
  // when a scale does write it.)
  const lean = (leanMass && leanMass.length) ? leanMass : deriveLean(weight, bodyFat);
  return { weight, leanMass: lean, bodyFat };
}

// Pair each weight reading with the nearest body-fat reading (same day-ish) and
// compute lean mass. Scales usually log weight + body fat together, so timestamps line up.
export function deriveLean(weight, bodyFat) {
  if (!weight?.length || !bodyFat?.length) return [];
  const fats = [...bodyFat].sort((a, b) => a.date - b.date);
  const out = [];
  for (const w of weight) {
    let best = null, bestD = Infinity;
    for (const f of fats) { const d = Math.abs(f.date - w.date); if (d < bestD) { bestD = d; best = f; } }
    if (best && bestD <= 1.5 * 86400000 && best.value > 0 && best.value < 75) {
      const lean = w.value * (1 - best.value / 100);
      if (lean > 0) out.push({ date: w.date, value: lean });
    }
  }
  return out;
}

// SleepAnalysis is CATEGORY data (not quantity). Defensive: any API/shape mismatch →
// empty, so the engine just degrades (sleep is confirmatory-only). NEEDS ON-DEVICE
// VERIFICATION of the value enums across iOS versions.
async function categorySamples(identifier) {
  const k = hk();
  if (!k || !k.queryCategorySamples) return [];
  try {
    const s = await k.queryCategorySamples(identifier, { limit: 1000 });
    return (s || [])
      .map((x) => ({ start: new Date(x.startDate).getTime(), end: new Date(x.endDate).getTime(), value: x.value }))
      .filter((x) => x.end > x.start);
  } catch (e) { return []; }
}

// Recent nightly asleep hours. HKCategoryValueSleepAnalysis: 0=inBed, 2=awake are NOT
// asleep; 1/3/4/5 (asleep* variants across iOS versions) count. Attribute each block to
// the morning it ended. Returns [{date, hours}] most-recent-first.
export async function getSleepNights() {
  if (!isHealthAvailable()) return [];
  const samples = await categorySamples('HKCategoryTypeIdentifierSleepAnalysis');
  const asleep = samples.filter((s) => s.value !== 0 && s.value !== 2);
  const byNight = {};
  for (const s of asleep) {
    const d = new Date(s.end); d.setHours(0, 0, 0, 0);
    const key = d.getTime();
    byNight[key] = (byNight[key] || 0) + (s.end - s.start);
  }
  return Object.entries(byNight)
    .map(([k, ms]) => ({ date: Number(k), hours: Math.round((ms / 3600000) * 10) / 10 }))
    .sort((a, b) => b.date - a.date);
}

// Recovery signals (for making the Recovery grade real + the in-session corroboration).
export async function getRecoveryMetrics() {
  if (!isHealthAvailable()) return { hrv: [], restingHr: [], sleep: [] };
  const [hrv, restingHr, sleep] = await Promise.all([
    quantitySeries('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms'),
    quantitySeries('HKQuantityTypeIdentifierRestingHeartRate', 'count/min'),
    getSleepNights(),
  ]);
  return { hrv, restingHr, sleep };
}
