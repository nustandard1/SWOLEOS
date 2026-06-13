// @ts-nocheck
// Derives "Highlights" — backward-looking WINS for the home reel.
// Facts only: PRs, streaks, on-track, top sets, volume. Interpretation/coaching
// is the Pulse's job (see Intelligence). Highlights celebrate the past; the Pulse
// reads the future. No overlap.

function mondayOf(d) {
  const m = new Date(d); m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}
function dKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtVol(v) {
  if (!v) return '0';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return Math.round(v).toLocaleString();
}
function isWorkingSet(set, pattern) {
  if (set.is_warmup || !set.reps) return false;
  if (set.rpe == null) return true;
  const threshold = (pattern === 'squat' || pattern === 'hinge') ? 7 : 8;
  return set.rpe >= threshold;
}

// First-run informational cards — shown in the reel for the first ~2 weeks while a new
// user has few real wins yet. They onboard (Health sync, RPE, rest timer) and set
// expectations (analytics ramp). They phase out automatically once the account ages past
// the window; real wins always lead, these trail.
// `action` marks a tappable tip (HighlightReel calls onTip(action)); `cta` is the hint.
const FIRST_RUN_TIPS = [
  { key: 'tip-howto', icon: 'rocket-launch', tone: 'acc', kicker: 'START HERE',
    title: 'Get the Most Out of SWOLE/OS', sub: 'Six habits that make your coaching sharper — tap to see them.', sub2: true, action: 'howto', cta: 'OPEN' },
  { key: 'tip-health', icon: 'heart-pulse', tone: 'acc', kicker: 'SETUP',
    title: 'Sync Apple Health', sub: 'Connect for deep insight into your physique, recovery and progress.', sub2: true, action: 'health', cta: 'CONNECT' },
  { key: 'tip-rpe', icon: 'gauge', tone: 'acc', kicker: 'TRAINING 101',
    title: 'Master Your RPE', sub: 'RPE rates how hard a set felt — it drives your whole progression.', sub2: true, action: 'rpe', cta: 'LEARN' },
  { key: 'tip-analytics', icon: 'chart-line', tone: 'acc', kicker: 'WHAT TO EXPECT',
    title: 'Analytics Warming Up', sub: 'Quality insights take a couple of weeks — keep logging and we handle the rest.', sub2: true },
  { key: 'tip-rest', icon: 'timer-outline', tone: 'acc', kicker: 'GOOD TO KNOW',
    title: 'Rest Timer, Your Call', sub: 'Switch the rest timer on or off at the top-right of any session.', sub2: true },
];

