# Handoff: SWOLE/OS — "FORGE" visual redesign + onboarding + workout logger

## Overview
This package is the approved redesign of **SWOLE/OS**, a smart training-log app (React Native / Expo). It covers a complete visual system ("FORGE" — industrial, near-black + molten acid-orange), a new 3-act onboarding flow, a fully-featured workout logger, and supporting screens (Home, History, Profile, Programs, Login/Signup, Splash).

The goal of this handoff: **implement all of it cleanly into the existing Expo app** at `nustandard1/SWOLEOS`, reusing the app's current structure (`app/screens`, `app/navigation`, `app/types`, `app/lib`).

---

## ⚠️ About the design files (READ FIRST)
The files in this bundle are **design references built in HTML/React (for the browser)** — they are prototypes that show the intended **look, copy, and behavior**. They are **NOT** production code to copy-paste.

Your job is to **recreate these designs in the existing React Native / Expo codebase**, using its established patterns:
- React Native primitives (`View`, `Text`, `Pressable`, `ScrollView`, `TextInput`, `Modal`) — **not** `div`/`button`/HTML.
- `StyleSheet.create` with the provided `forge-tokens.ts` — **not** CSS.
- The app's existing navigation (`@react-navigation`), Supabase client (`app/lib/supabase.ts`), RevenueCat (`app/lib/revenuecat.ts`), and `app/lib/intelligence.ts`.

The HTML uses browser-only tricks (CSS pseudo-elements, hover, `position:absolute` sheets, pointer-events for swipe). Translate the **intent**, using RN-native equivalents (listed per-component below).

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy, and interactions are final. Recreate the UI pixel-faithfully using `forge-tokens.ts`. Where a browser effect doesn't map 1:1 to RN, preserve the *visual result* with the nearest RN-native approach.

---

## Design language (the "FORGE" system)
Internalize these principles — they make the redesign feel like one app:
1. **Sharp, not soft.** Border-radius is **0** almost everywhere (cards, inputs, buttons, cells). The only rounded things: the small app-icon tile and a couple of pill chips. This is the "forged steel / rack-grade equipment" feel.
2. **Heavy hairlines.** 1.5px borders in `colors.line` define structure instead of shadows. Tables/cards are bordered boxes, often divided by hairlines.
3. **Two typefaces, clear jobs.** `Saira Condensed` 800 UPPERCASE for all display headings & numbers-that-shout; `Saira` for body, labels, and tabular stats.
4. **One accent.** Molten orange `#FF5A1E`. Used for CTAs, the active/selected state, progress, and "live" data. Text/icons placed on an orange fill are near-black `#0C0B0A`.
5. **Industrial details.** Hazard-stripe diagonal hatch on the primary CTA; skewed (`skewX(-8deg)`) accent tiles for the icon & avatar; "spec sheet" tables; kicker/eyebrow labels with wide letter-spacing.
6. **Honest, motivating copy.** Short, declarative. The product is a *smart log* — never overpromise auto-generated programs (those are Pro).

---

## Fonts
The prototype uses Google Fonts **Saira** and **Saira Condensed**. In Expo:
```bash
npx expo install @expo-google-fonts/saira @expo-google-fonts/saira-condensed expo-font expo-splash-screen
```
Load in `App.tsx` before rendering (gate on `fontsLoaded`):
```ts
import { useFonts, Saira_400Regular, Saira_500Medium, Saira_600SemiBold, Saira_700Bold } from '@expo-google-fonts/saira';
import { SairaCondensed_700Bold, SairaCondensed_800ExtraBold } from '@expo-google-fonts/saira-condensed';
```
The `fonts` map in `forge-tokens.ts` already references these export names.

---

## App flow & navigation
```
Splash (1.7s auto) → Login ⇆ Signup → Onboarding (8 steps + hook + payoff) → App
App = Bottom Tabs: Home · History · [＋ Start Workout FAB] · Profile · Train(Programs)
      Workout Logger = full-screen modal over the tabs
      Finish = full-screen celebration overlay → back to Home
```
Map to the existing `app/navigation/TabNavigator.tsx`. Auth + Onboarding should be a separate stack shown when there's no session / onboarding incomplete (persist an `onboardingComplete` flag + the calibration answers to Supabase or async storage). The logger is a presented modal screen; Finish is a modal/overlay on dismiss.

