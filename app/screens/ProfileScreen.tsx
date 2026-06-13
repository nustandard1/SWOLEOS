// @ts-nocheck
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, Modal, TextInput,
} from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import SwipeSheet from '../components/SwipeSheet';
import { BlurView } from 'expo-blur';
import { isHealthAvailable, getBodyMetrics, requestHealthPermissions } from '../lib/health';
import { getMergedBody } from '../lib/trendPairs';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { colors, fonts, space } from '../theme/forge';
import { triggerReplayOnboarding, triggerPreviewPaywall } from '../lib/devBus';
import { seedCoachData, clearCoachSeed } from '../lib/devSeed';
import { resolveSplitDef } from '../lib/splitDefinitions';
import * as Updates from 'expo-updates';

// Show the onboarding-replay tool in dev AND on the internal preview build (so Mike
// can preview onboarding on-device), but never in a production launch build.
const SHOW_PREVIEW_TOOLS = __DEV__ || (!!Updates.channel && Updates.channel !== 'production');

// Current goal — the lifter's ACTIVE physique phase. Stored in users.current_phase;
// drives the body-comp read ("how am I doing FOR MY GOAL") and future coaching.
// 'gain'/'lean'/'recomp'/'maintain' keep their original engine keys; 'lean_gain' maps
// to the gain pivot, 'none' to observational-only.
const GOALS = [
  { k: 'gain',      label: 'BULKING' },
  { k: 'lean_gain', label: 'LEAN GAIN' },
  { k: 'recomp',    label: 'RECOMP' },
  { k: 'maintain',  label: 'MAINTAIN' },
  { k: 'lean',      label: 'CUTTING' },
];
// One-line explanation shown under the selected goal.
const GOAL_INFO = {
  gain:      'Aggressive weight gain — use care not to add excessive body fat.',
  lean_gain: 'Gradual accumulation of size, aiming to minimize body fat.',
  recomp:    'Hold your bodyweight while getting leaner and building muscle.',
  maintain:  'Keep what you’ve got — strength, body composition, and bodyweight.',
  lean:      'Get leaner and lose weight while keeping as much lean mass as possible.',
};

// Alphabetical — zero-friction scanning, same rule as every picker in the app.
const MUSCLES = ['abs', 'arms', 'back', 'calves', 'chest', 'delts', 'glutes', 'hamstrings', 'quads'];
const FREQ_DAYS = [2, 3, 4, 5, 6];
const EXP_LEVELS = [
  { k: 'beginner', label: 'BEGINNER' },
  { k: 'intermediate', label: 'INTERMEDIATE' },
  { k: 'advanced', label: 'ADVANCED' },
];
const REP_PREFS = [
  { k: 'lower', label: 'LOWER (3–7)' },
  { k: 'moderate', label: 'MODERATE (8–12)' },
  { k: 'higher', label: 'HIGHER (12–20)' },
];
// ALL first — the combined trend is the default read; tap into a single metric for detail.
// SETS was dropped (redundant with volume); LEAN MASS (Apple Health) replaces it.
const CHART_MODES = [
  { k: 'all', label: 'ALL' },
  { k: 'vol', label: 'VOLUME' },
  { k: 'str', label: 'STRENGTH' },
  { k: 'lean', label: 'LEAN MASS' },
];
const LINE_COLORS = { vol: colors.acc, str: colors.statusGood, lean: '#2ED9FF' };
// "Upper/Lower 3" → "Upper/Lower"; "PPL 4-Day" → "PPL" (split TYPE, not the variant).
const cleanSplit = (name) => String(name || '').replace(/\s*\d+(-day)?\s*$/i, '').trim();
// Onboarding-era muscle values were stored Capitalized; canonical is lowercase
// (matches exercises.primary_muscle). Normalize on read AND write.
const lc = (arr) => (arr || []).map(x => String(x).toLowerCase());

const fmtShort = (v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : `${Math.round(v)}`);
const mondayOf = (d) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - dow); return x; };

