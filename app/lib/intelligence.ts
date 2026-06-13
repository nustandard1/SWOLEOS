import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SetData {
  set_number: number;
  weight: number | null;
  reps: number;
  rpe: number | null;
  cluster_reps?: number[] | null;
}

export const sumClusters = (s: { cluster_reps?: number[] | null }) =>
  (s?.cluster_reps || []).reduce((a, b) => a + (b || 0), 0);

export interface ExerciseHistory {
  date: string;
  sets: SetData[];
  total_volume: number;
  total_reps: number;
}

export type RepPref = 'lower' | 'moderate' | 'higher';
export type ExpLevel = 'beginner' | 'intermediate' | 'advanced';

export interface CalibrationProfile {
  rep_preference?: RepPref | null;
  experience_level?: ExpLevel | null;
  archetype?: string | null; // 'compound' | 'physique' | 'both'
  goal?: string | null;      // top goal key
}

export interface ExerciseMeta {
  movement_pattern?: string | null;
  equipment?: string | null;
  primary_muscle?: string | null;
}

// One progression option. `w`/`r` (when present) make it APPLIABLE — the logger can
// load it into the untouched sets' ghosts with a tap. Label-only options are informational.
export interface TargetOption {
  label: string;
  w?: number;
  r?: number;
  addSet?: boolean; // option implies one more set than last session
}

export interface ProgressionGuidance {
  lastSummary: string | null;
  repRange: { min: number; max: number };
  targets: TargetOption[];
  plateau: { level: 'warn' | 'flag'; message: string } | null;
  // Optional one-liner shown above targets when last session's effort/recovery says
  // "be careful today" (RPE ceiling, high soreness, drained check-in). Advisory only.
  caution: string | null;
  // The progression suggestion in a brief COACHING VOICE — one or two plain-language
  // sentences (primary move + an alternative), e.g. "Aim for 3×6 at 185 lbs this week,
  // or 4 sets of 4 would work too." This is what the logger shows now (no tap-to-apply).
  coachNote: string | null;
}

// Post-session check-in from the lifter's most recent session (all fields optional —
// the check-in itself is skippable). Used to soften progression targets.
export interface LastCheckin {
  session_rpe?: number | null; // 1-10
  soreness?: number | null;    // 1-5
  readiness?: number | null;   // 1-5
  performed_at?: string | null;
}

// ─── Data fetch ───────────────────────────────────────────────────────────────
export async function getLastSession(userId: string, exerciseId: string): Promise<ExerciseHistory | null> {
  const sessions = await getExerciseHistory(userId, exerciseId, 1);
  return sessions[0] || null;
}

// Last N sessions of an exercise (most recent first) — powers progression + plateau.
export async function getExerciseHistory(
  userId: string,
  exerciseId: string,
  limit = 4
): Promise<ExerciseHistory[]> {
  const { data, error } = await supabase
    .from('session_exercises')
    .select(`
      workout_sessions!inner(user_id, performed_at),
      set_logs(set_number, weight, reps, rpe, is_warmup, cluster_reps)
    `)
    .eq('exercise_id', exerciseId)
    .eq('workout_sessions.user_id', userId)
    .order('workout_sessions(performed_at)', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as any[]).map(row => {
    const ws = (row.set_logs || []).filter((s: any) => !s.is_warmup && s.reps > 0);
    return {
      date: (row.workout_sessions as any).performed_at,
      sets: ws,
      total_volume: ws.reduce((a: number, s: any) => a + (s.weight || 0) * (s.reps + sumClusters(s)), 0),
      total_reps: ws.reduce((a: number, s: any) => a + s.reps + sumClusters(s), 0),
    };
  });
}

// ─── Classification ───────────────────────────────────────────────────────────
const COMPOUND_PATTERNS = ['horizontal_press', 'vertical_press', 'horizontal_pull', 'vertical_pull', 'squat', 'hinge', 'lunge'];

function classify(meta: ExerciseMeta) {
  const p = meta.movement_pattern || '';
  const isCompound = COMPOUND_PATTERNS.includes(p);
  const heavyBarbell = (p === 'squat' || p === 'hinge') && (meta.equipment === 'barbell' || meta.equipment === 'smith_machine');
  const lowerCompound = (p === 'squat' || p === 'hinge' || p === 'lunge');
  return { isCompound, heavyBarbell, lowerCompound };
}