The FAB (center tab) is not a tab screen — it opens the Logger modal. Keep 5 slots: Home, History, FAB, Profile, Train.

---

## Screens / Views

> Exact colors → `colors.*`, type → `type.*`, spacing → `space.*` from `forge-tokens.ts`.
> Every screen background is `colors.bg`. Top safe-area padding ~54px in the mock (use `useSafeAreaInsets()` in RN).

### 1. Splash
- Centered: app icon (Loaded-Bar, 84px) + wordmark "SWOLE/OS" (Condensed 800, the "/OS" in `acc`), kicker "SMART TRAINING LOG", a 150×3px track with an orange fill animating 0→100% over ~1.5s.
- Auto-advances to Login after ~1.7s. Use `expo-splash-screen` for the true native splash, then this branded loading screen.

### 2. Login  / 3. Signup
- Layout: top row = app icon (52px) + wordmark (Condensed 30). A faint giant ghost "S" watermark (`#120E09`) bleeding off the right edge (decorative; use a large absolutely-positioned `Text` clipped by `overflow:hidden`).
- Hero headline (`type.display`, ~38px): Login = "THE ONLY TRAINING LOG YOU'LL EVER NEED." / Signup = "BUILD A SYSTEM THAT TRAINS YOU BACK."
- Fields: label (kicker style) above each; input is `surf2` fill, 1.5px `line` border, focus → border `acc`. `TextInput` with `colors.text` text.
- Primary button "LOG IN" / "CREATE ACCOUNT": full-width, `acc` fill, `onAcc` label (`type.button`), trailing arrow icon. Height ≥ 54px, radius 0.
- Login also: an "OR" divider + ghost-bordered "Continue with Apple" button. Footer link toggles Login⇆Signup ("CREATE ACCOUNT" / "LOG IN" in `acc`).
- Wire to existing Supabase auth. Signup → Onboarding; Login → App.

### 4. Onboarding  ★ (the centerpiece — 3 acts)
A single stack with an internal phase machine: `hook → calibrate(steps 0–7) → boot → payoff`.

**Header (calibrate phase):** back chevron (step>0 goes back; step 0 returns to hook) · an 8-segment progress bar (filled segments = `acc`) · step counter "0N/8" (mono).

**ACT 1 — Hook (3 swipeable value beats).** Icon tile (64px, accent-tinted) + kicker "0N / 03" + big Condensed headline + body copy. Dots indicator (tap to jump) + button ("NEXT", last = "CALIBRATE MY SYSTEM"). A "SKIP" link top-right. Copy:
- Beat 1 — **"Log it in seconds"** — "Log your own training and keep it all in one place, with built-in intelligence to help guide progression. Or build your program from a template."
- Beat 2 — **"Train with intelligence"** — "SWOLE/OS analyses your previous sessions and gives you progression targets — guiding progressive overload rep by rep, session by session."
- Beat 3 — **"See the bigger picture"** — "SWOLE/OS Intelligence reveals where you're growing and where you're stalling, with weekly & monthly breakdowns. Or follow expert programs with video demos on Pro."

