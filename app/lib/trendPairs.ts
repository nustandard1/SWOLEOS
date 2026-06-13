// @ts-nocheck
// SWOLE OS — paired trend views ("conclusions, not lines").
// Three coach-framed comparisons, each two related metrics indexed to % change so
// different units compare honestly on one axis:
//   PERFORMANCE  strength vs lean mass   — "am I bigger & stronger?"  (the default)
//   TRAINING     volume   vs strength    — "is the work paying off?"  (adaptation quadrant)
//   PHYSIQUE     weight   vs body fat    — "is my body changing right?"
// Inputs = input/output/context framing: volume is INPUT, strength & lean are OUTPUT,
// weight & bf% are CONTEXT. Never overlay unrelated units raw — index or point-change.
// All verdicts are deterministic (no AI round-trip) and phase-aware where it matters.
import { supabase } from './supabase';
import { isHealthAvailable, getBodyMetrics, deriveLean } from './health';

const DAY = 86400000, WEEK = 7 * DAY;
const WEEKS = 8; // trend window

// Goal keys (users.current_phase) → display label for the Physique view.
const PHASE_LABELS = {
  gain: 'BULK', lean_gain: 'LEAN GAIN', recomp: 'RECOMP',
  maintain: 'MAINTAIN', lean: 'CUT', none: null,
};

