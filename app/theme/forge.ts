// ============================================================================
// SWOLE/OS — FORGE design system tokens
// Drop this into your Expo app (e.g. app/theme/forge.ts) and import everywhere.
// These are the EXACT values from the approved HTML prototype.
// ============================================================================

export const colors = {
  // surfaces (v2 — neutral charcoal, "black steel not dark wood")
  bg:      '#080808', // app background (almost pure black)
  surf:    '#141414', // card / panel (charcoal)
  surf2:   '#1C1C1C', // input fields, inset cells
  surf3:   '#242424', // raised chips (RPE pad)
  line:    '#202020', // hairline borders — intentionally subtle
  line2:   '#2E2E2E', // stronger structural borders, inactive segments

  // text (neutral, faint warmth). dim kept a touch brighter than the raw spec
  // (#525250) for legibility on near-black — Mike + wife readability note.
  text:    '#F2F2F0', // primary near-white
  muted:   '#8C8C88', // secondary / labels
  dim:     '#6E6E6A', // tertiary / ghost values / placeholders (spec #525250, bumped for contrast)

  // accent (molten acid-orange — the brand, UNCHANGED)
  acc:     '#FF5A1E', // primary accent, CTAs, active state
  acc2:    '#FF8A3D', // lighter accent, target text, "PRO"
  accDim:  'rgba(255,90,30,0.34)', // muted-orange accent borders (NOT brown)
  accSurf: '#1C1C1C', // selected-row surface = plain charcoal (+ orange left-bar/border)

  // semantic
  danger:    '#C5341B', // delete row background
  dangerTxt: '#FF7A6B', // delete text
  onAcc:     '#0C0B0A', // text/icons ON an orange fill (near-black)

  // status (Intelligence breakdown dots / rings)
  statusGood: '#46C26A', // green
  statusMid:  '#FF8A3D', // amber
  statusLow:  '#FF5A4A', // red-orange
};

// Intelligence gradient identity (NuStandard brand: magenta → purple → cyan).
// Use ONLY for the gradient-text word "Intelligence" — not bars/dots/toggles.
export const intelGradient = {
  colors: ['#FF3BD4', '#9B53F0', '#22D3EE'],
  locations: [0, 0.48, 1],
  angleDeg: 100,
};

// Accent variants (explored but NOT selected — kept for reference only).
// Production accent is `colors.acc` (#FF5A1E).
export const accentVariants = {
  acidOrange: { acc: '#FF5A1E', acc2: '#FF8A3D', accDim: '#3A1A0B' }, // SELECTED
  emberRed:   { acc: '#FF3B2F', acc2: '#FF6E54', accDim: '#3A100B' },
  moltenAmber:{ acc: '#FFA313', acc2: '#FFC457', accDim: '#3A2606' },
};

// ----------------------------------------------------------------------------
// Typography
// Two families, loaded via @expo-google-fonts (see README "Fonts" section):
//   Saira            — UI / body / tabular numerals
//   Saira_Condensed  — display headings (always UPPERCASE, heavy)
// RN has no letter-spacing-em; values below are in px at the given size.
// ----------------------------------------------------------------------------
export const fonts = {
  // map to the expo-google-fonts export names once loaded
  display:   'SairaCondensed_800ExtraBold', // headings — transform to UPPERCASE in component
  displaySemi:'SairaCondensed_700Bold',
  body:      'Saira_400Regular',
  bodyMed:   'Saira_500Medium',
  bodySemi:  'Saira_600SemiBold',
  bodyBold:  'Saira_700Bold',
};

// Reusable text styles (RN TextStyle objects). Apply fontFamily from `fonts`.
export const type = {
  // big display headline — onboarding/section titles. UPPERCASE.
  display:   { fontFamily: fonts.display, fontSize: 42, lineHeight: 39, color: colors.text, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  displayLg: { fontFamily: fonts.display, fontSize: 46, lineHeight: 43, color: colors.text, textTransform: 'uppercase' as const },
  displaySm: { fontFamily: fonts.display, fontSize: 30, lineHeight: 30, color: colors.text, textTransform: 'uppercase' as const },
  exerciseName: { fontFamily: fonts.display, fontSize: 21, lineHeight: 21, color: colors.text, textTransform: 'uppercase' as const },

  // kicker / eyebrow label — above headings, on cards. UPPERCASE, wide tracking.
  kicker:    { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase' as const, letterSpacing: 1.8 },

  // body copy
  body:      { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.muted },
  bodyText:  { fontFamily: fonts.bodyMed, fontSize: 14, color: colors.text },

  // tabular numerals — set fontVariant: ['tabular-nums'] on the <Text>
  mono:      { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] as const },

  // button label
  button:    { fontFamily: fonts.display, fontSize: 17, color: colors.onAcc, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
};

// ----------------------------------------------------------------------------
// Spacing / radii / layout — FORGE is intentionally SHARP (no rounded corners).
// ----------------------------------------------------------------------------
export const radius = {
  none: 0,    // default for cards, inputs, buttons (the industrial look)
  pill: 999,  // ONLY for the small app-icon container & a few chips
};

export const space = { xs: 4, sm: 8, md: 14, lg: 20, xl: 26, xxl: 40 };

export const borders = {
  hairline: { borderWidth: 1.5, borderColor: colors.line },
  strong:   { borderWidth: 1.5, borderColor: colors.line2 },
  accent:   { borderWidth: 1.5, borderColor: colors.acc },
  dashed:   { borderWidth: 1.5, borderColor: colors.acc, borderStyle: 'dashed' as const },
};

// Touch targets: keep all interactive controls >= 44px tall (hit area).
export const HIT = 44;

export default { colors, accentVariants, fonts, type, radius, space, borders, HIT };