**ACT 2 — Calibrate (8 steps).** Each: kicker + Condensed headline + optional sub + controls. Footer button "CONTINUE" (disabled until valid) / final step "CALIBRATE SYSTEM". Steps:
- **0 · Initialize** ("Forge your system.") — name `TextInput`. Valid when non-empty.
- **1 · Objective** ("What matters most?") — **ranked** goal list: physique, strength, performance, fat loss, balanced. Tapping a row assigns the next number badge (1,2,3…); tap again removes & renumbers. Selected row → `accSurf` bg + `acc` border + filled number badge. Valid when ≥1 ranked. *(This is the key signal — store the ordered array.)*
- **2 · Frequency** ("How many days per week?") — big number dial with − / + (clamp 2–7) + a 6-pip track (tap a pip to set). Adaptive helper text under it.
- **3 · System Calibration** ("Who you are as a lifter.") — sub: "This is what powers SWOLE/OS Intelligence — the more it knows, the sharper your guidance." Two card groups:
  - *"What rep range do you tend to prefer training in?"* → 3 cards: **Higher reps** (12–20+) · **Moderate reps** (8–12) · **Lower reps** (3–7). Single-select (radio).
  - *"How experienced are you?"* → 3 cards: **Beginner** (under ~1 yr) · **Intermediate** (1–3 yrs) · **Advanced** (3+ yrs). Single-select.
  - Valid when both chosen.
- **4 · System Calibration** ("What drives you?") — two groups:
  - *"Which statement best describes you?"* → 3 cards: "I love heavy compound lifts" · "I care mostly about physique" · "Both, equally". Single-select.
  - *"What's your weakest body part?"* → chips: Chest, Back, Shoulders, Legs, Arms, All of it. Single-select.
  - Valid when both chosen.
- **5 · Focus** ("Any muscles to prioritize?") — chips incl. a **"Balanced"** chip (clearing the rest) + Chest…Abs. Multi-select up to 3. Counter shows "N/3" or "Balanced". Optional.
- **6 · Friction** ("What holds you back?") — sub mentions SWOLE/OS Intelligence will watch for these. Chips: Having no plan, Consistency, Motivation, Recovery / injuries, Nutrition, Not sure / none. Multi-select up to 3. Optional.
- **7 · Confirm** ("System spec.") — a "spec sheet" table (hairline-divided rows): Operator, Goals (joined with " › "), Frequency, Style (rep · level), Weakness, Priority. Button "CALIBRATE SYSTEM".

**Boot.** Full-screen: app icon + a 200px progress bar filling over ~2s + kicker "Calibrating progression engine…". Then → payoff.

**ACT 3 — Payoff (activate).** Orange check badge + kicker "System calibrated" + headline "You're set, {name}." + copy: "SWOLE/OS will help guide you toward your goals and grow along with you — with progression targets tuned to your level. How do you want to start?" Then **3 path buttons**:
- **"Start logging now"** (primary, `acc` fill) → enter app, open the Logger.
- **"Build from a template"** (`surf`) → enter app (templates flow — stub to Home/Programs for now).
- **"Explore expert programs"** + `PRO` badge (`accSurf`) → enter app on the Programs (Train) tab.
On any choice, persist all calibration answers and mark onboarding complete.

### 5. Home / Dashboard
- Top bar: wordmark (18px) + a "FREE" chip (ghost border).
- Greeting kicker (time-of-day) + big Condensed first-name (44px).
- **Primary CTA "START WORKOUT"** (full-width `acc`): hazard-stripe diagonal hatch overlay on the right (~14% opacity black stripes), Condensed 30px label + sub "Push Day · ready when you are" + a near-black square arrow button. Opens Logger.
- **This Week** ruled section: a 3-cell bordered stat strip (Workouts / Hard Sets / Volume — Condensed numerals) + a 7-bar mini weekly volume chart (bars > 70% filled `acc`, else `surf2`).
- **Last Session** ruled section: bordered card, hairline-divided lift rows (name + "weight × reps", with a `acc` "▲ +5%" ticker where improved).
- **Intelligence** ruled section: accent-tinted card with a left 3px `acc` bar, a glowing dot, kicker "Progression Target", a Condensed line ("Bench Press → add 5 lb") and supporting copy. (Static now; wire to `intelligence.ts` later.)

### 6. Workout Logger  ★ (full-screen modal — the core loop)
**Top bar:** "Cancel" (left) · center = live **volume** (mono, big) + "N hard sets logged" sub · "FINISH" button (`acc`). *(Note: the old running session clock was intentionally removed.)*

**Session header:** kicker "Session" + an editable session-name `TextInput` (Condensed). Below it a **session note** affordance: "+ Session note" → opens the note sheet; once set, shows the note text (tap to edit).