// Target operating rep range from the lifter's preference + the lift type.
function repRange(profile: CalibrationProfile, cls: ReturnType<typeof classify>) {
  const pref: RepPref = (profile.rep_preference as RepPref) || 'moderate';
  let r: { min: number; max: number };
  if (cls.isCompound) {
    r = pref === 'lower' ? { min: 5, max: 8 } : pref === 'higher' ? { min: 8, max: 12 } : { min: 6, max: 10 };
  } else {
    r = pref === 'lower' ? { min: 6, max: 10 } : pref === 'higher' ? { min: 10, max: 15 } : { min: 8, max: 12 };
  }
  // Heavy barbell squat/hinge: a "loves heavy compounds" lifter (or low-rep pref) goes lower & heavier.
  if (cls.heavyBarbell) {
    r = (pref === 'lower' || profile.archetype === 'compound') ? { min: 3, max: 6 } : { min: 5, max: 8 };
  }
  return r;
}

function increment(cls: ReturnType<typeof classify>) {
  if (!cls.isCompound) return 5;     // isolation (but we prefer reps first)
  if (cls.lowerCompound) return 10;  // lower-body compound
  return 5;                          // upper-body compound
}
const round5 = (n: number) => Math.round(n / 5) * 5;
// Estimated 1RM (spec §4.1). RPE-adjusted: feed "effective reps" n = reps + RIR
// (RIR ≈ 10 − RPE, capped at 4) so reps-in-reserve count as strength. We AVERAGE Epley
// and Brzycki to cancel single-formula bias — Epley over-reads at higher reps, Brzycki
// under-reads; the mean is tighter. Both formulas diverge badly past ~10 effective reps
// (high-rep sets contaminate a strength estimate with endurance) — the confidence layer
// (§10, lands with the structured output) down-weights e1RM-driven calls there.
const e1rm = (s: SetData) => {
  const w = s.weight || 0;
  if (w <= 0 || (s.reps || 0) <= 0) return 0;
  const rir = s.rpe == null ? 0 : Math.max(0, Math.min(4, 10 - s.rpe));
  const n = s.reps + rir; // effective reps
  const epley = w * (1 + n / 30);
  const brzycki = n < 37 ? (w * 36) / (37 - n) : epley; // guard the n→37 asymptote
  return (epley + brzycki) / 2;
};

function bestE1rm(session: ExerciseHistory): number {
  const vals = (session.sets || []).filter(s => (s.weight || 0) > 0 && s.reps > 0).map(e1rm);
  return vals.length ? Math.max(...vals) : 0;
}

// ±4% — the e1RM measurement-noise floor (test–retest CV ~2.3–8.3%; spec §4.4, decision A).
// A change inside this band is noise, not progress and not a stall.
export const NOISE_BAND = 0.04;

