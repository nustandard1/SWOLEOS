// SWOLE OS — default weekday patterns for a template's training days.
// 0 = Monday … 6 = Sunday. Used when a lifter hasn't manually assigned days,
// so a program still shows up on the calendar automatically.

export function defaultDows(numDays: number): number[] {
  const n = Math.max(1, Math.min(7, numDays));
  switch (n) {
    case 1: return [0];                 // Mon
    case 2: return [0, 3];              // Mon / Thu
    case 3: return [0, 2, 4];           // Mon / Wed / Fri
    case 4: return [0, 1, 3, 4];        // Mon / Tue / Thu / Fri
    case 5: return [0, 1, 2, 3, 4];     // Mon–Fri
    case 6: return [0, 1, 2, 3, 4, 5];  // Mon–Sat
    default: return [0, 1, 2, 3, 4, 5, 6];
  }
}

// Build a {dow -> session} map for a template's sessions (ordered by session_order),
// honoring explicit scheduled_dow and filling the rest from defaults without collisions.
// maxDays caps how many training days are laid out — for splits with MORE session
// variants than training days (e.g. 4-day PPL = 6 A/B sessions over 4 days), pass the
// split's daysPerWeek so the calendar shows 4 days, not 6. Extra sessions rotate in.
export function buildSchedule<T extends { scheduled_dow?: number | null }>(sessions: T[], maxDays?: number): Record<number, T> {
  const out: Record<number, T> = {};
  const used = new Set<number>();
  const cap = (maxDays && maxDays > 0) ? maxDays : sessions.length;
  // explicit first (still capped)
  for (const s of sessions) {
    if (s.scheduled_dow != null && out[s.scheduled_dow] == null && used.size < cap) { out[s.scheduled_dow] = s; used.add(s.scheduled_dow); }
  }
  // defaults into free slots, up to the cap
  const defs = defaultDows(cap);
  let di = 0;
  for (const s of sessions) {
    if (s.scheduled_dow != null) continue;
    if (used.size >= cap) break;
    let dow = defs[di++];
    if (dow == null) continue;
    let guard = 0;
    while (used.has(dow) && guard < 7) { dow = (dow + 1) % 7; guard++; }
    if (!used.has(dow)) { out[dow] = s; used.add(dow); }
  }
  return out;
}