**Per exercise = a bordered card:**
- Header: optional superset badge (A1/A2 in an `acc` tile) + exercise name (Condensed 21) + a small `acc` progress ticker "▲ +x%" when the best working set beats last time + a muscle tag (right, accent-bordered).
- **Setup note** row (persists with the exercise, resurfaces every session): if set → accent-tinted row with the note + "EDIT"; else "+ Add setup note". Opens the note sheet. Example content: "Incline @ 30°," "Cable pin 10."
- "Last" ghost row: shows last session's result string (`muted`).
- Column header: Set · Weight · Reps · RPE.
- **Set rows:**
  - Left = **set-number button** showing the label: working sets "1,2,3…", warm-up "W", cluster "C", myo "M". A tiny "⋯" hints it's tappable. **Tap → "Set options" bottom sheet** (see below). This is the clear, discoverable way to change set type or delete (replaces the hidden gesture).
  - Weight / Reps / RPE = tappable cells. Tapping one selects it and opens the **custom numeric keypad** (see below). Empty cells show ghost placeholders (last-time value in `dim`, or "lbs/reps/—"). A completed working set's weight cell highlights with an `acc` border ("pr" style).
  - For **cluster/myo** sets, the Reps cell is replaced by a **mini-rep chip row** (e.g. 5 · 5 · 5), each chip tappable into the keypad, plus a "+" to add a mini. Myo's first chip is the activation set (accent-bordered).
  - Right = a **check button**. Tapping completes the set → fills from ghost if blank, applies the "done" styling, and **starts the rest timer**.
  - **Swipe-left to delete** is also supported as a power gesture (use `react-native-gesture-handler` Swipeable revealing a red delete), but the set-options sheet is the primary/obvious path.
- **Target** row (when present): accent-tinted, target icon + "Target +5 lb vs last · on pace for a PR" (`acc2`).
- **"+ ADD SET"** — clean full-width primary action (Condensed, `acc`).
- **"Advanced set types"** disclosure (de-emphasized) → expands to "+ Cluster set" / "+ Myo-reps" buttons. Collapsed by default (keeps the common path simple).

**"+ ADD EXERCISE"** — dashed accent-bordered button → opens the Exercise Picker.

**Rest timer** (appears when a working set is completed): a bar pinned above the bottom edge — thin progress track (`acc` fill draining over the duration) + "Rest" label + countdown (mono, `acc`) + controls **−15 / +15 / SKIP**. At 0 it reads "Rest complete · go" and pulses. Default 120s. (Use `setInterval`; pause/resume not required.)