// Priority: PRs > streak > week-complete/on-track > top set > volume trend.
// First ~2 weeks also append onboarding tips. Returns up to ~7 cards.
export function buildHighlights({ sessions = [], loggedDates = {}, weekStats = {}, plannedPerWeek = 0, accountAgeDays = null, healthConnected = false }) {
  const out = [];
  const now = Date.now();
  const thisMon = mondayOf(new Date()).getTime();
  const lastMon = thisMon - 7 * 86400000;

  // --- PR detection (e1RM via Epley) across loaded history ---
  // A genuine PR requires PRIOR history for that lift AND a strict beat, set
  // within the last ~10 days. (First-ever logs aren't "PRs".) Collect them all.
  const asc = [...sessions].reverse();
  const best = {};
  const prs = [];
  for (const sess of asc) {
    const fresh = (now - new Date(sess.performed_at).getTime()) <= 10 * 86400000;
    for (const ex of sess.session_exercises || []) {
      const nm = ex.exercises?.name; if (!nm) continue;
      let sb = null;
      for (const st of ex.set_logs || []) {
        if (st.is_warmup || !st.reps || !st.weight) continue;
        const e = st.weight * (1 + st.reps / 30);
        if (!sb || e > sb.e1rm) sb = { e1rm: e, w: st.weight, reps: st.reps };
      }
      if (!sb) continue;
      const prior = best[nm];
      if (prior && sb.e1rm > prior.e1rm * 1.001 && fresh) {
        const pct = Math.round((sb.e1rm / prior.e1rm - 1) * 100);
        prs.push({ name: nm, w: sb.w, reps: sb.reps, pct, e1rm: sb.e1rm });
      }
      if (!prior || sb.e1rm > prior.e1rm) best[nm] = sb;
    }
  }
  // Biggest jumps first; surface up to 2 distinct lifts as their own cards.
  const seenPr = new Set();
  prs.sort((a, b) => b.pct - a.pct);
  for (const pr of prs) {
    if (seenPr.has(pr.name)) continue;
    seenPr.add(pr.name);
    out.push({
      key: `pr-${pr.name}`, icon: 'trophy', tone: 'good',
      kicker: 'NEW PR · THIS WEEK',
      title: pr.name,
      sub: `${pr.w} lbs × ${pr.reps}${pr.pct >= 1 ? ` — up ${pr.pct}%` : ''}`,
      big: pr.pct >= 1 ? `+${pr.pct}%` : null,
    });
    if (seenPr.size >= 2) break;
  }

  // --- This-week snapshot — a live read of the current training week ---
  let rpeSum = 0, rpeN = 0;
  for (const sess of sessions) {
    if (new Date(sess.performed_at).getTime() < thisMon) continue;
    for (const ex of sess.session_exercises || []) {
      const pattern = ex.exercises?.movement_pattern;
      for (const st of ex.set_logs || []) {
        if (st.rpe == null || !isWorkingSet(st, pattern)) continue;
        rpeSum += st.rpe; rpeN++;
      }
    }
  }
  const wkAvgRpe = rpeN ? rpeSum / rpeN : null;
  if ((weekStats.workouts || 0) > 0) {
    out.push({
      key: 'snapshot', icon: 'calendar-week', tone: 'acc',
      kicker: 'THIS WEEK',
      title: `${weekStats.workouts} Session${weekStats.workouts === 1 ? '' : 's'} In`,
      sub: `${weekStats.hardSets || 0} working sets · ${fmtVol(weekStats.volume || 0)} lbs${wkAvgRpe != null ? ` · avg RPE ${wkAvgRpe.toFixed(1)}` : ''}`,
      sub2: true, big: null,
    });
  }

  // --- Streak: consecutive weeks with >=1 logged session ---
  const weeks = new Set();
  for (const k of Object.keys(loggedDates)) {
    const p = k.split('-').map(Number);
    weeks.add(dKey(mondayOf(new Date(p[0], p[1] - 1, p[2]))));
  }
  let streak = 0;
  const cursor = mondayOf(new Date());
  if (!weeks.has(dKey(cursor))) cursor.setDate(cursor.getDate() - 7); // this week not started — count from last
  while (weeks.has(dKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 7); }
  if (streak >= 2) {
    out.push({
      key: 'streak', icon: 'fire', tone: 'acc',
      kicker: 'CONSISTENCY',
      title: `${streak}-Week Streak`,
      sub: 'Show up again — keep it alive.',
      big: null,
    });
  }

  // --- On track this week (capped; ad-hoc sessions never pad the plan) ---
  const done = Math.min(weekStats.workouts || 0, plannedPerWeek || 0);
  if (plannedPerWeek > 0) {
    if (done >= plannedPerWeek) {
      out.push({
        key: 'wk-done', icon: 'check-circle', tone: 'good',
        kicker: 'THIS WEEK',
        title: 'Week Complete',
        sub: `${plannedPerWeek}/${plannedPerWeek} sessions in the book.`,
        big: `${done}/${plannedPerWeek}`,
      });
    } else if (done > 0) {
      const left = plannedPerWeek - done;
      out.push({
        key: 'wk-prog', icon: 'progress-check', tone: 'acc',
        kicker: 'THIS WEEK',
        title: 'On Track',
        sub: `${left} session${left > 1 ? 's' : ''} to close out the week.`,
        big: `${done}/${plannedPerWeek}`,
      });
    }
  }

  // --- Week buckets: heaviest set + volume this/last week ---
  let topSet = null;     // { name, w, reps }
  let volThis = 0, volLast = 0;
  for (const sess of sessions) {
    const at = new Date(sess.performed_at).getTime();
    const bucket = at >= thisMon ? 'this' : (at >= lastMon ? 'last' : null);
    if (!bucket) continue;
    for (const ex of sess.session_exercises || []) {
      const pattern = ex.exercises?.movement_pattern;
      const nm = ex.exercises?.name;
      for (const st of ex.set_logs || []) {
        if (!isWorkingSet(st, pattern)) continue;
        const v = (st.weight || 0) * st.reps;
        if (bucket === 'this') {
          volThis += v;
          if (st.weight && (!topSet || st.weight > topSet.w)) topSet = { name: nm, w: st.weight, reps: st.reps };
        } else {
          volLast += v;
        }
      }
    }
  }

  if (topSet && topSet.name) {
    out.push({
      key: 'topset', icon: 'arm-flex', tone: 'acc',
      kicker: 'HEAVIEST THIS WEEK',
      title: topSet.name,
      sub: `Top set — ${topSet.w} lbs × ${topSet.reps}.`,
      big: null,
    });
  }

  // Volume: prefer the vs-last-week trophy when it's up; else the flat tally.
  const volTrendPct = volLast > 0 ? Math.round((volThis / volLast - 1) * 100) : null;
  if (volTrendPct != null && volTrendPct >= 3) {
    out.push({
      key: 'vol-trend', icon: 'trending-up', tone: 'good',
      kicker: 'THIS WEEK',
      title: 'Volume Climbing',
      sub: `${fmtVol(volThis)} lbs moved — up vs last week.`,
      big: `+${volTrendPct}%`,
    });
  } else if (volThis > 0) {
    out.push({
      key: 'vol', icon: 'weight-lifter', tone: 'acc',
      kicker: 'THIS WEEK',
      title: `${fmtVol(volThis)} lbs Moved`,
      sub: `${weekStats.hardSets || 0} working set${(weekStats.hardSets || 0) === 1 ? '' : 's'} logged.`,
      big: null,
    });
  }

  // First ~2 weeks: append onboarding tips after any real wins (so wins lead, tips
  // trail — and for a brand-new user with no wins yet, the tips ARE the reel).
  if (accountAgeDays != null && accountAgeDays <= 14) {
    for (const tip of FIRST_RUN_TIPS) {
      if (tip.action === 'health' && healthConnected) continue; // already synced — don't nudge
      out.push(tip);
    }
  }

  // Empty state — a nudge instead of a blank reel.
  if (out.length === 0) {
    out.push({
      key: 'empty', icon: 'rocket-launch', tone: 'acc',
      kicker: 'GET STARTED',
      title: 'Your Wins Live Here',
      sub: 'Log a session — PRs, streaks & records show up here.',
      big: null,
    });
  }

  return out.slice(0, 7);
}