export default function ProfileScreen() {
  const navigation = useNavigation();
  const [profile, setProfile] = useState(null);
  const [lifetimeVol, setLifetimeVol] = useState(0);
  const [hasSessions, setHasSessions] = useState(true); // default true so the to-do doesn't flash pre-load
  const [dismissed, setDismissed] = useState({});       // setup items the user X'd this session
  const [goalLocked, setGoalLocked] = useState(true);   // goal locked once set — tap unlock to change (no accidental toggles)
  const [showWeighIn, setShowWeighIn] = useState(false);
  const [wiWeight, setWiWeight] = useState('');
  const [wiBf, setWiBf] = useState('');
  const [program, setProgram] = useState(null);   // { title, splitName, sessions }
  const [streak, setStreak] = useState(0);        // days — Mike's forgiving definition
  const [weeks, setWeeks] = useState([]);         // 8 weekly buckets {vol, sets, str}
  const [leanWeeks, setLeanWeeks] = useState([]); // 8 weekly avg lean-mass lbs (0 = no data)
  const [leanHasData, setLeanHasData] = useState(false); // Health returned ANY lean samples — gates the connect CTA (parity w/ Intelligence)
  const [chartMode, setChartMode] = useState('all');
  const [editOpen, setEditOpen] = useState(false);
  const [draftWeak, setDraftWeak] = useState([]);
  const [draftStrong, setDraftStrong] = useState([]);
  const [draftDays, setDraftDays] = useState(null);
  const [draftExp, setDraftExp] = useState(null);
  const [draftReps, setDraftReps] = useState(null);

  useFocusEffect(useCallback(() => { loadProfile(); }, []));

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [profileRes, sessionsRes, tmplRes] = await Promise.all([
      supabase.from('users').select('*').eq('id', user.id).single(),
      supabase
        .from('workout_sessions')
        .select('performed_at, session_exercises(set_logs(weight, reps, is_warmup))')
        .eq('user_id', user.id),
      supabase
        .from('workout_templates')
        .select('id, title, split_type, template_sessions(id)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    if (profileRes.data) setProfile({ ...profileRes.data, email: user.email });

    const plannedPerWeek = tmplRes.data?.template_sessions?.length || 0;
    if (tmplRes.data) {
      const def = resolveSplitDef(tmplRes.data.split_type);
      setProgram({
        id: tmplRes.data.id,
        splitId: tmplRes.data.split_type,
        title: tmplRes.data.title,
        splitName: cleanSplit(def?.shortName ?? tmplRes.data.split_type),
        sessions: plannedPerWeek,
      });
    } else {
      setProgram(null);
    }

    // Lean mass (Apple Health) — weekly averages for the trend chart. Empty/zeros when
    // Health is unavailable or unconnected; the chart explains itself in that case.
    try {
      // Merged body data (Apple Health + manual weigh-ins), last 8 weeks.
      const sinceMs = Date.now() - 56 * 86400000;
      const { leanMass } = await getMergedBody(user.id, sinceMs);
      setLeanHasData(!!(leanMass && leanMass.length));
      if (leanMass?.length) {
        const nowT = new Date();
        const monday = mondayOf(nowT);
        const sums = Array.from({ length: 8 }, () => ({ t: 0, n: 0 }));
        for (const sample of leanMass) {
          const wk = Math.floor((monday.getTime() + 7 * 86400000 - sample.date) / (7 * 86400000));
          if (wk >= 0 && wk < 8) { sums[wk].t += sample.value; sums[wk].n += 1; }
        }
        const lw = sums.map(x => (x.n ? x.t / x.n : 0)).reverse(); // oldest → newest
        for (let i = 1; i < lw.length; i++) if (!lw[i] && lw[i - 1]) lw[i] = lw[i - 1];
        setLeanWeeks(lw);
      }
    } catch (e) { setLeanHasData(false); /* read failed — chart shows the connect note */ }

    // One pass over all sessions: lifetime volume + 8-week chart buckets + streak.
    const sessions = sessionsRes.data || [];
    setHasSessions(sessions.length > 0);
    let vol = 0;
    const now = new Date();
    const thisMonday = mondayOf(now);
    const bucketOf = (t) => Math.floor((thisMonday.getTime() + 7 * 86400000 - t) / (7 * 86400000)); // 0 = current week
    const buckets = Array.from({ length: 8 }, () => ({ vol: 0, sets: 0, str: 0 }));
    const weekSessionCount = {}; // weeksAgo -> sessions logged

    for (const sess of sessions) {
      const t = new Date(sess.performed_at).getTime();
      const wk = bucketOf(t);
      if (wk >= 0) weekSessionCount[wk] = (weekSessionCount[wk] || 0) + 1;
      for (const ex of sess.session_exercises || []) {
        for (const set of ex.set_logs || []) {
          if (set.is_warmup || !(set.reps > 0)) continue;
          const w = set.weight || 0;
          vol += w * set.reps;
          if (wk >= 0 && wk < 8) {
            const b = buckets[wk];
            b.vol += w * set.reps;
            b.sets += 1;
            const e = w * (1 + set.reps / 30);
            if (e > b.str) b.str = e;
          }
        }
      }
    }
    setLifetimeVol(vol);
    setWeeks([...buckets].reverse()); // oldest → newest for the chart

    // STREAK (forgiving): a past week "holds" if its logged sessions ≥ planned (or ≥1
    // with no active program). The in-progress week always counts. Streak = days since
    // the start of the oldest consecutive holding week, as long as the run has training.
    const holds = (wk) => (weekSessionCount[wk] || 0) >= (plannedPerWeek > 0 ? plannedPerWeek : 1);
    let heldWeeks = 0;
    while (heldWeeks < 52 && holds(heldWeeks + 1)) heldWeeks++;
    const runStart = new Date(thisMonday.getTime() - heldWeeks * 7 * 86400000);
    const anyTraining = heldWeeks > 0 || (weekSessionCount[0] || 0) > 0;
    setStreak(anyTraining ? Math.floor((now.getTime() - runStart.getTime()) / 86400000) + 1 : 0);
  }

  // One-tap Health connect, right where the lean-mass chart asks for it.
  async function connectHealth() {
    if (!isHealthAvailable()) {
      Alert.alert('Apple Health', 'Health connects in the installed app on your iPhone.');
      return;
    }
    try { await requestHealthPermissions(); } catch (e) { /* user declined — fine */ }
    loadProfile();
  }

  async function saveWeighIn() {
    const w = parseFloat(wiWeight), bf = parseFloat(wiBf);
    if (isNaN(w) && isNaN(bf)) { setShowWeighIn(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('body_metrics').insert({
        user_id: user.id,
        weight: isNaN(w) ? null : w,
        body_fat: isNaN(bf) ? null : bf,
      });
    }
    setShowWeighIn(false); setWiWeight(''); setWiBf('');
    loadProfile();
  }

  async function pickGoal(k) {
    setProfile(p => ({ ...p, current_phase: k }));
    setGoalLocked(true); // re-lock after choosing so it can't drift by accident
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('users').update({ current_phase: k }).eq('id', user.id);
  }

  function openMuscleEditor() {
    // Lowercase BOTH drafts — onboarding-era rows stored "Chest" etc., which made
    // chips look blocked/frozen against the lowercase chip values.
    setDraftWeak(lc(profile?.weak_muscles?.length ? profile.weak_muscles : (profile?.weakest_part ? [profile.weakest_part] : [])).filter(m => MUSCLES.includes(m)).slice(0, 2));
    setDraftStrong(lc(profile?.strong_muscles).filter(m => MUSCLES.includes(m)).slice(0, 2));
    setDraftDays(profile?.training_days_per_week || null);
    setDraftExp(profile?.experience_level || null);
    setDraftReps(profile?.rep_preference || null);
    setEditOpen(true);
  }
  // Zero-friction selection: tap to add, tap again to remove; at the 2-pick limit a new
  // tap auto-swaps out the most recent pick; tapping a muscle that lives in the OTHER
  // list steals it over. Nothing ever silently refuses.
  function toggleDraft(list, setList, other, setOther, m) {
    if (list.includes(m)) { setList(list.filter(x => x !== m)); return; }
    if (other.includes(m)) setOther(other.filter(x => x !== m));
    setList(list.length >= 2 ? [...list.slice(0, list.length - 1), m] : [...list, m]);
  }
  async function saveMuscles() {
    setEditOpen(false);
    setProfile(p => ({
      ...p, weak_muscles: draftWeak, strong_muscles: draftStrong, training_days_per_week: draftDays,
      experience_level: draftExp, rep_preference: draftReps,
    }));
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('users').update({
        weak_muscles: draftWeak, strong_muscles: draftStrong, priority_muscles: draftWeak,
        training_days_per_week: draftDays, experience_level: draftExp, rep_preference: draftReps,
      }).eq('id', user.id);
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  function fmtVol(v) {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M LBS`;
    if (v >= 1000)    return `${(v / 1000).toFixed(1)}K LBS`;
    return `${v.toLocaleString()} LBS`;
  }

  const initial = profile?.name?.charAt(0)?.toUpperCase() || '?';
  const days = profile?.training_days_per_week;
  // Pro members don't get sold what they already own (RevenueCat will set users.tier).
  const isPro = ['pro', 'premium', 'lifetime'].includes(String(profile?.tier || '').toLowerCase());

  const fmt = (s) => (s ? String(s).replace(/_/g, ' ').toUpperCase() : '');
  const ranked = profile?.goals_ranked?.length ? profile.goals_ranked : (profile?.goal ? [profile.goal] : []);
  const goalsLabel = ranked.length ? ranked.map(fmt).join(' › ') : '—';
  const repLabel = fmt(profile?.rep_preference);
  const levelLabel = fmt(profile?.experience_level);
  const styleLabel = fmt(profile?.lifter_style)
    || [repLabel && `${repLabel} REPS`, levelLabel].filter(Boolean).join(' · ')
    || '—';
  const strongLabel = profile?.strong_muscles?.length ? profile.strong_muscles.map(fmt).join(' · ') : '—';
  const focusList = profile?.weak_muscles?.length ? profile.weak_muscles : (profile?.weakest_part ? [profile.weakest_part] : []);
  const focusLabel = focusList.length ? focusList.map(fmt).join(' · ') : '—';

  const specRows = [
    { k: 'GOALS',           v: goalsLabel },
    { k: 'FREQUENCY',       v: days ? `${days} DAYS / WEEK` : '—' },
    { k: 'STYLE',           v: styleLabel },
    { k: 'STRENGTHS',       v: strongLabel },
    { k: 'WEAK POINTS',     v: focusLabel },
    { k: 'LIFETIME VOLUME', v: fmtVol(lifetimeVol) },
  ];

  // Chart window ADAPTS to the data: a lifter with 2 weeks of history gets a 2-week
  // chart that fills the full width (honest dynamic ticks), not 6 empty weeks of shelf.
  const leanFull = leanWeeks.length === 8 ? leanWeeks : Array(8).fill(0);
  const firstDataIdx = (() => {
    for (let i = 0; i < 8; i++) {
      if ((weeks[i] && (weeks[i].vol > 0 || weeks[i].str > 0)) || leanFull[i] > 0) return i;
    }
    return 6;
  })();
  const winStart = Math.min(firstDataIdx, 6); // window always has ≥2 slots
  const winWeeks = weeks.slice(winStart);
  const leanSeries = leanFull.slice(winStart);
  const hasLean = leanSeries.some(v => v > 0);
  const tickLabels = Array.from({ length: 8 - winStart }, (_, j) => {
    const weeksAgo = 7 - (winStart + j);
    return weeksAgo === 0 ? 'NOW' : `${weeksAgo}W`;
  });
  const chartVals = winWeeks.map((w, i) => (chartMode === 'str' ? w.str : chartMode === 'lean' ? leanSeries[i] : w.vol));
  const chartMax = Math.max(...chartVals, 1);
  const latest = chartVals[chartVals.length - 1] || 0;

  // STRENGTH reads as % change vs the first trained week — "1.4K E1RM" means nothing
  // to most lifters; "+6% vs 8 wks ago" does.
  const strSeries = winWeeks.map(w => w.str);
  const strBase = strSeries.find(v => v > 0) || 0;
  const strLatest = strSeries[strSeries.length - 1] || 0;
  const strPct = strBase > 0 && strLatest > 0 ? ((strLatest - strBase) / strBase) * 100 : null;
  const headline =
    chartMode === 'vol' ? `${fmtShort(latest)} LBS`
    : chartMode === 'lean' ? (hasLean ? `${latest.toFixed(1)} LBS` : '—')
    : chartMode === 'str' ? (strPct == null ? '—' : `${strPct >= 0 ? '+' : ''}${strPct.toFixed(1)}%`)
    : 'ALL TRENDS';

  // Line mode: each series normalized to its own max so the SHAPES compare (trend
  // direction is the point, not shared units). Leading no-data weeks are TRIMMED —
  // otherwise empty weeks render as a flat zero shelf before the data starts.
  const linePoints = (vals) => {
    const first = vals.findIndex(v => v > 0);
    if (first === -1) return '';
    const max = Math.max(...vals, 1);
    const pts = [];
    for (let i = first; i < vals.length; i++) {
      pts.push(`${vals.length > 1 ? (i / (vals.length - 1)) * 100 : 0},${100 - (vals[i] / max) * 92 - 4}`);
    }
    return pts.join(' ');
  };

  const currentPhase = profile?.current_phase;
  const hasGoal = currentPhase && currentPhase !== 'none';

  // Setup checklist — each item shows only while incomplete; the whole card auto-hides
  // when everything's done. The X dismisses an item for the session.
  const todoItems = [
    !hasSessions && { key: 'log', icon: 'dumbbell', label: 'Log your first session', sub: 'Tap + and start training', onPress: () => navigation.navigate('WorkoutLogger', undefined) },
    !program && { key: 'program', icon: 'clipboard-text', label: 'Set up a program', sub: 'Build a template or choose a PRO program', onPress: () => navigation.navigate('Train') },
    (!profile?.current_phase || profile?.current_phase === 'none') && { key: 'phase', icon: 'target', label: 'Set your current goal', sub: 'Pick a phase above — bulk, cut, recomp…', onPress: null },
    isHealthAvailable() && !leanHasData && { key: 'health', icon: 'heart-pulse', label: 'Connect Apple Health', sub: 'Track weight & body composition', onPress: connectHealth },
  ].filter(Boolean).filter(t => !dismissed[t.key]);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.headerRow}>
          <Text style={s.title}>PROFILE</Text>
          {!isPro && (
            <TouchableOpacity style={s.goProChip} activeOpacity={0.8}>
              <Text style={s.goProChipText}>GO PRO</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Identity + streak */}
        <View style={s.identity}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.identityName}>{(profile?.name || 'Athlete').toUpperCase()}</Text>
            <Text style={s.identityEmail}>{profile?.email || ''}</Text>
          </View>
          {streak > 0 && (
            <View style={s.streakChip}>
              <Text style={s.streakNum}>{streak}</Text>
              <Text style={s.streakLbl}>DAY{streak === 1 ? '' : ''} STREAK</Text>
            </View>
          )}
        </View>

        {/* Current goal — feeds the intelligence (body-comp pivot, coaching frame).
            Locked once set so it can't drift by accident; tap unlock to change. */}
        <View style={s.rule}>
          <Text style={s.ruleLabel}>CURRENT GOAL</Text>
          <View style={s.ruleLine} />
        </View>
        {hasGoal && goalLocked ? (
          <View style={s.goalLockedCard}>
            <View style={s.goalLockedRow}>
              <Text style={s.goalLockedVal}>{GOALS.find(g => g.k === currentPhase)?.label || 'SET'}</Text>
              <TouchableOpacity style={s.unlockBtn} onPress={() => setGoalLocked(false)} activeOpacity={0.7}>
                <MaterialCommunityIcons name="lock-outline" size={12} color={colors.muted} />
                <Text style={s.unlockText}>UNLOCK TO CHANGE</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.goalExplain}>{GOAL_INFO[currentPhase]}</Text>
          </View>
        ) : (
          <>
            <View style={s.goalGrid}>
              {GOALS.map(g => {
                const on = currentPhase === g.k;
                return (
                  <TouchableOpacity key={g.k} style={[s.goalChip, on && s.goalChipOn]} onPress={() => pickGoal(g.k)} activeOpacity={0.8}>
                    <Text style={[s.goalChipText, on && s.goalChipTextOn]}>{g.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={s.goalHint}>{hasGoal ? GOAL_INFO[currentPhase] : 'Pick the phase you’re training for — it drives your body-comp analysis.'}</Text>
          </>
        )}

        {/* Manual weigh-in — for lifters without a smart scale / Apple Health */}
        <TouchableOpacity style={s.weighInBtn} onPress={() => setShowWeighIn(true)} activeOpacity={0.8}>
          <View style={s.weighInIcon}><MaterialCommunityIcons name="scale-bathroom" size={18} color={colors.acc} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.weighInTitle}>LOG WEIGHT / BODY FAT %</Text>
            <Text style={s.weighInSub}>No scale or Apple Health? Track it by hand.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.dim} />
        </TouchableOpacity>

        {/* Finish setup — actionable checklist, auto-hides as each step is done */}
        {todoItems.length > 0 && (
          <>
            <View style={s.rule}>
              <Text style={s.ruleLabel}>FINISH SETUP</Text>
              <View style={s.ruleLine} />
            </View>
            <View style={s.todoCard}>
              {todoItems.map((t, i) => (
                <View key={t.key} style={[s.todoRow, i > 0 && s.todoBorder]}>
                  <View style={s.todoIcon}><MaterialCommunityIcons name={t.icon} size={18} color={colors.acc} /></View>
                  <TouchableOpacity style={{ flex: 1 }} onPress={t.onPress} activeOpacity={t.onPress ? 0.7 : 1} disabled={!t.onPress}>
                    <Text style={s.todoLabel}>{t.label}</Text>
                    <Text style={s.todoSub}>{t.sub}</Text>
                  </TouchableOpacity>
                  {t.onPress && <MaterialCommunityIcons name="chevron-right" size={18} color={colors.dim} />}
                  <TouchableOpacity onPress={() => setDismissed(d => ({ ...d, [t.key]: true }))} hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}>
                    <MaterialCommunityIcons name="close" size={15} color={colors.dim} style={{ marginLeft: 10 }} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Current program — actionable: edit it, or build one on the spot */}
        <View style={s.programRow}>
          <BlurView intensity={26} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={s.programInner}>
            <View style={{ flex: 1 }}>
              <Text style={s.programLbl}>CURRENT PROGRAM</Text>
              <Text style={s.programName}>{program ? program.title.toUpperCase() : 'NO ACTIVE PROGRAM'}</Text>
              {program
                ? <Text style={s.programSub}>{program.splitName} · {program.sessions} sessions / week</Text>
                : <Text style={s.programSub}>Build one and it lands on your calendar.</Text>}
            </View>
            {program ? (
              <TouchableOpacity
                style={s.programBtn}
                onPress={() => navigation.navigate('TemplateBuilder', { splitId: program.splitId, templateId: program.id })}
                activeOpacity={0.8}
              >
                <Text style={s.programBtnText}>EDIT</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[s.programBtn, s.programBtnAcc]}
                onPress={() => navigation.navigate('SplitPicker')}
                activeOpacity={0.8}
              >
                <Text style={[s.programBtnText, { color: colors.onAcc }]}>+ BUILD</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* System Spec */}
        <View style={s.rule}>
          <Text style={s.ruleLabel}>SYSTEM{'\n'}SPEC</Text>
          <View style={s.ruleLine} />
          <TouchableOpacity onPress={openMuscleEditor} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.editLink}>EDIT</Text>
          </TouchableOpacity>
        </View>

        <View style={s.specTable}>
          {specRows.map((row, i) => (
            <View key={i} style={[s.specRow, i === 0 && { borderTopWidth: 0 }]}>
              <Text style={s.specKey}>{row.k}</Text>
              <Text style={s.specVal}>{row.v}</Text>
            </View>
          ))}
        </View>

        {/* Pro card — hidden once they ARE pro */}
        {!isPro && (
        <View style={s.proCard}>
          <View style={s.proGlow} />
          <View style={s.proKickerRow}>
            <MaterialCommunityIcons name="crown" size={14} color={colors.acc} />
            <Text style={s.proKicker}>SWOLE/OS PRO</Text>
          </View>
          <Text style={s.proTitle}>UNLOCK THE FULL{'\n'}ENGINE.</Text>
          <Text style={s.proItem}>· Expert prebuilt programs</Text>
          <Text style={s.proItem}>· Advanced plateau analytics</Text>
          <Text style={s.proItem}>· Video demos for every lift</Text>
          <TouchableOpacity style={s.proBtn} activeOpacity={0.85}>
            <Text style={s.proBtnText}>GO PRO — $9/MO</Text>
            <Text style={s.proBtnArrow}>→</Text>
          </TouchableOpacity>
        </View>
        )}

        {/* Preview flows (preview mode — no data written). Hidden in production. */}
        {SHOW_PREVIEW_TOOLS && (
          <TouchableOpacity style={s.devBtn} onPress={triggerReplayOnboarding}>
            <Text style={s.devBtnText}>⟳ PREVIEW ONBOARDING</Text>
          </TouchableOpacity>
        )}
        {SHOW_PREVIEW_TOOLS && (
          <TouchableOpacity style={s.devBtn} onPress={triggerPreviewPaywall}>
            <Text style={s.devBtnText}>⟳ PREVIEW PAYWALL</Text>
          </TouchableOpacity>
        )}
        {SHOW_PREVIEW_TOOLS && (
          <TouchableOpacity style={s.devBtn} onPress={async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const res = await seedCoachData(user.id);
            if (res?.error) { Alert.alert('Seed failed', res.error); return; }
            Alert.alert('Coach data seeded', `Start an Empty Session and add these lifts to see the states:\n\n${(res.summary || []).join('\n')}`);
          }}>
            <Text style={s.devBtnText}>⟳ SEED COACH DATA</Text>
          </TouchableOpacity>
        )}
        {SHOW_PREVIEW_TOOLS && (
          <TouchableOpacity style={s.devBtn} onPress={async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) { await clearCoachSeed(user.id); Alert.alert('Cleared', 'Seeded coach sessions removed.'); }
          }}>
            <Text style={s.devBtnText}>⟳ CLEAR COACH SEED</Text>
          </TouchableOpacity>
        )}

        {/* Sign out */}
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
          <Text style={s.signOutText}>SIGN OUT</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Spec editor — weak/strong muscles + frequency. Swipes down to dismiss. */}
      <SwipeSheet visible={editOpen} onClose={() => setEditOpen(false)}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>EDIT YOUR SPEC</Text>

            <Text style={s.sheetLbl}>WEAK POINTS — UP TO 2 (these get priority)</Text>
            <View style={s.sheetChips}>
              {MUSCLES.map(m => {
                const on = draftWeak.includes(m);
                return (
                  <TouchableOpacity key={m} style={[s.mChip, on && s.mChipOn]} onPress={() => toggleDraft(draftWeak, setDraftWeak, draftStrong, setDraftStrong, m)} activeOpacity={0.8}>
                    <Text style={[s.mChipText, on && { color: colors.acc }]}>{m.toUpperCase()}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.sheetLbl}>STRENGTHS — UP TO 2</Text>
            <View style={s.sheetChips}>
              {MUSCLES.map(m => {
                const on = draftStrong.includes(m);
                return (
                  <TouchableOpacity key={m} style={[s.mChip, on && s.mChipGood]} onPress={() => toggleDraft(draftStrong, setDraftStrong, draftWeak, setDraftWeak, m)} activeOpacity={0.8}>
                    <Text style={[s.mChipText, on && { color: colors.statusGood }]}>{m.toUpperCase()}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.sheetLbl}>EXPERIENCE</Text>
            <View style={s.sheetChips}>
              {EXP_LEVELS.map(e => {
                const on = draftExp === e.k;
                return (
                  <TouchableOpacity key={e.k} style={[s.mChip, on && s.mChipOn]} onPress={() => setDraftExp(e.k)} activeOpacity={0.8}>
                    <Text style={[s.mChipText, on && { color: colors.acc }]}>{e.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.sheetLbl}>REP RANGE YOU LIKE</Text>
            <View style={s.sheetChips}>
              {REP_PREFS.map(r => {
                const on = draftReps === r.k;
                return (
                  <TouchableOpacity key={r.k} style={[s.mChip, on && s.mChipOn]} onPress={() => setDraftReps(r.k)} activeOpacity={0.8}>
                    <Text style={[s.mChipText, on && { color: colors.acc }]}>{r.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.sheetLbl}>TRAINING FREQUENCY</Text>
            <View style={s.sheetChips}>
              {FREQ_DAYS.map(d => {
                const on = draftDays === d;
                return (
                  <TouchableOpacity key={d} style={[s.mChip, on && s.mChipOn]} onPress={() => setDraftDays(d)} activeOpacity={0.8}>
                    <Text style={[s.mChipText, on && { color: colors.acc }]}>{d} DAYS</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={s.sheetSave} onPress={saveMuscles} activeOpacity={0.85}>
              <Text style={s.sheetSaveText}>SAVE</Text>
            </TouchableOpacity>
          </View>
      </SwipeSheet>

      {/* Manual weigh-in sheet */}
      <Modal visible={showWeighIn} transparent animationType="slide" onRequestClose={() => setShowWeighIn(false)}>
        <TouchableOpacity style={s.wiOverlay} activeOpacity={1} onPress={() => setShowWeighIn(false)}>
          <View style={s.wiSheet}>
            <View style={s.wiHandle} />
            <Text style={s.wiTitle}>LOG WEIGH-IN</Text>
            <Text style={s.wiLabel}>WEIGHT (LBS)</Text>
            <TextInput
              style={s.wiInput} value={wiWeight} onChangeText={setWiWeight}
              placeholder="e.g. 185" placeholderTextColor={colors.dim}
              keyboardType="decimal-pad" returnKeyType="done"
            />
            <Text style={[s.wiLabel, { marginTop: space.md }]}>BODY FAT %  ·  OPTIONAL</Text>
            <TextInput
              style={s.wiInput} value={wiBf} onChangeText={setWiBf}
              placeholder="e.g. 15" placeholderTextColor={colors.dim}
              keyboardType="decimal-pad" returnKeyType="done"
            />
            <TouchableOpacity style={s.wiSave} onPress={saveWeighIn} activeOpacity={0.85}>
              <Text style={s.wiSaveText}>SAVE WEIGH-IN</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.wiCancel} onPress={() => setShowWeighIn(false)}>
              <Text style={s.wiCancelText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: 60 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xl },
  title: { fontFamily: fonts.display, fontSize: 36, color: colors.text, textTransform: 'uppercase' },
  goProChip: { borderWidth: 1.5, borderColor: colors.acc, backgroundColor: colors.accSurf, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  goProChipText: { fontFamily: fonts.display, fontSize: 13, color: colors.acc, textTransform: 'uppercase', letterSpacing: 0.5 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xl },
  avatar: {
    width: 60, height: 60, backgroundColor: colors.acc,
    alignItems: 'center', justifyContent: 'center',
    transform: [{ skewX: '-8deg' }],
  },
  avatarText: { fontFamily: fonts.display, fontSize: 28, color: colors.onAcc, textTransform: 'uppercase' },
  identityName: { fontFamily: fonts.display, fontSize: 24, color: colors.text, textTransform: 'uppercase', lineHeight: 28 },
  identityEmail: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 3 },
  streakChip: { alignItems: 'center', borderWidth: 1.5, borderColor: colors.accDim, backgroundColor: colors.accSurf, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  streakNum: { fontFamily: fonts.display, fontSize: 22, color: colors.acc, lineHeight: 24 },
  streakLbl: { fontFamily: fonts.bodySemi, fontSize: 7.5, color: colors.muted, letterSpacing: 1 },

  rule: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  ruleLabel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.8 },
  ruleLine: { flex: 1, height: 1.5, backgroundColor: colors.line },
  editLink: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.acc, letterSpacing: 1.2 },

  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8 },
  goalChip: { borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 9 },
  goalChipOn: { borderColor: colors.acc, backgroundColor: 'rgba(255,255,255,0.04)' },
  goalChipText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, letterSpacing: 0.8 },
  goalChipTextOn: { color: colors.acc },
  goalHint: { fontFamily: fonts.body, fontSize: 11, color: colors.dim, marginBottom: space.xl },

  // Locked goal summary
  goalLockedCard: { borderWidth: 1.5, borderColor: colors.acc, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 11, padding: 14, marginBottom: space.xl },
  goalLockedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalLockedVal: { fontFamily: fonts.display, fontSize: 20, color: colors.acc, textTransform: 'uppercase', letterSpacing: 0.5 },
  unlockBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.line2, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5 },
  unlockText: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, letterSpacing: 1 },
  goalExplain: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, lineHeight: 18, marginTop: 8 },

  // Manual weigh-in
  weighInBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: space.xl },
  weighInIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  weighInTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.3 },
  weighInSub: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 1 },
  wiOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  wiSheet: { backgroundColor: colors.surf, borderTopWidth: 1.5, borderTopColor: colors.line2, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xl },
  wiHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line2, marginBottom: space.md },
  wiTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.text, textTransform: 'uppercase', marginBottom: space.md },
  wiLabel: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginBottom: 6 },
  wiInput: { borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.bodyMed, fontSize: 16, color: colors.text },
  wiSave: { backgroundColor: colors.acc, borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginTop: space.lg },
  wiSaveText: { fontFamily: fonts.display, fontSize: 16, color: colors.onAcc, textTransform: 'uppercase', letterSpacing: 0.5 },
  wiCancel: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  wiCancelText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },

  // Finish-setup checklist
  todoCard: { borderWidth: 1, borderColor: 'rgba(255,90,30,0.5)', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, marginBottom: space.xl },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  todoBorder: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  todoIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  todoLabel: { fontFamily: fonts.display, fontSize: 15, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.3 },
  todoSub: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 1 },

  chartCard: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: space.md, marginBottom: space.xl, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.03)' },
  chartTabs: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.md },
  chartTab: { borderWidth: 1.5, borderColor: colors.line2, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5 },
  chartTabOn: { borderColor: colors.acc, backgroundColor: colors.accSurf },
  chartTabText: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, letterSpacing: 0.8 },
  chartTabTextOn: { color: colors.acc },
  chartLatest: { fontFamily: fonts.display, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 84 },
  chartBarSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  chartBar: { backgroundColor: colors.line2, borderRadius: 3 },
  chartBarNow: { backgroundColor: colors.acc },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  chartAxisText: { fontFamily: fonts.bodySemi, fontSize: 8, color: colors.dim, letterSpacing: 0.8 },
  chartSubNote: { fontFamily: fonts.bodySemi, fontSize: 8, color: colors.dim, letterSpacing: 0.8, marginTop: -8, marginBottom: 8 },
  legendRow: { flexDirection: 'row', gap: 14, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontFamily: fonts.bodySemi, fontSize: 8.5, color: colors.muted, letterSpacing: 0.8 },
  legendNote: { fontFamily: fonts.bodySemi, fontSize: 7.5, color: colors.dim, letterSpacing: 0.6 },
  leanEmpty: { height: 84, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md, gap: 8 },
  leanConnectBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8,
  },
  leanConnectBtnText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.text, letterSpacing: 1 },
  leanEmptyText: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, textAlign: 'center', lineHeight: 16 },

  programRow: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 14, marginBottom: space.xl, overflow: 'hidden' },
  programInner: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, backgroundColor: 'rgba(255,255,255,0.03)' },
  programLbl: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginBottom: 4 },
  programName: { fontFamily: fonts.display, fontSize: 18, color: colors.text, textTransform: 'uppercase' },
  programSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
  programBtn: { borderWidth: 1.5, borderColor: colors.line2, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9 },
  programBtnAcc: { backgroundColor: colors.acc, borderColor: colors.acc },
  programBtnText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.muted, letterSpacing: 1 },

  specTable: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, overflow: 'hidden', marginBottom: space.xl },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: space.md, paddingVertical: 14, borderTopWidth: 1.5, borderTopColor: colors.line },
  specKey: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, flex: 1 },
  specVal: { fontFamily: fonts.display, fontSize: 14, color: colors.text, textTransform: 'uppercase', textAlign: 'right', flex: 1 },

  proCard: {
    borderWidth: 1.5, borderColor: colors.acc, backgroundColor: colors.surf2,
    borderRadius: 14, padding: space.md, marginBottom: space.xl, overflow: 'hidden',
  },
  proGlow: {
    position: 'absolute', right: -50, top: -50,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: colors.acc, opacity: 0.10,
  },
  proKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  proKicker: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.acc, textTransform: 'uppercase', letterSpacing: 1.8 },
  proTitle:  { fontFamily: fonts.display, fontSize: 28, color: colors.text, textTransform: 'uppercase', lineHeight: 34, paddingTop: 6, marginBottom: space.md },
  proItem:   { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginBottom: 4 },
  proBtn: {
    backgroundColor: colors.acc, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10, paddingVertical: 14, marginTop: space.md, borderRadius: 10,
  },
  proBtnText:  { fontFamily: fonts.display, fontSize: 16, color: colors.onAcc, textTransform: 'uppercase' },
  proBtnArrow: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.onAcc },

  devBtn: { alignItems: 'center', paddingVertical: space.md, borderWidth: 1.5, borderColor: colors.line2, borderStyle: 'dashed', borderRadius: 10, marginTop: space.lg },
  devBtnText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.acc2, textTransform: 'uppercase', letterSpacing: 1.2 },
  signOutBtn: { alignItems: 'center', paddingVertical: space.lg },
  signOutText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.dim, textTransform: 'uppercase', letterSpacing: 1.5 },

  // Spec editor sheet (shell/overlay provided by SwipeSheet)
  sheet: { backgroundColor: colors.surf, borderTopWidth: 1.5, borderTopColor: colors.line2, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: space.lg, paddingBottom: space.xl },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line2, marginBottom: space.md },
  sheetTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textTransform: 'uppercase', marginBottom: space.md },
  sheetLbl: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, letterSpacing: 1.3, marginBottom: 8 },
  sheetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: space.lg },
  mChip: { borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf2, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 7 },
  mChipOn: { borderColor: colors.acc, backgroundColor: colors.accSurf },
  mChipGood: { borderColor: colors.statusGood, backgroundColor: 'rgba(70,194,106,0.08)' },
  mChipText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, letterSpacing: 0.8 },
  sheetSave: { backgroundColor: colors.acc, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  sheetSaveText: { fontFamily: fonts.display, fontSize: 16, color: colors.onAcc, textTransform: 'uppercase' },
});
