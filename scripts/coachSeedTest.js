// SWOLE/OS coaching engine — SEED/TEST HARNESS (decision F).
// Pure-math scenario runner for the progression engine. The real engine lives in
// app/lib/intelligence.ts but imports supabase (RN) so it can't run in Node — so this
// mirrors the EXACT functions under test. Verify logic here, then port identically.
//   run:  node scripts/coachSeedTest.js
'use strict';

// ── functions under test (must match app/lib/intelligence.ts) ──────────────────
const NOISE_BAND = 0.04; // ±4% — e1RM measurement-noise floor (spec §4.4)

function e1rm(s) {
  const rir = s.rpe == null ? 0 : Math.max(0, Math.min(4, 10 - s.rpe));
  return (s.weight || 0) * (1 + (s.reps + rir) / 30);
}
function bestE1rm(sets) {
  const v = (sets || []).filter(s => (s.weight || 0) > 0 && s.reps > 0).map(e1rm);
  return v.length ? Math.max(...v) : 0;
}
// rolling best-e1RM over up to `window` exposures from index i (most-recent-first)
function rollingE1rm(sessions, i, window = 3) {
  const v = [];
  for (let k = i; k < Math.min(i + window, sessions.length); k++) {
    const e = bestE1rm(sessions[k].sets);
    if (e > 0) v.push(e);
  }
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}
// NEW: count consecutive recent exposures that failed to clear the prior ROLLING avg
// by more than the ±4% band. Within-band wiggle is not progress and not a stall.
function countStallsNEW(sessions) {
  let st = 0;
  for (let i = 0; i < sessions.length - 1; i++) {
    const cur = bestE1rm(sessions[i].sets);
    const prior = rollingE1rm(sessions, i + 1);
    if (cur <= 0 || prior <= 0) break;
    if (cur <= prior * (1 + NOISE_BAND)) st++; else break;
  }
  return st;
}
function detectNEW(sessions, advanced) {
  if (sessions.length < 2) return null;
  const st = countStallsNEW(sessions);
  const warnAt = advanced ? 2 : 1; // decision F: act at 2 exposures (3 for advanced)
  if (st >= warnAt + 1) return { level: 'flag', stalls: st };
  if (st >= warnAt) return { level: 'warn', stalls: st };
  return null;
}

// ── OLD code (for the before/after comparison) ─────────────────────────────────
function countStallsOLD(sessions) {
  let st = 0;
  for (let i = 0; i < sessions.length - 1; i++) {
    if (bestE1rm(sessions[i].sets) <= bestE1rm(sessions[i + 1].sets) + 0.5) st++; else break;
  }
  return st;
}
function detectOLD(sessions, advanced) {
  if (sessions.length < 2) return null;
  const st = countStallsOLD(sessions);
  const warnAt = advanced ? 3 : 2;
  if (st >= warnAt + 1) return { level: 'flag', stalls: st };
  if (st >= warnAt) return { level: 'warn', stalls: st };
  return null;
}

// ── scenario builders ──────────────────────────────────────────────────────────
const S = (weight, reps, rpe) => ({ sets: [{ weight, reps, rpe }] }); // one top set
const v = (x) => (x == null ? '—' : `${x.level}(${x.stalls})`);

const scenarios = [
  { name: 'Clean progressing (load climbing ~5%/exposure)',
    s: [S(100,8,8), S(95,8,8), S(90,8,8), S(85,8,8)], expect: 'no stall' },
  { name: 'Noisy-flat — real stall, ±~1.5% wiggle (OLD breaks on one up-tick)',
    s: [S(100,8,8), S(102,8,8), S(99,8,8), S(101,8,8)], expect: 'NEW flags, OLD misses' },
  { name: 'Dead flat — identical 3+ sessions',
    s: [S(100,8,8), S(100,8,8), S(100,8,8), S(100,8,8)], expect: 'flag' },
  { name: 'Two-exposure flat (decision F: act at 2)',
    s: [S(100,8,8), S(100,8,8)], expect: 'NEW warn, OLD none' },
  { name: 'Slipping (load declining)',
    s: [S(85,8,8), S(90,8,8), S(95,8,8), S(100,8,8)], expect: 'flag' },
  { name: 'Real progress via reps at same load (8→9→10→11 reps)',
    s: [S(100,11,8), S(100,10,8), S(100,9,8), S(100,8,8)], expect: 'no stall' },
  { name: 'Within-band drift — 100→101→100→101 (basically flat)',
    s: [S(101,8,8), S(100,8,8), S(101,8,8), S(100,8,8)], expect: 'flag (it IS flat)' },
];

console.log('SWOLE/OS coaching seed test — detectPlateau OLD(+0.5 lb) vs NEW(±4% rolling band)\n');
for (const sc of scenarios) {
  const e1 = sc.s.map(x => bestE1rm(x.sets).toFixed(1)).join(' · ');
  console.log(`• ${sc.name}`);
  console.log(`    e1RM (newest→oldest): ${e1}`);
  console.log(`    OLD: ${v(detectOLD(sc.s, false))}    NEW: ${v(detectNEW(sc.s, false))}    [expect: ${sc.expect}]\n`);
}

// ── #2 RHR readiness flag (must match computeRhrFlag in intelligence.ts) ─────────
const DAY = 86400000;
function computeRhrFlag(restingHr) {
  if (!restingHr || restingHr.length < 5) return null;
  const now = Date.now();
  const recent = restingHr.filter(r => now - r.date <= 3 * DAY);
  const baseline = restingHr.filter(r => { const age = now - r.date; return age > 3 * DAY && age <= 17 * DAY; });
  if (recent.length < 2 || baseline.length < 3) return null;
  const mean = a => a.reduce((s, b) => s + b.value, 0) / a.length;
  const delta = Math.round(mean(recent) - mean(baseline));
  return { elevated: delta >= 7, delta };
}
// build a series: recent 3-day readings + baseline (days 4–16) readings
const series = (recentVals, baseVals) => {
  const now = Date.now();
  const out = [];
  recentVals.forEach((val, i) => out.push({ date: now - (i + 1) * DAY, value: val }));      // days 1–3
  baseVals.forEach((val, i) => out.push({ date: now - (i + 5) * DAY, value: val }));         // days 5+
  return out;
};
const rhrCases = [
  { name: 'Elevated +8 (sustained) — recovery flag', s: series([66, 67, 65], [58, 59, 58, 57, 59]), expect: 'elevated' },
  { name: 'Normal — at baseline', s: series([58, 59, 57], [58, 59, 58, 57, 59]), expect: 'not elevated' },
  { name: 'Noise +4 — below the 7 bpm bar', s: series([62, 63, 61], [58, 59, 58, 57, 59]), expect: 'not elevated' },
  { name: 'Thin data (3 readings) — null', s: series([66], [58, 59]), expect: 'null' },
];
console.log('— #2 RHR flag (recent 3-day mean vs ~2-week baseline, ≥7 bpm = elevated) —\n');
for (const c of rhrCases) {
  const f = computeRhrFlag(c.s);
  console.log(`• ${c.name}\n    → ${f ? `elevated=${f.elevated} delta=${f.delta >= 0 ? '+' : ''}${f.delta}` : 'null'}    [expect: ${c.expect}]\n`);
}