**Custom numeric keypad** (bottom sheet, replaces OS keyboard for set entry): a bar with the field label + "DONE", an optional **RPE quick-row** (6 / 7 / 7.5 / 8 / 8.5 / 9 / 9.5 / 10 chips) shown only when editing RPE, then a 3×4 grid (1–9, ".", 0, ⌫). Keeps numeric entry fast and on-brand. In RN, render as an absolutely-positioned panel / `Modal` and update state directly (don't use a real `TextInput` keyboard for these).

**Set options sheet** (tap a set number): bottom sheet titled "Set options" with rows — "Mark as warm-up" / "Make working set" (toggle) · "Duplicate set" · "Delete set" (danger) · "CANCEL". Use a RN `Modal` or bottom-sheet lib.

**Note sheet** (session or exercise): bottom sheet with title, a hint line, a multiline `TextInput` (`surf2`), and "SAVE NOTE". Exercise notes persist on the exercise and resurface every time it's logged.

### 7. Exercise Picker (full-screen sheet)
Header "Add Exercise" + "CLOSE". Search input (filters by name). Horizontal muscle-filter chips (All, Chest, Back, …). Scrollable list of rows (name + muscle). Tap a row → adds the exercise to the session. (Seed list of ~24 common lifts is in `forge-app.jsx`.)

### 8. Finish overlay
Full-screen: orange check badge (pops in) + kicker "Workout Logged" + Condensed session name (40px) + a 3-cell bordered stat strip (Volume / Hard Sets / Duration) + note "Progression logged. SWOLE/OS updated your targets for next session." + "DONE" button → Home (with stats updated).

### 9. History
Top bar "History" + "N LOGGED" chip. List of session cards: name (Condensed) + relative time (mono) + a stats line (volume · hard sets · exercises) + optional PR line (trophy icon, `acc2`).

### 10. Profile
- Identity row: skewed `acc` avatar tile with initial + name (Condensed) + email (mono).
- **System Spec** card (hairline rows): Goals (joined " › "), Frequency, Training style (rep · level), Weakness, Priority muscles, Lifetime volume.
- **"Sharpen your intelligence"** card → progressive profiling (age, current maxes, training history). Stub the destination; this is where deeper lifter data is captured later.
- **SWOLE/OS PRO** card: accent-tinted, glow, list (prebuilt expert programs · advanced plateau analytics · video demos for every lift) + "GO PRO — $9/MO" → wire to RevenueCat (`app/lib/revenuecat.ts`).

### 11. Programs / "Train" (Pro)
Top bar "Programs" + "PRO" chip. Intro line. List of program cards (name + "days · level" + optional "Most popular" tag + a lock glyph). Locked behind Pro.

---

## Interactions & behavior
- **Selection states:** selected card/chip → `acc` border + `accSurf` bg (or `acc` fill + `onAcc` text for chips). Active button press → invert to `acc`/`onAcc`.
- **Keypad entry:** appends digits (cap ~5 chars), one ".", ⌫ deletes last. Updates the selected cell's state live.
- **Completing a set:** fills blank weight/reps from the ghost (last-time) values, marks done, starts a 120s rest timer.
- **Ticker math:** per exercise, compare best completed working set (weight×reps) vs the best last-session value (from ghost); show "▲ +x%" only when current > previous.
- **Rest timer:** counts down each second; −15/+15 adjust; SKIP dismisses; 0 → "complete" pulsing state.
- **Live totals:** header volume = Σ(weight×reps) of completed non-warmup sets (clusters/myo sum their mini-reps × weight). Hard sets = count of completed non-warmup sets.
- **Animations:** entrance fades/pops are light. IMPORTANT lesson from the prototype — don't gate a resting visual state behind an animation that may not settle; in RN use `Animated`/`Reanimated` with explicit end states (badges/sheets must be visible even if animation is skipped).
- **Reduced motion / safe areas:** respect `useSafeAreaInsets()` for top (~54px) and bottom (tab bar / home indicator).

## State management
Use the app's existing approach (Context/Zustand/Supabase — whatever's already there). Minimum shape:
```ts
// Calibration profile (persist to Supabase + extend app/types/index.ts):
type CalibrationProfile = {
  name: string;
  goals: GoalKey[];              // ORDERED ranking: 'physique'|'strength'|'performance'|'fat_loss'|'balanced'
  daysPerWeek: number;           // 2–7
  repPreference: 'higher'|'moderate'|'lower';
  experience: 'beginner'|'intermediate'|'advanced';
  archetype: 'compound'|'physique'|'both';
  weakestPart: 'Chest'|'Back'|'Shoulders'|'Legs'|'Arms'|'All of it';
  priorityMuscles: string[];     // up to 3 ([] = balanced)
  limiters: string[];            // up to 3
  onboardingComplete: boolean;
};

// Active workout session:
type SetEntry = { type:'normal'|'warmup'|'cluster'|'myo'; weight:string; reps:string; rpe:string; minis:string[]; done:boolean; ghost?:{weight:string;reps:string} };
type ExerciseEntry = { name:string; muscle:string; lastSummary?:string; note:string; linkedToPrev:boolean; advancedOpen:boolean; sets:SetEntry[]; target?:string };
type WorkoutSession = { name:string; note:string; exercises:ExerciseEntry[]; startedAt:number };
```
Note how `goals`, `repPreference`, `experience`, `archetype`, `weakestPart`, `limiters` are intended to feed `app/lib/intelligence.ts` for progression targets and the weekly/monthly breakdowns (future work — wire the data through now even if the logic comes later). The existing `TrainingGoal` type in `app/types/index.ts` should be reconciled/extended with the new `GoalKey` set.

