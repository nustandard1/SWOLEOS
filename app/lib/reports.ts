// @ts-nocheck
import { supabase } from './supabase';
import { buildSchedule } from './schedule';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MuscleStat { muscle: string; sets: number; volume: number; }
export interface Insight { tone: 'good' | 'warn' | 'flag'; text: string; }

// ─── Multi-week trend types ─────────────────────────────────────────────────
export interface Trends {
  weeksTrackable: number;        // how many of the lookback weeks have data
  strengthTrajectory: 'climbing' | 'flat' | 'falling' | null;
  strengthUp: number;
  strengthDown: number;
  stalls: { exercise: string; sessions: number }[];      // no new peak in 3+ logged sessions
  comebacks: { exercise: string }[];                      // broke a plateau this week
  muscleVolumeTrends: { muscle: string; dir: 'up' | 'down' | 'flat'; deltaPct: number }[];
  // per-muscle volume + STRENGTH direction together (progression is the real metric, not volume alone)
  muscleScores: { muscle: string; sets: number; volumeDir: 'up' | 'down' | 'flat'; strengthDir: 'up' | 'down' | 'flat'; volumePct: number; strengthPct: number }[];
  frequency: { muscle: string; perWeek: number }[];       // avg times/wk a muscle is trained (last 4wk)
  // adherence/planned/fulfilled present only when an active template defines a schedule.
  // chronicShortfall = came up short on planned frequency for 2+ of the most recent
  // completed weeks IN A ROW (a real pattern, not a one-off life-happens week).
  consistency: { weeksTrained: number; ofWeeks: number; streak: number; adherence: number | null; planned: number; fulfilled: number; weeksShort: number; weeksPlanned: number; chronicShortfall: boolean };
  rpeTrend: 'rising' | 'steady' | 'falling' | null;
  imbalances: { label: string; ratio: number }[];         // e.g. push vs pull >= 2x
}
export interface TrendSeries {
  weekLabels: string[];          // oldest -> newest, e.g. ['5wk','4wk',...,'now']
  volume: number[];
  workingSets: number[];
}

export interface WeeklyReport {
  // One-sentence local-vs-systemic read (most lifts up but X down → programming on X;
  // most down → systemic recovery). The week's sharpest insight when present.
  diagnosis: { kind: 'local' | 'systemic'; line: string } | null;
  weekLabel: string;             // human date range, e.g. "JUN 2 – 8"
  weekStart: string;             // ISO date (Monday) of the report week
  weekEnd: string;               // ISO date (Sunday) of the report week
  periodKey: string;             // = weekStart; the ai_reports cache key
  anchorOffset: number;          // 0 = current week, 1 = last completed, …
  hasData: boolean;
  thin: boolean;                 // not much logged yet
  sessions: number;
  totalVolume: number;
  volumeDeltaPct: number | null; // vs previous week
  workingSets: number;
  avgRpe: number | null;       // mean working-set RPE this week (intensity signal)
  clustersUsed: boolean;       // high-intensity methods (clusters/myo/rest-pause) used this week
  score: { overall: number | null; strength: string; hypertrophy: string; recovery: string; consistency: string };
  muscles: MuscleStat[];
  prs: { exercise: string; detail: string }[];
  progression: { progressed: number; stalled: number; regressed: number; total: number };
  insights: Insight[];
  recommendations: string[];
  trends: Trends;
  series: TrendSeries;
}

const EMPTY_TRENDS: Trends = {
  weeksTrackable: 0, strengthTrajectory: null, strengthUp: 0, strengthDown: 0,
  stalls: [], comebacks: [], muscleVolumeTrends: [], muscleScores: [], frequency: [],
  consistency: { weeksTrained: 0, ofWeeks: 4, streak: 0, adherence: null, planned: 0, fulfilled: 0, weeksShort: 0, weeksPlanned: 0, chronicShortfall: false }, rpeTrend: null, imbalances: [],
};
const EMPTY_SERIES: TrendSeries = { weekLabels: [], volume: [], workingSets: [] };

const PUSH_MUSCLES = ['chest', 'delts', 'triceps'];
const PULL_MUSCLES = ['back', 'biceps'];

