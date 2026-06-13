// @ts-nocheck
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, SafeAreaView, Modal, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { requestHealthPermissions, isHealthAvailable } from '../lib/health';
import { formatSessionDate } from '../lib/intelligence';
import { colors, fonts, space } from '../theme/forge';
import { Wordmark } from '../components/Brand';
import CountUp from '../components/CountUp';
import GradientText from '../components/GradientText';
import Pulse from '../components/Pulse';
import WeekStrip from '../components/WeekStrip';
import HighlightReel from '../components/HighlightReel';
import DaySheet from '../components/DaySheet';
import { SPLIT_DEFINITIONS } from '../lib/splitDefinitions';
import { buildSchedule } from '../lib/schedule';
import { buildHighlights } from '../lib/highlights';
import { getIntelligence } from '../lib/trendPairs';
import ScoreChip from '../components/ScoreChip';

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
// The "start" CTA rotates through these on each visit — FORGE edge, no fluff.
const START_PHRASES = ['START WORKOUT', 'GET UNDER THE BAR', 'ENTER THE ARENA', "THE IRON'S WAITING", 'TIME TO TRAIN', "WORK TO DO — LET'S GO", 'GROWTH AWAITS'];
function todayWeekday() { return WEEKDAYS[new Date().getDay()]; }
function greetingSentence() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
// Strip the day-count suffix so "Upper/Lower 3" / "PPL 4-Day" → "UPPER/LOWER" / "PPL".
function cleanSplit(s) {
  return String(s || '').replace(/\s+\d+(\s*-?\s*day)?$/i, '').trim().toUpperCase();
}

function fmtVolume(v) {
  if (!v) return '0';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return v.toLocaleString();
}

function isWorkingSet(set, pattern) {
  if (set.is_warmup || !set.reps) return false;
  if (set.rpe == null) return true;
  const threshold = (pattern === 'squat' || pattern === 'hinge') ? 7 : 8;
  return set.rpe >= threshold;
}

