// @ts-nocheck
// SWOLE OS — body-composition intelligence engine.
// Pure logic (no I/O) so it's testable on its own. Takes body-comp samples (from
// Apple Health: weight / lean mass / body-fat %), the lifter's current PHASE, and the
// training STRENGTH direction, and produces a graduated-confidence read that isolates
// training-vs-nutrition. The native HealthKit fetch lives separately in health.ts.
//
// Guardrails baked in (per spec):
//  • Trends, never single readings — endpoints are smoothed (multi-day average).
//  • Bioimpedance (Hume/scale) lean mass is noisy → wider "flat" band, corroborate w/ strength.
//  • Confidence scales with time: ~1wk = early mention; ~2wk = soft trend; 4wk+ = verdict.
//  • Never hard-claim nutrition (no food data) → "likely".

export type Phase = 'gain' | 'lean' | 'recomp' | 'maintain';
export interface MetricSample { date: number; value: number; } // ms epoch, value
export interface BodyMetrics {
  weight: MetricSample[];   // lbs
  leanMass: MetricSample[]; // lbs
  bodyFat: MetricSample[];  // percent (0–100)
}
export interface BodyCompRead {
  confidence: 'early' | 'trend' | 'verdict';
  windowDays: number;
  weightDelta: number | null;   // lbs
  leanDelta: number | null;     // lbs
  bodyFatDelta: number | null;  // percentage points
  ratePctPerWeek: number | null; // weight change as % bodyweight / week
  headline: string;
  detail: string;
  flag: 'nutrition' | 'training' | 'recovery' | null;
  tag: { label: string; tone: 'good' | 'flag' | 'neutral' }; // quick state: BUILDING / SHREDDING / LEAN MASS ↓ / HOLDING
}

const DAY = 86400000;

// Average of the samples within `days` of each end — kills single-reading noise.
function endpoints(samples: MetricSample[], days = 4): { start: number; end: number; span: number } | null {
  if (!samples || samples.length < 2) return null;
  const s = [...samples].sort((a, b) => a.date - b.date);
  const first = s[0].date, last = s[s.length - 1].date;
  const span = (last - first) / DAY;
  if (span < 1) return null;
  const w = days * DAY;
  const head = s.filter(x => x.date <= first + w);
  const tail = s.filter(x => x.date >= last - w);
  const mean = (arr) => arr.reduce((a, b) => a + b.value, 0) / arr.length;
  return { start: mean(head), end: mean(tail), span };
}

// Direction with a "flat" dead-band (band is in the metric's own units).
function dir(delta: number | null, band: number): 'up' | 'down' | 'flat' {
  if (delta == null) return 'flat';
  if (delta > band) return 'up';
  if (delta < -band) return 'down';
  return 'flat';
}

const cav = (c: BodyCompRead['confidence']) =>
  c === 'early' ? ' One week is a short window — give it a couple more to trust it.'
    : c === 'trend' ? ' Early trend; it firms up over the next couple weeks.'
      : '';

