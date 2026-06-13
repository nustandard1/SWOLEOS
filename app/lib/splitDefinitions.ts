export interface SessionSlot {
  name: string;
  focusMuscles: string[]; // primary_muscle values
  setTargets: { muscle: string; min: number; max: number }[];
  notes?: string;
}

export interface SplitDefinition {
  id: string;
  name: string;
  shortName: string;
  daysPerWeek: number;
  sessions: SessionSlot[];
  rotationWeeks?: number; // how many weeks before rotation repeats
  rotationSchedule?: string[][]; // per week: array of session names per training day
  idealFor: string;
  description: string;
  pros: string[];
  cons: string[];
  volumeNote: string;
}

export const SPLIT_DEFINITIONS: SplitDefinition[] = [
  {
    id: 'ppl_4day',
    name: '4-Day Push/Pull/Legs',
    shortName: 'PPL 4-Day',
    daysPerWeek: 4,
    rotationWeeks: 3,
    rotationSchedule: [
      ['Push A', 'Pull A', 'Legs A', 'Push B'],
      ['Pull B', 'Legs B', 'Push A', 'Pull A'],
      ['Legs A', 'Push B', 'Pull B', 'Legs B'],
    ],
    sessions: [
      {
        name: 'Push A',
        focusMuscles: ['chest', 'delts', 'triceps'],
        setTargets: [
          { muscle: 'chest', min: 4, max: 8 },
          { muscle: 'delts', min: 4, max: 8 },
          { muscle: 'triceps', min: 4, max: 8 },
        ],
        notes: 'Chest, Delts, Triceps. Aim for 4-8 working sets each.',
      },
      {
        name: 'Pull A',
        focusMuscles: ['back', 'biceps'],
        setTargets: [
          { muscle: 'back', min: 6, max: 8 },
          { muscle: 'biceps', min: 3, max: 6 },
        ],
        notes: 'Back, Biceps, Rear Delts, optional Traps.',
      },
      {
        name: 'Legs A',
        focusMuscles: ['quads', 'hamstrings', 'calves', 'glutes'],
        setTargets: [
          { muscle: 'quads', min: 4, max: 8 },
          { muscle: 'hamstrings', min: 4, max: 6 },
          { muscle: 'calves', min: 2, max: 5 },
        ],
        notes: 'Quads, Hamstrings, Calves. Heavy compounds at 7-8 RPE.',
      },
      {
        name: 'Push B',
        focusMuscles: ['chest', 'delts', 'triceps'],
        setTargets: [
          { muscle: 'chest', min: 4, max: 8 },
          { muscle: 'delts', min: 4, max: 8 },
          { muscle: 'triceps', min: 4, max: 8 },
        ],
        notes: 'Variation of Push A. Different exercises, same targets.',
      },
      {
        name: 'Pull B',
        focusMuscles: ['back', 'biceps'],
        setTargets: [
          { muscle: 'back', min: 6, max: 8 },
          { muscle: 'biceps', min: 3, max: 6 },
        ],
        notes: 'Variation of Pull A. Different exercises, same targets.',
      },
      {
        name: 'Legs B',
        focusMuscles: ['quads', 'hamstrings', 'calves', 'glutes'],
        setTargets: [
          { muscle: 'quads', min: 4, max: 8 },
          { muscle: 'hamstrings', min: 4, max: 6 },
          { muscle: 'calves', min: 2, max: 5 },
        ],
        notes: 'Variation of Legs A. Different exercises, same targets.',
      },
    ],
    idealFor: 'Intermediate to advanced lifters focused on hypertrophy',
    description:
      'Push/Pull/Legs split across 4 days per week, cycling through A and B variations over a 3-week wave. Each muscle group is hit roughly every 5 days — balanced frequency and recovery for hypertrophy.',
    pros: ['High frequency (~every 5 days)', 'Balanced volume across all groups', 'A/B variation keeps training fresh'],
    cons: ['Requires consistent 4 days/week commitment', 'Muscle groups trained later in a session may get lower quality sets due to fatigue'],
    volumeNote: 'Push: 4-8 sets chest/delts/triceps. Pull: 6-8 back, 3-6 biceps. Legs: 4-8 quads, 4-6 hamstrings.',
  },

  {
    id: 'ppl_5day',
    name: '5-Day Push/Pull/Legs',
    shortName: 'PPL 5-Day',
    daysPerWeek: 5,
    rotationWeeks: 3,
    rotationSchedule: [
      ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B'],
      ['Legs B', 'Push A', 'Pull A', 'Legs A', 'Push B'],
      ['Pull B', 'Legs B', 'Push A', 'Pull A', 'Legs A'],
    ],
    sessions: [
      {
        name: 'Push A',
        focusMuscles: ['chest', 'delts', 'triceps'],
        setTargets: [
          { muscle: 'chest', min: 4, max: 8 },
          { muscle: 'delts', min: 4, max: 8 },
          { muscle: 'triceps', min: 4, max: 8 },
        ],
      },
      {
        name: 'Pull A',
        focusMuscles: ['back', 'biceps'],
        setTargets: [
          { muscle: 'back', min: 6, max: 8 },
          { muscle: 'biceps', min: 3, max: 6 },
        ],
      },
      {
        name: 'Legs A',
        focusMuscles: ['quads', 'hamstrings', 'calves', 'glutes'],
        setTargets: [
          { muscle: 'quads', min: 4, max: 8 },
          { muscle: 'hamstrings', min: 4, max: 6 },
          { muscle: 'calves', min: 2, max: 5 },
        ],
      },
      {
        name: 'Push B',
        focusMuscles: ['chest', 'delts', 'triceps'],
        setTargets: [
          { muscle: 'chest', min: 4, max: 8 },
          { muscle: 'delts', min: 4, max: 8 },
          { muscle: 'triceps', min: 4, max: 8 },
        ],
      },
      {
        name: 'Pull B',
        focusMuscles: ['back', 'biceps'],
        setTargets: [
          { muscle: 'back', min: 6, max: 8 },
          { muscle: 'biceps', min: 3, max: 6 },
        ],
      },
      {
        name: 'Legs B',
        focusMuscles: ['quads', 'hamstrings', 'calves', 'glutes'],
        setTargets: [
          { muscle: 'quads', min: 4, max: 8 },
          { muscle: 'hamstrings', min: 4, max: 6 },
          { muscle: 'calves', min: 2, max: 5 },
        ],
      },
    ],
    idealFor: 'Advanced lifters wanting higher frequency and volume',
    description:
      'Same A/B rotation as 4-Day PPL but across 5 training days. Higher frequency and total volume — recovery demand is higher. Results and recovery should dictate 4 vs. 5 days.',
    pros: ['Very high frequency and volume potential', 'Fast rotation through sessions', 'A/B variation keeps training fresh'],
    cons: ['High recovery demand', 'Requires 5 consistent days/week'],
    volumeNote: 'Same per-session targets as 4-Day PPL, but hit more frequently.',
  },

  {
    id: 'upper_lower_4day',
    name: 'Upper/Lower 4-Day',
    shortName: 'Upper/Lower 4',
    daysPerWeek: 4,
    rotationSchedule: [['Upper A', 'Lower A', 'Upper B', 'Lower B']],
    sessions: [
      {
        name: 'Upper A',
        focusMuscles: ['chest', 'back', 'delts', 'biceps', 'triceps'],
        setTargets: [
          { muscle: 'chest', min: 3, max: 7 },
          { muscle: 'back', min: 3, max: 7 },
          { muscle: 'delts', min: 2, max: 5 },
          { muscle: 'biceps', min: 2, max: 4 },
          { muscle: 'triceps', min: 2, max: 4 },
        ],
        notes: 'Mon/Tue. Chest, Back, Shoulders, Arms. Start with your weakest area.',
      },
      {
        name: 'Lower A',
        focusMuscles: ['quads', 'hamstrings', 'calves', 'glutes'],
        setTargets: [
          { muscle: 'quads', min: 3, max: 7 },
          { muscle: 'hamstrings', min: 3, max: 6 },
          { muscle: 'calves', min: 2, max: 4 },
        ],
        notes: 'Quads, Hamstrings, Calves. Big compounds optional.',
      },
      {
        name: 'Upper B',
        focusMuscles: ['chest', 'back', 'delts', 'biceps', 'triceps'],
        setTargets: [
          { muscle: 'chest', min: 3, max: 7 },
          { muscle: 'back', min: 3, max: 7 },
          { muscle: 'delts', min: 2, max: 5 },
          { muscle: 'biceps', min: 2, max: 4 },
          { muscle: 'triceps', min: 2, max: 4 },
        ],
        notes: 'Thu/Fri. Variation of Upper A. Different exercises, same targets.',
      },
      {
        name: 'Lower B',
        focusMuscles: ['quads', 'hamstrings', 'calves', 'glutes'],
        setTargets: [
          { muscle: 'quads', min: 3, max: 7 },
          { muscle: 'hamstrings', min: 3, max: 6 },
          { muscle: 'calves', min: 2, max: 4 },
        ],
        notes: 'Variation of Lower A. Different exercises or rep ranges.',
      },
    ],
    idealFor: 'Most lifters — best balance of frequency, volume, and recovery',
    description:
      'Each muscle group gets hit twice per week with the volume split across two sessions. Higher quality volume per session and better recovery. Mon/Tue/Thu/Fri. Also works well for hybrid athletic training on lower days.',
    pros: ['Optimal frequency (2x/week)', 'High quality volume', 'Great recovery between sessions', 'Flexible — works for hypertrophy or athletic goals'],
    cons: ['Requires 4 consistent days', 'Muscle groups trained later in a session may get lower quality sets due to accumulated fatigue'],
    volumeNote: '6-14 sets/muscle group per week. Priority groups aim for 10+ sets/week.',
  },

  {
    id: 'upper_lower_3day',
    name: 'Upper/Lower 3-Day',
    shortName: 'Upper/Lower 3',
    daysPerWeek: 3,
    rotationWeeks: 4,
    rotationSchedule: [
      ['Upper A', 'Lower A', 'Upper B'],
      ['Lower B', 'Upper A', 'Lower A'],
      ['Upper B', 'Lower B', 'Upper A'],
      ['Lower A', 'Upper B', 'Lower B'],
    ],
    sessions: [
      {
        name: 'Upper A',
        focusMuscles: ['chest', 'back', 'delts', 'biceps', 'triceps'],
        setTargets: [
          { muscle: 'chest', min: 4, max: 7 },
          { muscle: 'back', min: 4, max: 7 },
          { muscle: 'delts', min: 3, max: 5 },
          { muscle: 'biceps', min: 2, max: 4 },
          { muscle: 'triceps', min: 2, max: 4 },
        ],
        notes: 'Mon/Wed/Fri rotation. More recovery between sessions — go heavier.',
      },
      {
        name: 'Lower A',
        focusMuscles: ['quads', 'hamstrings', 'calves', 'glutes'],
        setTargets: [
          { muscle: 'quads', min: 4, max: 7 },
          { muscle: 'hamstrings', min: 3, max: 6 },
          { muscle: 'calves', min: 2, max: 4 },
        ],
        notes: 'Good split for big compounds — deadlifts, squats.',
      },
      {
        name: 'Upper B',
        focusMuscles: ['chest', 'back', 'delts', 'biceps', 'triceps'],
        setTargets: [
          { muscle: 'chest', min: 4, max: 7 },
          { muscle: 'back', min: 4, max: 7 },
          { muscle: 'delts', min: 3, max: 5 },
          { muscle: 'biceps', min: 2, max: 4 },
          { muscle: 'triceps', min: 2, max: 4 },
        ],
      },
      {
        name: 'Lower B',
        focusMuscles: ['quads', 'hamstrings', 'calves', 'glutes'],
        setTargets: [
          { muscle: 'quads', min: 4, max: 7 },
          { muscle: 'hamstrings', min: 3, max: 6 },
          { muscle: 'calves', min: 2, max: 4 },
        ],
      },
    ],
    idealFor: 'Busy lifters, high-intensity trainers, those who prefer big compounds',
    description:
      'Rotating 4-week schedule across 3 training days. About every 5 days per muscle group. Extra recovery days mean intensity can be very high. Great for deadlifts, squats, bench — heavy compounds. Lends itself to strongman and athletic training.',
    pros: ['High intensity possible', 'More recovery days', 'Works well with big compounds', '3 days/week commitment'],
    cons: ['Slightly lower frequency than 4-day', 'Muscle groups trained later in a session may get lower quality sets due to fatigue'],
    volumeNote: 'Same per-session targets as 4-Day Upper/Lower, but slightly more volume per session to compensate for less frequency.',
  },

  {
    id: 'bro_split',
    name: 'Classic Bro Split (Frequency Optimized)',
    shortName: 'Bro Split',
    daysPerWeek: 6,
    sessions: [
      {
        name: 'Chest / Biceps',
        focusMuscles: ['chest', 'biceps', 'delts'],
        setTargets: [
          { muscle: 'chest', min: 6, max: 10 },
          { muscle: 'biceps', min: 4, max: 6 },
          { muscle: 'delts', min: 3, max: 6 },
        ],
        notes: 'Biceps are fresh here — great for quality arm work after chest pressing.',
      },
      {
        name: 'Legs',
        focusMuscles: ['quads', 'hamstrings', 'calves', 'glutes'],
        setTargets: [
          { muscle: 'quads', min: 6, max: 8 },
          { muscle: 'hamstrings', min: 4, max: 6 },
          { muscle: 'calves', min: 4, max: 6 },
        ],
      },
      {
        name: 'Back / Triceps',
        focusMuscles: ['back', 'triceps'],
        setTargets: [
          { muscle: 'back', min: 6, max: 10 },
          { muscle: 'triceps', min: 6, max: 8 },
        ],
        notes: 'Triceps are fresh after back work — hit them hard.',
      },
      {
        name: 'Cardio / Recovery',
        focusMuscles: [],
        setTargets: [],
        notes: '30-60 min low to moderate intensity. HR 110-140.',
      },
      {
        name: 'Shoulders / Chest / Biceps',
        focusMuscles: ['delts', 'chest', 'biceps'],
        setTargets: [
          { muscle: 'delts', min: 6, max: 8 },
          { muscle: 'chest', min: 4, max: 6 },
          { muscle: 'biceps', min: 3, max: 5 },
        ],
      },
      {
        name: 'Legs / Back',
        focusMuscles: ['quads', 'hamstrings', 'back', 'calves'],
        setTargets: [
          { muscle: 'quads', min: 4, max: 6 },
          { muscle: 'hamstrings', min: 3, max: 6 },
          { muscle: 'back', min: 3, max: 6 },
          { muscle: 'calves', min: 2, max: 4 },
        ],
      },
    ],
    idealFor: 'Lifters who want high volume per muscle, enjoy longer sessions',
    description:
      'Frequency-optimized bro split hitting most muscle groups twice per week. Biceps on chest day and triceps on back day so they are fresh. Most groups also get residual volume through compound movements.',
    pros: ['High per-session volume for each group', 'Fresh arms on dedicated days', 'Classic structure that works'],
    cons: ['6 days/week commitment', 'Higher total fatigue', 'Less flexibility in scheduling'],
    volumeNote: 'Weekly: Chest 10-16 sets, Biceps 7-11, Quads 10-14, Hamstrings 7-12, Back 9-14, Delts 9-14, Triceps 6-8, Calves 6-10.',
  },

  {
    id: 'full_body_3day',
    name: 'Full Body 3-Day',
    shortName: 'Full Body 3',
    daysPerWeek: 3,
    sessions: [
      {
        name: 'Full Body A',
        focusMuscles: ['chest', 'back', 'quads', 'hamstrings', 'delts'],
        setTargets: [
          { muscle: 'chest', min: 2, max: 4 },
          { muscle: 'back', min: 2, max: 4 },
          { muscle: 'quads', min: 2, max: 4 },
          { muscle: 'hamstrings', min: 2, max: 3 },
          { muscle: 'delts', min: 2, max: 3 },
        ],
        notes: 'Mon/Wed/Fri. Prioritize compounds. Aim for at least 6 hard sets per group weekly.',
      },
      {
        name: 'Full Body B',
        focusMuscles: ['chest', 'back', 'quads', 'hamstrings', 'delts'],
        setTargets: [
          { muscle: 'chest', min: 2, max: 4 },
          { muscle: 'back', min: 2, max: 4 },
          { muscle: 'quads', min: 2, max: 4 },
          { muscle: 'hamstrings', min: 2, max: 3 },
          { muscle: 'delts', min: 2, max: 3 },
        ],
        notes: 'Variation of A. Different exercises or rep ranges.',
      },
      {
        name: 'Full Body C',
        focusMuscles: ['chest', 'back', 'quads', 'hamstrings', 'delts'],
        setTargets: [
          { muscle: 'chest', min: 2, max: 4 },
          { muscle: 'back', min: 2, max: 4 },
          { muscle: 'quads', min: 2, max: 4 },
          { muscle: 'hamstrings', min: 2, max: 3 },
          { muscle: 'delts', min: 2, max: 3 },
        ],
      },
      {
        name: 'Full Body D',
        focusMuscles: ['chest', 'back', 'quads', 'hamstrings', 'delts'],
        setTargets: [
          { muscle: 'chest', min: 2, max: 4 },
          { muscle: 'back', min: 2, max: 4 },
          { muscle: 'quads', min: 2, max: 4 },
          { muscle: 'hamstrings', min: 2, max: 3 },
          { muscle: 'delts', min: 2, max: 3 },
        ],
      },
    ],
    idealFor: 'Tactical/athletic lifters, beginners, those with limited time',
    description:
      'Full body training 3 days/week with a rest day between sessions (Mon/Wed/Fri). Cycles through A/B/C/D variations. Excellent for tactical and athletic training. Volume per muscle group is lower — compounds are essential.',
    pros: ['3 days/week', 'High frequency per muscle', 'Great for athletic/tactical goals', 'Excellent recovery'],
    cons: ['Lower volume per session per muscle group', 'Not optimal for pure hypertrophy', 'Muscle groups trained later in a session can suffer from accumulated fatigue — especially on full body days'],
    volumeNote: 'Aim for at least 6 hard sets/group across the week. Strength focus: 7-8 RPE range.',
  },

  {
    id: 'full_body_2day',
    name: 'Full Body 2-Day',
    shortName: 'Full Body 2',
    daysPerWeek: 2,
    sessions: [
      {
        name: 'Full Body A',
        focusMuscles: ['quads', 'hamstrings', 'chest', 'back', 'delts'],
        setTargets: [
          { muscle: 'quads', min: 3, max: 5 },
          { muscle: 'hamstrings', min: 2, max: 4 },
          { muscle: 'chest', min: 2, max: 4 },
          { muscle: 'back', min: 2, max: 4 },
          { muscle: 'delts', min: 2, max: 3 },
        ],
        notes: 'Start with lower body. Mon/Thu or Tue/Fri. 2-3 days between sessions.',
      },
      {
        name: 'Full Body B',
        focusMuscles: ['chest', 'back', 'quads', 'hamstrings', 'delts'],
        setTargets: [
          { muscle: 'chest', min: 3, max: 5 },
          { muscle: 'back', min: 3, max: 5 },
          { muscle: 'quads', min: 2, max: 4 },
          { muscle: 'hamstrings', min: 2, max: 4 },
          { muscle: 'delts', min: 2, max: 3 },
        ],
        notes: 'Start with upper body. Intensity must be high — make every set count.',
      },
      {
        name: 'Full Body C',
        focusMuscles: ['quads', 'hamstrings', 'chest', 'back', 'delts'],
        setTargets: [
          { muscle: 'quads', min: 3, max: 5 },
          { muscle: 'hamstrings', min: 2, max: 4 },
          { muscle: 'chest', min: 2, max: 4 },
          { muscle: 'back', min: 2, max: 4 },
          { muscle: 'delts', min: 2, max: 3 },
        ],
      },
    ],
    idealFor: 'Very busy lifters, those needing more recovery, or as a maintenance phase',
    description:
      'Full body training just 2 days per week. Mon/Thu or Tue/Fri — always 2-3 days between sessions. Compounds with lower rep ranges (3-8). Intensity must be high. Surprisingly effective when done hard and intelligently.',
    pros: ['Only 2 days/week', 'Maximum recovery', 'Simple to plan', 'Works well for strength focus'],
    cons: ['Lower weekly volume', 'Intensity must be high to compensate', 'Less room for isolation work', 'Muscle groups trained later in a session get lower quality sets — order them strategically'],
    volumeNote: '6-10 sets/group is reasonable. Prioritize 1-2 groups, hit others with 3-6 hard sets.',
  },

  {
    id: 'hybrid_5day',
    name: 'Upper/Lower/Push/Pull/Legs (Hybrid 5-Day)',
    shortName: 'Hybrid 5-Day',
    daysPerWeek: 5,
    sessions: [
      {
        name: 'Upper',
        focusMuscles: ['chest', 'back', 'delts', 'biceps', 'triceps'],
        setTargets: [
          { muscle: 'chest', min: 3, max: 6 },
          { muscle: 'back', min: 3, max: 6 },
          { muscle: 'delts', min: 2, max: 4 },
          { muscle: 'biceps', min: 2, max: 4 },
          { muscle: 'triceps', min: 2, max: 4 },
        ],
        notes: 'Mon. Start with your priority muscle groups.',
      },
      {
        name: 'Lower',
        focusMuscles: ['quads', 'hamstrings', 'calves', 'glutes'],
        setTargets: [
          { muscle: 'quads', min: 3, max: 6 },
          { muscle: 'hamstrings', min: 3, max: 5 },
          { muscle: 'calves', min: 2, max: 4 },
        ],
        notes: 'Tue. Quads, Hams, Calves, Abs.',
      },
      {
        name: 'Push',
        focusMuscles: ['chest', 'delts', 'triceps'],
        setTargets: [
          { muscle: 'chest', min: 3, max: 6 },
          { muscle: 'delts', min: 3, max: 5 },
          { muscle: 'triceps', min: 3, max: 5 },
        ],
        notes: 'Wed. Chest, Triceps, Delts.',
      },
      {
        name: 'Pull',
        focusMuscles: ['back', 'biceps'],
        setTargets: [
          { muscle: 'back', min: 4, max: 7 },
          { muscle: 'biceps', min: 3, max: 5 },
        ],
        notes: 'Thu. Back, Biceps.',
      },
      {
        name: 'Legs',
        focusMuscles: ['quads', 'hamstrings', 'calves', 'glutes'],
        setTargets: [
          { muscle: 'quads', min: 3, max: 6 },
          { muscle: 'hamstrings', min: 3, max: 5 },
          { muscle: 'calves', min: 2, max: 4 },
        ],
        notes: 'Fri/Sat. Quads, Hams, Calves.',
      },
    ],
    idealFor: 'Advanced lifters who want variety and can handle 5 days/week',
    description:
      'Hybrid split combining an upper/lower day followed by a classic push/pull/legs. 5 days per week. Solid freedom to target priority muscle groups on the upper/lower days, then hit everything systematically through PPL.',
    pros: ['High variety', 'Excellent muscle group targeting flexibility', 'Strong frequency + volume combo'],
    cons: ['5 days/week required', 'High total weekly volume — recovery must be managed'],
    volumeNote: '6-16 sets/group depending on focus. Upper/Lower days: start with priority muscle groups.',
  },
];

// ── Custom (from-scratch) programs ───────────────────────────────────────────
// Serious lifters run their own programming — a custom template rides the whole
// engine (scheduling, weekly volume tally, progression targets) with generic days
// and no preset muscle guide.
export function customSplitDef(days: number): SplitDefinition {
  const d = Math.max(2, Math.min(7, days || 4));
  return {
    id: `custom_${d}day`,
    name: `${d}-Day Custom Program`,
    shortName: 'Custom',
    daysPerWeek: d,
    sessions: Array.from({ length: d }, (_, i) => ({ name: `Day ${i + 1}`, focusMuscles: [], setTargets: [] })),
    idealFor: 'Lifters who run their own programming',
    description: 'Your own program, built from scratch. You pick the days, the structure, and every exercise.',
    pros: [],
    cons: [],
    volumeNote: '',
  };
}

// Resolve any split id — predefined or custom_<N>day.
export function resolveSplitDef(id: string): SplitDefinition | undefined {
  const found = SPLIT_DEFINITIONS.find(s => s.id === id);
  if (found) return found;
  const m = /^custom_(\d+)day$/.exec(id || '');
  return m ? customSplitDef(parseInt(m[1], 10)) : undefined;
}