function getWeekBounds() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const [name, setName]             = useState('');
  const [tier, setTier]             = useState('free');
  const [weekStats, setWeekStats]   = useState({ workouts: 0, hardSets: 0, volume: 0 });
  const [focusKey, setFocusKey]     = useState(0);
  const [startPhrase, setStartPhrase] = useState('START WORKOUT');
  const [highlights, setHighlights] = useState([]);
  const [score, setScore] = useState(null);
  const [plannedPerWeek, setPlannedPerWeek] = useState(0);
  const [nextSession, setNextSession] = useState(null);
  const [loggedDates, setLoggedDates] = useState({}); // 'YYYY-MM-DD' -> sessionId
  const [schedule, setSchedule] = useState({});       // dow(0=Mon) -> { id, name, built }
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [daySheet, setDaySheet] = useState(null);     // { dateKey, info } | null
  const [scheduleStart, setScheduleStart] = useState(null); // program start (no schedule dots before this)
  const [healthConnected, setHealthConnected] = useState(true); // assume yes until proven otherwise (don't flash the tip)
  const [showRpe, setShowRpe] = useState(false);      // RPE explainer modal (from a first-run tip)
  const [showHealth, setShowHealth] = useState(false); // Apple Health connect modal (from a first-run tip)
  const [showHowto, setShowHowto] = useState(false);   // "get the most out of SWOLE/OS" modal

  // Every calendar tap opens an adaptive day sheet (see DaySheet).
  function onDayPress(dateKey, info) { setDaySheet({ dateKey, info }); }
  function sheetView(sessionId) { setDaySheet(null); navigation.navigate('WorkoutLogger', { editSessionId: sessionId }); }
  function sheetStart(sched) { setDaySheet(null); navigation.navigate('WorkoutLogger', { templateSessionId: sched.id, templateId: activeTemplateId }); }
  function sheetLog(dateKey, isToday) { setDaySheet(null); navigation.navigate('WorkoutLogger', isToday ? undefined : { logDate: dateKey }); }

  // First-run tip taps → explain RPE, or kick off the Apple Health connect flow.
  function handleTip(action) {
    if (action === 'rpe') setShowRpe(true);
    else if (action === 'health') setShowHealth(true);
    else if (action === 'howto') setShowHowto(true);
  }
  async function connectAppleHealth() {
    setShowHealth(false);
    try { await requestHealthPermissions(); } catch (e) { /* declined — fine */ }
    setHealthConnected(true);
    loadHome();
  }

  const [loading, setLoading]       = useState(true);
  const loadedOnce = useRef(false); // spinner only on first load; refresh quietly after

  useFocusEffect(
    useCallback(() => { loadHome(); setFocusKey(k => k + 1); setStartPhrase(START_PHRASES[Math.floor(Math.random() * START_PHRASES.length)]); }, [])
  );

  async function loadHome() {
    if (!loadedOnce.current) setLoading(true);
    loadedOnce.current = true;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [profileRes, sessionsRes, templateRes] = await Promise.all([
      supabase.from('users').select('name, tier').eq('id', user.id).single(),
      supabase
        .from('workout_sessions')
        .select(`id, session_name, performed_at,
          session_exercises(
            exercise_id,
            exercises(name, primary_muscle, movement_pattern),
            set_logs(weight, reps, rpe, is_warmup)
          )`)
        .eq('user_id', user.id)
        .order('performed_at', { ascending: false })
        .limit(20),
      supabase
        .from('workout_templates')
        .select(`id, title, split_type, current_session_index, created_at,
          template_sessions(id, name, session_order, scheduled_dow, template_session_exercises(id, exercises(name, primary_muscle)))`)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single(),
    ]);

    if (profileRes.data) {
      setName(profileRes.data.name || '');
      setTier(profileRes.data.tier || 'free');
    }

    // Active program → next session
    let pPerWeek = 0; // program's sessions/week — denominator for the plan + highlights
    if (templateRes.data) {
      const t = templateRes.data;
      const sessions = [...(t.template_sessions || [])].sort((a, b) => a.session_order - b.session_order);
      const idx = t.current_session_index ?? 0;
      const next = sessions[idx % sessions.length];
      const splitDef = SPLIT_DEFINITIONS.find(sd => sd.id === t.split_type);
      pPerWeek = sessions.length;
      setPlannedPerWeek(pPerWeek);
      setActiveTemplateId(t.id);
      setScheduleStart(t.created_at || new Date().toISOString());
      const dowMap = buildSchedule(sessions, splitDef?.daysPerWeek); // explicit days + auto-defaults, capped to the split's days/week
      const sched = {};
      for (const dow in dowMap) {
        const sx = dowMap[dow];
        const exs = sx.template_session_exercises || [];
        const muscles = [...new Set(exs.map(e => e.exercises?.primary_muscle).filter(Boolean))];
        const exNames = exs.map(e => e.exercises?.name).filter(Boolean);
        sched[dow] = { id: sx.id, name: sx.name, built: exs.length > 0, muscles, exercises: exNames };
      }
      setSchedule(sched);
      if (next) {
        setNextSession({
          sessionName: next.name,
          templateTitle: t.title,
          splitShort: splitDef?.shortName ?? t.split_type,
          sessionId: next.id,
          templateId: t.id,
          built: (next.template_session_exercises?.length ?? 0) > 0,
          allSessions: sessions.map(sx => ({
            id: sx.id,
            name: sx.name,
            built: (sx.template_session_exercises?.length ?? 0) > 0,
            isNext: sx.id === next.id,
          })),
        });
      }
    } else {
      setNextSession(null);
      setSchedule({});
      setActiveTemplateId(null);
      setScheduleStart(null);
      setPlannedPerWeek(0);
    }

    // Logged-day map for the week-strip calendar (last ~12 weeks).
    const since = new Date(Date.now() - 84 * 86400000).toISOString();
    const { data: dateRows } = await supabase
      .from('workout_sessions')
      .select('id, performed_at')
      .eq('user_id', user.id)
      .gte('performed_at', since)
      .order('performed_at', { ascending: false });
    const dateMap = {};
    for (const row of dateRows || []) {
      const d = new Date(row.performed_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!dateMap[key]) dateMap[key] = row.id; // keep the most recent that day
    }
    setLoggedDates(dateMap);

    const sessions = sessionsRes.data || [];
    const weekStart = getWeekBounds();

    let wWorkouts = 0, wSets = 0, wVol = 0;

    for (const s of sessions) {
      if (s.performed_at >= weekStart) {
        wWorkouts++;
        for (const ex of s.session_exercises || []) {
          const pattern = ex.exercises?.movement_pattern;
          for (const set of ex.set_logs || []) {
            if (isWorkingSet(set, pattern)) {
              wSets++;
              wVol += (set.weight || 0) * set.reps;
            }
          }
        }
      }
    }

    const wStats = { workouts: wWorkouts, hardSets: wSets, volume: wVol };
    setWeekStats(wStats);

    // Highlights reel — backward-looking wins (PRs, streaks, on-track, volume) + first-run
    // onboarding tips for the first ~2 weeks (gated on account age from the auth user).
    const accountAgeDays = user.created_at ? (Date.now() - new Date(user.created_at).getTime()) / 86400000 : null;
    // "Connected" = no Apple Health on this device (nothing to sync) OR the user has been
    // through the connect flow. Read here so the tip never flashes in/out.
    let hConnected = true;
    try { hConnected = !isHealthAvailable() || (await AsyncStorage.getItem('swoleos_health_connected')) === 'true'; } catch (e) { /* default connected */ }
    setHealthConnected(hConnected);
    setHighlights(buildHighlights({ sessions, loggedDates: dateMap, weekStats: wStats, plannedPerWeek: pPerWeek, accountAgeDays, healthConnected: hConnected }));

    setLoading(false);

    // Training Score for the Home glance — same engine as the Intelligence screen,
    // so the number matches both places. Loaded after the fast path (Health read).
    try {
      const intel = await getIntelligence(user.id);
      setScore(intel?.score || null);
    } catch (e) { /* score is a bonus — Home stands without it */ }
  }

  // Day-based "today's workout": the session scheduled for today's weekday, if any.
  const todayDow = (new Date().getDay() + 6) % 7;
  const todaySession = schedule[todayDow] || null;
  // Did they already log a session today? If so the card flips to a "complete" state.
  const todayKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const todayLoggedId = loggedDates[todayKey] || null;

  function startToday() {
    if (todaySession?.built) navigation.navigate('WorkoutLogger', { templateSessionId: todaySession.id, templateId: activeTemplateId });
    else if (todaySession && !todaySession.built) Alert.alert('Not built yet', `"${todaySession.name}" has no exercises. Build it in the Train tab.`);
    else if (nextSession?.built) navigation.navigate('WorkoutLogger', { templateSessionId: nextSession.sessionId, templateId: nextSession.templateId });
    else navigation.navigate('WorkoutLogger', undefined);
  }
  function startSession(sess) {
    if (sess?.built) navigation.navigate('WorkoutLogger', { templateSessionId: sess.id, templateId: activeTemplateId });
    else if (sess) Alert.alert('Not built yet', `"${sess.name}" has no exercises. Build it in the Train tab.`);
    else navigation.navigate('WorkoutLogger', undefined);
  }

  // Command-card mode — the rest-day / on-track logic. On a program: do today's session;
  // if behind (a scheduled day earlier this week with no log), offer that catch-up; if up
  // to date on an off day, it's a rest day (still loggable). No program → always a start CTA.
  const hasProgram = !!nextSession;
  const monStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); })();
  const weekLoggedDows = new Set();
  for (const k of Object.keys(loggedDates)) {
    const p = k.split('-').map(Number); const dd = new Date(p[0], p[1] - 1, p[2]);
    if (dd.getTime() >= monStart) weekLoggedDows.add((dd.getDay() + 6) % 7);
  }
  const missedDows = hasProgram ? Object.keys(schedule).map(Number).filter(d => d < todayDow && !weekLoggedDows.has(d)) : [];
  const behindSession = missedDows.length ? schedule[Math.max(...missedDows)] : null;
  const cardMode = todayLoggedId ? 'complete'
    : todaySession ? 'today'
    : behindSession ? 'catchup'
    : hasProgram ? 'rest'
    : 'open';

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Top bar */}
        <View style={s.topbar}>
          <Wordmark size={18} />
          <View style={s.tierChip}>
            <Text style={s.tierChipText}>{tier.toUpperCase()}</Text>
          </View>
        </View>

        {/* Compact greeting — one quiet line, not a 1/5-screen block */}
        <Text style={s.greetLine}>
          {todayWeekday()} · {greetingSentence()}, <Text style={s.greetName}>{name.split(' ')[0] || 'Athlete'}</Text>
        </Text>

        {/* Training Score glance — taps into the full Intelligence screen */}
        {score && (
          <View style={s.scoreWrap}>
            <ScoreChip score={score} trigger={focusKey} onPress={() => navigation.navigate('Intelligence')} />
          </View>
        )}

        {/* Week strip — calendar first: "where am I in the week" before "let's go" */}
        <View style={s.wsWrap}>
          <WeekStrip loggedDates={loggedDates} schedule={schedule} scheduleStart={scheduleStart} onDayPress={onDayPress} />
        </View>

        {/* Command card — program + today + start. Whole block taps into the workout.
            Once today's session is logged it flips to a calm "complete · view" state. */}
        <TouchableOpacity
          style={s.cmd}
          onPress={() => {
            if (cardMode === 'complete') navigation.navigate('WorkoutLogger', { editSessionId: todayLoggedId });
            else if (cardMode === 'catchup') startSession(behindSession);
            else if (cardMode === 'rest') navigation.navigate('WorkoutLogger', undefined);
            else startToday();
          }}
          activeOpacity={0.92}
        >
          <View style={s.cmdTop}>
            {nextSession && (
              <View style={s.cmdProgRow}>
                <Text style={s.cmdProg} numberOfLines={1}>
                  CURRENT PROGRAM · <Text style={s.cmdProgName}>{nextSession.templateTitle.toUpperCase()}</Text>
                </Text>
                {nextSession.splitShort ? (
                  <View style={s.cmdSplitChip}><Text style={s.cmdSplitText}>{cleanSplit(nextSession.splitShort)}</Text></View>
                ) : null}
              </View>
            )}
            <Text style={s.cmdToday}>
              {cardMode === 'complete' ? "TODAY'S SESSION COMPLETE"
                : cardMode === 'today' ? `TODAY · ${todaySession.name.toUpperCase()}`
                : cardMode === 'catchup' ? `CATCH UP · ${behindSession.name.toUpperCase()}`
                : cardMode === 'rest' ? 'REST OR CARDIO DAY'
                : 'READY WHEN YOU ARE'}
            </Text>
          </View>

          {cardMode === 'complete' ? (
            <View style={s.cmdDone}>
              <MaterialCommunityIcons name="check-circle" size={18} color={colors.statusGood} />
              <Text style={s.cmdDoneText}>SESSION COMPLETE</Text>
              <View style={{ flex: 1 }} />
              <Text style={s.cmdDoneView}>VIEW →</Text>
            </View>
          ) : cardMode === 'rest' ? (
            <View style={s.cmdRest}>
              <MaterialCommunityIcons name="sleep" size={17} color={colors.muted} />
              <Text style={s.cmdRestText}>YOU'RE ON TRACK — RECOVER</Text>
              <View style={{ flex: 1 }} />
              <Text style={s.cmdRestAdd}>LOG ANYWAY →</Text>
            </View>
          ) : (
            <View style={s.cmdStart}>
              {/* Hazard stripe overlay */}
              <View style={s.ctaStripes} pointerEvents="none">
                {Array.from({ length: 10 }).map((_, i) => (
                  <View key={i} style={[s.stripe, { left: i * 28 - 20 }]} />
                ))}
              </View>
              <Text style={s.cmdStartText}>{startPhrase}</Text>
              <Text style={s.cmdStartArrow}>→</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Highlights — backward-looking wins, auto-advancing reel */}
        <View style={s.section}>
          <View style={s.rule}>
            <Text style={s.ruleLabel}>HIGHLIGHTS</Text>
            <View style={s.ruleLine} />
          </View>
          <HighlightReel highlights={highlights} onTip={handleTip} />
        </View>

        {/* This Week */}
        <View style={s.section}>
          <View style={s.rule}>
            <Text style={s.ruleLabel}>THIS WEEK</Text>
            <View style={s.ruleLine} />
          </View>
          <View style={s.statsRow}>
            <View style={s.stat}>
              <CountUp value={weekStats.workouts} trigger={focusKey} format={(n) => String(Math.round(n)).padStart(2, '0')} style={s.statVal} />
              <Text style={s.statLabel}>WORKOUTS</Text>
            </View>
            <View style={[s.stat, s.statBorder]}>
              <CountUp value={weekStats.hardSets} trigger={focusKey} style={s.statVal} />
              <Text style={s.statLabel}>WORKING SETS</Text>
            </View>
            <View style={[s.stat, s.statBorder]}>
              <CountUp value={weekStats.volume} trigger={focusKey} format={fmtVolume} style={s.statVal} />
              <Text style={s.statLabel}>VOLUME</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 8 }} />

      </ScrollView>

      <DaySheet day={daySheet} onClose={() => setDaySheet(null)} onView={sheetView} onStart={sheetStart} onLog={sheetLog} />

      {/* RPE explainer — opened from the first-run "Master Your RPE" tip */}
      <Modal visible={showRpe} transparent animationType="fade" onRequestClose={() => setShowRpe(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>WHAT IS RPE?</Text>
            <Text style={s.modalBody}>
              RPE (rate of perceived exertion) is just a way to measure <Text style={s.modalAccent}>intensity</Text> — how close you were to failure on a set.
            </Text>
            {[
              { n: '10', t: 'Max effort — couldn\'t have done another rep or added weight.' },
              { n: '9', t: 'Could probably have done 1 more rep.' },
              { n: '8', t: 'Could have done 2, maybe 3 more reps.' },
              { n: '7', t: '3–4 reps left in the tank.' },
              { n: '6', t: 'Warm-up effort.' },
            ].map(r => (
              <View key={r.n} style={s.rpeRow}>
                <View style={s.rpeNum}><Text style={s.rpeNumText}>{r.n}</Text></View>
                <Text style={s.rpeRowText}>{r.t}</Text>
              </View>
            ))}
            <TouchableOpacity style={s.modalBtn} onPress={() => setShowRpe(false)}>
              <Text style={s.modalBtnText}>GOT IT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Apple Health connect — opened from the first-run "Sync Apple Health" tip */}
      <Modal visible={showHealth} transparent animationType="fade" onRequestClose={() => setShowHealth(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <MaterialCommunityIcons name="heart-pulse" size={30} color={colors.acc} style={{ alignSelf: 'center', marginBottom: 6 }} />
            <Text style={s.modalTitle}>SYNC APPLE HEALTH</Text>
            <Text style={s.modalBody}>
              Connect Apple Health and SWOLE OS reads your <Text style={s.modalAccent}>weight and body composition</Text> to track physique, recovery and progress alongside your lifts.
            </Text>
            <Text style={[s.modalBody, { marginTop: 10 }]}>
              Pair a <Text style={s.modalAccent}>Hume</Text> or other smart scale that writes to Apple Health for accurate weight & body-fat data — no manual entry.
            </Text>
            <TouchableOpacity style={s.modalBtn} onPress={connectAppleHealth}>
              <Text style={s.modalBtnText}>CONNECT APPLE HEALTH</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalCancel} onPress={() => setShowHealth(false)}>
              <Text style={s.modalCancelText}>MAYBE LATER</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* "Get the most out of SWOLE/OS" — from the first-run how-to tip */}
      <Modal visible={showHowto} transparent animationType="fade" onRequestClose={() => setShowHowto(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>GET THE MOST OUT OF{'\n'}SWOLE/OS</Text>
            {[
              { i: 'calendar-check', t: 'Log consistently', d: 'The more you log, the sharper your coaching gets.' },
              { i: 'heart-pulse', t: 'Sync your devices', d: 'Connect a scale / watch to Apple Health if you have them.' },
              { i: 'gauge', t: 'Log RPE honestly', d: 'It drives every progression call — accuracy pays you back.' },
              { i: 'clipboard-text', t: 'Use a template or program', d: "No plan at the gym? Pick one in the Train tab." },
              { i: 'target', t: 'Set your goal', d: 'Tell us your phase in Profile so intel aims the right way.' },
              { i: 'comment-question', t: 'Answer the 3 post-session questions', d: 'Five seconds that make recovery reads real.' },
            ].map((h, i) => (
              <View key={i} style={s.howRow}>
                <MaterialCommunityIcons name={h.i} size={18} color={colors.acc} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.howT}>{h.t}</Text>
                  <Text style={s.howD}>{h.d}</Text>
                </View>
              </View>
            ))}
            <TouchableOpacity style={s.modalBtn} onPress={() => setShowHowto(false)}>
              <Text style={s.modalBtnText}>LET'S GO</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: 24 },

  topbar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md,
  },
  tierChip: {
    borderWidth: 1.5, borderColor: colors.line2,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  tierChipText: {
    fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 1.5,
  },

  section: { paddingHorizontal: space.lg, marginBottom: space.xl },

  // Compact greeting
  greetLine: {
    fontFamily: fonts.body, fontSize: 12.5, color: colors.muted,
    paddingHorizontal: space.lg, marginTop: 2, marginBottom: space.md,
  },
  greetName: { fontFamily: fonts.bodySemi, color: colors.text },

  // Training Score glance
  scoreWrap: { paddingHorizontal: space.lg, marginBottom: space.md },

  // Week strip wrapper — aligns calendar with the command card
  wsWrap: { paddingHorizontal: space.lg },

  // Command card — consolidated program + today + start
  cmd: {
    marginHorizontal: space.lg, marginBottom: space.xl,
    borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf,
    overflow: 'hidden',
  },
  cmdTop: { paddingHorizontal: space.md, paddingTop: 13, paddingBottom: 12 },
  cmdProgRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cmdProg: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.2 },
  cmdProgName: { color: colors.acc },
  cmdSplitChip: { borderWidth: 1, borderColor: colors.line2, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  cmdSplitText: { fontFamily: fonts.bodySemi, fontSize: 8, color: colors.muted, letterSpacing: 1 },
  cmdToday: { fontFamily: fonts.display, fontSize: 25, color: colors.text, textTransform: 'uppercase', marginTop: 6, lineHeight: 28 },
  cmdStart: {
    backgroundColor: colors.acc, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.md, minHeight: 58, overflow: 'hidden',
  },
  cmdStartText: { fontFamily: fonts.display, fontSize: 19, color: colors.onAcc, textTransform: 'uppercase', letterSpacing: 0.5 },
  cmdStartArrow: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.onAcc },
  // Completed-today state — calm, not a "go" CTA: surface bar, green check, quiet View.
  cmdDone: {
    backgroundColor: colors.surf2, flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: space.md, minHeight: 52, borderTopWidth: 1.5, borderTopColor: colors.line,
  },
  cmdDoneText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.statusGood, textTransform: 'uppercase', letterSpacing: 1 },
  cmdDoneView: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  // Rest day, on track — calm, not a "go" CTA, but still loggable.
  cmdRest: { backgroundColor: colors.surf2, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: space.md, minHeight: 52, borderTopWidth: 1.5, borderTopColor: colors.line },
  cmdRestText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  cmdRestAdd: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.dim, textTransform: 'uppercase', letterSpacing: 1 },

  // First-run tip modals (RPE explainer + Apple Health connect)
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', paddingHorizontal: space.lg },
  modalCard: { backgroundColor: colors.surf, borderWidth: 1.5, borderColor: colors.line2, padding: space.lg },
  modalTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.text, textTransform: 'uppercase', textAlign: 'center', lineHeight: 30, paddingTop: 3, marginBottom: 10 },
  modalBody: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, lineHeight: 21 },
  modalAccent: { fontFamily: fonts.bodySemi, color: colors.acc },
  rpeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  rpeNum: { width: 34, height: 34, borderWidth: 1.5, borderColor: colors.acc, alignItems: 'center', justifyContent: 'center' },
  rpeNumText: { fontFamily: fonts.display, fontSize: 16, color: colors.acc, paddingTop: 2 },
  rpeRowText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text, lineHeight: 18 },
  modalBtn: { backgroundColor: colors.acc, paddingVertical: 15, alignItems: 'center', marginTop: space.lg },
  modalBtnText: { fontFamily: fonts.display, fontSize: 15, color: colors.onAcc, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalCancel: { paddingVertical: 13, alignItems: 'center' },
  modalCancelText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: 13 },
  howT: { fontFamily: fonts.bodySemi, fontSize: 13.5, color: colors.text },
  howD: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, lineHeight: 16, marginTop: 1 },

  // Hazard stripe overlay (reused by the command-card START bar)
  ctaStripes: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row', overflow: 'hidden' },
  stripe: {
    position: 'absolute', top: -20, height: 200, width: 10,
    backgroundColor: 'rgba(0,0,0,0.10)',
    transform: [{ rotate: '20deg' }],
  },

  // Rule header
  rule: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md, gap: space.sm },
  ruleLabel: {
    fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 1.8,
  },
  ruleLine: { flex: 1, height: 1.5, backgroundColor: colors.line },
  ruleMeta: {
    fontFamily: fonts.bodyBold, fontSize: 10, color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 1,
  },

  // Stats
  statsRow: {
    flexDirection: 'row', borderWidth: 1.5, borderColor: colors.line,
  },
  stat: { flex: 1, padding: space.md },
  statBorder: { borderLeftWidth: 1.5, borderLeftColor: colors.line },
  statVal: {
    fontFamily: fonts.display, fontSize: 28, color: colors.text,
    textTransform: 'uppercase',
  },
  statLabel: {
    fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4,
  },

  // Intelligence
  intelCard: {
    borderWidth: 1.5, borderColor: colors.accDim, backgroundColor: colors.accSurf,
    flexDirection: 'row', overflow: 'hidden',
  },
  intelBar: { width: 3, backgroundColor: colors.acc },
  intelContent: { flex: 1, padding: space.md },
  intelHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  intelDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.acc },
  intelKicker: {
    fontFamily: fonts.bodySemi, fontSize: 10, color: colors.acc2,
    textTransform: 'uppercase', letterSpacing: 1.8,
  },
  intelHeadline: {
    fontFamily: fonts.display, fontSize: 18, color: colors.text,
    textTransform: 'uppercase', marginBottom: 6,
  },
  intelBody: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, lineHeight: 19 },
  intelArrow: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.acc, paddingRight: space.md, alignSelf: 'center' },
});
