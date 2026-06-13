// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Animated, Easing, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { colors, fonts, space } from '../theme/forge';
import { Wordmark, AppIcon } from '../components/Brand';
import Pulse from '../components/Pulse';
import GlowPulse from '../components/GlowPulse';
import GradientText from '../components/GradientText';
import PaywallScreen from './PaywallScreen';
import { BlurView } from 'expo-blur';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing as ReEasing,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Options ──────────────────────────────────────────────────────────────────
const GOALS = [
  { k: 'physique',    label: 'PHYSIQUE',    sub: 'Muscle growth & size' },
  { k: 'strength',    label: 'STRENGTH',    sub: 'Move heavier weight' },
  { k: 'performance', label: 'PERFORMANCE', sub: 'Athleticism & conditioning' },
  { k: 'fat_loss',    label: 'FAT LOSS',    sub: 'Lean out, keep muscle' },
  { k: 'balanced',    label: 'BALANCED',    sub: 'A bit of everything' },
];
const REP_PREFS = [
  { k: 'higher',   label: 'HIGHER REPS',   sub: '12-20+ reps' },
  { k: 'moderate', label: 'MODERATE REPS', sub: '8-12 reps' },
  { k: 'lower',    label: 'LOWER REPS',    sub: '3-7 reps' },
];
const LEVELS = [
  { k: 'beginner',     label: 'BEGINNER',     sub: 'New - under ~1 year' },
  { k: 'intermediate', label: 'INTERMEDIATE', sub: '1-3 years training' },
  { k: 'advanced',     label: 'ADVANCED',     sub: '3+ years, dialed in' },
];
// "What drives you" — choose up to 2; the last two are exclusive (solo).
const TRAITS = [
  { k: 'intensity', label: 'I TAKE SETS TO FAILURE',          sub: 'Intensity' },
  { k: 'volume',    label: 'I TRAIN WITH LOTS OF SETS & REPS', sub: 'Volume' },
  { k: 'barbell',   label: 'I LOVE HEAVY BARBELL LIFTS',       sub: null },
  { k: 'machines',  label: 'I PREFER MACHINES & ACCESSORIES',  sub: null },
  { k: 'all',       label: 'I INCORPORATE ALL OF THESE',       sub: null, solo: true },
  { k: 'unsure',    label: "I DON'T KNOW YET",                 sub: null, solo: true },
];
const SOLO_TRAITS = ['all', 'unsure'];
// Alphabetical — zero-friction scanning, same rule as every picker in the app.
const MUSCLES = ['Abs', 'Arms', 'Back', 'Calves', 'Chest', 'Delts', 'Glutes', 'Hamstrings', 'Quads'];

function freqHint(d) {
  if (d <= 2) return 'Full body is the way to go on 2 days.';
  if (d === 3) return 'Full body, upper/lower, or a high-intensity split work well.';
  if (d === 4) return 'PPL, upper/lower, or high-intensity splits all work well.';
  if (d === 5) return 'PPL, modified bro splits, or hybrid splits work well.';
  return 'PPL, bro splits, and hybrid splits work well.';
}
const firstNameOf = (n) => (n.trim().split(/\s+/)[0] || '').toUpperCase();

// Lifter style derived from traits + rep preference (shown on the confirm screen).
function styleLabel(traits, reps) {
  if (!traits.length || traits.includes('all') || traits.includes('unsure')) return 'BALANCED';
  const hi = traits.includes('intensity') || traits.includes('barbell') || reps === 'lower';
  const hv = traits.includes('volume') || traits.includes('machines') || reps === 'higher';
  if (hi && !hv) return 'INTENSITY-DRIVEN';
  if (hv && !hi) return 'VOLUME-DRIVEN';
  return 'BALANCED';
}

// Haptics — silently no-op where unsupported (Expo Go).
const hTap  = () => { try { Haptics.selectionAsync(); } catch (e) { /* */ } };
const hBump = () => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) { /* */ } };
const hWin  = () => { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) { /* */ } };