interface Profile {
  rep_preference?: string | null;
  experience_level?: string | null;
  archetype?: string | null;
  goal?: string | null;
  weakest_part?: string | null;
  priority_muscles?: string[] | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// HARD working set (drives the working-SET COUNT): RPE >= 8 (>= 7 on heavy squat/
// hinge), or unrated. This is the "did it count as a hard set" bar.
function isWorkingSet(set: any, pattern?: string): boolean {
  if (set.is_warmup || !set.reps) return false;
  if (set.rpe == null) return true;
  return set.rpe >= ((pattern === 'squat' || pattern === 'hinge') ? 7 : 8);
}
// Counts toward VOLUME (tonnage). Floor is RPE 7 — anything below 7 is a warm-up-tier
// set (a waste, and hard to measure), so it earns no volume credit. Unrated sets still
// count. This is intentionally looser than the hard-set bar above.
function countsForVolume(set: any): boolean {
  if (set.is_warmup || !set.reps || !set.weight) return false;
  if (set.rpe == null) return true;
  return set.rpe >= 7;
}
// RPE-adjusted Epley. The plain formula assumes the set was a true rep max; a set left
// with reps in reserve (lower RPE) reflects MORE strength than its raw reps imply. So
// we feed Epley "effective reps" = reps + RIR (RIR ≈ 10 − RPE, capped at 4 so a soft
// RPE can't balloon it). No RPE logged → plain Epley (RIR 0). This makes "same weight,
// same reps, but easier (lower RPE)" correctly register as a strength gain.
const e1rm = (w: number, r: number, rpe?: number | null) => {
  const rir = rpe == null ? 0 : Math.max(0, Math.min(4, 10 - rpe));
  return (w || 0) * (1 + (r + rir) / 30);
};
// Volume includes cluster reps; e1RM/strength uses the main set only.
const sumC = (st: any) => (st.cluster_reps || []).reduce((a: number, b: number) => a + (b || 0), 0);
const setVol = (st: any) => (st.weight || 0) * (st.reps + sumC(st));
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
// "JUN 2 – 8" (same month) or "JUN 30 – JUL 6" (spanning).
function fmtRange(startMs: number, endMs: number): string {
  const a = new Date(startMs), b = new Date(endMs);
  const left = `${MONTHS[a.getMonth()]} ${a.getDate()}`;
  const right = a.getMonth() === b.getMonth() ? `${b.getDate()}` : `${MONTHS[b.getMonth()]} ${b.getDate()}`;
  return `${left} – ${right}`;
}

// ─── Deterministic readiness grades (stable, reproducible — not AI-guessed) ─────
const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
function numToGrade(n: number): string {
  if (n >= 93) return 'A'; if (n >= 90) return 'A-';
  if (n >= 87) return 'B+'; if (n >= 83) return 'B'; if (n >= 80) return 'B-';
  if (n >= 77) return 'C+'; if (n >= 73) return 'C'; if (n >= 70) return 'C-';
  if (n >= 67) return 'D+'; if (n >= 60) return 'D'; return 'F';
}
function computeScore(args: {
  progression: { progressed: number; stalled: number; regressed: number; total: number };
  strengthTrajectory: string | null;
  consistency: { weeksTrained: number; ofWeeks: number; streak: number; adherence: number | null };
  rpeTrend: string | null;
  volumeDeltaPct: number | null;
  workingSets: number;
  avgRpe: number | null;
  weeksTrackable: number;
  checkins?: { sessionRpe: number | null; soreness: number | null; readiness: number | null; n: number } | null;
}) {
  const { progressed, regressed, total } = args.progression;
  const progRatio = total > 0 ? (progressed - regressed) / total : null; // -1..1
  const traj = args.strengthTrajectory;
  const wt = args.weeksTrackable;

  // We only GRADE a dimension once there's a real signal behind it. No data is NOT a
  // bad grade — it's "—" (not enough to judge). Strength/Growth/Recovery all hinge on
  // progression, which needs at least one lift compared this week OR 2+ tracked weeks.
  const canGradeLifts = total > 0 || wt >= 2;

  let strengthN: number | null = null;
  let growthN: number | null = null;
  let recoveryN: number | null = null;
  if (canGradeLifts) {
    // STRENGTH — progression is king (lifts moving up vs down) + multi-week trajectory.
    if (progRatio == null) strengthN = traj === 'climbing' ? 78 : traj === 'falling' ? 62 : 70;
    else strengthN = 58 + 42 * progRatio + (traj === 'climbing' ? 8 : traj === 'falling' ? -8 : 0);

    // GROWTH (hypertrophy) — progressive overload + adequate working-set volume + volume trend.
    if (progRatio == null) growthN = 70;
    else {
      growthN = 55 + 30 * Math.max(0, progRatio);
      if (args.workingSets >= 12) growthN += 6; else if (args.workingSets < 6) growthN -= 12;
      if (args.volumeDeltaPct != null) growthN += Math.max(-8, Math.min(8, args.volumeDeltaPct / 4));
    }

    // RECOVERY — REAL when the lifter filled post-session check-ins this week
    // (soreness / readiness / session RPE are direct recovery reports); otherwise
    // inferred from RPE-vs-progress as before.
    const ck = args.checkins;
    if (ck && ck.n >= 2 && (ck.soreness != null || ck.readiness != null || ck.sessionRpe != null)) {
      recoveryN = 74;
      if (ck.soreness != null) recoveryN -= (ck.soreness - 2.5) * 8;        // >moderate soreness drags
      if (ck.readiness != null) recoveryN += (ck.readiness - 3) * 7;        // drained ↔ primed
      if (ck.sessionRpe != null && ck.sessionRpe >= 8.5) recoveryN -= 8;    // every session near-max
      if (progRatio != null && progRatio >= 0.5) recoveryN += 6;            // recovering AND progressing
    } else {
      recoveryN = 74;
      if (args.avgRpe != null && args.avgRpe >= 9 && (progRatio == null || progRatio < 0.3)) recoveryN -= 26;
      else if (args.avgRpe != null && args.avgRpe >= 8.7 && (progRatio == null || progRatio < 0.4)) recoveryN -= 12;
      if (args.rpeTrend === 'rising' && (progRatio == null || progRatio < 0.4)) recoveryN -= 8;
      if (progRatio != null && progRatio >= 0.5 && (args.avgRpe == null || args.avgRpe < 9)) recoveryN += 8;
    }
  }

  // CONSISTENCY — planned-vs-actual adherence when a schedule exists (the truest
  // signal: did you hit your committed days?). Forgiving — a logged session fulfills a
  // planned one regardless of weekday. With no adherence data, we fall back to
  // weeks-trained ONLY once there are 2+ weeks of history to be consistent ACROSS;
  // before that there's nothing to grade, so it's "—", not a low mark.
  const adh = args.consistency.adherence;
  let consistencyN: number | null = null;
  if (adh != null) {
    consistencyN = 42 + 53 * adh + Math.min(7, args.consistency.streak * 2);
  } else if (wt >= 2) {
    const weeksRatio = args.consistency.ofWeeks > 0 ? args.consistency.weeksTrained / args.consistency.ofWeeks : 0;
    consistencyN = 45 + 50 * weeksRatio + Math.min(8, args.consistency.streak * 2);
  }

  const sN = strengthN == null ? null : clampScore(strengthN);
  const gN = growthN == null ? null : clampScore(growthN);
  const rN = recoveryN == null ? null : clampScore(recoveryN);
  const cN = consistencyN == null ? null : clampScore(consistencyN);

  // Overall blends only the dimensions we can actually grade (renormalized weights).
  // If we can't even grade strength or growth — the core of training quality — there's
  // no honest overall yet → null (the UI shows a "score pending" state, not a 0/D).
  const dims = [{ n: sN, w: 0.35 }, { n: gN, w: 0.25 }, { n: rN, w: 0.15 }, { n: cN, w: 0.25 }];
  const avail = dims.filter(d => d.n != null);
  const wsum = avail.reduce((a, d) => a + d.w, 0);
  const overall = (sN == null && gN == null) || wsum === 0
    ? null
    : clampScore(avail.reduce((a, d) => a + d.w * (d.n as number), 0) / wsum);

  const g = (n: number | null) => (n == null ? '—' : numToGrade(n));
  return { overall, strength: g(sN), hypertrophy: g(gN), recovery: g(rN), consistency: g(cN) };
}

function weekBounds(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7) - offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return { start: monday.getTime(), end: sunday.getTime() };
}

const WEAK_TO_MUSCLE: Record<string, string[]> = {
  Chest: ['chest'], Back: ['back'], Shoulders: ['delts'],
  Legs: ['quads', 'hamstrings', 'glutes', 'calves'], Arms: ['biceps', 'triceps'],
};

