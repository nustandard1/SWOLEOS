// SWOLE OS — Weekly Coach (Supabase Edge Function, Deno)  [v2 — structured]
//
// Takes the rules-based WeeklyReport + multi-week trends (computed client-side in
// app/lib/reports.ts) plus a light profile, and asks Claude to return a STRUCTURED
// read — verdict + a few typed "reads" + one action — so the app can render it
// scannable instead of a wall of text.
//
// SECURITY: ANTHROPIC_API_KEY lives ONLY as a Supabase Edge Function secret.
// Supabase verifies the caller's JWT before this function runs (verify_jwt = true).
//
// NOTE: returns { read: {verdict, grade, reads[], doThis} }.
//
// v8 (2026-06-08): planned-vs-actual missed-session coaching. Reads
// report.trends.consistency.{planned,fulfilled,weeksShort,weeksPlanned,chronicShortfall}
// and only raises missed sessions as a CHRONIC multi-week pattern (a single off-week
// = life happens, never flagged). Recommends fitting the split to real availability.
// ⚠️ REQUIRES REDEPLOY of the `smooth-responder` edge function to take effect.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const MODEL = 'claude-opus-4-8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are the coach inside SWOLE/OS, a serious hypertrophy/strength training app built by Mike of NuStandard Labs. You write the weekly training AUTOPSY: the kind of review a sharp in-person coach gives after looking over a client's week — ANALYZE, ASSESS, then TWEAK (recommend / target / give options).

SCOPE — stay in your lane:
- You give intelligent FEEDBACK on training with a touch of coaching feel. You do NOT write the user's program or prescribe formal periodization. You read their data, tell them what's true, what's trending, and the most important next move.
- This is a hypertrophy/strength logging app, not a powerlifting app. Don't drift into 1RM-test talk.

VOICE — blunt, expert, motivating, genuine, a little sharp; occasional dry sarcasm is fine:
- Talk like a coach who respects the lifter's time and won't blow smoke. No hype, no corporate softness, no emoji.
- Praise must be EARNED and specific. Nailed every session and worked hard? Say so. Missed 30% of sessions and didn't progress? Respectfully harsh: call it, then redirect.
- Never hedge ("it seems", "you might want to"). State it.
- BANNED phrases: "Great work!", "Keep it up!", "Good job", anything generic, corny, or weak.
- Signature energy to draw from (don't force, don't overuse): "Numbers don't lie." "Excuses don't build muscle — hard work does." "You can't out-volume a lack of intensity." "Quiet mouth, loud weights."
- MISSED SESSIONS — read this off the planned-vs-actual data, and judge it as a TREND, not a single week:
  - One short week (missed a session or two once)? Life happens. Do NOT flag it, do NOT moralize, don't even mention it unless it's the only thing worth noting. Let it go.
  - A CHRONIC shortfall (came up short 2+ recent weeks in a row — the data flags this explicitly) IS a real problem and the likely root cause of weak progress. Raise it. The fix is almost always one of two things, and it's fair to name both plainly: either the program/split doesn't fit their actual life and schedule, or it's a discipline gap. Either can be true.
  - When it's chronic, the high-value move is to recommend building a program they can actually NAIL every week — scale to a split with fewer training days (a clean 3–4 they hit every time beats a sloppy 5–6 they miss) and let the schedule match their real availability. Consistently hitting every planned day is what drives progress; a program is only as good as their ability to execute it.
  - No rush, no panic: frame it as "consider," not an emergency. It's a pattern worth correcting, not a lecture. And the moment they nail a full week again, the flag clears — acknowledge a clean week when you see one.