// ─── Animated reveal (fade + rise on mount) ───────────────────────────────────
function Reveal({ children, delay = 0, dy = 14, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 440, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

// Faint "data ambiance" behind the intro — mock metrics like the intelligence report.
function MockBg() {
  return (
    <View pointerEvents="none" style={s.mockBg}>
      <View style={[s.mockBars, { top: 84, right: 14 }]}>
        {[16, 26, 21, 34, 29, 44, 38, 50].map((h, i) => <View key={i} style={[s.mockBar, { height: h }]} />)}
      </View>
      <View style={[s.mockTicks, { bottom: 150, left: 18 }]}>
        {['CHEST  ▲', 'BACK  ▲', 'QUADS  —', 'DELTS  ▲'].map((t, i) => <Text key={i} style={s.mockTick}>{t}</Text>)}
      </View>
      <View style={[s.mockGrades, { bottom: 96, right: 20 }]}>
        {['A-', 'B+', 'B', 'A'].map((g, i) => <Text key={i} style={s.mockGrade}>{g}</Text>)}
      </View>
    </View>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────────
function Kicker({ children, color }) { return <Text style={[s.kicker, { color: color || colors.acc2 }]}>{children}</Text>; }
function Display({ children, size }) { const fs = size || 40; return <Text style={[s.display, { fontSize: fs, lineHeight: fs + 4 }]}>{children}</Text>; }
function StepHead({ kicker, title, sub, size }) {
  return (
    <>
      <Reveal delay={0}><Kicker>{kicker}</Kicker></Reveal>
      <Reveal delay={70}><Display size={size}>{title}</Display></Reveal>
      {sub ? <Reveal delay={140}><Text style={s.sub}>{sub}</Text></Reveal> : null}
    </>
  );
}
function PrimaryBtn({ label, onPress, disabled }) {
  return (
    <TouchableOpacity style={[s.btn, disabled && s.btnOff]} onPress={() => { if (!disabled) { hBump(); onPress(); } }} disabled={!!disabled} activeOpacity={0.85}>
      <Text style={s.btnLabel}>{label}</Text>
      <Text style={s.btnArrow}>→</Text>
    </TouchableOpacity>
  );
}
function RadioCard({ label, sub, selected, onPress }) {
  return (
    <TouchableOpacity style={[s.card, selected && s.cardOn]} onPress={() => { hTap(); onPress(); }} activeOpacity={0.8}>
      <View style={[s.radioDot, selected && s.radioDotOn]}>{selected ? <View style={s.radioDotInner} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={[s.cardLabel, selected && { color: colors.acc }]}>{label}</Text>
        {sub ? <Text style={s.cardSub}>{sub}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}
function CheckCard({ label, sub, selected, onPress }) {
  return (
    <TouchableOpacity style={[s.card, selected && s.cardOn]} onPress={() => { hTap(); onPress(); }} activeOpacity={0.8}>
      <View style={[s.checkBox, selected && s.checkBoxOn]}>{selected ? <MaterialCommunityIcons name="check" size={14} color={colors.onAcc} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={[s.cardLabel, selected && { color: colors.acc }]}>{label}</Text>
        {sub ? <Text style={s.cardSub}>{sub}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}
function Chip({ label, selected, onPress, tint }) {
  return (
    <TouchableOpacity style={[s.chip, selected && s.chipOn, selected && tint === 'good' && { borderColor: colors.statusGood }]} onPress={() => { hTap(); onPress(); }} activeOpacity={0.8}>
      <Text style={[s.chipText, selected && s.chipTextOn, selected && tint === 'good' && { color: colors.statusGood }]}>{label}</Text>
    </TouchableOpacity>
  );
}
function GoalRow({ g, rank, onPress }) {
  const on = !!rank;
  return (
    <TouchableOpacity style={[s.card, on && s.cardOn]} onPress={() => { hTap(); onPress(); }} activeOpacity={0.8}>
      <View style={{ flex: 1 }}>
        <Text style={[s.cardLabel, on && { color: colors.acc }]}>{g.label}</Text>
        <Text style={s.cardSub}>{g.sub}</Text>
      </View>
      <View style={[s.rankBox, on && s.rankBoxOn]}>
        {rank ? <Text style={s.rankNum}>{rank}</Text> : <Text style={s.rankPlus}>+</Text>}
      </View>
    </TouchableOpacity>
  );
}

// Frosted-glass "live intelligence" panel — aspirational ambiance on the intro.
// expo-blur frost + Reanimated float, a self-drawing score ring, and the three
// pillars SWOLE/OS judges: Strength, Volume, Lean Mass.
function IntelGlass() {
  const RING = 58, ST = 6, R = (RING - ST) / 2, CIRC = 2 * Math.PI * R;
  const draw = useRef(new Animated.Value(0)).current;
  const fy = useSharedValue(0);
  useEffect(() => {
    Animated.timing(draw, { toValue: 1, duration: 1200, delay: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    fy.value = withRepeat(withTiming(-6, { duration: 2600, easing: ReEasing.inOut(ReEasing.quad) }), -1, true);
  }, []);
  const dashoff = draw.interpolate({ inputRange: [0, 1], outputRange: [CIRC, CIRC * (1 - 0.87)] });
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: fy.value }] }));
  const Metric = ({ label, val }) => (
    <View style={s.glassRow}>
      <Text style={s.glassLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      <MaterialCommunityIcons name="trending-up" size={13} color={colors.statusGood} />
      <Text style={s.glassVal}>{val}</Text>
    </View>
  );
  return (
    <Reanimated.View style={[s.glassWrap, floatStyle]}>
      <BlurView intensity={32} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={s.glassInner}>
        <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={RING} height={RING} style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}>
            <Defs>
              <LinearGradient id="igrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={colors.acc} />
                <Stop offset="1" stopColor={colors.statusMid} />
              </LinearGradient>
            </Defs>
            <Circle cx={RING / 2} cy={RING / 2} r={R} stroke="rgba(255,255,255,0.10)" strokeWidth={ST} fill="none" />
            <AnimatedCircle cx={RING / 2} cy={RING / 2} r={R} stroke="url(#igrad)" strokeWidth={ST} fill="none" strokeDasharray={CIRC} strokeDashoffset={dashoff} strokeLinecap="round" />
          </Svg>
          <Text style={s.glassScore}>87</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Metric label="STRENGTH" val="+6%" />
          <Metric label="VOLUME" val="+12%" />
          <Metric label="LEAN MASS" val="+0.4 lb" />
        </View>
      </View>
    </Reanimated.View>
  );
}

// ─── INTRO ────────────────────────────────────────────────────────────────────
function IntroAct({ onStart, onSkip }) {
  return (
    <SafeAreaView style={s.safe}>
      <MockBg />
      <View pointerEvents="none" style={s.introPurpleGlow}>
        <GlowPulse size={220} color="#7A5CFF" />
      </View>
      <View style={s.introTop}>
        <Wordmark size={18} />
        <TouchableOpacity onPress={onSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.skip}>SKIP</Text>
        </TouchableOpacity>
      </View>
      <View style={s.introBody}>
        <View style={s.introHero}>
          <GlowPulse size={280} />
          <AppIcon size={88} />
        </View>
        <View style={{ height: 22 }} />
        <Reveal delay={150}><Text style={s.introLead}>{'YOUR TRAINING,\nWEAPONIZED BY'}</Text></Reveal>
        <Reveal delay={260} style={{ marginTop: 2, marginBottom: space.md }}>
          <GradientText text="INTELLIGENCE" fontSize={31} fontFamily={fonts.display} letterSpacing={1} align="center" />
        </Reveal>
        <Reveal delay={400}>
          <Text style={s.introSub}>SWOLE/OS learns how you train, constantly analyzes your data, and guides you toward progressive overload.</Text>
        </Reveal>
        <Reveal delay={540} style={s.glassReveal}>
          <IntelGlass />
        </Reveal>
      </View>
      <View style={s.introFoot}>
        <PrimaryBtn label="BUILD MY SYSTEM" onPress={onStart} />
      </View>
    </SafeAreaView>
  );
}

// ─── ASSEMBLE (real, cites their answers) ─────────────────────────────────────
function AssembleAct({ data, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, []);
  const goal = (GOALS.find(g => g.k === data.ranked[0]) || {}).label || 'BALANCED';
  const level = (LEVELS.find(l => l.k === data.level) || {}).label || '';
  const style = styleLabel(data.traits, data.reps);
  const lines = [
    `Locking in for ${goal.toLowerCase()}`,
    `${data.days} days a week`,
    level ? `${level.toLowerCase()} lifter` : null,
    `${style.toLowerCase()} style`,
    data.weak.length ? `Prioritizing your ${data.weak.join(' & ').toLowerCase()}` : null,
  ].filter(Boolean);
  return (
    <SafeAreaView style={[s.safe, s.center]}>
      <View style={s.introHero}>
        <GlowPulse size={220} />
        <AppIcon size={72} />
      </View>
      <View style={{ height: 26 }} />
      <Kicker color={colors.acc2}>BUILDING YOUR SYSTEM</Kicker>
      <View style={{ height: 16 }} />
      {lines.map((l, i) => (
        <Reveal key={i} delay={250 + i * 370}>
          <View style={s.asmRow}>
            <MaterialCommunityIcons name="check" size={15} color={colors.acc} style={{ marginRight: 8 }} />
            <Text style={s.asmLine}>{l}</Text>
          </View>
        </Reveal>
      ))}
    </SafeAreaView>
  );
}

// ─── PAYOFF (preview + real routing) ──────────────────────────────────────────
function PayoffAct({ name, onComplete }) {
  const dn = firstNameOf(name) || 'ATHLETE';
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.payScroll} showsVerticalScrollIndicator={false}>
        <Reveal><View style={s.payBadge}><MaterialCommunityIcons name="check-bold" size={26} color={colors.onAcc} /></View></Reveal>
        <Reveal delay={110}><Kicker color={colors.acc2}>SYSTEM ONLINE</Kicker></Reveal>
        <Reveal delay={190}><Display size={40}>{`YOU'RE WIRED\nIN, ${dn}.`}</Display></Reveal>
        <Reveal delay={290}>
          <Text style={s.payBody}>Your intelligence is tuned to how you train. It sharpens every session you log. Where do you want to start?</Text>
        </Reveal>
        <Reveal delay={400}>
          <TouchableOpacity style={s.pathPrimary} onPress={() => { hBump(); onComplete('Home'); }} activeOpacity={0.85}>
            <View style={{ flex: 1 }}>
              <Text style={s.pathPrimaryTitle}>START LOGGING NOW</Text>
              <Text style={s.pathPrimarySub}>Jump in — log your first session</Text>
            </View>
            <Text style={s.arrowDark}>→</Text>
          </TouchableOpacity>
        </Reveal>
        <Reveal delay={480}>
          <TouchableOpacity style={s.pathGhost} onPress={() => { hBump(); onComplete('Train'); }} activeOpacity={0.8}>
            <View style={{ flex: 1 }}>
              <Text style={s.pathGhostTitle}>BUILD A TEMPLATE</Text>
              <Text style={s.pathGhostSub}>Set up a split — sessions populate as you go</Text>
            </View>
            <Text style={s.arrowMuted}>→</Text>
          </TouchableOpacity>
        </Reveal>
        <Reveal delay={560}>
          <TouchableOpacity style={s.pathPro} onPress={() => { hBump(); onComplete('Train', 'programs'); }} activeOpacity={0.8}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <Text style={s.pathProTitle}>EXPERT PROGRAMS</Text>
                <View style={s.proBadge}><Text style={s.proBadgeText}>PRO</Text></View>
              </View>
              <Text style={s.pathProSub}>Coach-built plans with video demos</Text>
            </View>
            <Text style={s.arrowAcc}>→</Text>
          </TouchableOpacity>
        </Reveal>
        <Reveal delay={650}>
          <TouchableOpacity style={s.exploreLink} onPress={() => { hTap(); onComplete('Home'); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.exploreText}>I'LL EXPLORE THE APP FIRST</Text>
          </TouchableOpacity>
        </Reveal>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function OnboardingScreen({ onComplete, preview = false }) {
  const [phase, setPhase] = useState('intro');   // intro | calibrate | assemble | payoff
  const [step, setStep] = useState(0);
  const TOTAL = 7;

  const [name, setName] = useState('');
  const [ranked, setRanked] = useState([]);
  const [traits, setTraits] = useState([]);
  const [days, setDays] = useState(4);
  const [level, setLevel] = useState(null);
  const [reps, setReps] = useState(null);
  const [weak, setWeak] = useState([]);
  const [strong, setStrong] = useState([]);

  const fn = firstNameOf(name);
  const rankOf = (k) => { const i = ranked.indexOf(k); return i < 0 ? null : i + 1; };
  const toggleGoal = (k) => setRanked(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k]);
  const toggleTrait = (k) => setTraits(p => {
    if (SOLO_TRAITS.includes(k)) return p.includes(k) ? [] : [k];   // solo: exclusive
    const base = p.filter(x => !SOLO_TRAITS.includes(x));
    if (base.includes(k)) return base.filter(x => x !== k);
    return base.length >= 2 ? base : [...base, k];
  });
  // Weak/strong are mutually exclusive, up to 2 each.
  const toggleWeak = (m) => {
    setStrong(sp => sp.filter(x => x !== m));
    setWeak(p => p.includes(m) ? p.filter(x => x !== m) : p.length >= 2 ? p : [...p, m]);
  };
  const toggleStrong = (m) => {
    setWeak(wp => wp.filter(x => x !== m));
    setStrong(p => p.includes(m) ? p.filter(x => x !== m) : p.length >= 2 ? p : [...p, m]);
  };

  const canContinue = [
    name.trim().length > 0,   // 0 name
    ranked.length > 0,        // 1 goals
    traits.length > 0,        // 2 what drives you
    true,                     // 3 frequency
    !!level && !!reps,        // 4 how do you train
    weak.length > 0,          // 5 physique
    true,                     // 6 confirm
  ][step];

  function goNext() { if (step < TOTAL - 1) setStep(v => v + 1); }
  function goBack() { if (step > 0) setStep(v => v - 1); else setPhase('intro'); }

  async function calibrate() {
    hWin();
    setPhase('assemble');
    if (preview) return; // dev replay — don't touch the account's real calibration
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const archetype = traits.includes('barbell') ? 'compound' : traits.includes('volume') ? 'physique' : 'both';
      // Core fields — must always persist (sets `goal`, which clears onboarding).
      await supabase.from('users').update({
        name: name.trim() || 'Athlete',
        goal: ranked[0] || 'balanced',
        goals_ranked: ranked,
        training_days_per_week: days,
        rep_preference: reps,
        experience_level: level,
        archetype,
        weakest_part: weak[0] || null,
        priority_muscles: weak,       // push the weak areas — they ARE the priority
      }).eq('id', user.id);
      // Newer columns — grouped (no-op together if the migration isn't run yet).
      await supabase.from('users').update({
        lifter_traits: traits,
        lifter_style: styleLabel(traits, reps),
        weak_muscles: weak,
        strong_muscles: strong,
      }).eq('id', user.id);
    }
    // AssembleAct's timer advances to payoff once its animation plays.
  }

  if (phase === 'intro')    return <IntroAct onStart={() => setPhase('calibrate')} onSkip={() => onComplete('Home')} />;
  if (phase === 'assemble') return <AssembleAct data={{ ranked, days, level, reps, traits, weak }} onDone={() => setPhase('paywall')} />;
  if (phase === 'paywall')  return <PaywallScreen onStartTrial={() => setPhase('payoff')} onSkip={() => setPhase('payoff')} onRestore={() => { /* TODO RevenueCat restore */ }} />;
  if (phase === 'payoff')   return <PayoffAct name={name} onComplete={onComplete} />;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.header}>
          <TouchableOpacity onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={s.backChev}>‹</Text>
          </TouchableOpacity>
          <View style={s.progTrack}>
            {Array.from({ length: TOTAL }).map((_, i) => <View key={i} style={[s.seg, i <= step && s.segOn]} />)}
          </View>
          <Text style={s.stepNum}>{String(step + 1).padStart(2, '0')}/{TOTAL}</Text>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <View>
              <Reveal><AppIcon size={56} /></Reveal>
              <View style={{ height: 20 }} />
              <StepHead kicker="INITIALIZE" title={'WHAT DO I\nCALL YOU?'} sub="I'll tune everything around how you train. First — what should I call you?" />
              <Reveal delay={210}>
                <Text style={s.fieldLbl}>YOUR NAME</Text>
                <TextInput style={s.input} placeholder="e.g. Marcus" placeholderTextColor={colors.dim} value={name} onChangeText={setName} autoFocus returnKeyType="done" />
              </Reveal>
            </View>
          )}

          {step === 1 && (
            <View>
              <StepHead kicker="THE MISSION" title={'WHAT ARE YOU\nCHASING?'} sub={`${fn ? `Alright, ${fn}. ` : ''}Tap to rank by importance — skip any that don't apply.`} />
              <Reveal delay={210}>{GOALS.map(g => <GoalRow key={g.k} g={g} rank={rankOf(g.k)} onPress={() => toggleGoal(g.k)} />)}</Reveal>
            </View>
          )}

          {step === 2 && (
            <View>
              <StepHead kicker="THIS HELPS SWOLE/OS UNDERSTAND YOU AS A LIFTER" title={'WHAT DRIVES\nYOU?'} sub="Choose up to 2." />
              <Reveal delay={210}>{TRAITS.map(o => <CheckCard key={o.k} label={o.label} sub={o.sub} selected={traits.includes(o.k)} onPress={() => toggleTrait(o.k)} />)}</Reveal>
            </View>
          )}

          {step === 3 && (
            <View style={{ alignItems: 'center' }}>
              <StepHead kicker="THE COMMITMENT" title={'HOW MANY DAYS,\nREALLY?'} size={36} sub="Be honest about what you can NAIL every week. Consistency beats ambition." />
              <Reveal delay={210} style={{ alignItems: 'center' }}>
                <View style={s.dialRow}>
                  <TouchableOpacity style={s.dialBtn} onPress={() => { hTap(); setDays(d => Math.max(2, d - 1)); }}><Text style={s.dialBtnText}>−</Text></TouchableOpacity>
                  <View style={s.dialCenter}>
                    <Text style={s.dialNum}>{days}</Text>
                    <Text style={[s.kicker, { color: colors.muted }]}>DAYS / WEEK</Text>
                  </View>
                  <TouchableOpacity style={s.dialBtn} onPress={() => { hTap(); setDays(d => Math.min(7, d + 1)); }}><Text style={s.dialBtnText}>+</Text></TouchableOpacity>
                </View>
                <View style={s.pipRow}>
                  {[2, 3, 4, 5, 6, 7].map(d => (
                    <TouchableOpacity key={d} onPress={() => { hTap(); setDays(d); }}><View style={[s.pip, d <= days && s.pipOn]} /></TouchableOpacity>
                  ))}
                </View>
                <Text style={[s.sub, { textAlign: 'center', marginTop: space.md }]}>{freqHint(days)}</Text>
              </Reveal>
            </View>
          )}

          {step === 4 && (
            <View>
              <StepHead kicker="YOUR STYLE" title={'HOW DO YOU\nTRAIN?'} size={30} />
              <Reveal delay={210}>
                <Text style={s.grpLbl}>HOW <Text style={{ color: colors.acc }}>EXPERIENCED</Text> ARE YOU?</Text>
                {LEVELS.map(o => <RadioCard key={o.k} label={o.label} sub={o.sub} selected={level === o.k} onPress={() => setLevel(o.k)} />)}
                <View style={{ height: space.sm }} />
                <Text style={s.grpLbl}>TYPICAL <Text style={{ color: colors.acc }}>REP RANGE</Text> YOU LIKE TO USE</Text>
                {REP_PREFS.map(o => <RadioCard key={o.k} label={o.label} sub={o.sub} selected={reps === o.k} onPress={() => setReps(o.k)} />)}
              </Reveal>
            </View>
          )}

          {step === 5 && (
            <View>
              <StepHead kicker="THE MIRROR" title={'BE HONEST\nABOUT YOUR\nPHYSIQUE.'} />
              <Reveal delay={210}>
                <Text style={s.grpLbl}>YOUR 2 <Text style={s.grpHi}>WEAKEST</Text> AREAS  ·  WE'LL PUSH THESE HARDER</Text>
                <View style={s.chips}>{MUSCLES.map(m => <Chip key={m} label={m} selected={weak.includes(m)} onPress={() => toggleWeak(m)} />)}</View>
                <View style={{ height: space.lg }} />
                <Text style={s.grpLbl}>YOUR 2 <Text style={s.grpHi}>STRONGEST / BEST-DEVELOPED</Text></Text>
                <View style={s.chips}>{MUSCLES.map(m => <Chip key={m} label={m} tint="good" selected={strong.includes(m)} onPress={() => toggleStrong(m)} />)}</View>
              </Reveal>
            </View>
          )}

          {step === 6 && (
            <View>
              <StepHead kicker="CONFIRM" title={'YOUR\nSYSTEM.'} />
              <Reveal delay={210}>
                <View style={s.spec}>
                  {[
                    { k: 'OPERATOR',  v: name.trim() || 'Athlete' },
                    { k: 'GOALS',     v: ranked.length ? ranked.map(k => (GOALS.find(g => g.k === k) || {}).label || k).join(' › ') : 'BALANCED' },
                    { k: 'FREQUENCY', v: days + ' DAYS / WEEK' },
                    { k: 'STYLE',     v: styleLabel(traits, reps) },
                    { k: 'STRENGTHS',  v: strong.length ? strong.join(' · ') : '-' },
                    { k: 'WEAK POINTS', v: weak.length ? weak.join(' · ') : '-' },
                  ].map((row, i) => (
                    <View key={i} style={[s.specRow, i === 0 && { borderTopWidth: 0 }]}>
                      <Text style={s.specKey}>{row.k}</Text>
                      <Text style={s.specVal}>{row.v}</Text>
                    </View>
                  ))}
                </View>
                <Text style={s.sub}>Lock it in and SWOLE/OS tunes your engine. Recalibrate anytime in your profile.</Text>
              </Reveal>
            </View>
          )}
        </ScrollView>

        <View style={s.footer}>
          {step < TOTAL - 1
            ? <PrimaryBtn label="CONTINUE" onPress={goNext} disabled={!canContinue} />
            : <PrimaryBtn label="CALIBRATE SYSTEM" onPress={calibrate} disabled={!canContinue} />}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.lg },

  kicker: { fontFamily: fonts.bodySemi, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.6, marginBottom: space.xs },
  display: { fontFamily: fonts.display, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: space.md, paddingTop: 4 },
  sub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.muted, marginBottom: space.lg },
  grpLbl: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: space.sm },
  grpHi: { fontFamily: fonts.bodyBold, color: colors.acc },

  // mock-metrics ambiance
  mockBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5 },
  mockBars: { position: 'absolute', flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  mockBar: { width: 7, backgroundColor: colors.line2 },
  mockTicks: { position: 'absolute', gap: 8 },
  mockTick: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.line2, letterSpacing: 1 },
  mockGrades: { position: 'absolute', flexDirection: 'row', gap: 12 },
  mockGrade: { fontFamily: fonts.display, fontSize: 22, color: colors.line2 },

  // intro
  introTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md },
  skip: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.8 },
  introBody: { flex: 1, paddingHorizontal: space.lg, justifyContent: 'center', alignItems: 'center' },
  introHero: { alignItems: 'center', justifyContent: 'center' },
  introLead: { fontFamily: fonts.display, fontSize: 29, lineHeight: 32, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },
  introSub: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.muted, textAlign: 'center', maxWidth: 360 },
  introPurpleGlow: { position: 'absolute', left: -34, top: 380, opacity: 0.6 },
  glassReveal: { width: '100%', maxWidth: 330, marginTop: space.lg },
  glassWrap: { width: '100%', borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  glassInner: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, backgroundColor: 'rgba(255,255,255,0.04)' },
  glassScore: { fontFamily: fonts.display, fontSize: 21, color: colors.text },
  glassRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: 4 },
  glassLabel: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, letterSpacing: 1, textTransform: 'uppercase' },
  glassVal: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.statusGood },
  introFoot: { paddingHorizontal: space.lg, paddingBottom: space.lg },

  // assemble
  asmRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  asmLine: { fontFamily: fonts.bodyMed, fontSize: 16, color: colors.text },

  // header / progress
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, gap: 12 },
  backChev: { fontFamily: fonts.bodyBold, fontSize: 26, color: colors.muted, width: 18 },
  progTrack: { flex: 1, flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 3, backgroundColor: colors.line2 },
  segOn: { backgroundColor: colors.acc },
  stepNum: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, letterSpacing: 1, fontVariant: ['tabular-nums'] },

  scroll: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xl },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.lg, paddingTop: space.sm },

  // inputs
  fieldLbl: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: space.sm },
  input: { borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf, paddingHorizontal: space.md, paddingVertical: 14, fontFamily: fonts.bodyMed, fontSize: 18, color: colors.text },

  // cards (radio / check / goal share the frame)
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf, paddingHorizontal: space.md, paddingVertical: 11, marginBottom: 7 },
  cardOn: { borderColor: colors.acc, backgroundColor: colors.accSurf },
  cardLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.3 },
  cardSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
  radioDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.line2, marginRight: space.md, alignItems: 'center', justifyContent: 'center' },
  radioDotOn: { borderColor: colors.acc },
  radioDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.acc },
  checkBox: { width: 20, height: 20, borderWidth: 1.5, borderColor: colors.line2, marginRight: space.md, alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { borderColor: colors.acc, backgroundColor: colors.acc },

  // chips
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf, paddingHorizontal: 14, paddingVertical: 10 },
  chipOn: { borderColor: colors.acc, backgroundColor: colors.accSurf },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  chipTextOn: { color: colors.acc },

  // goal ranking box
  rankBox: { width: 30, height: 30, borderWidth: 1.5, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  rankBoxOn: { borderColor: colors.acc, backgroundColor: colors.acc },
  rankNum: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onAcc },
  rankPlus: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.dim },

  // frequency dial
  dialRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginTop: space.xl },
  dialBtn: { width: 52, height: 52, borderWidth: 1.5, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  dialBtnText: { fontFamily: fonts.display, fontSize: 28, color: colors.acc },
  dialCenter: { alignItems: 'center', minWidth: 96 },
  dialNum: { fontFamily: fonts.display, fontSize: 72, color: colors.text, lineHeight: 78 },
  pipRow: { flexDirection: 'row', gap: 8, marginTop: space.lg },
  pip: { width: 26, height: 5, backgroundColor: colors.line2 },
  pipOn: { backgroundColor: colors.acc },

  // confirm spec
  spec: { borderWidth: 1.5, borderColor: colors.line2, marginBottom: space.lg },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 12, borderTopWidth: 1.5, borderTopColor: colors.line },
  specKey: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.2 },
  specVal: { flex: 1, textAlign: 'right', fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, marginLeft: space.md },

  // primary button
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.acc, paddingVertical: 17, gap: 10 },
  btnOff: { backgroundColor: colors.surf3, opacity: 0.55 },
  btnLabel: { fontFamily: fonts.display, fontSize: 18, color: colors.onAcc, textTransform: 'uppercase', letterSpacing: 0.5 },
  btnArrow: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.onAcc },

  // payoff
  payScroll: { paddingHorizontal: space.lg, paddingTop: space.xxl, paddingBottom: space.xl },
  payBadge: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.acc, alignItems: 'center', justifyContent: 'center', marginBottom: space.lg },
  payBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.muted, marginBottom: space.xl },
  pathPrimary: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.acc, padding: space.lg, marginBottom: space.md },
  pathPrimaryTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onAcc, textTransform: 'uppercase' },
  pathPrimarySub: { fontFamily: fonts.body, fontSize: 13, color: colors.onAcc, opacity: 0.8, marginTop: 2 },
  arrowDark: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.onAcc },
  pathGhost: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf, padding: space.lg, marginBottom: space.md },
  pathGhostTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textTransform: 'uppercase' },
  pathGhostSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  arrowMuted: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.muted },
  pathPro: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.accDim, backgroundColor: colors.accSurf, padding: space.lg },
  pathProTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.acc2, textTransform: 'uppercase' },
  pathProSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  arrowAcc: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.acc2 },
  proBadge: { backgroundColor: colors.acc, paddingHorizontal: 6, paddingVertical: 2 },
  proBadgeText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.onAcc, letterSpacing: 1 },
  exploreLink: { alignItems: 'center', paddingVertical: space.md, marginTop: space.xs },
  exploreText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.dim, textTransform: 'uppercase', letterSpacing: 1.2 },
});