## Design tokens
See **`forge-tokens.ts`** (drop-in). Summary:
- Colors: bg `#0C0B0A`, surf `#15120D`, surf2 `#1E1913`, line `#2B2419`, line2 `#3A3122`, text `#F7F2E8`, muted `#8C8273`, dim `#574F44`, acc `#FF5A1E`, acc2 `#FF8A3D`, accDim `#3A1A0B`, accSurf `#160E07`, danger `#C5341B`.
- Type: Saira Condensed 800 (display, UPPERCASE) + Saira 400–700 (body/mono, tabular-nums for numbers).
- Radius: 0 everywhere except the app-icon tile.
- Borders: 1.5px hairlines.
- Touch targets ≥ 44px.

## Assets / brand marks (rebuild in code — they're CSS/SVG in the mock)
- **App icon — "Loaded Bar":** a near-black rounded tile (radius ~16px on a 56px tile) containing a centered Condensed "S" flanked by orange "weight plate" bars (thin vertical rects, taller pair inside a shorter dimmer pair). Recreate as a small RN component (or export a PNG for the real Expo app icon).
- **Wordmark — "Slash Beam":** "SWOLE" (text color) + an oversized orange "/" + "OS" (orange), all Condensed 800 UPPERCASE, on one line. Build as a small `<Wordmark/>` component.
- **Hazard stripes** (CTA): diagonal repeating stripes — in RN use a small repeating image or an SVG `Pattern` overlay at ~14% opacity.
- Icons: simple stroke icons (home, plus, history, user, bolt, flame, trophy, target, check, x, chevron, search, arrow). Use `react-native-svg` or your existing icon set; match the thin 2px stroke style.
- No photography is used.

## Files in this bundle (design references)
- `screenshots/` — **rendered reference images of every screen** (login, signup, onboarding hook → calibration → confirm → payoff, home, logger + keypad + set-options sheet, history, profile, programs, exercise picker, finish). Use these as the visual target for each screen.
- `SWOLE OS Prototype.html` — the full interactive prototype (open in a browser to click through every flow). **This is the source of truth for look & behavior.**
- `forge-flow.jsx` — Login, Signup, the full Onboarding (hook → calibrate 8 steps → boot → payoff). Exact copy & step logic.
- `forge-app.jsx` — Home, Workout Logger (sets, keypad, rest timer, notes, ticker, set-options sheet, supersets, cluster/myo), Exercise Picker, Finish, History, Profile, Programs, Tab Bar.
- `forge-core.jsx` — Wordmark, Loaded-Bar icon, numeric keypad, icon set.
- `forge-tokens.ts` — **drop-in design tokens** for React Native.
- `index.html` styling lives inside `SWOLE OS Prototype.html` `<style>` (all the `.fg-*`, `.ob-*`, `.lg-*` rules) — read it for exact spacing/measurements.

## Suggested implementation order
1. Fonts + `forge-tokens.ts` + shared primitives (`<Display>`, `<Kicker>`, `<Button>`, `<Card>`, `<Chip>`, `<Wordmark>`, `<AppIcon>`).
2. Auth screens (Login/Signup) wired to existing Supabase.
3. Onboarding stack (biggest piece — get the phase machine + 8 steps + payoff right; persist answers).
4. Tab shell + Home.
5. Workout Logger (sets → keypad → complete → rest timer → finish), then notes/ticker/supersets/advanced sets.
6. History, Profile, Programs.
7. Wire Profile "Pro" to RevenueCat; leave `intelligence.ts` hooks as TODOs fed by the new calibration data.

---
*Questions to resolve in code: reconcile the new `GoalKey` set with the existing `TrainingGoal` union in `app/types/index.ts`; decide persistence (Supabase table vs local) for calibration + active sessions.*