// Rolling best-e1RM over up to `window` exposures from index i (sessions are
// most-recent-first). A 3-exposure mean is far less jumpy than a single session.
function rollingE1rm(sessions: ExerciseHistory[], i: number, window = 3): number {
  const vals: number[] = [];
  for (let k = i; k < Math.min(i + window, sessions.length); k++) {
    const e = bestE1rm(sessions[k]);
    if (e > 0) vals.push(e);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

// Consecutive recent exposures whose best e1RM failed to clear the prior ROLLING
// average by more than the ±4% band. Robust to noise in both directions: one up-wiggle
// no longer breaks a genuinely-flat run, and a sub-noise "gain" no longer reads as progress.
// (Replaces the old +0.5 lb threshold, which sat far inside the noise floor → false stalls.)
function countStalls(sessions: ExerciseHistory[]): number {
  let stalls = 0;
  for (let i = 0; i < sessions.length - 1; i++) {
    const cur = bestE1rm(sessions[i]);
    const prior = rollingE1rm(sessions, i + 1);
    if (cur <= 0 || prior <= 0) break;
    if (cur <= prior * (1 + NOISE_BAND)) stalls++; else break;
  }
  return stalls;
}

function detectPlateau(sessions: ExerciseHistory[], profile: CalibrationProfile) {
  if (sessions.length < 2) return null;
  const stalls = countStalls(sessions);
  // Decision F: trends act at 2 exposures (1 flat step), firm at 3. Advanced lifters
  // progress slower, so give them one more exposure of patience before we speak.
  const advanced = profile.experience_level === 'advanced';
  const warnAt = advanced ? 2 : 1;
  if (stalls >= warnAt + 1) {
    return { level: 'flag' as const, message: 'Stalled 3+ sessions. Recovery or programming is likely off — consider a deload, a lighter 6–7 RPE week, or swapping this lift.' };
  }
  if (stalls >= warnAt) {
    return { level: 'warn' as const, message: 'No clear progress lately. Chase a rep, or back off slightly to recover.' };
  }
  return null;
}

// Performance trend (spec §4.3): the latest exposure's best e1RM vs a 3-exposure ROLLING
// average, judged against the ±4% band. Because e1RM is RPE-adjusted, rep gains AND
// effort-quality both fall out of one number — same work at a LOWER RPE reads as progress,
// the SAME numbers at a higher RPE reads as a slip. Far less jumpy than a single-session delta.
export type Trend = 'progressing' | 'flat' | 'slipping' | 'unclear';
function classifyTrend(sessions: ExerciseHistory[]): Trend {
  if (!sessions || sessions.length < 2) return 'unclear';
  const cur = bestE1rm(sessions[0]);
  const prior = rollingE1rm(sessions, 1);
  if (cur <= 0 || prior <= 0) return 'unclear';
  if (cur > prior * (1 + NOISE_BAND)) return 'progressing';
  if (cur < prior * (1 - NOISE_BAND)) return 'slipping';
  return 'flat';
}

// Resting-HR readiness flag (spec §9.2 / §4.7). Compares a recent 3-day mean against a
// trailing baseline (~3–17 days back, uncoupled from the acute window). A sustained ≥7 bpm
// rise over baseline is a meaningful recovery signal (3–4 bpm is noise). CONFIRMATORY ONLY —
// the engine uses it to corroborate a back-off, never to override strong performance.
// Returns null when there isn't enough history (degrade gracefully).
export interface RhrFlag { elevated: boolean; delta: number; recent: number; baseline: number; }
export function computeRhrFlag(restingHr: { date: number; value: number }[] | null | undefined): RhrFlag | null {
  if (!restingHr || restingHr.length < 5) return null;
  const now = Date.now();
  const DAY = 86400000;
  const recent = restingHr.filter(r => now - r.date <= 3 * DAY);
  const baseline = restingHr.filter(r => { const age = now - r.date; return age > 3 * DAY && age <= 17 * DAY; });
  if (recent.length < 2 || baseline.length < 3) return null;
  const mean = (arr: { value: number }[]) => arr.reduce((a, b) => a + b.value, 0) / arr.length;
  const recentMean = mean(recent);
  const baselineMean = mean(baseline);
  const delta = Math.round(recentMean - baselineMean);
  return { elevated: delta >= 7, delta, recent: Math.round(recentMean), baseline: Math.round(baselineMean) };
}

// ─── The engine — builds in-session guidance for one exercise ──────────────────
export function buildProgressionGuidance(
  sessions: ExerciseHistory[],
  profile: CalibrationProfile,
  meta: ExerciseMeta,
  checkin?: LastCheckin | null,
  rhr?: RhrFlag | null
): ProgressionGuidance {
  const cls = classify(meta);
  const range = repRange(profile || {}, cls);

  // Recovery gate from the lifter's most recent post-session check-in (≤72h old).
  // Advisory only — softens recommendations, never blocks logging.
  let recoveryFlag: string | null = null;
  if (checkin && checkin.performed_at) {
    const ageH = (Date.now() - new Date(checkin.performed_at).getTime()) / 3600000;
    if (ageH <= 72) {
      if ((checkin.soreness || 0) >= 4 && (checkin.readiness || 5) <= 2) {
        recoveryFlag = 'You reported high soreness and low readiness — match last session today, save the push for when you’re fresh.';
      } else if ((checkin.soreness || 0) >= 4) {
        recoveryFlag = 'You reported high soreness last session — quality reps today, push only if it feels right.';
      } else if ((checkin.readiness || 5) <= 2) {
        recoveryFlag = 'You came in drained last session — match last session’s numbers and reassess as you warm up.';
      } else if ((checkin.session_rpe || 0) >= 9) {
        recoveryFlag = 'Last session was near max effort — repeating that performance IS progress.';
      }
    }
  }

  if (!sessions || sessions.length === 0) {
    return { lastSummary: null, repRange: range, targets: [], plateau: null, caution: null, coachNote: null };
  }

  const last = sessions[0];
  const sets = (last.sets || []).filter(s => (s.weight || 0) > 0 && s.reps > 0);
  if (sets.length === 0) {
    return { lastSummary: null, repRange: range, targets: [], plateau: null, caution: null, coachNote: null };
  }

  const lastSummary = sets.map(s => `${s.weight}×${s.reps}${sumClusters(s) ? ` +${(s.cluster_reps || []).join('·')}` : ''}`).join(' · ');
  const topWeight = Math.max(...sets.map(s => s.weight || 0));

  // Cluster-aware targets: if the top working set carried cluster reps, progression
  // focuses SOLELY on that cluster set (Mike's rules, by the set's own RPE):
  //   9.5–10 → repeat the same protocol · 9 → +1 rep per cluster (add volume) ·
  //   ≤8.5 → add weight, same clusters. Clusters cap at 5 reps each (timed clusters
  //   in PRO programs may run to 8 — not produced by this engine).
  const CLUSTER_REP_CAP = 5;
  const topClusterSet = sets.find(s => (s.weight || 0) === topWeight && sumClusters(s) > 0);
  if (topClusterSet) {
    const W = (n: number) => `${n} lbs`;
    const incC = increment(classify(meta));
    const c = (topClusterSet.cluster_reps || []).filter(x => x > 0);
    const cstr = c.join('·');
    const mainR = topClusterSet.reps;
    const cRpe = topClusterSet.rpe;
    const bumped = c.map(x => Math.min(x + 1, CLUSTER_REP_CAP));
    const canAddClusterReps = bumped.some((x, i) => x !== c[i]);
    // Cluster targets are informational (no w/r apply — cluster reps live per set).
    const targets: TargetOption[] = [];
    let cCaution: string | null = recoveryFlag;
    let cNote: string;
    if (cRpe != null && cRpe >= 9.5) {
      targets.push({ label: `Aim to repeat ${W(topWeight)} × ${mainR} + ${cstr} — same protocol, watch RPE` });
      if (!cCaution) cCaution = `That cluster set was RPE ${cRpe} — repeating it IS the win. Add nothing today.`;
      cNote = `That cluster set hit RPE ${cRpe} last time — repeat ${W(topWeight)} × ${mainR} + ${cstr}. Matching it is the win.`;
    } else if (cRpe != null && cRpe >= 9) {
      if (canAddClusterReps) {
        targets.push({ label: `Add cluster reps → ${W(topWeight)} × ${mainR} + ${bumped.join('·')}` });
        cNote = `Strong cluster work. Add a rep to each cluster → ${W(topWeight)} × ${mainR} + ${bumped.join('·')}.`;
      } else {
        // Every cluster already at the 5-rep cap — load is the only path up.
        targets.push({ label: `Clusters maxed at 5s — add load → ${W(round5(topWeight + incC))} × ${mainR} + ${cstr}` });
        cNote = `Clusters are maxed at 5s — add load instead: ${W(round5(topWeight + incC))} × ${mainR} + ${cstr}.`;
      }
    } else if (cRpe != null) {
      targets.push({ label: `Add load → ${W(round5(topWeight + incC))} × ${mainR} + ${cstr} (same clusters)` });
      cNote = `Add load and keep the same clusters → ${W(round5(topWeight + incC))} × ${mainR} + ${cstr}.`;
    } else {
      // No RPE logged on the cluster set — can't tier it; offer both paths.
      if (canAddClusterReps) targets.push({ label: `Add cluster reps → ${W(topWeight)} × ${mainR} + ${bumped.join('·')}` });
      targets.push({ label: `${canAddClusterReps ? 'Or add' : 'Add'} load → ${W(round5(topWeight + incC))} × ${mainR} + ${cstr}` });
      cNote = canAddClusterReps
        ? `Add a rep to each cluster → ${W(topWeight)} × ${mainR} + ${bumped.join('·')}, or add load if those move fast.`
        : `Add load → ${W(round5(topWeight + incC))} × ${mainR} + ${cstr}.`;
    }
    return { lastSummary, repRange: range, targets, plateau: detectPlateau(sessions, profile), caution: cCaution, coachNote: recoveryFlag || cNote };
  }
  const setsAtTop = sets.filter(s => (s.weight || 0) === topWeight);
  const repsAtTop = setsAtTop.map(s => s.reps);
  const minRepAtTop = Math.min(...repsAtTop);
  const maxRepAtTop = Math.max(...repsAtTop);
  const setCount = sets.length;
  const rpes = sets.map(s => s.rpe).filter((r): r is number => r != null);
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
  const inc = increment(cls);
  const isPhysique = profile?.archetype === 'physique'
    || profile?.goal === 'build_muscle'
    || profile?.goal === 'physique';

  const targets: TargetOption[] = [];
  const allHitTop = minRepAtTop >= range.max;
  const W = (n: number) => `${n} lbs`;

  // Has the lifter been adding sets over recent weeks? If so, don't keep
  // recommending "add a set" — push load/reps instead.
  const recentSetCounts = (sessions || []).slice(0, 3)
    .map(sn => (sn.sets || []).filter(x => (x.weight || 0) > 0 && x.reps > 0).length)
    .filter(c => c > 0);
  const setsCreptUp = recentSetCounts.length >= 2 && recentSetCounts[0] > Math.min(...recentSetCounts.slice(1));

  // An add-a-set volume option. Adding a set with SLIGHTLY FEWER reps at the same
  // weight is still progressive overload (more total reps). Offered only if it's a
  // genuine volume increase and sets haven't already been creeping up over weeks.
  function addSetOption(): TargetOption | null {
    if (setsCreptUp) return null;
    const repFloor = Math.max(1, minRepAtTop - 1);
    const newReps = (setCount + 1) * repFloor;
    const oldReps = setCount * minRepAtTop;
    if (newReps <= oldReps) return null;
    return { label: `Add volume → ${setCount + 1} × ${repFloor} @ ${W(topWeight)}`, w: topWeight, r: repFloor, addSet: true };
  }

  // ── Composite readiness (Mike's spec) ─────────────────────────────────────
  // RPE is the prominent metric, corroborated by the lift's own trajectory and the
  // lifter's recovery check-in. Flags stack toward caution; goals/experience shape
  // the options (rep range already personalizes via rep_preference + archetype).
  const rpeCeiling = avgRpe != null && avgRpe >= 9;
  const rpeHigh = avgRpe != null && avgRpe >= 8.5 && avgRpe < 9;

  // Context: is high RPE a ONE-OFF grinder or a TREND? A single hard day "is what it
  // is" — note it, don't catastrophize. Sustained high RPE across recent sessions is a
  // real recovery signal worth backing off. (Look at the 1–2 sessions BEFORE last.)
  const sessionAvgRpe = (sn: ExerciseHistory): number | null => {
    const rs = (sn.sets || []).filter(s => (s.weight || 0) > 0 && s.reps > 0 && s.rpe != null).map(s => s.rpe as number);
    return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  };
  const priorRpes = (sessions || []).slice(1, 3).map(sessionAvgRpe).filter((r): r is number => r != null);
  const rpeTrend = (rpeCeiling || rpeHigh) && priorRpes.length > 0 && priorRpes.every(r => r >= 8.5);
  const rpeOneOff = (rpeCeiling || rpeHigh) && (priorRpes.length === 0 || priorRpes.some(r => r < 8.5));

  // Trend off the 3-exposure ROLLING average (spec §4.3), not a single-session delta —
  // the stronger predictor, and it's the same band the stall logic uses.
  const trend = classifyTrend(sessions);
  const liftSlipping = trend === 'slipping';
  // Getting stronger? High RPE WITH progress is earned — note the intensity, never fault it.
  const liftProgressing = trend === 'progressing';

  const flagCount = (recoveryFlag ? 1 : 0) + (liftSlipping ? 1 : 0);
  // hold = repeat is the target · small = progression in smallest increments · push = full menu
  const tier: 'hold' | 'small' | 'push' =
    rpeCeiling ? 'hold'
    : rpeHigh ? (flagCount >= 1 ? 'hold' : 'small')
    : flagCount >= 2 ? 'hold'
    : flagCount === 1 ? 'small'
    : 'push';

  // Beginners progress near-linearly — lead with the load option on compounds.
  const loadFirst = profile?.experience_level === 'beginner' && cls.isCompound && !cls.heavyBarbell;

  // When an "add load" option resets reps, never imply MORE reps than last session —
  // load + reps together is a double jump. Reset to the range bottom or the lifter's
  // current reps, whichever is lower (e.g. last = 25×5, range 6–10 → "30 × 5", not "30 × 6").
  const loadResetReps = Math.min(range.min, minRepAtTop);

  // Sets×reps phrasing for the coaching note ("3×6" — or "6 reps" for a single set).
  const sxr = (n: number, r: number) => (n === 1 ? `${r} reps` : `${n}×${r}`);
  // Voice = TERSE + data-first by default; blunt/animated only when a real stall earns it.
  // Detect the stall up front so it can override as the headline.
  const plateau = detectPlateau(sessions, profile);
  const stalls = countStalls(sessions); // shared ±4% rolling-band logic (no more +0.5 lb)
  const freshAlt = `add ${inc} lbs or a rep if you feel good`;
  const rpeLead = avgRpe != null ? `Last: RPE ${avgRpe.toFixed(1)}. ` : '';
  let coachNote: string;

  let caution: string | null = recoveryFlag;
  if (tier === 'hold') {
    // Compact: the WHY lives inside the target line — no separate caution echoing it.
    if (rpeCeiling) {
      targets.push({ label: `Repeat ${W(topWeight)} × ${minRepAtTop} — last was RPE ${avgRpe.toFixed(1)}, that's plenty`, w: topWeight, r: minRepAtTop });
      if (rpeTrend && liftProgressing) coachNote = `Last: RPE ${avgRpe.toFixed(1)} — high, but still climbing. Repeat ${sxr(setCount, minRepAtTop)} at ${topWeight} lbs, or ${freshAlt}.`;
      else if (rpeTrend) coachNote = `RPE's run high a few sessions (${avgRpe.toFixed(1)}) with little to show — recover first. Repeat ${sxr(setCount, minRepAtTop)} at ${topWeight} lbs, or a lighter week.`;
      else coachNote = `Last: RPE ${avgRpe.toFixed(1)}. Repeat ${sxr(setCount, minRepAtTop)} at ${topWeight} lbs, or ${freshAlt}.`;
    } else {
      targets.push({ label: `Match last session — ${W(topWeight)} × ${minRepAtTop}, watch RPE`, w: topWeight, r: minRepAtTop });
      if (!caution) {
        if (rpeHigh && liftSlipping) caution = `RPE was ${avgRpe.toFixed(1)} and this lift slipped last session — repeat it clean before pushing.`;
        else if (liftSlipping) caution = `This lift slipped last session — match your numbers, save the push.`;
      }
      coachNote = `${liftSlipping ? 'Slipped last time. ' : ''}Match ${sxr(setCount, minRepAtTop)} at ${topWeight} lbs clean; add ${inc} lbs or a rep once it moves.`;
    }
    targets.push({ label: `Fresh? ${W(topWeight)} × ${minRepAtTop + 1} on at least 1 set`, w: topWeight, r: minRepAtTop + 1 });
  } else if (cls.heavyBarbell) {
    // RPE-7 conservative progression on heavy hinge/squat patterns
    if (avgRpe != null && avgRpe >= 8) {
      targets.push({ label: `Add reps → ${W(topWeight)} × ${minRepAtTop + 1} across`, w: topWeight, r: minRepAtTop + 1 });
      targets.push({ label: `Or repeat ${W(topWeight)} × ${minRepAtTop} cleaner (lower RPE)`, w: topWeight, r: minRepAtTop });
      coachNote = `Last: RPE ${avgRpe.toFixed(1)}. Heavy — earn a rep first: ${sxr(setCount, minRepAtTop + 1)} at ${topWeight} lbs, or repeat cleaner.`;
    } else {
      targets.push({ label: `Add load → ${W(round5(topWeight + inc))} × ${loadResetReps}+`, w: round5(topWeight + inc), r: loadResetReps });
      targets.push({ label: `Or add reps → ${W(topWeight)} × ${minRepAtTop + 1}`, w: topWeight, r: minRepAtTop + 1 });
      coachNote = `Bar moved well. ${sxr(setCount, loadResetReps)} at ${round5(topWeight + inc)} lbs, or hold ${topWeight} for ${minRepAtTop + 1}.`;
    }
  } else if (tier === 'small') {
    // Show what progression looks like — in the smallest demonstrable increments.
    const repOpt: TargetOption = { label: `Add a rep → ${W(topWeight)} × ${minRepAtTop + 1} on 1–2 sets`, w: topWeight, r: minRepAtTop + 1 };
    const loadOpt: TargetOption = { label: `Or smallest load jump → ${W(round5(topWeight + inc))} × ${loadResetReps}`, w: round5(topWeight + inc), r: loadResetReps };
    if (loadFirst) targets.push({ ...loadOpt, label: loadOpt.label.replace(/^Or s/, 'S') }, { ...repOpt, label: `Or add a rep → ${W(topWeight)} × ${minRepAtTop + 1} on 1–2 sets` });
    else targets.push(repOpt, loadOpt);
    coachNote = `${rpeLead}Nudge it — ${sxr(setCount, minRepAtTop + 1)} at ${topWeight} lbs, or ${round5(topWeight + inc)} for ${loadResetReps}.`;
  } else if (allHitTop) {
    // Double progression: hit the top of the range on all sets → add load, reset low
    targets.push({ label: `Add load → ${W(round5(topWeight + inc))} × ${range.min}–${range.max}`, w: round5(topWeight + inc), r: range.min });
    if (cls.isCompound) targets.push({ label: `Or add reps → ${W(topWeight)} × ${maxRepAtTop + 1}`, w: topWeight, r: maxRepAtTop + 1 });
    coachNote = `Topped your range last time — add load. ${sxr(setCount, range.min)} at ${round5(topWeight + inc)} lbs${cls.isCompound ? `, or chase ${maxRepAtTop + 1} at ${topWeight}` : ''}.`;
  } else {
    // Chase reps toward the top of the range (smallest jump first)
    const nextRep = Math.min(maxRepAtTop + 1, range.max);
    if (loadFirst) {
      targets.push({ label: `Add load → ${W(round5(topWeight + inc))} × ${loadResetReps}`, w: round5(topWeight + inc), r: loadResetReps });
      targets.push({ label: `Or add reps → ${W(topWeight)} × ${nextRep} across`, w: topWeight, r: nextRep });
    } else {
      targets.push({ label: `Add reps → ${W(topWeight)} × ${nextRep} across`, w: topWeight, r: nextRep });
      if (cls.isCompound) targets.push({ label: `Or add load → ${W(round5(topWeight + inc))} × ${loadResetReps}`, w: round5(topWeight + inc), r: loadResetReps });
    }
    // Alt: a volume set for physique lifters ("4 sets of 4"), else the load jump.
    const volAlt = (isPhysique && !setsCreptUp) ? `${setCount + 1} sets of ${Math.max(1, minRepAtTop - 1)} at ${topWeight} lbs` : null;
    const altPhrase = loadFirst
      ? `chase ${nextRep} at ${topWeight}`
      : (volAlt || (cls.isCompound ? `${round5(topWeight + inc)} for ${loadResetReps}` : null));
    coachNote = loadFirst
      ? `${rpeLead}Add load — ${sxr(setCount, loadResetReps)} at ${round5(topWeight + inc)} lbs, or ${altPhrase}.`
      : `${rpeLead}Aim ${sxr(setCount, nextRep)} at ${topWeight} lbs${altPhrase ? `, or ${altPhrase}` : ''}.`;
  }

  // Add-a-set volume option ONLY when nothing questions fatigue (full-push tier).
  if (targets.length < 3 && !cls.heavyBarbell && tier === 'push') {
    const v = addSetOption();
    if (v && !targets.some(t => t.label === v.label)) targets.push(v);
  }

  // Biometric corroboration (spec §9.2, cascade gate 2). RHR is CONFIRMATORY — it
  // strengthens a back-off when performance already says so, never overrides a PR.
  const rhrElevated = !!rhr?.elevated;
  const rhrPhrase = rhr ? `RHR's run +${rhr.delta} bpm over your baseline` : '';

  // A REAL stall gets the blunt, animated voice — it's the headline. Recovery evidence
  // (maxed RPE OR sustained-elevated RHR) routes "stuck" to a back-off, not "handle it".
  if (plateau && !recoveryFlag) {
    const stuck = stalls + 1;
    if (rpeCeiling || rhrElevated) {
      const why = rpeCeiling && rhrElevated ? `RPE's maxed (${avgRpe.toFixed(1)}) and ${rhrPhrase}`
        : rpeCeiling ? `RPE's maxed (${avgRpe.toFixed(1)})`
        : rhrPhrase;
      coachNote = `Stuck ${stuck} sessions and ${why} — that's recovery, not effort. Take a lighter week, then attack it.`;
    } else {
      coachNote = `${stuck} sessions at ${topWeight}×${minRepAtTop} — quit spinning your wheels. Add ${inc} lbs or chase a rep. Handle business.`;
    }
  } else if (rhrElevated && liftSlipping && !recoveryFlag) {
    // Slipping + sustained-elevated RHR, no formal stall yet — the corroborated back-off.
    coachNote = `This lift's sliding and ${rhrPhrase} — back off and bank some recovery. Repeat ${sxr(setCount, minRepAtTop)} at ${topWeight} lbs at most.`;
  } else if (rhrElevated && !liftProgressing && !caution) {
    // Neutral session but RHR is up — a quiet watch, don't change the prescription.
    caution = `Heads up — ${rhrPhrase}. Keep an eye on recovery this week.`;
  }
  // Recovery check-in context always wins — conservative and complete on its own.
  if (recoveryFlag) coachNote = recoveryFlag;

  return {
    lastSummary,
    repRange: range,
    targets: targets.slice(0, 3),
    plateau,
    caution,
    coachNote,
  };
}

// ─── Legacy helper (kept for compatibility) ────────────────────────────────────
export interface ProgressionTargets {
  add_reps: { sets: SetData[]; label: string };
  add_load: { sets: SetData[]; label: string };
  add_set: { sets: SetData[]; label: string };
}
export function getProgressionTargets(lastSets: SetData[]): ProgressionTargets | null {
  if (!lastSets || lastSets.length === 0) return null;
  const ws = lastSets.filter(s => s.weight !== null && (s.weight || 0) > 0);
  if (ws.length === 0) return null;
  const best = [...ws].sort((a, b) => (b.weight || 0) * b.reps - (a.weight || 0) * a.reps)[0];
  const w = best.weight || 0, reps = best.reps, n = ws.length;
  const inc = w >= 100 ? 5 : 2.5;
  return {
    add_reps: { label: `Add a rep → ${n} × ${reps + 1} @ ${w}lbs`, sets: ws.map(s => ({ ...s, reps: s.reps + 1 })) },
    add_load: { label: `Add load → ${n} × ${reps} @ ${w + inc}lbs`, sets: ws.map(s => ({ ...s, weight: (s.weight || 0) + inc })) },
    add_set: { label: `Add a set → ${n + 1} × ${reps} @ ${w}lbs`, sets: [...ws, { ...ws[ws.length - 1] }] },
  };
}

// ─── Date formatting ───────────────────────────────────────────────────────────
export function formatSessionDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