// ─── The weekly report engine ──────────────────────────────────────────────────
export async function getWeeklyReport(userId: string, anchorOffset = 0): Promise<WeeklyReport> {
  const A = anchorOffset;                       // which week this report covers (0 = current)
  const wb = weekBounds(A);
  const weekStartISO = new Date(wb.start).toISOString().slice(0, 10);
  const weekEndISO = new Date(wb.end - 86400000).toISOString().slice(0, 10);
  const rangeLabel = fmtRange(wb.start, wb.end - 86400000);

  const empty: WeeklyReport = {
    diagnosis: null,
    weekLabel: rangeLabel, weekStart: weekStartISO, weekEnd: weekEndISO, periodKey: weekStartISO, anchorOffset: A,
    hasData: false, thin: true, sessions: 0, totalVolume: 0,
    volumeDeltaPct: null, workingSets: 0, avgRpe: null, clustersUsed: false,
    score: { overall: null, strength: '—', hypertrophy: '—', recovery: '—', consistency: '—' },
    muscles: [], prs: [],
    progression: { progressed: 0, stalled: 0, regressed: 0, total: 0 },
    insights: [], recommendations: [],
    trends: EMPTY_TRENDS, series: EMPTY_SERIES,
  };

  // Pull a wide window once (covers anchored past weeks + their 6-week lookback).
  const since = new Date(Date.now() - 105 * 86400000).toISOString();
  const [{ data: sessionsData }, { data: prof }, { data: tmpl }] = await Promise.all([
    supabase.from('workout_sessions')
      .select(`id, performed_at, session_rpe, soreness, readiness,
        session_exercises(exercise_id,
          exercises(name, primary_muscle, movement_pattern),
          set_logs(weight, reps, rpe, is_warmup, cluster_reps))`)
      .eq('user_id', userId)
      .gte('performed_at', since)
      .order('performed_at', { ascending: false }),
    supabase.from('users').select('rep_preference, experience_level, archetype, goal, weakest_part, priority_muscles').eq('id', userId).single(),
    supabase.from('workout_templates')
      .select('created_at, template_sessions(session_order, scheduled_dow)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle(),
  ]);

  const sessions = sessionsData || [];
  if (sessions.length === 0) return empty;

  const profile: Profile = prof || {};
  const thisWk = weekBounds(A);
  const lastWk = weekBounds(A + 1);
  const tMs = (s: any) => new Date(s.performed_at).getTime();
  const inWeek = (s: any, b: { start: number; end: number }) => tMs(s) >= b.start && tMs(s) < b.end;

  const weekSessions = sessions.filter(s => inWeek(s, thisWk));
  const prevSessions = sessions.filter(s => inWeek(s, lastWk));

  if (weekSessions.length === 0) {
    return { ...empty, hasData: false };
  }

  // Volume + working sets + muscle breakdown (this week)
  let totalVolume = 0, workingSets = 0, clustersUsed = false;
  const muscleMap: Record<string, { sets: number; volume: number }> = {};
  let rpeSum = 0, rpeCount = 0;
  const rpeFlags: string[] = [];

  for (const s of weekSessions) {
    for (const ex of s.session_exercises || []) {
      const pattern = ex.exercises?.movement_pattern;
      const muscle = ex.exercises?.primary_muscle;
      for (const st of (ex.set_logs || [])) {
        const touch = () => { if (muscle && !muscleMap[muscle]) muscleMap[muscle] = { sets: 0, volume: 0 }; };
        // Hard working set → the SET COUNT + RPE signal.
        if (isWorkingSet(st, pattern)) {
          const clusterBonus = sumC(st) > 0 ? 1 : 0; // clusters add one working set
          workingSets += 1 + clusterBonus;
          if (muscle) { touch(); muscleMap[muscle].sets += 1 + clusterBonus; }
          if (st.rpe != null) { rpeSum += st.rpe; rpeCount++; }
        }
        // RPE ≥ 7 → counts toward VOLUME (sub-7 is warm-up tier, no credit).
        if (countsForVolume(st)) {
          const vol = setVol(st);
          if (sumC(st) > 0) clustersUsed = true;
          totalVolume += vol;
          if (muscle) { touch(); muscleMap[muscle].volume += vol; }
        }
      }
      // RPE inconsistency: a heavier set with >= reps at <= RPE vs a lighter set
      const real = (ex.set_logs || []).filter((st: any) => !st.is_warmup && st.reps > 0 && st.weight);
      for (let i = 0; i < real.length; i++) {
        for (let j = 0; j < real.length; j++) {
          if (i === j) continue;
          const a = real[i], b = real[j];
          if (b.weight > a.weight && b.reps >= a.reps && a.rpe != null && b.rpe != null && b.rpe <= a.rpe) {
            const nm = ex.exercises?.name || 'a lift';
            if (!rpeFlags.includes(nm)) rpeFlags.push(nm);
          }
        }
      }
    }
  }

  const muscles: MuscleStat[] = Object.entries(muscleMap)
    .map(([muscle, v]) => ({ muscle, sets: v.sets, volume: v.volume }))
    .sort((a, b) => b.sets - a.sets);

  // Previous week volume (same RPE ≥ 7 floor)
  let prevVolume = 0;
  for (const s of prevSessions) {
    for (const ex of s.session_exercises || []) {
      for (const st of (ex.set_logs || []).filter((x: any) => countsForVolume(x))) {
        prevVolume += setVol(st);
      }
    }
  }
  const volumeDeltaPct = prevVolume > 0 ? Math.round(((totalVolume - prevVolume) / prevVolume) * 100) : null;

  // ─── Multi-week trends (6-week lookback window) ──────────────────────────────
  const NUM_WEEKS = 6;
  const weekly: any[] = []; // index 0 = oldest, last = the report week
  for (let rel = NUM_WEEKS - 1; rel >= 0; rel--) {
    const off = A + rel;                 // absolute week offset from now
    const b = weekBounds(off);
    const ws = sessions.filter(s => inWeek(s, b));
    let vol = 0, wsetCount = 0, rSum = 0, rCnt = 0;
    const mus: Record<string, number> = {};       // per-muscle HARD set count
    const musVol: Record<string, number> = {};     // per-muscle VOLUME (RPE ≥ 7)
    const exBest: Record<string, { e: number; name: string }> = {};
    for (const s of ws) {
      for (const ex of s.session_exercises || []) {
        const pattern = ex.exercises?.movement_pattern;
        const muscle = ex.exercises?.primary_muscle;
        for (const st of (ex.set_logs || [])) {
          if (isWorkingSet(st, pattern)) {
            const cb = sumC(st) > 0 ? 1 : 0; // clusters add one working set
            wsetCount += 1 + cb;
            if (muscle) mus[muscle] = (mus[muscle] || 0) + 1 + cb;
            if (st.rpe != null) { rSum += st.rpe; rCnt++; }
          }
          if (countsForVolume(st)) {
            const v = setVol(st);
            vol += v;
            if (muscle) musVol[muscle] = (musVol[muscle] || 0) + v;
          }
          if (!st.is_warmup && st.reps > 0 && st.weight) {
            const e = e1rm(st.weight, st.reps, st.rpe);
            if (!exBest[ex.exercise_id] || e > exBest[ex.exercise_id].e) {
              exBest[ex.exercise_id] = { e, name: ex.exercises?.name || '', muscle };
            }
          }
        }
      }
    }
    weekly.push({ off, sessions: ws.length, volume: vol, workingSets: wsetCount, avgRpe: rCnt ? rSum / rCnt : null, muscleSets: mus, muscleVol: musVol, exBest });
  }

  const weeksTrackable = weekly.filter(w => w.sessions > 0).length;
  const last4 = weekly.slice(-4);

  // Per-exercise sequence of best e1RM across trained weeks (oldest -> newest)
  const exSeq: Record<string, number[]> = {};
  const exNm: Record<string, string> = {};
  const exMuscle: Record<string, string> = {};
  for (const w of weekly) {
    for (const id in w.exBest) {
      (exSeq[id] = exSeq[id] || []).push(w.exBest[id].e);
      exNm[id] = w.exBest[id].name;
      if (w.exBest[id].muscle) exMuscle[id] = w.exBest[id].muscle;
    }
  }
  let strengthUp = 0, strengthDown = 0;
  const stalls: { exercise: string; sessions: number }[] = [];
  const comebacks: { exercise: string }[] = [];
  for (const id in exSeq) {
    const seq = exSeq[id];
    if (seq.length < 2) continue;
    const first = seq[0], lastV = seq[seq.length - 1];
    if (lastV > first + 0.5) strengthUp++;
    else if (lastV < first - 0.5) strengthDown++;
    // stall: 3+ trained sessions, no new peak in the last 3 entries
    if (seq.length >= 3) {
      const earlierPeak = Math.max(...seq.slice(0, seq.length - 3));
      const recent3 = seq.slice(-3);
      const recentPeak = Math.max(...recent3);
      if (recentPeak <= earlierPeak + 0.5) {
        stalls.push({ exercise: exNm[id], sessions: seq.length });
      }
      // comeback: last entry is a fresh peak after 2 flat/down entries before it
      const beforeLast = seq.slice(0, seq.length - 1);
      const peakBefore = Math.max(...beforeLast);
      const prevTwoFlat = seq.length >= 3 &&
        seq[seq.length - 2] <= peakBefore - 0.5 + 0.5 && // not a peak
        lastV > peakBefore + 0.5;
      if (prevTwoFlat) comebacks.push({ exercise: exNm[id] });
    }
  }
  const strengthTrajectory: any = weeksTrackable < 2 ? null
    : strengthUp > strengthDown ? 'climbing'
      : strengthDown > strengthUp ? 'falling' : 'flat';

  // Muscle volume trend: last 2 weeks avg sets vs the 2 weeks before
  const recentWk = weekly.slice(-2), priorWk = weekly.slice(-4, -2);
  const sumMus = (arr: any[]) => {
    const m: Record<string, number> = {};
    for (const w of arr) for (const k in w.muscleSets) m[k] = (m[k] || 0) + w.muscleSets[k];
    return m;
  };
  const recentMus = sumMus(recentWk), priorMus = sumMus(priorWk);
  const muscleVolumeTrends: { muscle: string; dir: any; deltaPct: number }[] = [];
  for (const m of new Set([...Object.keys(recentMus), ...Object.keys(priorMus)])) {
    const r = (recentMus[m] || 0) / 2, p = (priorMus[m] || 0) / 2;
    if (r < 2 && p < 2) continue; // ignore trivial volume
    // No real prior period → don't fake an "up"; show flat until there's something to compare.
    const deltaPct = p > 0 ? Math.round(((r - p) / p) * 100) : 0;
    const dir = p === 0 ? 'flat' : deltaPct > 15 ? 'up' : deltaPct < -15 ? 'down' : 'flat';
    muscleVolumeTrends.push({ muscle: m, dir, deltaPct });
  }
  muscleVolumeTrends.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

  // exSessSeq: each lift's best e1RM per logged session (oldest→newest) within the
  // ~4-week window. Used ONLY by the first-week progression fallback further down.
  const TREND_WINDOW_MS = 28 * 86400000;
  const trendEnd = thisWk.end;                          // as-of the report week's end
  const trendCutoff = trendEnd - TREND_WINDOW_MS;
  const sessOldFirst = [...sessions].filter(s => tMs(s) >= trendCutoff && tMs(s) < trendEnd).reverse();
  const exSessSeq: Record<string, number[]> = {};
  for (const sn of sessOldFirst) {
    for (const ex of sn.session_exercises || []) {
      const id = ex.exercise_id;
      const muscle = ex.exercises?.primary_muscle;
      let best = 0;
      for (const st of (ex.set_logs || [])) {
        if (!st.is_warmup && st.reps > 0 && st.weight) best = Math.max(best, e1rm(st.weight, st.reps, st.rpe));
      }
      if (best > 0) (exSessSeq[id] = exSessSeq[id] || []).push(best);
      if (!exMuscle[id] && muscle) exMuscle[id] = muscle;
    }
  }

  // ─── Performance Trends: WEEK-OVER-WEEK (this week vs last week) ───────────────
  // VOLUME = per-muscle tonnage (RPE ≥ 7) this week vs last week. STRENGTH = per-muscle
  // estimated-1RM direction this week vs last, aggregated across the muscle's lifts that
  // were trained BOTH weeks. Only meaningful with ≥ 2 trackable weeks — the UI gates the
  // whole section on that, so a single week never shows half-baked tickers.
  const wkNow = weekly[weekly.length - 1] || { muscleVol: {}, exBest: {} };
  const wkPrev = weekly[weekly.length - 2] || { muscleVol: {}, exBest: {} };
  const musStrAgg: Record<string, { up: number; down: number; sum: number; cnt: number }> = {};
  for (const id in wkNow.exBest) {
    const m = wkNow.exBest[id].muscle;
    const prev = wkPrev.exBest[id];
    if (!m || !prev) continue;                          // need the lift in BOTH weeks
    const a = musStrAgg[m] || (musStrAgg[m] = { up: 0, down: 0, sum: 0, cnt: 0 });
    const d = wkNow.exBest[id].e - prev.e;
    if (d > 0.5) a.up++; else if (d < -0.5) a.down++;
    if (prev.e > 0) { a.sum += (d / prev.e) * 100; a.cnt++; }
  }
  const muscleScores = muscles.map(m => {
    const a = musStrAgg[m.muscle];
    const strengthDir: any = a && a.cnt ? (a.up > a.down ? 'up' : a.down > a.up ? 'down' : 'flat') : 'flat';
    const strengthPct = a && a.cnt ? Math.round(a.sum / a.cnt) : 0;
    const tv = wkNow.muscleVol[m.muscle] || 0, pv = wkPrev.muscleVol[m.muscle] || 0;
    let volumeDir: any = 'flat', volumePct = 0;
    if (pv > 0) {
      volumePct = Math.round(((tv - pv) / pv) * 100);
      volumeDir = volumePct > 10 ? 'up' : volumePct < -10 ? 'down' : 'flat';
    }
    return { muscle: m.muscle, sets: m.sets, volumeDir, strengthDir, volumePct, strengthPct };
  });

  // Frequency: avg sessions/week per muscle over last 4 weeks
  const freqMap: Record<string, number> = {};
  for (const w of last4) {
    for (const s of sessions.filter(ss => inWeek(ss, weekBounds(w.off)))) {
      const hit: Record<string, boolean> = {};
      for (const ex of s.session_exercises || []) {
        const m = ex.exercises?.primary_muscle;
        const pattern = ex.exercises?.movement_pattern;
        if (m && (ex.set_logs || []).some((st: any) => isWorkingSet(st, pattern))) hit[m] = true;
      }
      for (const m in hit) freqMap[m] = (freqMap[m] || 0) + 1;
    }
  }
  const wkDenom = Math.max(1, last4.filter(w => w.sessions > 0).length);
  const frequency = Object.entries(freqMap)
    .map(([muscle, n]) => ({ muscle, perWeek: Math.round((n / wkDenom) * 10) / 10 }))
    .sort((a, b) => b.perWeek - a.perWeek);

  // Consistency: weeks trained of last 4 + current streak
  let streak = 0;
  for (let i = weekly.length - 1; i >= 0; i--) { if (weekly[i].sessions > 0) streak++; else break; }
  const weeksTrained = last4.filter(w => w.sessions > 0).length;

  // Planned-vs-actual frequency adherence (P2.5). Mirrors the forgiving WeekStrip
  // model: a logged session fulfills a planned one regardless of weekday; only
  // completed weeks within the program window count, so a fresh program or the
  // in-progress current week never drags the grade down.
  let weeklyDows: number[] = [];
  let programStartMs: number | null = null;
  if (tmpl) {
    const tsessions = [...(tmpl.template_sessions || [])].sort((a, b) => (a.session_order ?? 0) - (b.session_order ?? 0));
    weeklyDows = Object.keys(buildSchedule(tsessions)).map(Number);
    if (tmpl.created_at) { const d = new Date(tmpl.created_at); d.setHours(0, 0, 0, 0); programStartMs = d.getTime(); }
  }
  const todayMid = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  // Adherence over the report week + the 3 before it (only COMPLETED weeks count).
  // compWeeks[0] = the most recent completed week in that window.
  const compWeeks: { planned: number; logged: number; short: boolean }[] = [];
  if (weeklyDows.length) {
    for (let k = 0; k < 4; k++) {
      const off = A + k;
      const b = weekBounds(off);
      if (b.end > todayMid) continue;                // skip an in-progress week (e.g. anchor 0)
      let planned = 0;
      for (let i = 0; i < 7; i++) {
        const dayMs = b.start + i * 86400000;
        if (programStartMs != null && dayMs < programStartMs) continue; // before program existed
        if (dayMs >= todayMid) continue;                                 // today/future don't count
        if (weeklyDows.includes((new Date(dayMs).getDay() + 6) % 7)) planned++;
      }
      if (planned === 0) continue;
      const logged = sessions.filter(s => inWeek(s, b)).length;
      compWeeks.push({ planned, logged, short: logged < planned });
    }
  }
  const plannedTotal = compWeeks.reduce((a, w) => a + w.planned, 0);
  // forgiving: capped per week, over-training doesn't bank credit toward a short week
  const fulfilledTotal = compWeeks.reduce((a, w) => a + Math.min(w.logged, w.planned), 0);
  const weeksPlanned = compWeeks.length;
  const weeksShort = compWeeks.filter(w => w.short).length;
  // Consecutive short weeks counting back from the most recent — a one-off doesn't
  // trip it, and nailing the latest week clears it (no nagging once they fix it).
  let recentShortStreak = 0;
  for (const w of compWeeks) { if (w.short) recentShortStreak++; else break; }
  const chronicShortfall = recentShortStreak >= 2;
  // Need at least a couple of planned days before adherence is meaningful (avoid
  // grading off a single session); otherwise fall back to the weeks-trained model.
  const adherence = plannedTotal >= 2 ? fulfilledTotal / plannedTotal : null;

  // RPE trend over weeks
  const recentRpe = recentWk.map(w => w.avgRpe).filter(x => x != null);
  const priorRpe = priorWk.map(w => w.avgRpe).filter(x => x != null);
  let rpeTrend: any = null;
  if (recentRpe.length && priorRpe.length) {
    const ra = recentRpe.reduce((a, b) => a + b, 0) / recentRpe.length;
    const pa = priorRpe.reduce((a, b) => a + b, 0) / priorRpe.length;
    rpeTrend = ra > pa + 0.4 ? 'rising' : ra < pa - 0.4 ? 'falling' : 'steady';
  }

  // Imbalances over last 4 weeks (set counts)
  const setsFor = (list: string[]) => list.reduce((a, m) => a + (recentMus[m] || 0) + (priorMus[m] || 0), 0);
  const pushSets = setsFor(PUSH_MUSCLES), pullSets = setsFor(PULL_MUSCLES);
  const imbalances: { label: string; ratio: number }[] = [];
  if (pushSets >= 6 && pullSets >= 1 && pushSets / Math.max(1, pullSets) >= 2) {
    imbalances.push({ label: 'Push volume is more than double pull', ratio: Math.round((pushSets / Math.max(1, pullSets)) * 10) / 10 });
  } else if (pullSets >= 6 && pushSets >= 1 && pullSets / Math.max(1, pushSets) >= 2) {
    imbalances.push({ label: 'Pull volume is more than double push', ratio: Math.round((pullSets / Math.max(1, pushSets)) * 10) / 10 });
  }
  const quad = (recentMus['quads'] || 0) + (priorMus['quads'] || 0);
  const ham = (recentMus['hamstrings'] || 0) + (priorMus['hamstrings'] || 0);
  if (quad >= 6 && quad / Math.max(1, ham) >= 2) {
    imbalances.push({ label: 'Quads getting more than double the hamstring volume', ratio: Math.round((quad / Math.max(1, ham)) * 10) / 10 });
  }

  const trends: Trends = {
    weeksTrackable, strengthTrajectory, strengthUp, strengthDown,
    stalls: stalls.slice(0, 4), comebacks: comebacks.slice(0, 3),
    muscleVolumeTrends: muscleVolumeTrends.slice(0, 6), muscleScores, frequency,
    consistency: { weeksTrained, ofWeeks: 4, streak, adherence, planned: plannedTotal, fulfilled: fulfilledTotal, weeksShort, weeksPlanned, chronicShortfall }, rpeTrend, imbalances,
  };
  const series: TrendSeries = {
    weekLabels: weekly.map((w, i) => (i === weekly.length - 1 ? 'Now' : `${weekly.length - 1 - i}w`)),
    volume: weekly.map(w => Math.round(w.volume)),
    workingSets: weekly.map(w => w.workingSets),
  };

  // Per-exercise progression: best e1RM this week vs most recent prior session
  const bestThisWeek: Record<string, { e: number; name: string; weight: number; reps: number }> = {};
  for (const s of weekSessions) {
    for (const ex of s.session_exercises || []) {
      const id = ex.exercise_id;
      for (const st of (ex.set_logs || []).filter((x: any) => !x.is_warmup && x.reps > 0 && x.weight)) {
        const e = e1rm(st.weight, st.reps, st.rpe);
        if (!bestThisWeek[id] || e > bestThisWeek[id].e) bestThisWeek[id] = { e, name: ex.exercises?.name || '', weight: st.weight, reps: st.reps };
      }
    }
  }
  const bestPrior: Record<string, number> = {};
  for (const s of sessions) {
    if (tMs(s) >= thisWk.start) continue; // only before this week
    for (const ex of s.session_exercises || []) {
      const id = ex.exercise_id;
      for (const st of (ex.set_logs || []).filter((x: any) => !x.is_warmup && x.reps > 0 && x.weight)) {
        const e = e1rm(st.weight, st.reps, st.rpe);
        if (!bestPrior[id] || e > bestPrior[id]) bestPrior[id] = e;
      }
    }
  }
  let progressed = 0, stalled = 0, regressed = 0, total = 0;
  const prs: { exercise: string; detail: string }[] = [];
  for (const id of Object.keys(bestThisWeek)) {
    const cur = bestThisWeek[id];
    const prior = bestPrior[id];
    if (prior == null) continue; // brand-new exercise, no comparison
    total++;
    if (cur.e > prior + 0.5) { progressed++; prs.push({ exercise: cur.name, detail: `${cur.weight}×${cur.reps}` }); }
    else if (cur.e < prior - 0.5) regressed++;
    else stalled++;
  }

  // HYBRID fallback: if NO lift had a prior-week comparison (a true first week),
  // fall back to session-over-session within the available data so demonstrated
  // overload across the week's own sessions still counts — instead of grading blind.
  // (`exSessSeq` = each lift's best e1RM per session, oldest→newest, within window.)
  if (total === 0) {
    for (const id of Object.keys(bestThisWeek)) {
      const seq = exSessSeq[id];
      if (!seq || seq.length < 2) continue;               // need ≥2 logged sessions of the lift
      const cur = seq[seq.length - 1];                    // latest session's best
      const prevBest = Math.max(...seq.slice(0, seq.length - 1)); // best of its earlier sessions
      total++;
      const b = bestThisWeek[id];
      if (cur > prevBest + 0.5) { progressed++; prs.push({ exercise: b.name, detail: `${b.weight}×${b.reps}` }); }
      else if (cur < prevBest - 0.5) regressed++;
      else stalled++;
    }
  }

  const avgRpe = rpeCount ? rpeSum / rpeCount : null;

  // ─── Insights ───
  const insights: Insight[] = [];
  if (avgRpe != null && avgRpe >= 9 && total > 0 && (stalled + regressed) >= progressed) {
    insights.push({ tone: 'flag', text: `You're grinding — average RPE ${avgRpe.toFixed(1)} — but lifts aren't moving. That's a recovery signal. Pull a few sets back to RPE 8 and reassess volume.` });
  }
  if (rpeFlags.length > 0) {
    insights.push({ tone: 'warn', text: `Some sets on ${rpeFlags.slice(0, 2).join(' & ')} look mis-rated (a heavier set with more reps at the same or lower RPE). Tighten up how you judge proximity to failure and log it honestly — it makes every target sharper.` });
  }
  if (total > 0 && progressed / total >= 0.6) {
    insights.push({ tone: 'good', text: `Strong week — ${progressed} of ${total} lifts moved forward. Progressive overload is happening. Keep grinding, no changes needed.` });
  }
  // top-progressing muscle
  if (muscles.length && progressed > 0) {
    const top = muscles[0];
    insights.push({ tone: 'good', text: `${cap(top.muscle)} got the most work (${top.sets} working sets). Sustained progress here means it's growing.` });
  }
  // weak part lagging
  const weakMuscles = profile.weakest_part ? (WEAK_TO_MUSCLE[profile.weakest_part] || []) : [];
  const weakSets = weakMuscles.reduce((a, m) => a + (muscleMap[m]?.sets || 0), 0);
  if (weakMuscles.length && weakSets < 6) {
    insights.push({ tone: 'warn', text: `Your weak point (${profile.weakest_part}) only got ${weakSets} working sets this week. If it's a priority, it needs more volume — that's likely why it lags.` });
  }

  // ─── Recommendations ───
  const recommendations: string[] = [];
  if (rpeFlags.length > 0) {
    recommendations.push('Pick a rep range that fits the lift (e.g. 6–8 for compounds, 8–12 for isolation) and chase the top of it before adding weight — double progression. It makes your logging consistent and your progress measurable.');
  }
  if (total > 0 && (stalled + regressed) > progressed) {
    recommendations.push('Several lifts stalled. Try backing off to 6–7 RPE for a session, or swap a stalled lift for a fresh variation.');
  }
  if (volumeDeltaPct != null && volumeDeltaPct < -20) {
    recommendations.push(`Volume dropped ${Math.abs(volumeDeltaPct)}% vs last week. If that wasn't a planned lighter week, make sure you're hitting your sessions.`);
  }
  if (recommendations.length === 0 && total > 0) {
    recommendations.push('Consider running double progression — beat the top of your rep range, then add a small jump. Consistency wins.');
  }

  const thin = weekSessions.length < 2 || total < 2;

  // Post-session check-in aggregates for the week (optional data — null when skipped).
  const ckAvg = (key: string) => {
    const vals = weekSessions.map((s: any) => s[key]).filter((v: any) => v != null);
    return vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
  };
  const ckN = weekSessions.filter((s: any) => s.session_rpe != null || s.soreness != null || s.readiness != null).length;
  const checkins = ckN > 0
    ? { sessionRpe: ckAvg('session_rpe'), soreness: ckAvg('soreness'), readiness: ckAvg('readiness'), n: ckN }
    : null;

  // ── Local-vs-systemic diagnosis ──
  // If MOST muscle groups are progressing but one or two are going backwards, that's a
  // PROGRAMMING issue on those days — not systemic recovery. If most are down (and/or
  // effort is maxed with high soreness), it's systemic. One sharp sentence, not an essay.
  let diagnosis: { kind: 'local' | 'systemic'; line: string } | null = null;
  {
    const scored = (trends.muscleScores || []).filter((m: any) => m.strengthDir !== 'flat' || m.sets >= 3);
    const ups = scored.filter((m: any) => m.strengthDir === 'up');
    const downs = scored.filter((m: any) => m.strengthDir === 'down');
    if (scored.length >= 3 && ups.length >= 2 && downs.length >= 1 && downs.length <= 2 && ups.length > downs.length) {
      const names = downs.map((m: any) => cap(m.muscle)).join(' & ');
      diagnosis = {
        kind: 'local',
        line: `Most of your lifts are progressing, but ${names} ${downs.length > 1 ? 'are' : 'is'} heading backwards — that points to programming on those days, not overall recovery. Check the volume and RPE there.`,
      };
    } else if (scored.length >= 3 && downs.length >= 2 && downs.length > ups.length) {
      const sore = checkins?.soreness != null && checkins.soreness >= 3.5;
      diagnosis = {
        kind: 'systemic',
        line: sore
          ? `Multiple muscle groups are regressing and you've reported high soreness — that's systemic recovery debt, not a programming problem. Pull intensity back to RPE 7–8 this week.`
          : `Multiple muscle groups are regressing at once — that pattern is systemic (recovery, sleep, food), not one bad training day. Ease intensity before adding anything.`,
      };
    }
  }

  return {
    diagnosis,
    weekLabel: rangeLabel,
    weekStart: weekStartISO,
    weekEnd: weekEndISO,
    periodKey: weekStartISO,
    anchorOffset: A,
    hasData: true,
    thin,
    sessions: weekSessions.length,
    totalVolume,
    volumeDeltaPct,
    workingSets,
    avgRpe,
    clustersUsed,
    score: computeScore({
      progression: { progressed, stalled, regressed, total },
      strengthTrajectory: trends.strengthTrajectory,
      consistency: trends.consistency,
      rpeTrend: trends.rpeTrend,
      volumeDeltaPct,
      workingSets,
      avgRpe,
      weeksTrackable: trends.weeksTrackable,
      checkins,
    }),
    muscles,
    prs: prs.slice(0, 6),
    progression: { progressed, stalled, regressed, total },
    insights,
    recommendations,
    trends,
    series,
  };
}

// ─── The Autopsy: the most recent COMPLETED week that has data ────────────────
// A single off-week should never blank the autopsy — scan back up to 8 weeks for the
// most recent completed week with a logged session and report on that one.
export async function getAutopsyReport(userId: string): Promise<WeeklyReport> {
  const since = new Date(Date.now() - 70 * 86400000).toISOString();
  const { data } = await supabase
    .from('workout_sessions')
    .select('performed_at')
    .eq('user_id', userId)
    .gte('performed_at', since);
  const times = (data || []).map((s: any) => new Date(s.performed_at).getTime());
  let anchor = 1; // default to last week (will be hasData:false → "first autopsy" teaser)
  for (let off = 1; off <= 8; off++) {
    const b = weekBounds(off);
    if (times.some(t => t >= b.start && t < b.end)) { anchor = off; break; }
  }
  return getWeeklyReport(userId, anchor);
}

// ─── The Pulse: a lean, live read of the CURRENT week + momentum ──────────────
// Present-tense heartbeat. Deliberately sparse — status & momentum, never a grade
// (you don't grade an unfinished week). Always has something timely to say.
export interface Pulse {
  hasEverTrained: boolean;
  sessionsThisWeek: number;
  plannedThisWeek: number;       // scheduled training days in the current week (0 = no schedule)
  onPace: 'ahead' | 'on' | 'behind' | null;
  weekComplete: boolean;
  workingSets: number;
  volume: number;
  streakWeeks: number;
  recentPRs: { exercise: string; detail: string }[];
  liveLine: string;
  hasAutopsy: boolean;           // a completed week with data exists (so we can point to it)
}

function pickLiveLine(c: any): string {
  if (!c.hasEverTrained) return 'Log your first session — your intelligence starts building the moment you do.';
  if (c.sessionsThisWeek === 0) {
    return c.hasAutopsy
      ? "Fresh week, clean slate. Last week's autopsy is below — go execute it."
      : 'New week, clean slate. Get the first session on the board.';
  }
  if (c.recentPRs.length) return `You just beat your best on ${c.recentPRs[0].exercise}. That's the storyline — build on it.`;
  if (c.weekComplete) return `${c.sessionsThisWeek}/${c.plannedThisWeek} done — the week's in the books. Your autopsy drops when it closes.`;
  if (c.plannedThisWeek > 0 && c.onPace === 'behind' && c.day >= 3) {
    const left = Math.max(0, c.plannedThisWeek - c.sessionsThisWeek);
    return `${c.sessionsThisWeek}/${c.plannedThisWeek} in and the week's running out — ${left} to go. Don't coast.`;
  }
  if (c.streakWeeks >= 3 && c.day <= 1) return `${c.streakWeeks}-week streak alive. Protect it — get today's work in.`;
  if (c.plannedThisWeek > 0) return `${c.sessionsThisWeek}/${c.plannedThisWeek} sessions, ${c.onPace === 'ahead' ? 'ahead of pace' : 'on pace'}. Keep stacking quality work.`;
  return `${c.sessionsThisWeek} session${c.sessionsThisWeek === 1 ? '' : 's'} in. Keep it moving — quiet mouth, loud weights.`;
}

export async function getPulse(userId: string): Promise<Pulse> {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const [{ data: sessionsData }, { data: tmpl }] = await Promise.all([
    supabase.from('workout_sessions')
      .select(`id, performed_at, session_rpe, soreness, readiness,
        session_exercises(exercise_id,
          exercises(name, primary_muscle, movement_pattern),
          set_logs(weight, reps, rpe, is_warmup, cluster_reps))`)
      .eq('user_id', userId)
      .gte('performed_at', since)
      .order('performed_at', { ascending: false }),
    supabase.from('workout_templates')
      .select('template_sessions(session_order, scheduled_dow)')
      .eq('user_id', userId).eq('is_active', true).maybeSingle(),
  ]);

  const sessions = sessionsData || [];
  const tMs = (s: any) => new Date(s.performed_at).getTime();
  const inWeek = (s: any, b: { start: number; end: number }) => tMs(s) >= b.start && tMs(s) < b.end;
  const thisWk = weekBounds(0);
  const weekSessions = sessions.filter(s => inWeek(s, thisWk));
  const hasEverTrained = sessions.length > 0;

  // Working sets + volume so far this week.
  let workingSets = 0, volume = 0;
  for (const s of weekSessions) {
    for (const ex of s.session_exercises || []) {
      const pattern = ex.exercises?.movement_pattern;
      for (const st of (ex.set_logs || [])) {
        if (isWorkingSet(st, pattern)) { workingSets += 1 + (sumC(st) > 0 ? 1 : 0); volume += setVol(st); }
      }
    }
  }

  // Schedule → planned days this week + pace.
  let weeklyDows: number[] = [];
  if (tmpl) {
    const tsessions = [...(tmpl.template_sessions || [])].sort((a, b) => (a.session_order ?? 0) - (b.session_order ?? 0));
    weeklyDows = Object.keys(buildSchedule(tsessions)).map(Number);
  }
  const todayDow = (new Date().getDay() + 6) % 7; // 0=Mon … 6=Sun
  const plannedThisWeek = weeklyDows.length;
  const plannedElapsed = weeklyDows.filter(d => d <= todayDow).length;
  const sessionsThisWeek = weekSessions.length;
  let onPace: any = null, weekComplete = false;
  if (plannedThisWeek > 0) {
    weekComplete = sessionsThisWeek >= plannedThisWeek;
    onPace = sessionsThisWeek > plannedElapsed ? 'ahead' : sessionsThisWeek >= plannedElapsed ? 'on' : 'behind';
  }

  // Streak — consecutive weeks with ≥1 session; an untrained current week doesn't break it.
  let streakWeeks = 0;
  for (let off = 0; off <= 12; off++) {
    const has = sessions.some(s => inWeek(s, weekBounds(off)));
    if (has) streakWeeks++;
    else if (off === 0) continue;
    else break;
  }

  // Recent PRs (last 7 days): a set whose e1RM beats the best seen before it in-window.
  const oldFirst = [...sessions].reverse();
  const bestSoFar: Record<string, number> = {};
  const prMap: Record<string, { exercise: string; detail: string; e: number }> = {};
  const weekAgo = Date.now() - 7 * 86400000;
  for (const s of oldFirst) {
    const recent = tMs(s) >= weekAgo;
    for (const ex of s.session_exercises || []) {
      const id = ex.exercise_id;
      for (const st of (ex.set_logs || [])) {
        if (st.is_warmup || !st.reps || !st.weight) continue;
        const e = e1rm(st.weight, st.reps, st.rpe);
        const prior = bestSoFar[id];
        if (recent && prior != null && e > prior + 0.5) {
          if (!prMap[id] || e > prMap[id].e) prMap[id] = { exercise: ex.exercises?.name || 'a lift', detail: `${st.weight}×${st.reps}`, e };
        }
        if (prior == null || e > prior) bestSoFar[id] = e;
      }
    }
  }
  const recentPRs = Object.values(prMap).sort((a, b) => b.e - a.e).slice(0, 3).map(p => ({ exercise: p.exercise, detail: p.detail }));

  // Is there a completed week with data (so the pulse can point at "last week's autopsy")?
  let hasAutopsy = false;
  for (let off = 1; off <= 8; off++) { if (sessions.some(s => inWeek(s, weekBounds(off)))) { hasAutopsy = true; break; } }

  const liveLine = pickLiveLine({
    hasEverTrained, sessionsThisWeek, plannedThisWeek, plannedElapsed, weekComplete,
    onPace, recentPRs, streakWeeks, day: todayDow, hasAutopsy,
  });

  return {
    hasEverTrained, sessionsThisWeek, plannedThisWeek, onPace, weekComplete,
    workingSets, volume, streakWeeks, recentPRs, liveLine, hasAutopsy,
  };
}

// ─── Layer 2b: AI coach narrative (structured) ───────────────────────────────
// The edge function returns a STRUCTURED read so the UI can render it scannable
// (verdict + typed cards + one action) instead of a wall of text.
// The ANTHROPIC_API_KEY never touches the client — the edge function holds it.

export interface CoachRead {
  score: {
    overall: number;          // 0-100 coach's-gestalt readiness/quality score
    strength: string;         // letter grade e.g. "A", "B+"
    hypertrophy: string;
    recovery: string;
    consistency: string;
  };
  biggestWin: { title: string; stat?: string; detail: string } | null;
  biggestLimitation: { title: string; detail: string } | null;
  observations: string[];                              // 2-4 short bullets
  prescription: string[];                              // short imperative bullets
  // Performance Trends rows are engine-driven (report.trends.muscleScores), not AI.
}

// Monday-of-this-week ISO date, used as the cache key.
function currentPeriodKey(): string {
  const { start } = weekBounds(0);
  return new Date(start).toISOString().slice(0, 10);
}

function parseRead(raw: string | null | undefined): CoachRead | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    // Only accept the dashboard shape; older cached shapes return null so the
    // autopsy regenerates in the current format.
    if (o && o.score && Array.isArray(o.observations)) return o as CoachRead;
  } catch (_) { /* legacy plaintext — regenerate */ }
  return null;
}