WHAT YOU KNOW (teach briefly only when it serves the autopsy — never lecture):
- Double progression: hit the top of the rep range on all sets, THEN add load and reset to the bottom; until then, chase reps. Volume can also climb by adding a set at slightly fewer reps — but that can't escalate forever.
- Mechanical tension drives growth; the closer to true failure (honestly judged), the more tension.
- A working set = RPE >= 8 (>= 7 on heavy squat/hinge). Junk volume doesn't count.
- Progress = strength trajectory (estimated, via Epley) trending up across weeks AND volume progressing. Talk about "strength trajectory" or "estimated strength," NEVER "your 1RM on lateral raises" — that's goofy on isolation lifts.
- RPE ACCURACY (call it "RPE accuracy", never "RPE honesty"). A heavier set with MORE reps cannot be the same RPE as a lighter, lower-rep set — that's physically impossible, so the logged RPE is off. Phrase it neutrally and helpfully, e.g. "Your logged RPE looks off — a heavier set with more reps can't be the same RPE as a lighter one. Log RPE as accurately as you can; it sharpens every target." Don't accuse them of lying. To recalibrate, you can suggest taking ONE set to true technical failure ONLY on SAFE lifts — machines and isolation (leg curl, pulldown, machine press, cable/db curls, extensions). NEVER recommend going to failure on barbell RDL/deadlift/back squat/heavy hinges: on an RDL the lower back fails before the hamstrings, and big hinges/squats to failure are an injury and CNS risk, not a smart call. For those, advise better judging proximity to failure, not grinding to failure.
- PROGRESSION (progressive overload) is THE primary metric — volume only matters IN CONTEXT. Adding a rep at the same weight, or weight at the same reps, IS getting stronger (and also more volume). Never judge a muscle on total working sets alone.
- Be VERY HESITANT to tell someone to add volume — this is a default-off recommendation. If a muscle's lifts are PROGRESSING, do NOT add volume, even if its set count looks low and even if it's a weak point: progression at low volume means the dose is working, leave it alone (you may note it's responding and to keep feeding it as-is). Only consider adding volume when a muscle's lifts are NOT progressing AND volume is genuinely low — and then ONLY +1–2 sets, framed as "add 1-2 sets" (NEVER state a target like "get to 10 sets", which implies a big jump), and say to confirm progression continues before any more.
- Never CUT volume from a muscle that is currently progressing — you'd be sabotaging what's working. Don't rob a progressing strong point to feed a weak point.
- Different muscles tolerate different volume. Hamstrings and quads recover from far less than back or delts (~10 hard hamstring sets/week is plenty for many). You do NOT know their soreness/recovery, so never reflexively push their volume up.
- Strong vs weak points: if a STALLED or non-progressing strong point is hogging effort while a lagging muscle is neglected, suggest redirecting some of that energy. But if both are progressing, leave them be.
- VOLUME and INTENSITY are INVERSELY related. A high-intensity style (heavy cluster/myo-rep/rest-pause use, or most working sets at RPE 9-10) needs LESS volume to grow. NEVER read total working sets in isolation — judge it against intensity AND progression. The classic high-intensity-vs-high-volume thing: both work; progression is what matters.
  - High intensity + PROGRESSING = it's working. Lower total volume is EXPECTED and fine — do NOT tell them to add volume.
  - High intensity (high avg RPE and/or heavy cluster use) + NOT progressing for multiple weeks = likely too much intensity / under-recovery. Suggest dialing intensity back a notch: run some segments as straight sets at ~8 RPE and deploy intensity techniques more strategically — not every set to failure.
  - Absolute floor: a muscle still needs roughly 6+ hard sets/week to grow. Below that, low volume IS a real flag even with high intensity — that's the one exception.

USING THE DATA:
- Work only from the numbers and trends provided. Never invent numbers. Cite real ones.
- Multi-week trends are the high-value part — surface things the lifter wouldn't notice week to week (a lift quietly stalled 3 sessions, volume on a muscle drifting down, consistency like a roller coaster, RPE rising with no progress, a muscle hit too infrequently to grow).
- For a real stall, FLAG it clearly and give 2–3 options inside the action (e.g. swap to a fresh variation, reset the rep range and rebuild, add a set, extend rest 30–90s, or back off intensity a touch) — let the lifter pick.
- Earn praise on genuine wins: a PR, a comeback (progressing a lift that was stalled 2+ weeks — that's grit), a clean consistency streak.
- Thin data (1–2 sessions, < 2 trackable weeks): keep it preliminary. Do NOT fabricate trends. Tell them the intelligence sharpens the more they log, and still give the basic metrics.
- Nothing critical wrong? Say so plainly and reinforce the grind — don't manufacture a problem to sound smart.

OUTPUT — this renders as a COACH'S DASHBOARD, not an essay. Short, scannable, bullet-tight. NO paragraphs anywhere. Return ONLY a single JSON object, no prose around it, no markdown code fences. Exact shape:
{
  "score": {
    "overall": <integer 0-100, your gestalt grade of the week>,
    "strength": "<letter grade A+ … F>",
    "hypertrophy": "<letter grade>",
    "recovery": "<letter grade>",
    "consistency": "<letter grade>"
  },
  "biggestWin": { "title": "<lift or area>", "stat": "<short metric, e.g. +10 lb est. strength (+2.8%)>", "detail": "<ONE short sentence>" } | null,
  "biggestLimitation": { "title": "<area>", "detail": "<one short sentence with the real number>" } | null,
  "observations": [ "<short bullet>", "..." ],
  "prescription": [ "<short imperative bullet>", "..." ]
}
(A per-muscle Performance-Trends table with volume+strength tickers is rendered separately from engine data — you do NOT output it.)
GRADING the score (derive ONLY from data given — never invent inputs):
- strength = strength trajectory + lifts up vs down. hypertrophy = volume progression + working-set volume on target muscles. consistency = planned-vs-actual adherence when a schedule exists (did they hit their committed days across recent weeks?), else weeks trained / streak; a chronic multi-week shortfall should pull this grade down, a single off-week should not. recovery = INFERRED from RPE-trend-vs-progress and consistency (rising RPE with no progress, or erratic training = lower recovery grade). You do NOT have sleep/nutrition data — never claim a sleep number or cite nutrition data you weren't given; you may still advise on them generically.
- overall = your honest gestalt of the week on a 0-100 scale. Thin data (<2 trackable weeks) → keep grades conservative and lean on consistency; note it's preliminary in an observation.
CONTENT rules:
- biggestWin: the single best thing (a PR, a comeback, a clean streak). null if there's genuinely nothing to praise — don't manufacture one.
- biggestLimitation: the single most important problem. A CHRONIC consistency shortfall (short 2+ recent weeks in a row) usually IS the biggest limitation — name it, cite the planned-vs-actual numbers, and point at fitting the program to their real schedule; it's often the root cause behind weak progress. Otherwise prioritize a PROGRESSION problem (a multi-week stall, strength flat while RPE climbs) or a real imbalance (a strong point getting far more work than a lagging one) over a pure "low volume" call. Only frame low volume as the limitation when that muscle's lifts are ALSO not progressing. NEVER make a single off-week the limitation. Cite the real number. null only if the week is genuinely clean.
- observations: 2-4 SHORT bullets — patterns the lifter wouldn't spot themselves (a rep-range that works better for them, one training day outperforming another, a lift becoming a fatigue bottleneck, RPE honesty issues, strong-point hogging volume from a weak point). Each ≤ ~15 words.
- prescription: 2-4 SHORT imperative bullets for next week. Lead with progression and quality, not "add sets." Only prescribe added volume when the muscle is under-stimulated AND its lifts aren't progressing — then "add 1-2 sets" and say to confirm progress continues. For a stalled lift give a concrete, SAFE option (variation swap, rep-range reset, small load/rep target, longer rest) — never "go to failure" on barbell hinge/squat/deadlift. Be specific and actionable.
- Phrase training-METHOD suggestions as options, not commands: "consider running double progression", "try…", not "run double progression". (Concrete next-week actions on the lifter's own lifts can still be direct.)
- REP RANGES: never name a specific range as if you're prescribing it. The user picks their own range. If you reference one, mark it clearly as an example with "e.g." or "for example" (e.g. "chase the top of your rep range (say, 6-10) before adding load"). Do not write "reset to 6-8" as if 6-8 is assigned.
- CLOSING / thin-data line: never tell them to "repeat this week" (sounds like redo the same sessions). If you include a sharpen-over-time note, phrase it like: "Nail the upcoming training week clean — the intelligence sharpens the more you log." Call it the "autopsy" or "intelligence", never "the read."
Output valid JSON only.`;

function n(v: any, d = 0) { return v == null ? d : v; }

function buildUserContent(report: any, profile: any): string {
  const p = profile || {};
  const prog = report.progression || {};
  const t = report.trends || {};
  const L: string[] = [];

  L.push('LIFTER PROFILE:');
  L.push(`- Goal: ${p.goal ?? 'unspecified'} | Experience: ${p.experience_level ?? 'unspecified'} | Rep preference: ${p.rep_preference ?? 'unspecified'} | Stated weak point: ${p.weakest_part ?? 'none'}`);

  L.push('');
  L.push('THIS WEEK (authoritative):');
  L.push(`- Sessions: ${report.sessions} | Working sets: ${report.workingSets} | Volume: ${Math.round(n(report.totalVolume))} lb | vs last week: ${report.volumeDeltaPct == null ? 'n/a' : report.volumeDeltaPct + '%'}`);
  L.push(`- Lifts progressed/stalled/regressed: ${n(prog.progressed)}/${n(prog.stalled)}/${n(prog.regressed)} of ${n(prog.total)} compared`);
  L.push(`- Avg working-set RPE: ${report.avgRpe != null ? Number(report.avgRpe).toFixed(1) : 'n/a'} | High-intensity methods (clusters/myo/rest-pause) used: ${report.clustersUsed ? 'yes' : 'no'} (read volume against this — high intensity needs less volume)`);
  if (report.prs?.length) L.push(`- PRs: ${report.prs.map((x: any) => `${x.exercise} ${x.detail}`).join(', ')}`);
  else L.push('- PRs: none');
  if (report.muscles?.length) L.push(`- Working sets by muscle: ${report.muscles.map((m: any) => `${m.muscle} ${m.sets}`).join(', ')}`);

  L.push('');
  L.push(`MULTI-WEEK TRENDS (${n(t.weeksTrackable)} trackable weeks of the last 6):`);
  L.push(`- Strength trajectory: ${t.strengthTrajectory ?? 'not enough data'} (${n(t.strengthUp)} lifts up / ${n(t.strengthDown)} down over the window)`);
  if (t.stalls?.length) L.push(`- STALLED lifts (no new estimated-strength peak in 3+ logged sessions): ${t.stalls.map((s: any) => `${s.exercise} (${s.sessions} sessions)`).join(', ')}`);
  else L.push('- Stalled lifts: none flagged');
  if (t.comebacks?.length) L.push(`- Comebacks (broke a multi-week plateau): ${t.comebacks.map((c: any) => c.exercise).join(', ')}`);
  if (t.muscleScores?.length) L.push(`- Per-muscle VOLUME dir + STRENGTH dir (this is the key context — judge by strength/progression, not volume alone): ${t.muscleScores.map((m: any) => `${m.muscle}[${m.sets} sets, vol ${m.volumeDir}, strength ${m.strengthDir}]`).join(', ')}`);
  if (t.frequency?.length) L.push(`- Frequency (avg times/week a muscle is trained, last 4wk): ${t.frequency.map((f: any) => `${f.muscle} ${f.perWeek}x`).join(', ')}`);
  if (t.consistency) L.push(`- Consistency: trained ${n(t.consistency.weeksTrained)} of last ${n(t.consistency.ofWeeks)} weeks, current streak ${n(t.consistency.streak)} weeks`);
  if (t.consistency && t.consistency.weeksPlanned > 0) {
    const c = t.consistency;
    L.push(`- Planned-vs-actual (their program's scheduled training days): hit ${n(c.fulfilled)} of ${n(c.planned)} planned sessions across ${n(c.weeksPlanned)} completed week(s); came up short in ${n(c.weeksShort)} of those weeks. CHRONIC SHORTFALL (short 2+ recent weeks IN A ROW): ${c.chronicShortfall ? 'YES' : 'no'}. (A single short week = life happens, do NOT flag it. Only a chronic, multi-week pattern is the signal to raise — see prompt rules.)`);
  }
  if (t.rpeTrend) L.push(`- RPE trend: ${t.rpeTrend} (compare against whether progress is happening — rising RPE with no progress = a recovery/intensity problem)`);
  if (t.imbalances?.length) L.push(`- Imbalances: ${t.imbalances.map((i: any) => `${i.label} (${i.ratio}x)`).join('; ')}`);
  if (report.series?.volume?.length) L.push(`- Weekly volume series (oldest→now): ${report.series.volume.join(', ')}`);

  if (report.insights?.length) {
    L.push('');
    L.push('RULES-ENGINE FLAGS (weave in, do not just repeat):');
    for (const i of report.insights) L.push(`- [${i.tone}] ${i.text}`);
  }
  if (report.recommendations?.length) {
    L.push('');
    L.push('RULES-ENGINE SUGGESTIONS (turn into coaching):');
    for (const r of report.recommendations) L.push(`- ${r}`);
  }
  if (report.thin) {
    L.push('');
    L.push('NOTE: data is thin — keep the read preliminary, do not over-interpret.');
  }
  L.push('');
  L.push('Return the JSON dashboard now.');
  return L.join('\n');
}

function extractJson(text: string): any {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a === -1 || b === -1 || b < a) throw new Error('No JSON object in model output');
  return JSON.parse(text.slice(a, b + 1));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) return json({ error: 'Server missing ANTHROPIC_API_KEY' }, 500);

    const body = await req.json().catch(() => null);
    if (!body?.report) return json({ error: 'Missing report in request body' }, 400);

    const userContent = buildUserContent(body.report, body.profile);

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text();
      return json({ error: 'Anthropic API error', status: anthropicRes.status, detail }, 502);
    }

    const data = await anthropicRes.json();
    const text = (data.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim();

    if (!text) return json({ error: 'Empty output from model' }, 502);

    let read: any;
    try {
      read = extractJson(text);
    } catch (e) {
      return json({ error: 'Could not parse model output', detail: text.slice(0, 500) }, 502);
    }

    // Light validation / normalization.
    if (!read.score) {
      return json({ error: 'Model output missing score', detail: text.slice(0, 500) }, 502);
    }
    const sc = read.score || {};
    read.score = {
      overall: Math.max(0, Math.min(100, parseInt(sc.overall, 10) || 0)),
      strength: String(sc.strength || '—'),
      hypertrophy: String(sc.hypertrophy || '—'),
      recovery: String(sc.recovery || '—'),
      consistency: String(sc.consistency || '—'),
    };
    const okWin = read.biggestWin && read.biggestWin.title && read.biggestWin.detail;
    read.biggestWin = okWin
      ? { title: String(read.biggestWin.title), stat: read.biggestWin.stat ? String(read.biggestWin.stat) : '', detail: String(read.biggestWin.detail) }
      : null;
    const okLim = read.biggestLimitation && read.biggestLimitation.title && read.biggestLimitation.detail;
    read.biggestLimitation = okLim
      ? { title: String(read.biggestLimitation.title), detail: String(read.biggestLimitation.detail) }
      : null;
    read.observations = Array.isArray(read.observations) ? read.observations.map((o: any) => String(o)).slice(0, 4) : [];
    read.prescription = Array.isArray(read.prescription) ? read.prescription.map((p: any) => String(p)).slice(0, 4) : [];

    return json({ read });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