function mondayOf(d) {
  const m = new Date(d); m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

// ── weekly bucketing ─────────────────────────────────────────────────────────
// Index 0 = oldest, WEEKS-1 = current (in-progress) week.
function weekIndexOf(t, thisMonday) {
  const ago = Math.floor((thisMonday.getTime() + WEEK - t) / WEEK); // 0 = current week
  const idx = WEEKS - 1 - ago;
  return idx >= 0 && idx < WEEKS ? idx : null;
}

// Strength index: per-exercise weekly best e1RM, each exercise indexed to its own
// first appearance, then averaged per week. Robust to exercise selection (an upper
// week vs lower week doesn't fake a strength swing the way raw e1RM sums would).
function strengthIndexSeries(sessions, thisMonday) {
  const exWeeks = {}; // name -> [best e1rm per week | null]
  for (const sess of sessions) {
    const wk = weekIndexOf(new Date(sess.performed_at).getTime(), thisMonday);
    if (wk == null) continue;
    for (const ex of sess.session_exercises || []) {
      const nm = ex.exercises?.name; if (!nm) continue;
      for (const st of ex.set_logs || []) {
        if (st.is_warmup || !st.reps || !st.weight) continue;
        const e = st.weight * (1 + st.reps / 30);
        if (!exWeeks[nm]) exWeeks[nm] = Array(WEEKS).fill(null);
        if (!exWeeks[nm][wk] || e > exWeeks[nm][wk]) exWeeks[nm][wk] = e;
      }
    }
  }
  const ratios = Array.from({ length: WEEKS }, () => []);
  for (const nm in exWeeks) {
    const w = exWeeks[nm];
    const firstIdx = w.findIndex(v => v != null);
    if (firstIdx < 0) continue;
    const dataWeeks = w.filter(v => v != null).length;
    if (dataWeeks < 2) continue; // one-off exercises can't speak to a trend
    const base = w[firstIdx];
    for (let i = firstIdx; i < WEEKS; i++) if (w[i] != null && base > 0) ratios[i].push(w[i] / base);
  }
  return ratios.map(r => (r.length ? (r.reduce((a, b) => a + b, 0) / r.length) * 100 : null));
}

function volumeSeries(sessions, thisMonday) {
  const vol = Array(WEEKS).fill(null);
  for (const sess of sessions) {
    const wk = weekIndexOf(new Date(sess.performed_at).getTime(), thisMonday);
    if (wk == null) continue;
    for (const ex of sess.session_exercises || []) {
      for (const st of ex.set_logs || []) {
        if (st.is_warmup || !st.reps) continue;
        vol[wk] = (vol[wk] || 0) + (st.weight || 0) * st.reps;
      }
    }
  }
  return vol;
}

// Weekly averages of Health samples (weight / lean / bf).
function sampleSeries(samples, thisMonday) {
  const sums = Array.from({ length: WEEKS }, () => ({ t: 0, n: 0 }));
  for (const sm of samples || []) {
    const wk = weekIndexOf(sm.date, thisMonday);
    if (wk != null) { sums[wk].t += sm.value; sums[wk].n += 1; }
  }
  return sums.map(x => (x.n ? x.t / x.n : null));
}

// ── series helpers ───────────────────────────────────────────────────────────
const dataWeeks = (s) => (s || []).filter(v => v != null).length;

// Forward-fill nulls after the first real value so lines read as trends, not gaps.
function ffill(s) {
  const out = [...s];
  for (let i = 1; i < out.length; i++) if (out[i] == null && out[i - 1] != null) out[i] = out[i - 1];
  return out;
}

// % change from the first real value. (For bf%, use pointSeries instead.)
function indexPct(s) {
  const f = s.find(v => v != null && v !== 0);
  if (f == null) return s.map(() => null);
  return s.map(v => (v == null ? null : ((v / f) - 1) * 100));
}
// Point change from the first real value (bf% — points ≈ same visual scale as % change).
function pointSeries(s) {
  const f = s.find(v => v != null);
  if (f == null) return s.map(() => null);
  return s.map(v => (v == null ? null : v - f));
}

// Smoothed endpoints: avg of first two real values vs avg of last two — one partial
// or noisy week can't fake a trend.
function endsOf(s) {
  const vals = (s || []).map((v, i) => ({ v, i })).filter(x => x.v != null);
  if (vals.length < 2) return null;
  const head = vals.slice(0, Math.min(2, vals.length));
  const tail = vals.slice(-Math.min(2, vals.length));
  const mean = (a) => a.reduce((x, y) => x + y.v, 0) / a.length;
  return { start: mean(head), end: mean(tail) };
}
function dirOf(delta, band) {
  if (delta == null) return null;
  return delta > band ? 'up' : delta < -band ? 'down' : 'flat';
}
const fmtPct = (p) => `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
const fmtLb = (d) => `${d >= 0 ? '+' : ''}${d.toFixed(1)} LB`;
const fmtPt = (d) => `${d >= 0 ? '+' : ''}${d.toFixed(1)} PT`;

// ── the pure builder ─────────────────────────────────────────────────────────
export function buildTrendViews({ sessions = [], body = null, phase = null, phaseChangedAt = null }) {
  // Grace window: the first ~2 weeks after switching to a cut/bulk, lean-mass swings are
  // mostly water & glycogen — don't read them as muscle gained/lost (spec, Mike).
  const inGrace = phaseChangedAt && (Date.now() - new Date(phaseChangedAt).getTime()) <= 14 * DAY;
  const thisMonday = mondayOf(new Date());
  const labels = Array.from({ length: WEEKS }, (_, i) => {
    const ago = WEEKS - 1 - i;
    return ago === 0 ? 'NOW' : `${ago}W`;
  });

  const strRaw = strengthIndexSeries(sessions, thisMonday);
  const volRaw = volumeSeries(sessions, thisMonday);
  const leanRaw = sampleSeries(body?.leanMass, thisMonday);
  const wtRaw = sampleSeries(body?.weight, thisMonday);
  const bfRaw = sampleSeries(body?.bodyFat, thisMonday);

  // Endpoint stats (computed on RAW series, bands in real units).
  const strE = endsOf(strRaw);                       // index points ≈ %
  const strengthPct = strE ? strE.end - strE.start : null;
  const sDir = dirOf(strengthPct, 2);                // ±2% strength = noise

  const leanE = endsOf(leanRaw);
  const leanDelta = leanE ? leanE.end - leanE.start : null;
  const lDir = dirOf(leanDelta, 1.2);                // ±1.2 lb lean = bioimpedance noise

  // Volume: current week is in-progress — judging it against full weeks fakes a crash.
  // The TRAINING view drops the current week entirely (both lines, same x-range).
  const volComplete = volRaw.slice(0, WEEKS - 1);
  const strComplete = strRaw.slice(0, WEEKS - 1);
  const volE = endsOf(volComplete);
  const volPct = volE && volE.start > 0 ? ((volE.end / volE.start) - 1) * 100 : null;
  const vDir = dirOf(volPct, 10);                    // ±10% weekly volume = normal swing
  const strCE = endsOf(strComplete);
  const strCPct = strCE ? strCE.end - strCE.start : null;
  const sCDir = dirOf(strCPct, 2);

  const wtE = endsOf(wtRaw);
  const wtDelta = wtE ? wtE.end - wtE.start : null;
  const bw = wtE ? wtE.end || wtE.start : null;
  const wDir = dirOf(wtDelta, bw ? Math.max(1, bw * 0.008) : 1); // ±0.8% bw = noise
  const bfE = endsOf(bfRaw);
  const bfDelta = bfE ? bfE.end - bfE.start : null;
  const fDir = dirOf(bfDelta, 0.5);                  // ±0.5 pt = noise

  const isGain = phase === 'gain' || phase === 'lean_gain';
  const isCut = phase === 'lean';

  // "Connected with thin data" and "not connected" are DIFFERENT states: the
  // connect CTA only belongs when there are ZERO samples. Some-but-not-enough
  // gets honest warming-up copy instead — never tell a connected user to connect.
  const anyLean = (body?.leanMass || []).length > 0;
  const anyWt = (body?.weight || []).length > 0;
  const anyBf = (body?.bodyFat || []).length > 0;
  // Health status surfaced on the card so "connected & warming up" never looks
  // like "broken": none → connect CTA; syncing → explicit count + unlock note.
  const bodyInfoOf = (samples, series) => {
    const n = (samples || []).length;
    if (n === 0) return { state: 'none', count: 0, weeks: 0 };
    const w = dataWeeks(series);
    return { state: w >= 2 ? 'live' : 'syncing', count: n, weeks: w };
  };
  const leanInfo = bodyInfoOf(body?.leanMass, leanRaw);
  const wtInfo = bodyInfoOf(body?.weight, wtRaw);

  // ── PERFORMANCE — strength vs lean mass ──
  const perfOk = dataWeeks(strRaw) >= 2;
  const hasLean = dataWeeks(leanRaw) >= 2;
  let perfV;
  if (!perfOk) {
    perfV = { tone: 'neutral', badge: 'WARMING UP', headline: 'Not enough history yet.', sub: 'Log a couple of weeks of sessions and this becomes your money graph.' };
  } else if (hasLean) {
    if (sDir === 'up' && lDir === 'up') perfV = { tone: 'good', badge: 'BUILDING', headline: 'Bigger and stronger.', sub: 'Strength and lean mass climbing together — that’s real muscle, not just practice. The work is translating. Don’t change a thing.' };
    else if (sDir === 'up' && lDir === 'down' && isCut) perfV = { tone: 'good', badge: 'STRONG CUT', headline: 'Cutting without losing strength.', sub: 'Strength holding up while the scale drops — the cut is sparing muscle. Stay the course.' };
    else if (sDir === 'up') perfV = { tone: 'mid', badge: 'NEURAL', headline: 'Stronger, not bigger yet.', sub: isGain ? 'Strength is climbing but lean mass isn’t following — on a bulk that usually means the surplus isn’t big enough. Nudge food up.' : 'Strength is climbing ahead of lean mass — early gains are often neural. If size is the goal, make sure you’re eating for it.' };
    else if (lDir === 'up' && sDir !== 'down') perfV = { tone: 'mid', badge: 'LOADING', headline: 'Building, not expressing yet.', sub: 'Lean mass is up but strength hasn’t followed — often accumulated fatigue masking new muscle. PRs tend to land after the next easy week.' };
    else if (sDir === 'down' && lDir === 'down') perfV = { tone: 'flag', badge: 'LOSING GROUND', headline: 'Strength and size both slipping.', sub: 'Both trending down — check recovery and food first. If you’re cutting, the deficit is too aggressive.' };
    else if (sDir === 'down') perfV = { tone: 'flag', badge: 'CHECK FATIGUE', headline: 'Strength is slipping.', sub: 'Lean mass is holding but strength is falling — that pattern is usually fatigue or a recovery hole, not lost muscle. Look at sleep and RPE.' };
    else perfV = { tone: 'neutral', badge: 'HOLDING', headline: 'Holding pattern.', sub: 'Nothing moving much either way. Make sure progressive overload is actually happening — the engine sharpens as you log.' };
    // Early-cut / early-bulk grace window — don't misread water/glycogen as muscle. Only
    // override the ALARMING reads; a strength-corroborated verdict (sDir up) stands.
    if (inGrace && isCut && lDir === 'down' && sDir !== 'up') {
      perfV = { tone: 'neutral', badge: 'EARLY CUT', headline: 'It’s only week one.', sub: 'The first weeks of a cut, a lean-mass dip is mostly water and glycogen — not muscle. Don’t panic. Hold the line and reassess after about two weeks.' };
    } else if (inGrace && isGain && lDir === 'up' && sDir !== 'up') {
      perfV = { tone: 'mid', badge: 'EARLY BULK', headline: 'Lean’s up — give it a beat.', sub: 'Early in a bulk, some of that lean gain is water and glycogen. Real muscle confirms over the coming weeks — keep eating and training.' };
    }
  } else {
    // anyLean = connected but not enough weeks yet; !anyLean = nothing synced.
    const leanNote = anyLean
      ? ' Body-comp data is syncing in — a couple weeks of weigh-ins and this reads size against strength.'
      : ' Sync body-comp weigh-ins and SWOLE/OS reads whether it’s muscle too.';
    if (sDir === 'up') perfV = { tone: 'good', badge: 'STRONGER', headline: 'Getting stronger.', sub: 'Strength is trending up.' + leanNote };
    else if (sDir === 'down') perfV = { tone: 'flag', badge: 'CHECK FATIGUE', headline: 'Strength is slipping.', sub: 'Trend is down — check recovery, food, and whether RPEs are creeping.' + leanNote };
    else perfV = { tone: 'neutral', badge: 'HOLDING', headline: 'Strength holding steady.', sub: 'No clear move yet.' + leanNote };
  }

  // ── TRAINING — volume vs strength (adaptation quadrant) ──
  const trainOk = dataWeeks(volComplete) >= 2 && dataWeeks(strComplete) >= 2;
  let trainV;
  if (!trainOk) {
    trainV = { tone: 'neutral', badge: 'WARMING UP', headline: 'Not enough complete weeks yet.', sub: 'After a couple of full training weeks, this view shows whether the work is buying progress.' };
  } else if (sCDir === 'up' && (vDir === 'flat' || vDir === 'down')) {
    trainV = { tone: 'good', badge: 'EXCELLENT', headline: 'Maximum return on your training.', sub: `Strength ${fmtPct(strCPct)} without adding volume — every set is earning. This is what efficient training looks like.` };
  } else if (sCDir === 'up' && vDir === 'up') {
    trainV = { tone: 'mid', badge: 'MODERATE', headline: 'Progress — bought with volume.', sub: `Volume ${fmtPct(volPct)} and strength ${fmtPct(strCPct)}. It’s working, but you’re paying for it in work. Watch that the returns keep up.` };
  } else if (vDir === 'up') {
    trainV = { tone: 'flag', badge: 'POOR RETURN', headline: 'More work, no payoff.', sub: `Volume is up ${fmtPct(volPct)} but strength is flat — that’s junk-volume territory. Train harder at current volume before adding more.` };
  } else if (sCDir === 'down' && vDir === 'down') {
    trainV = { tone: 'neutral', badge: 'DELOAD?', headline: 'Both backing off.', sub: 'Volume and strength both trending down — fine if this is a planned deload or a life week. If not, get back on the plan.' };
  } else if (sCDir === 'down') {
    trainV = { tone: 'flag', badge: 'CHECK PLAN', headline: 'Same work, falling strength.', sub: 'Volume is steady but strength is dropping — usually recovery, food, or a stimulus that’s gone stale. Time to change something.' };
  } else {
    trainV = { tone: 'neutral', badge: 'STEADY', headline: 'Steady state.', sub: 'Volume and strength both holding. Sustainable — but if you want movement, the stimulus has to move first.' };
  }

  // ── PHYSIQUE — weight vs body fat ──
  const physOk = dataWeeks(wtRaw) >= 2;
  const hasBf = dataWeeks(bfRaw) >= 2;
  let physV;
  if (!physOk) {
    physV = anyWt
      ? { tone: 'neutral', badge: 'WARMING UP', headline: 'Weigh-ins flowing in.', sub: 'Body data is syncing — a couple weeks of weigh-ins and this view reads your cut or bulk honestly.' }
      : { tone: 'neutral', badge: 'NO WEIGH-INS', headline: 'No recent weigh-ins.', sub: 'Step on a synced scale a couple times a week and this view tracks your cut or bulk honestly.' };
  } else if (hasBf) {
    if (wDir === 'up' && fDir !== 'up') physV = { tone: 'good', badge: 'CLEAN BULK', headline: 'Gaining clean.', sub: `Weight ${fmtLb(wtDelta)} with body fat holding — the surplus is going where you want it. Keep it right here.` };
    else if (wDir === 'up' && fDir === 'up') physV = { tone: isGain ? 'mid' : 'flag', badge: 'FAST GAIN', headline: 'Gaining fast — watch the fat.', sub: `Weight ${fmtLb(wtDelta)} and body fat ${fmtPt(bfDelta)} together. Some fat comes with a bulk, but if this pace holds, trim the surplus.` };
    else if (wDir === 'down' && fDir === 'down') physV = { tone: 'good', badge: 'CLEAN CUT', headline: 'Cutting clean.', sub: `Weight ${fmtLb(wtDelta)} with body fat down ${fmtPt(bfDelta).replace('+', '')} — fat is what’s leaving. Exactly what a good cut looks like.` };
    else if (wDir === 'down') physV = { tone: 'mid', badge: 'LEANING', headline: 'Weight coming down.', sub: 'Scale is dropping with body fat steady — keep protein high and strength stable so the loss stays fat.' };
    else if (isCut) physV = { tone: 'mid', badge: 'STALLED', headline: 'The deficit isn’t there.', sub: 'You’re set to cut but the scale isn’t moving over the window. Tighten intake — the math doesn’t lie.' };
    else if (isGain) physV = { tone: 'mid', badge: 'STALLED', headline: 'The surplus isn’t landing.', sub: 'Set to gain but weight is flat — the surplus probably isn’t real. Add a little food and re-check in two weeks.' };
    else physV = { tone: 'neutral', badge: 'HOLDING', headline: 'Holding steady.', sub: 'Weight and body fat both stable. Set your phase (bulk / cut / recomp) and this view judges it against the plan.' };
  } else {
    physV = { tone: 'neutral', badge: wDir === 'up' ? 'GAINING' : wDir === 'down' ? 'LOSING' : 'HOLDING', headline: wDir === 'up' ? 'Weight trending up.' : wDir === 'down' ? 'Weight trending down.' : 'Weight holding steady.', sub: 'Sync body-fat readings and SWOLE/OS tells you whether the change is muscle or fat.' };
  }

  const views = [
    {
      key: 'performance', tab: 'PERFORMANCE', question: 'AM I BIGGER & STRONGER?',
      ok: perfOk,
      thin: perfOk && dataWeeks(strRaw) <= 2,        // short window — caveat the verdict
      needsHealth: !anyLean,                          // ZERO lean samples → offer the connect path (thin ≠ disconnected)
      bodyInfo: leanInfo,                             // none | syncing | live (+ sample/week counts)
      series: { labels, a: ffill(strRaw.map(v => (v == null ? null : v - 100))), b: hasLean ? ffill(indexPct(leanRaw)) : null },
      aLabel: 'STRENGTH', bLabel: 'LEAN MASS',
      big: [
        { v: strengthPct != null ? fmtPct(strengthPct) : '—', label: 'STRENGTH', line: 'a' },
        { v: leanDelta != null ? fmtLb(leanDelta) : '—', label: 'LEAN MASS', line: 'b' },
      ],
      verdict: perfV,
    },
    {
      key: 'training', tab: 'TRAINING', question: 'IS THE WORK PAYING OFF?',
      ok: trainOk,
      thin: trainOk && dataWeeks(volComplete) <= 2,
      needsHealth: false,                             // pure training data — works for everyone
      series: { labels: labels.slice(0, WEEKS - 1), a: ffill(indexPct(volComplete)), b: ffill(strComplete.map(v => (v == null ? null : v - 100))) },
      aLabel: 'VOLUME', bLabel: 'STRENGTH',
      big: [
        { v: volPct != null ? fmtPct(volPct) : '—', label: 'VOLUME', line: 'a' },
        { v: strCPct != null ? fmtPct(strCPct) : '—', label: 'STRENGTH', line: 'b' },
      ],
      verdict: trainV,
    },
    {
      key: 'physique', tab: 'PHYSIQUE', question: 'IS MY PHYSIQUE IMPROVING?',
      phaseLabel: PHASE_LABELS[phase] || null,
      ok: physOk,
      thin: physOk && dataWeeks(wtRaw) <= 2,
      needsHealth: !anyWt,                            // ZERO weigh-ins → connect; some-but-thin = warming up
      bodyInfo: wtInfo,
      series: { labels, a: ffill(indexPct(wtRaw)), b: hasBf ? ffill(pointSeries(bfRaw)) : null },
      aLabel: 'WEIGHT', bLabel: 'BODY FAT',
      big: [
        { v: wtDelta != null ? fmtLb(wtDelta) : '—', label: 'WEIGHT', line: 'a' },
        { v: bfDelta != null ? fmtPt(bfDelta) : '—', label: 'BODY FAT', line: 'b' },
      ],
      verdict: physV,
    },
  ];

  return { windowWeeks: WEEKS, views };
}

// Health samples only count from the day the account was created — people often have
// months of scale history that predates SWOLE/OS, and charting weeks the lifter wasn't
// even in the app (with no training to corroborate) tells a story we can't back. We DO
// keep the single most-recent reading so the lifter's CURRENT weight/BF% still shows.
export function clampBodyMetrics(body, sinceMs, keepLatest = true) {
  if (!body || !sinceMs) return body;
  const clip = (arr) => {
    const all = arr || [];
    const inWindow = all.filter((s) => s.date >= sinceMs);
    if (inWindow.length || !keepLatest || !all.length) return inWindow;
    return [[...all].sort((a, b) => b.date - a.date)[0]]; // just the latest, for the current value
  };
  return { weight: clip(body.weight), leanMass: clip(body.leanMass), bodyFat: clip(body.bodyFat) };
}

// The clamp boundary = the day the account was created (auth user). Falls back to ~8 weeks
// if that's unavailable. Used so trends never reach back before the lifter joined.
export async function accountCreatedMs() {
  try {
    const { data } = await supabase.auth.getUser();
    const c = data?.user?.created_at;
    return c ? new Date(c).getTime() : (Date.now() - 56 * DAY);
  } catch (e) { return Date.now() - 56 * DAY; }
}

// Merged body-comp series: Apple Health (clamped) + manual weigh-ins (body_metrics),
// re-deriving lean mass from the combined weight+bf when Health has no direct reading.
// One source of truth for every body-comp consumer (Physique, body-comp read, profile).
export async function getMergedBody(userId, sinceMs) {
  let health = { weight: [], leanMass: [], bodyFat: [] };
  try { if (isHealthAvailable()) health = clampBodyMetrics(await getBodyMetrics(), sinceMs); } catch (e) { /* no health */ }

  const mW = [], mBf = [];
  try {
    const { data } = await supabase
      .from('body_metrics')
      .select('logged_at, weight, body_fat')
      .eq('user_id', userId)
      .gte('logged_at', new Date(sinceMs).toISOString());
    for (const r of data || []) {
      const t = new Date(r.logged_at).getTime();
      if (r.weight != null) mW.push({ date: t, value: Number(r.weight) });
      if (r.body_fat != null) mBf.push({ date: t, value: Number(r.body_fat) });
    }
  } catch (e) { /* table missing (pre-migration) or offline — Health stands */ }

  const weight = [...(health.weight || []), ...mW];
  const bodyFat = [...(health.bodyFat || []), ...mBf];
  let leanMass = health.leanMass || [];
  if (!leanMass.length) leanMass = deriveLean(weight, bodyFat);
  return { weight, leanMass, bodyFat };
}

// ── loader: fetch sessions + Health + phase, then build ──────────────────────
export async function getTrendViews(userId) {
  const since = new Date(Date.now() - WEEKS * WEEK).toISOString();
  const [sessRes, userRes, authRes] = await Promise.all([
    supabase
      .from('workout_sessions')
      .select(`performed_at,
        session_exercises(
          exercises(name, movement_pattern),
          set_logs(weight, reps, rpe, is_warmup)
        )`)
      .eq('user_id', userId)
      .gte('performed_at', since)
      .order('performed_at', { ascending: true }),
    supabase.from('users').select('current_phase, phase_changed_at').eq('id', userId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const body = await getMergedBody(userId, await accountCreatedMs());
  return buildTrendViews({
    sessions: sessRes.data || [],
    body,
    phase: userRes.data?.current_phase || null,
    phaseChangedAt: userRes.data?.phase_changed_at || null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// THE TRAINING SCORE — one number, 3 pillars, generous floor.
// Scores only what the lifter CONTROLS (consistency / progression / effort),
// never absolute strength. Doing the basics right lands ~low-80s; the 90s need
// progression; sub-60 takes genuinely missing work AND backsliding.
// ─────────────────────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
function isWorkingSet(st, pattern) {
  if (st.is_warmup || !st.reps) return false;
  if (st.rpe == null) return true;
  return st.rpe >= ((pattern === 'squat' || pattern === 'hinge') ? 7 : 8);
}

export function buildScore({ sessions = [], plannedPerWeek = 0, phase = null }) {
  const now = Date.now();
  const thisMonday = mondayOf(new Date()).getTime();
  const isCut = phase === 'lean';

  // ── Consistency: trailing window (last full week + current partial), generous.
  // Pro-rated by how far into the week we are, so a Monday isn't a "miss".
  const elapsedDays = Math.min(7, Math.floor((now - thisMonday) / DAY) + 1);
  const fracThisWeek = elapsedDays / 7;
  const winStart = thisMonday - WEEK;
  const trainedDays = new Set(
    sessions.filter(s => new Date(s.performed_at).getTime() >= winStart)
      .map(s => { const d = new Date(s.performed_at); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; })
  ).size;
  const expPerWeek = plannedPerWeek > 0 ? plannedPerWeek : 3; // no program → 3/wk reference
  const expected = expPerWeek * (1 + fracThisWeek);
  const cRatio = trainedDays / Math.max(1, expected);
  const consistency = clamp((plannedPerWeek > 0 ? 40 : 45) + cRatio * (plannedPerWeek > 0 ? 60 : 55), 0, 100);

  // ── Progression: per-lift best e1RM over last 28d, earliest vs latest session.
  // Holding = neutral-positive (70). Only real backsliding drags it down.
  const since28 = now - 28 * DAY;
  const exSeq = {};
  for (const s of sessions) {
    const t = new Date(s.performed_at).getTime();
    if (t < since28) continue;
    for (const ex of s.session_exercises || []) {
      const nm = ex.exercises?.name; if (!nm) continue;
      let bestE = 0;
      for (const st of ex.set_logs || []) {
        if (st.is_warmup || !st.reps || !st.weight) continue;
        const e = st.weight * (1 + st.reps / 30);
        if (e > bestE) bestE = e;
      }
      if (bestE > 0) (exSeq[nm] = exSeq[nm] || []).push({ t, e: bestE });
    }
  }
  // A lift only counts toward progression if its readings span REAL time (≥5 days
  // apart) — same-day clusters say nothing about a trend. Absurd swings (>40%) are
  // data artifacts (warm-up logged as a top set, a typo), not progress; ignore them.
  const MIN_SPAN = 5 * DAY;
  let progressed = 0, regressed = 0, tracked = 0, worstRegressor = null;
  for (const nm in exSeq) {
    const seq = exSeq[nm].sort((a, b) => a.t - b.t);
    if (seq.length < 2) continue;
    const first = seq[0], last = seq[seq.length - 1];
    if (last.t - first.t < MIN_SPAN) continue;       // not enough real time between points
    const chg = (last.e / first.e) - 1;
    if (Math.abs(chg) > 0.4) continue;                // non-physical — treat as noise
    tracked++;
    if (chg > 0.01) progressed++;
    else if (chg < -0.02) { regressed++; if (!worstRegressor || chg < worstRegressor.chg) worstRegressor = { name: nm, chg }; }
  }
  let progression = null;
  if (tracked >= 2) {
    const regPenalty = isCut ? 20 : 40; // a slip on a cut is expected — lighter touch
    progression = clamp(70 + (progressed / tracked) * 30 - (regressed / tracked) * regPenalty, 0, 100);
  }

  // ── Effort: RPE'd working sets landing in the productive 7–9.5 band, last 21d.
  const since21 = now - 21 * DAY;
  let rpeSets = 0, productive = 0, maxedOut = 0;
  for (const s of sessions) {
    const t = new Date(s.performed_at).getTime();
    if (t < since21) continue;
    for (const ex of s.session_exercises || []) {
      for (const st of ex.set_logs || []) {
        if (st.is_warmup || !st.reps || st.rpe == null) continue;
        rpeSets++;
        if (st.rpe >= 7 && st.rpe <= 9.5) productive++;
        if (st.rpe >= 10) maxedOut++;
      }
    }
  }
  let effort = null;
  if (rpeSets >= 3) effort = clamp(60 + (productive / rpeSets) * 40 - (maxedOut / rpeSets > 0.5 ? 12 : 0), 0, 100);

  // ── Blend, renormalized over computable pillars ──
  const parts = [{ v: consistency, w: 0.40 }, { v: progression, w: 0.35 }, { v: effort, w: 0.25 }].filter(p => p.v != null);
  const wSum = parts.reduce((a, p) => a + p.w, 0);
  let overall = Math.round(parts.reduce((a, p) => a + p.v * p.w, 0) / wSum);

  // Early on, progression can't be measured — keep an engaged new lifter encouraged
  // (honest: it's explicitly labelled BASELINE), never punished by a thin window.
  const baseline = progression == null;
  if (baseline && trainedDays >= 1) overall = Math.max(overall, 72);

  const band = overall >= 90 ? 'DIALED' : overall >= 80 ? 'STRONG' : overall >= 70 ? 'SOLID' : overall >= 60 ? 'SLIPPING' : 'OFF TRACK';
  const tone = overall >= 80 ? 'good' : overall >= 65 ? 'mid' : 'flag';

  let caption;
  if (baseline) caption = 'Building your baseline — keep logging and your full read sharpens fast.';
  else if (regressed > 0 && regressed >= progressed) caption = 'A few lifts are slipping — check recovery and effort before adding work.';
  else if (consistency < 65) caption = 'Getting your sessions in is the biggest lever right now.';
  else if (progressed > 0 && consistency >= 75) caption = 'You’re progressing and showing up. This is working — keep doing it.';
  else if (progressed === 0) caption = 'Rock-solid consistency. Push a little harder to start moving the lifts again.';
  else caption = 'Holding steady. Stay consistent and keep chasing progression.';

  return {
    overall, band, tone, baseline, caption,
    pillars: {
      consistency: Math.round(consistency),
      progression: progression == null ? null : Math.round(progression),
      effort: effort == null ? null : Math.round(effort),
    },
    _worstRegressor: worstRegressor,
  };
}

// Muscle in the recent rotation that's gone the longest without hard work.
function laggingMuscle(sessions) {
  const now = Date.now(), since = now - 28 * DAY, last = {};
  for (const s of sessions) {
    const t = new Date(s.performed_at).getTime();
    if (t < since) continue;
    for (const ex of s.session_exercises || []) {
      const m = ex.exercises?.primary_muscle; if (!m) continue;
      const worked = (ex.set_logs || []).some(st => !st.is_warmup && st.reps);
      if (worked) last[m] = Math.max(last[m] || 0, t);
    }
  }
  let worst = null;
  for (const m in last) {
    const days = Math.floor((now - last[m]) / DAY);
    if (days >= 9 && (!worst || days > worst.days)) worst = { muscle: m, days };
  }
  return worst;
}

// "Do This" — up to 3 prioritized directives. Problems first, then physique,
// then a lagging muscle, then an affirmation. All deterministic.
export function buildDirectives({ views = [], score = {}, sessions = [], phase = null }) {
  const out = [];
  const perf = views.find(v => v.key === 'performance');
  const phys = views.find(v => v.key === 'physique');

  if ((score.pillars?.consistency ?? 100) < 70)
    out.push({ icon: 'calendar', text: 'You’re behind your plan — get the next session in.' });
  if (score._worstRegressor)
    out.push({ icon: 'trending-down', text: `${score._worstRegressor.name} strength is down ~${Math.round(Math.abs(score._worstRegressor.chg) * 100)}% — ease the load back and rebuild clean.` });
  if ((score.pillars?.effort ?? 100) < 65)
    out.push({ icon: 'flame', text: 'Sets are leaving reps in the tank — push isolation work closer to failure.' });

  if (phys?.ok && phys.verdict) {
    const b = phys.verdict.badge;
    if (b === 'CLEAN BULK') out.push({ icon: 'check', text: 'Hold the surplus — it’s building muscle, don’t touch it.' });
    else if (b === 'FAST GAIN') out.push({ icon: 'arrow-down', text: 'Trim the surplus a touch — fat’s climbing faster than muscle.' });
    else if (b === 'CLEAN CUT') out.push({ icon: 'check', text: 'Cut’s clean — fat’s leaving, muscle’s staying. Hold the line.' });
    else if (b === 'STALLED') out.push({ icon: 'alert-triangle', text: phase === 'lean' ? 'Scale’s stuck — tighten the deficit a notch.' : 'Weight’s flat — nudge food up to keep building.' });
  }

  const lag = laggingMuscle(sessions);
  if (lag) out.push({ icon: 'alert-triangle', text: `${cap(lag.muscle)}: ${lag.days} days since you trained it — slot it back in.` });

  if (out.length === 0) {
    out.push(perf?.verdict?.tone === 'good'
      ? { icon: 'check', text: 'Everything’s trending up — don’t change a thing.' }
      : { icon: 'target', text: 'Stay consistent and keep chasing progression — the read sharpens as you log.' });
  }
  return out.slice(0, 3);
}

// Reference data behind the "full breakdown" tap — last 28 days.
export function buildBreakdown({ sessions = [] }) {
  const now = Date.now(), since = now - 28 * DAY;
  const muscleSets = {};
  let workingSets = 0, rpeSum = 0, rpeN = 0, sessionCount = 0;
  for (const s of sessions) {
    if (new Date(s.performed_at).getTime() < since) continue;
    sessionCount++;
    for (const ex of s.session_exercises || []) {
      const m = ex.exercises?.primary_muscle, pattern = ex.exercises?.movement_pattern;
      for (const st of ex.set_logs || []) {
        if (!isWorkingSet(st, pattern)) continue;
        workingSets++;
        if (m) muscleSets[m] = (muscleSets[m] || 0) + 1;
        if (st.rpe != null) { rpeSum += st.rpe; rpeN++; }
      }
    }
  }
  return {
    muscles: Object.entries(muscleSets).sort((a, b) => b[1] - a[1]).map(([m, sets]) => ({ m, sets })),
    workingSets, sessionCount,
    avgRpe: rpeN ? Math.round((rpeSum / rpeN) * 10) / 10 : null,
  };
}

// INSIGHTS — a few noteworthy, non-obvious observations the lifter may not have
// clocked. Diagnostic (what's happening), not prescriptive (that's Suggestions).
// Everything requires REAL time span, so same-day test clusters surface nothing.
// Set-to-set drop-off within ONE exercise in ONE session: do the reps fall off (and RPE
// climb) across the straight sets at the working weight? Returns null unless there are ≥2
// working sets at the same load.
function sessionExerciseFade(setLogs, pattern) {
  const ws = (setLogs || [])
    .filter(st => isWorkingSet(st, pattern) && st.reps > 0 && st.weight > 0)
    .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0));
  if (ws.length < 2) return null;
  const w0 = ws[0].weight;
  const atW = ws.filter(st => Math.abs(st.weight - w0) <= 2.5); // straight sets at the work weight
  if (atW.length < 2) return null;
  const repFirst = atW[0].reps, repLast = atW[atW.length - 1].reps;
  if (repFirst <= 0) return null;
  const fadePct = (repFirst - repLast) / repFirst;
  const rpeFirst = atW[0].rpe, rpeLast = atW[atW.length - 1].rpe;
  const rpeRise = (rpeFirst != null && rpeLast != null) ? rpeLast - rpeFirst : null;
  const hard = fadePct >= 0.3 || (fadePct >= 0.2 && rpeRise != null && rpeRise >= 1.5);
  return { hard };
}

// Reads set-to-set drop-off against the lifter's OWN baseline (spec, Mike): a NEW/sudden
// widespread fade = fatigue; a CHRONIC fade for a beginner = work capacity; chronic fade
// for an experienced lifter = grinding too hard. Never asserts capacity when fatigue is
// plausible. Returns a single insight (or null when there isn't enough to read).
export function buildFadeRead({ sessions = [], experience = null }) {
  const now = Date.now();
  let recHard = 0, recTot = 0, priHard = 0, priTot = 0;
  for (const s of sessions) {
    const age = now - new Date(s.performed_at).getTime();
    const recent = age <= 28 * DAY, prior = age > 28 * DAY && age <= 56 * DAY;
    if (!recent && !prior) continue;
    for (const e of s.session_exercises || []) {
      const f = sessionExerciseFade(e.set_logs, e.exercises?.movement_pattern);
      if (!f) continue;
      if (recent) { recTot++; if (f.hard) recHard++; }
      else { priTot++; if (f.hard) priHard++; }
    }
  }
  if (recTot < 4) return null;            // not enough straight-set lifts to read
  const recRate = recHard / recTot;
  if (recRate < 0.4) return null;         // fade isn't widespread enough to flag
  const priRate = priTot >= 4 ? priHard / priTot : null;
  const isNew = priRate != null && priRate < recRate * 0.6; // wasn't happening before
  if (isNew) {
    return { icon: 'battery-low', tone: 'flag', sev: 3, text: 'Your reps are falling off hard set-to-set lately — more than they used to. That reads as fatigue, not your norm. Ease the intensity a notch and let recovery catch up.' };
  }
  if (experience === 'beginner') {
    return { icon: 'arm-flex', tone: 'mid', sev: 1, text: 'You fade a lot late in your lifts — first set strong, last set a grind. That’s work capacity, and it builds fast with consistent training. Keep showing up.' };
  }
  return { icon: 'battery-low', tone: 'mid', sev: 2, text: 'You’re routinely grinding your last sets into the ground — big drop-offs set to set. Leaving a rep in the tank earlier keeps more quality across the whole session.' };
}

export function buildInsights({ sessions = [] }) {
  const now = Date.now();
  const recentStart = now - 28 * DAY, priorStart = now - 56 * DAY, MIN_SPAN = 5 * DAY;

  const ex = {};                 // name -> { muscle, pattern, pts:[{t,e}] }
  const recVol = {}, priVol = {}; // muscle -> working-set count per window
  let recRpeSum = 0, recRpeN = 0, priRpeSum = 0, priRpeN = 0;

  for (const s of sessions) {
    const t = new Date(s.performed_at).getTime();
    if (t < priorStart) continue;
    const recent = t >= recentStart;
    for (const e of s.session_exercises || []) {
      const nm = e.exercises?.name, muscle = e.exercises?.primary_muscle, pattern = e.exercises?.movement_pattern;
      let bestE = 0;
      for (const st of e.set_logs || []) {
        if (isWorkingSet(st, pattern) && muscle) {
          (recent ? recVol : priVol)[muscle] = ((recent ? recVol : priVol)[muscle] || 0) + 1;
          if (st.rpe != null) { if (recent) { recRpeSum += st.rpe; recRpeN++; } else { priRpeSum += st.rpe; priRpeN++; } }
        }
        if (!st.is_warmup && st.weight && st.reps) { const ee = st.weight * (1 + st.reps / 30); if (ee > bestE) bestE = ee; }
      }
      if (nm && bestE > 0) { (ex[nm] = ex[nm] || { muscle, pattern, pts: [] }).pts.push({ t, e: bestE }); }
    }
  }

  const isPress = (muscle, pattern) => pattern === 'push' || ['chest', 'triceps', 'delts'].includes(muscle);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const musChg = {};
  let pressChgs = [], otherChgs = [];
  for (const nm in ex) {
    const pts = ex[nm].pts.sort((a, b) => a.t - b.t);
    if (pts.length < 2) continue;
    const f = pts[0], l = pts[pts.length - 1];
    if (l.t - f.t < MIN_SPAN) continue;
    const chg = (l.e / f.e) - 1;
    if (Math.abs(chg) > 0.4) continue;
    (musChg[ex[nm].muscle] = musChg[ex[nm].muscle] || []).push(chg);
    (isPress(ex[nm].muscle, ex[nm].pattern) ? pressChgs : otherChgs).push(chg);
  }

  const ins = [];
  const pAvg = avg(pressChgs), oAvg = avg(otherChgs);
  if (pAvg != null && oAvg != null && pressChgs.length >= 2 && otherChgs.length >= 2) {
    if (pAvg < -0.01 && oAvg > 0.01) ins.push({ icon: 'alert', tone: 'flag', sev: 3, text: 'Your pressing strength is sliding while everything else climbs — check shoulder/triceps recovery or your bench setup.' });
    else if (oAvg < -0.01 && pAvg > 0.01) ins.push({ icon: 'alert', tone: 'mid', sev: 2, text: 'Pressing is leading but pulls and legs are flat — even it out before the imbalance sets in.' });
  }
  // Rank the climbing muscles so only the single best gets "standout"; the rest
  // are worded as "climbing" (avoids multiple "your standout" lines).
  const climbers = Object.keys(musChg)
    .map(m => ({ m, sAvg: avg(musChg[m]) }))
    .filter(x => x.sAvg != null && x.sAvg >= 0.03)
    .sort((a, b) => b.sAvg - a.sAvg);
  const topClimber = climbers.length ? climbers[0].m : null;
  for (const m in musChg) {
    const sAvg = avg(musChg[m]), rv = recVol[m] || 0, pv = priVol[m] || 0;
    if (pv >= 4 && rv >= pv * 1.25 && sAvg != null && sAvg <= 0.005)
      ins.push({ icon: 'alert', tone: 'mid', sev: 2, text: `${cap(m)} volume is up but strength is flat — effort going to waste. Push the sets you have harder before adding more.` });
    else if (sAvg != null && sAvg >= 0.03)
      ins.push(m === topClimber
        ? { icon: 'trending-up', tone: 'good', sev: 2, text: `${cap(m)} is your standout — strength up ~${Math.round(sAvg * 100)}% this month. Keep that recipe.` }
        : { icon: 'trending-up', tone: 'good', sev: 1, text: `${cap(m)} is climbing too — strength up ~${Math.round(sAvg * 100)}% this month.` });
    if (pv >= 6 && rv <= pv * 0.7)
      ins.push({ icon: 'trending-down', tone: 'mid', sev: 2, text: `${cap(m)} volume is down ~${Math.round((1 - rv / pv) * 100)}% vs last month — if that’s not on purpose, it’ll stall.` });
  }
  const pushSets = (recVol.chest || 0) + (recVol.triceps || 0) + (recVol.delts || 0);
  const pullSets = (recVol.back || 0) + (recVol.biceps || 0);
  if (pushSets >= 8 && pullSets >= 1 && pushSets / Math.max(1, pullSets) >= 2)
    ins.push({ icon: 'alert', tone: 'mid', sev: 2, text: `You’re running ~${(pushSets / Math.max(1, pullSets)).toFixed(1)}× the pushing volume of pulling — add back work for your shoulders and posture.` });
  else if (pullSets >= 8 && pushSets >= 1 && pullSets / Math.max(1, pushSets) >= 2)
    ins.push({ icon: 'alert', tone: 'mid', sev: 2, text: `Your pulling volume is ~${(pullSets / Math.max(1, pushSets)).toFixed(1)}× your pushing — balance it out.` });
  const recRpe = recRpeN ? recRpeSum / recRpeN : null, priRpe = priRpeN ? priRpeSum / priRpeN : null;
  if (recRpe != null && priRpe != null && recRpe >= priRpe + 0.6 && (oAvg == null || oAvg <= 0.01))
    ins.push({ icon: 'alert', tone: 'flag', sev: 3, text: 'Your sessions are getting harder (RPE climbing) with little to show for it — a fatigue signal. An easier week may pay off.' });

  ins.sort((a, b) => b.sev - a.sev);
  return ins.slice(0, 4);
}

// One orchestrating fetch → everything the redesigned Intelligence screen needs.
export async function getIntelligence(userId) {
  const since = new Date(Date.now() - WEEKS * WEEK).toISOString();
  const [sessRes, userRes, tmplRes] = await Promise.all([
    supabase
      .from('workout_sessions')
      .select(`performed_at,
        session_exercises(
          exercises(name, primary_muscle, movement_pattern),
          set_logs(set_number, weight, reps, rpe, is_warmup)
        )`)
      .eq('user_id', userId)
      .gte('performed_at', since)
      .order('performed_at', { ascending: true }),
    supabase.from('users').select('current_phase, phase_changed_at, experience_level').eq('id', userId).maybeSingle(),
    // limit(1) not maybeSingle — multiple active templates (from testing) would otherwise throw.
    supabase.from('workout_templates').select('template_sessions(id)').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: false }).limit(1),
  ]);
  const sessions = sessRes.data || [];
  const phase = userRes.data?.current_phase || null;
  const phaseChangedAt = userRes.data?.phase_changed_at || null;
  const experience = userRes.data?.experience_level || null;
  const plannedPerWeek = (tmplRes.data?.[0]?.template_sessions || []).length;

  const body = await getMergedBody(userId, await accountCreatedMs());

  const { views } = buildTrendViews({ sessions, body, phase, phaseChangedAt });
  const score = buildScore({ sessions, plannedPerWeek, phase });
  const doThis = buildDirectives({ views, score, sessions, phase });
  const insights = buildInsights({ sessions });
  // Set-to-set drop-off read — a significant signal, so it leads the insights when present.
  const fadeRead = buildFadeRead({ sessions, experience });
  if (fadeRead) insights.unshift(fadeRead);
  const breakdown = buildBreakdown({ sessions });
  return { hasData: sessions.length > 0, score, views, doThis, insights, breakdown };
}
