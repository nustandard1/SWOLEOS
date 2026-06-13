// ============================================================================
// SWOLE/OS — FORGE design system tokens
// Drop this into your Expo app (e.g. app/theme/forge.ts) and import everywhere.
// These are the EXACT values from the approved HTML prototype.
// ============================================================================

export const colors = {
  // surfaces (warm near-black "forged steel")
  bg:      '#0C0B0A', // app background
  surf:    '#15120D', // card / panel
  surf2:   '#1E1913', // input fields, inset cells
  surf3:   '#261F17', // raised chips (RPE pad)
  line:    '#2B2419', // hairline borders / dividers
  line2:   '#3A3122', // stronger borders, inactive segments

  // text
  text:    '#F7F2E8', // primary (warm off-white)
  muted:   '#8C8273', // secondary / labels
  dim:     '#574F44', // tertiary / ghost values / placeholders

  // accent (molten acid-orange — the brand)
  acc:     '#FF5A1E', // primary accent, CTAs, active state
  acc2:    '#FF8A3D', // lighter accent, target text, "PRO"
  accDim:  '#3A1A0B', // accent-tinted borders / backgrounds
  accSurf: '#160E07', // accent-tinted surface (selected rows, intel cards)

  // semantic
  danger:    '#C5341B', // delete row background
  dangerTxt: '#FF7A6B', // delete text
  onAcc:     '#0C0B0A', // text/icons ON an orange fill (near-black)
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