export async function getWeeklyNarrative(
  userId: string,
  report: WeeklyReport,
  opts: { force?: boolean } = {},
): Promise<{ read: CoachRead | null; cached: boolean; error?: string }> {
  if (!report.hasData) return { read: null, cached: false };
  const periodKey = report.periodKey || currentPeriodKey();

  // 1. Cache hit?
  if (!opts.force) {
    const { data: existing } = await supabase
      .from('ai_reports')
      .select('narrative')
      .eq('user_id', userId)
      .eq('type', 'weekly')
      .eq('period_key', periodKey)
      .maybeSingle();
    const cachedRead = parseRead(existing?.narrative);
    if (cachedRead) return { read: cachedRead, cached: true };
  }

  // 2. Pull a light profile to give the coach context.
  const { data: profile } = await supabase
    .from('users')
    .select('rep_preference, experience_level, archetype, goal, weakest_part')
    .eq('id', userId)
    .single();

  // 3. Call the edge function (auth + the Anthropic key live server-side).
  const { data, error } = await supabase.functions.invoke('smooth-responder', {
    body: { report, profile },
  });
  if (error) {
    // supabase-js hides the function's response body in error.context — dig it out.
    let detail = error.message;
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.json();
        detail = body?.detail ? `${body.error}: ${body.detail}` : (body?.error || detail);
      }
    } catch (_) { /* ignore */ }
    return { read: null, cached: false, error: detail };
  }
  const read: CoachRead | undefined = data?.read;
  if (!read || !read.score) return { read: null, cached: false, error: data?.error || 'No read returned' };

  // 4. Cache it (store the structured read as JSON).
  await supabase
    .from('ai_reports')
    .upsert(
      { user_id: userId, type: 'weekly', period_key: periodKey, narrative: JSON.stringify(read) },
      { onConflict: 'user_id,type,period_key' },
    );

  return { read, cached: false };
}