export function readBodyComp(opts: {
  metrics: BodyMetrics;
  phase: Phase | null;
  strengthDir: 'up' | 'flat' | 'down' | null;
  maxWindowDays?: number; // only read the most RECENT N days (default ~2 weeks) — never all-time
}): BodyCompRead | null {
  const { metrics, phase, strengthDir } = opts;
  const maxWindowDays = opts.maxWindowDays ?? 14;
  // Clip to a rolling recent window so a new user doesn't see a multi-year trend.
  const cutoff = Date.now() - maxWindowDays * DAY;
  const clip = (arr) => (arr || []).filter((sx) => sx.date >= cutoff);
  const metricsW = { weight: clip(metrics.weight), leanMass: clip(metrics.leanMass), bodyFat: clip(metrics.bodyFat) };

  const we = endpoints(metricsW.weight);
  if (!we || we.span < 5) return null; // need a few recent weigh-ins before saying anything

  const windowDays = Math.round(we.span);
  const confidence: BodyCompRead['confidence'] = we.span >= 28 ? 'verdict' : we.span >= 14 ? 'trend' : 'early';

  const weightDelta = we.end - we.start;
  const bw = we.end || we.start || 1;
  const ratePctPerWeek = (weightDelta / bw) * 100 / (we.span / 7);

  const le = endpoints(metricsW.leanMass);
  const fe = endpoints(metricsW.bodyFat);
  const leanDelta = le ? le.end - le.start : null;
  const bodyFatDelta = fe ? fe.end - fe.start : null;

  // Direction bands — lean mass band is wide (bioimpedance noise); weight ~0.4% bw.
  const wDir = dir(weightDelta, Math.max(1, bw * 0.004 * (we.span / 7)));
  const lDir = dir(leanDelta, 1.2);            // ±1.2 lb of lean = noise
  const fDir = dir(bodyFatDelta, 0.5);          // ±0.5 pct points = noise
  const sUp = strengthDir === 'up';
  const sFlat = strengthDir === 'flat' || strengthDir == null;

  let headline = '', detail = '', flag: BodyCompRead['flag'] = null;

  // ── Pivot logic: phase × body-comp × strength ──────────────────────────────
  if (phase === 'gain') {
    if (lDir === 'up' && (fDir !== 'up' || sUp)) {
      headline = 'Gaining — and it looks like muscle.';
      detail = `Lean mass up${leanDelta ? ` ~${Math.abs(leanDelta).toFixed(1)} lb` : ''} with strength climbing. This is the bulk working — keep the surplus where it is.`;
    } else if (lDir !== 'up' && sUp) {
      headline = 'Strength is up, but the scale isn’t building muscle.';
      detail = 'Your training stimulus is clearly working — lean mass just isn’t following. That gap is most likely nutrition: nudge calories/protein up.';
      flag = 'nutrition';
    } else if (lDir !== 'up' && sFlat) {
      headline = 'Not much is moving.';
      detail = 'Lean mass flat and strength flat — fix the training stimulus first (is overload actually happening?) before touching food.';
      flag = 'training';
    } else if (wDir === 'up' && fDir === 'up' && lDir !== 'up') {
      headline = 'Gaining mostly fat.';
      detail = sUp
        ? 'Strength is up but body fat is climbing faster than muscle — your surplus is likely too big. Trim it a touch.'
        : 'Weight and body fat up without strength moving — this is a surplus problem, not a muscle-building one. Tighten calories and chase progression.';
      flag = 'nutrition';
    } else {
      headline = 'Holding steady on the bulk.';
      detail = 'No clear muscle gain yet. Keep progressing the lifts and make sure the surplus is real.';
    }
  } else if (phase === 'lean') {
    if (wDir === 'down' && lDir !== 'down') {
      headline = 'Clean cut — fat down, muscle holding.';
      detail = `Weight trending down${le ? ' while lean mass holds' : ''} and strength steady. Exactly what a good cut looks like — stay the course.`;
    } else if (wDir === 'down' && lDir === 'down' && strengthDir === 'down') {
      headline = 'Cutting too hard.';
      detail = 'Losing weight, lean mass, AND strength together — the deficit is too aggressive. Ease it back and push protein up to protect muscle.';
      flag = 'nutrition';
    } else if (wDir !== 'down') {
      headline = 'Not losing yet.';
      detail = 'On a cut, the scale should be drifting down over a couple weeks. If it isn’t, the deficit isn’t there — tighten intake.';
      flag = 'nutrition';
    } else {
      headline = 'Leaning out.';
      detail = 'Trending the right way. Keep an eye on strength — if it starts falling fast, slow the cut.';
    }
  } else if (phase === 'recomp') {
    if (lDir === 'up' && (fDir === 'down' || wDir === 'flat')) {
      headline = 'Textbook recomp.';
      detail = 'Lean mass up while fat/weight hold or drop — you’re rebuilding the body at maintenance. Rare and hard; keep doing exactly this.';
    } else if (sUp) {
      headline = 'Recomp on track.';
      detail = 'Strength climbing at a stable weight is the recomp signal even before the scale shows it. Stay patient and consistent.';
    } else {
      headline = 'Recomp is slow going.';
      detail = 'Nothing dramatic moving. Recomps are slow — lean on progressive overload and tight nutrition, and judge it over weeks not days.';
    }
  } else if (phase === 'maintain') {
    if (wDir !== 'flat' || lDir !== 'flat') {
      headline = 'Drifting off maintenance.';
      detail = `You’re set to maintain but body comp is moving (${wDir === 'up' ? 'weight up' : wDir === 'down' ? 'weight down' : 'weight steady'}${lDir !== 'flat' ? `, lean ${lDir}` : ''}). If that’s not intended, adjust intake.`;
    } else {
      headline = 'Holding steady.';
      detail = 'Weight and composition stable — maintenance is doing its job. Training to progress, eating to hold.';
    }
  } else {
    // No phase set — describe what's moving, no verdict.
    const bits = [
      lDir !== 'flat' ? `lean mass ${lDir}` : null,
      wDir !== 'flat' ? `weight ${wDir}` : null,
      fDir !== 'flat' ? `body fat ${fDir}` : null,
    ].filter(Boolean);
    headline = bits.length ? `Body comp is moving — ${bits.join(', ')}.` : 'Body comp is holding steady.';
    detail = 'Set your current phase (gaining / leaning / recomp / maintain) and I’ll tell you whether that’s on plan.';
  }

  // Quick state tag (independent of phase) — what's actually happening right now.
  let tag: BodyCompRead['tag'] = { label: 'HOLDING', tone: 'neutral' };
  if (lDir === 'down' && leanDelta != null && leanDelta < -2) tag = { label: 'LEAN MASS ↓', tone: 'flag' };
  else if (lDir === 'up') tag = { label: 'BUILDING', tone: 'good' };
  else if (fDir === 'down' || (wDir === 'down' && lDir !== 'down')) tag = { label: 'SHREDDING', tone: 'good' };

  return {
    confidence, windowDays, weightDelta, leanDelta, bodyFatDelta, ratePctPerWeek,
    headline, detail: detail + cav(confidence), flag, tag,
  };
}
