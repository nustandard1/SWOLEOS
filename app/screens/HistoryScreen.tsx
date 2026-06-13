// @ts-nocheck
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, Modal, ScrollView, TextInput,
} from 'react-native';
import Svg, { Polyline, Line, Circle, Text as SvgText } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { getMergedBody } from '../lib/trendPairs';
import { colors, fonts, space } from '../theme/forge';

function relativeTime(dateStr) {
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  if (diff === 0) return `Today · ${date}`;
  if (diff === 1) return `Yesterday · ${date}`;
  // weekday helps place it at a glance, e.g. "Mon, Jun 12"
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

function shortDate(t) {
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

function fmtVol(lbs) {
  if (!lbs) return '0 lbs';
  if (lbs >= 1000) return `${(lbs / 1000).toFixed(1)}K lbs`;
  return `${lbs.toLocaleString()} lbs`;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function isWorkingSet(set, pattern) {
  if (set.is_warmup || !set.reps) return false;
  if (set.rpe == null) return true;
  return set.rpe >= ((pattern === 'squat' || pattern === 'hinge') ? 7 : 8);
}

const e1rm = (w, r) => w * (1 + r / 30);

// "EST 1RM" only means something on the big barbell lifts — a 1RM on lateral
// raises is noise. Squat/hinge patterns + barbell bench/press/row qualify.
function isBigBarbell(name, pattern) {
  if (pattern === 'squat' || pattern === 'hinge') return true;
  const n = (name || '').toLowerCase();
  return n.includes('barbell') && /(bench|press|row)/.test(n);
}

const MUSCLE_ORDER = ['chest', 'back', 'delts', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs', 'tactical', 'athlete', 'cardio'];
const FRESH_MS = 30 * 86400000; // a record set in the last 30 days reads as NEW

// The big strength lifts — pinned as the first Records category + summed into a
// STRENGTH SCORE (est-1RM total). Trap-bar deadlift counts at 0.9 (mechanically easier).
// Bench/deadlift/squat use a plain best-est-1RM match; the pull-up slot is special
// (adds bodyweight, falls back to lat-pulldown 3RM) — handled in loadRecords.
const STRENGTH_SLOTS = [
  { key: 'bench', label: 'Bench Press',
    match: (n) => /bench press/.test(n) && !/incline|decline|close|dumbbell|\bdb\b|floor|spoto/.test(n) },
  { key: 'deadlift', label: 'Deadlift',
    match: (n) => /deadlift/.test(n) && !/romanian|stiff|rdl|deficit|snatch|single|dumbbell|\bdb\b/.test(n),
    trap: (n) => /trap[- ]?bar|hex[- ]?bar/.test(n) },
  { key: 'squat', label: 'Squat',
    match: (n) => /back squat|zercher/.test(n) || (/squat/.test(n) && !/front|goblet|split|bulgarian|hack|box|pistol|sissy|belt|smith|dumbbell|\bdb\b/.test(n)) },
];
const isWeightedPullup = (n) => /weighted (pull|chin)|(pull|chin)-?up.*weighted/.test(n);
const isLatPulldown = (n) => /pulldown/.test(n);

export default function HistoryScreen() {
  const navigation = useNavigation();
  const [segment, setSegment]             = useState('records'); // records lands first — it's the interesting one
  const [sessions, setSessions]           = useState([]);
  const [records, setRecords]             = useState([]);        // [{muscle, rows:[...]}]
  const [recStats, setRecStats]           = useState({ prs: 0, monthPrs: 0, heaviest: 0 });
  const [strength, setStrength]           = useState(null);      // { slots, score, logged }
  const [showStrInfo, setShowStrInfo]     = useState(false);
  const [search, setSearch]               = useState('');
  const [loading, setLoading]             = useState(true);
  const [selectedSession, setSelected]    = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exDetail, setExDetail]           = useState(null);      // tapped record → the lift's full story
  const [userId, setUserId]               = useState(null);
  const loadedOnce = useRef(false); // spinner only on first load; refresh quietly after

  useFocusEffect(useCallback(() => { loadAll(); }, []));

  async function loadAll() {
    if (!loadedOnce.current) setLoading(true);
    loadedOnce.current = true;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);
    await Promise.all([loadSessions(user.id), loadRecords(user.id)]);
    setLoading(false);
  }

  async function loadSessions(uid) {
    const { data } = await supabase
      .from('workout_sessions')
      .select(`id, session_name, performed_at,
        session_exercises(
          id, exercise_id,
          exercises(primary_muscle, movement_pattern),
          set_logs(weight, reps, rpe, is_warmup)
        )`)
      .eq('user_id', uid)
      .order('performed_at', { ascending: false })
      .limit(60);

    const mapped = (data || []).map(s => {
      const exList = s.session_exercises || [];
      let vol = 0, hardSets = 0;
      const muscleSets = {};
      for (const ex of exList) {
        const pattern = ex.exercises?.movement_pattern;
        const muscle  = ex.exercises?.primary_muscle;
        for (const set of ex.set_logs || []) {
          if (isWorkingSet(set, pattern)) {
            vol += (set.weight || 0) * set.reps;
            hardSets++;
            if (muscle) muscleSets[muscle] = (muscleSets[muscle] || 0) + 1;
          }
        }
      }
      const muscleBreakdown = Object.entries(muscleSets).sort((a, b) => b[1] - a[1]);
      return { id: s.id, session_name: s.session_name, performed_at: s.performed_at, vol, hardSets, exCount: exList.length, muscleBreakdown };
    });

    setSessions(mapped);
  }

  // The PR wall: every working set ever, rolled into per-lift all-time bests +
  // record-break events (a "PR" = strictly beating the lift's prior best e1RM;
  // the first-ever set of a lift is a baseline, not a PR).
  async function loadRecords(uid) {
    const { data } = await supabase
      .from('set_logs')
      .select(`weight, reps, rpe, is_warmup,
        session_exercises!inner(
          exercise_id,
          exercises(name, primary_muscle, movement_pattern),
          workout_sessions!inner(id, performed_at, user_id, session_name)
        )`)
      .eq('session_exercises.workout_sessions.user_id', uid)
      .eq('is_warmup', false)
      .limit(8000);

    const byEx = {};
    for (const row of data || []) {
      const se = row.session_exercises;
      const ws = se?.workout_sessions;
      const name = se?.exercises?.name;
      if (!name || !ws || !row.weight || !row.reps) continue;
      if (!isWorkingSet(row, se.exercises?.movement_pattern)) continue;
      const key = se.exercise_id;
      if (!byEx[key]) byEx[key] = { exId: key, name, muscle: se.exercises?.primary_muscle || 'other', pattern: se.exercises?.movement_pattern, sets: [] };
      byEx[key].sets.push({ w: row.weight, r: row.reps, t: new Date(ws.performed_at).getTime(), sessionId: ws.id, sessionName: ws.session_name });
    }

    let prs = 0, monthPrs = 0, heaviest = 0;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const rows = [];
    for (const key in byEx) {
      const ex = byEx[key];
      ex.sets.sort((a, b) => a.t - b.t);

      let best = null;        // running all-time best (by e1RM)
      const events = [];      // record-break moments
      const byReps = {};      // rep count -> best weight at that count
      const bySession = {};   // sessionId -> { t, name, top, sets }

      for (const st of ex.sets) {
        const e = e1rm(st.w, st.r);
        if (st.w > heaviest) heaviest = st.w;
        if (best && e > best.e * 1.001) events.push({ t: st.t, w: st.w, r: st.r, e });
        if (!best || e > best.e) best = { w: st.w, r: st.r, t: st.t, e };
        if (!byReps[st.r] || st.w > byReps[st.r].w) byReps[st.r] = { w: st.w, t: st.t };
        if (!bySession[st.sessionId]) bySession[st.sessionId] = { t: st.t, name: st.sessionName, top: { w: st.w, r: st.r, e }, sets: 0 };
        const bs = bySession[st.sessionId];
        bs.sets++;
        if (e > bs.top.e) bs.top = { w: st.w, r: st.r, e };
      }
      if (!best) continue;

      prs += events.length;
      monthPrs += events.filter(ev => ev.t >= monthStart).length;

      const sessionsList = Object.values(bySession).sort((a, b) => b.t - a.t);
      const eventTimes = new Set(events.map(ev => ev.t));
      rows.push({
        ...ex,
        best,
        big: isBigBarbell(ex.name, ex.pattern),
        fresh: Date.now() - best.t <= FRESH_MS,
        events, byReps,
        sessions: sessionsList.map(sx => ({ ...sx, isPr: eventTimes.has(sx.t) })),
        trend: sessionsList.slice().reverse().map(sx => sx.top.e), // oldest → newest per-session best e1RM
      });
    }

    // Group by muscle in the canonical order; alphabetical within a group.
    const groups = [];
    for (const m of [...MUSCLE_ORDER, ...new Set(rows.map(r => r.muscle).filter(m => !MUSCLE_ORDER.includes(m)))]) {
      const inGroup = rows.filter(r => r.muscle === m).sort((a, b) => a.name.localeCompare(b.name));
      if (inGroup.length) groups.push({ muscle: m, rows: inGroup });
    }
    setRecords(groups);
    setRecStats({ prs, monthPrs, heaviest });

    // STRENGTH category + score — best est-1RM per big lift (trap-bar DL × 0.9).
    // Latest bodyweight (Apple Health) so weighted pull-ups count the lifter's weight.
    let bodyweight = 0;
    try {
      const { weight } = await getMergedBody(uid, Date.now() - 56 * 86400000);
      if (weight?.length) bodyweight = [...weight].sort((a, b) => b.date - a.date)[0].value;
    } catch (e) { /* no body data — pull-up falls back to added weight only */ }

    const slots = STRENGTH_SLOTS.map(slot => {
      let best = null;
      for (const r of rows) {
        const n = r.name.toLowerCase();
        if (!slot.match(n)) continue;
        const isTrap = slot.trap ? slot.trap(n) : false;
        const adjE = r.best.e * (isTrap ? 0.9 : 1);
        if (!best || adjE > best.e) best = { rec: r, e: adjE, note: isTrap ? 'TRAP-BAR ×0.9' : slot.label, eLabel: 'EST 1RM' };
      }
      return { key: slot.key, label: slot.label, best };
    });

    // Pull-up slot: weighted pull-up (incl. bodyweight) preferred; else lat-pulldown
    // 3RM as a handicapped stand-in (pulldown is easier, so you get a 3RM not a 1RM).
    let puBest = null;
    for (const r of rows) {
      if (!isWeightedPullup(r.name.toLowerCase())) continue;
      const e = (bodyweight + r.best.w) * (1 + r.best.r / 30);
      if (!puBest || e > puBest.e) puBest = { rec: r, e, note: bodyweight ? '+ BODYWEIGHT' : 'ADDED WEIGHT ONLY', eLabel: 'EST 1RM' };
    }
    if (!puBest) {
      for (const r of rows) {
        if (!isLatPulldown(r.name.toLowerCase())) continue;
        const e3 = r.best.e / 1.1; // 1RM → 3RM
        if (!puBest || e3 > puBest.e) puBest = { rec: r, e: e3, note: 'LAT PULLDOWN · 3RM USED', eLabel: 'EST 3RM' };
      }
    }
    slots.push({ key: 'pullup', label: 'Weighted Pull-Up', best: puBest });

    const logged = slots.filter(s => s.best).length;
    const score = Math.round(slots.reduce((sum, s) => sum + (s.best ? s.best.e : 0), 0));
    setStrength({ slots, score, logged, total: slots.length });
  }

  async function openDetail(session) {
    setDetailLoading(true);
    setSelected({ ...session, exercises: [], prCount: 0 });

    const { data } = await supabase
      .from('session_exercises')
      .select(`id, exercise_id, exercise_order,
        exercises(name, primary_muscle, movement_pattern),
        set_logs(set_number, weight, reps, rpe, is_warmup)`)
      .eq('workout_session_id', session.id)
      .order('exercise_order');

    if (!data) { setDetailLoading(false); return; }

    const exercises = data.map(ex => ({
      ...ex,
      set_logs: [...(ex.set_logs || [])].sort((a, b) => a.set_number - b.set_number),
    }));

    // PR detection
    const exerciseIds = exercises.map(e => e.exercise_id);
    let prMap = {};
    if (exerciseIds.length > 0 && userId) {
      const { data: hist } = await supabase
        .from('set_logs')
        .select(`weight, reps, rpe, is_warmup,
          session_exercises!inner(exercise_id,
            workout_sessions!inner(performed_at, user_id))`)
        .in('session_exercises.exercise_id', exerciseIds)
        .eq('session_exercises.workout_sessions.user_id', userId)
        .lt('session_exercises.workout_sessions.performed_at', session.performed_at)
        .eq('is_warmup', false);

      const patternByEx = {};
      for (const ex of exercises) patternByEx[ex.exercise_id] = ex.exercises?.movement_pattern || '';

      for (const row of hist || []) {
        const exId = row.session_exercises?.exercise_id;
        if (!exId || !row.weight || !row.reps) continue;
        if (!isWorkingSet(row, patternByEx[exId])) continue;
        if (!prMap[exId]) prMap[exId] = { byReps: {}, byWeight: {} };
        prMap[exId].byReps[row.reps]   = Math.max(prMap[exId].byReps[row.reps]   || 0, row.weight);
        prMap[exId].byWeight[row.weight] = Math.max(prMap[exId].byWeight[row.weight] || 0, row.reps);
      }
    }

    let prCount = 0;
    const tagged = exercises.map(ex => {
      const bests = prMap[ex.exercise_id];
      const pattern = ex.exercises?.movement_pattern;
      const seen = new Set();
      const taggedSets = ex.set_logs.map(set => {
        if (!isWorkingSet(set, pattern) || !set.weight || !set.reps) return { ...set, isPR: false };
        const key = `${set.weight}-${set.reps}`;
        if (seen.has(key)) return { ...set, isPR: false };
        const wPR = set.weight > (bests?.byReps[set.reps]   || 0);
        const rPR = set.reps   > (bests?.byWeight[set.weight] || 0);
        const isPR = wPR || rPR;
        if (isPR) { seen.add(key); prCount++; }
        return { ...set, isPR };
      });
      return { ...ex, set_logs: taggedSets };
    });

    setSelected({ ...session, exercises: tagged, prCount });
    setDetailLoading(false);
  }

  // ── SESSIONS list (with month headers) ──
  const listData = (() => {
    const out = [];
    let lastMonth = null;
    for (const sx of sessions) {
      const d = new Date(sx.performed_at);
      const m = `${d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()} ${d.getFullYear()}`;
      if (m !== lastMonth) { out.push({ type: 'header', id: `h-${m}`, label: m }); lastMonth = m; }
      out.push({ type: 'session', ...sx });
    }
    return out;
  })();

  function renderListItem({ item }) {
    if (item.type === 'header') {
      return (
        <View style={s.monthRule}>
          <Text style={s.monthLabel}>{item.label}</Text>
          <View style={s.monthLine} />
        </View>
      );
    }
    return (
      <TouchableOpacity style={s.card} onPress={() => openDetail(item)} activeOpacity={0.75}>
        <View style={s.cardTop}>
          <Text style={s.cardName} numberOfLines={1}>{item.session_name.toUpperCase()}</Text>
          <Text style={s.cardWhen}>{relativeTime(item.performed_at)}</Text>
        </View>
        <Text style={s.cardMeta}>
          {fmtVol(item.vol)}{'  ·  '}{item.hardSets} working sets{'  ·  '}{item.exCount} exercises
        </Text>
        {item.muscleBreakdown.length > 0 && (
          <View style={s.cardMuscles}>
            {item.muscleBreakdown.map(([m, n]) => (
              <View key={m} style={s.cardMuscleTag}>
                <Text style={s.cardMuscleName}>{capitalize(m)}</Text>
                <Text style={s.cardMuscleCount}> {n}</Text>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // ── RECORDS wall ──
  function renderRecords() {
    if (records.length === 0) {
      return (
        <View style={s.empty}>
          <Text style={s.emptyText}>YOUR RECORDS LIVE HERE</Text>
          <Text style={s.emptySub}>Log working sets and every lift's all-time best lands on this wall.</Text>
        </View>
      );
    }
    const q = search.trim().toLowerCase();
    const searching = q.length > 0;
    const shownGroups = searching
      ? records.map(g => ({ ...g, rows: g.rows.filter(r => r.name.toLowerCase().includes(q)) })).filter(g => g.rows.length)
      : records;

    return (
      <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* search */}
        <View style={s.searchRow}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.dim} />
          <TextInput
            style={s.searchInput}
            placeholder="Search a lift…"
            placeholderTextColor={colors.dim}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>

        {searching && shownGroups.length === 0 && (
          <Text style={s.searchEmpty}>No lifts match “{search.trim()}”.</Text>
        )}

        {/* trophy-room stat strip — hidden while searching */}
        {!searching && (<>
        <View style={s.statsRow}>
          <View style={s.statCellW}>
            <Text style={s.statValW}>{recStats.prs}</Text>
            <Text style={s.statLblW}>LIFETIME PRS</Text>
          </View>
          <View style={[s.statCellW, s.statCellWB]}>
            <Text style={[s.statValW, { color: colors.acc }]}>{recStats.monthPrs}</Text>
            <Text style={s.statLblW}>THIS MONTH</Text>
          </View>
          <View style={[s.statCellW, s.statCellWB]}>
            <Text style={s.statValW}>{recStats.heaviest}</Text>
            <Text style={s.statLblW}>HEAVIEST LIFT</Text>
          </View>
        </View>

        {/* STRENGTH category — the big lifts, pinned first, with a STRENGTH SCORE */}
        {strength && (
          <View style={s.strBlock}>
            <View style={s.monthRule}>
              <Text style={[s.monthLabel, { color: colors.acc }]}>STRENGTH</Text>
              <View style={s.monthLine} />
              <TouchableOpacity onPress={() => setShowStrInfo(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialCommunityIcons name="help-circle-outline" size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <View style={s.strScore}>
              <View>
                <Text style={s.strScoreNum}>{strength.score.toLocaleString()}</Text>
                <Text style={s.strScoreLbl}>STRENGTH SCORE · EST 1RM TOTAL</Text>
              </View>
              <View style={s.strScoreCount}>
                <Text style={s.strScoreCountNum}>{strength.logged}/{strength.total}</Text>
                <Text style={s.strScoreCountLbl}>LIFTS</Text>
              </View>
            </View>
            {strength.slots.map(slot => slot.best ? (
              <TouchableOpacity key={slot.key} style={s.recRow} onPress={() => setExDetail(slot.best.rec)} activeOpacity={0.75}>
                <View style={[s.recTrophy, slot.best.rec.fresh && s.recTrophyFresh]}>
                  <MaterialCommunityIcons name="trophy" size={17} color={slot.best.rec.fresh ? colors.statusGood : colors.acc} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.recName} numberOfLines={1}>{slot.best.rec.name.toUpperCase()}</Text>
                  <Text style={s.recWhen}>{slot.best.note}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.recBest}>{slot.best.rec.best.w} × {slot.best.rec.best.r}</Text>
                  <Text style={s.recE1rm}>{slot.best.eLabel} {Math.round(slot.best.e)} LB</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.dim} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            ) : (
              <View key={slot.key} style={[s.recRow, s.strMissing]}>
                <View style={[s.recTrophy, s.strTrophyEmpty]}>
                  <MaterialCommunityIcons name="trophy-outline" size={17} color={colors.dim} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.recName, { color: colors.muted }]} numberOfLines={1}>{slot.label.toUpperCase()}</Text>
                  <Text style={s.recWhen}>Log it to complete your score</Text>
                </View>
                <Text style={s.strAddVal}>—</Text>
              </View>
            ))}
          </View>
        )}
        </>)}

        {shownGroups.map(group => (
          <View key={group.muscle}>
            <View style={s.monthRule}>
              <Text style={s.monthLabel}>{group.muscle.toUpperCase()}</Text>
              <View style={s.monthLine} />
            </View>
            {group.rows.map(rec => (
              <TouchableOpacity key={rec.exId} style={s.recRow} onPress={() => setExDetail(rec)} activeOpacity={0.75}>
                <View style={[s.recTrophy, rec.fresh && s.recTrophyFresh]}>
                  <MaterialCommunityIcons name="trophy" size={17} color={rec.fresh ? colors.statusGood : colors.acc} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={s.recName} numberOfLines={1}>{rec.name.toUpperCase()}</Text>
                    {rec.fresh && <View style={s.newTag}><Text style={s.newTagText}>NEW</Text></View>}
                  </View>
                  <Text style={s.recWhen}>{shortDate(rec.best.t)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.recBest}>{rec.best.w} × {rec.best.r}</Text>
                  {rec.big && <Text style={s.recE1rm}>EST 1RM {Math.round(rec.best.e)} LB</Text>}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.dim} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>
    );
  }

  // ── per-lift story: strength trend + rep maxes + every appearance ──
  function renderExDetail() {
    const rec = exDetail;
    if (!rec) return null;
    const trend = rec.trend || [];
    const repRows = Object.entries(rec.byReps)
      .map(([r, v]) => ({ r: Number(r), ...v }))
      .sort((a, b) => a.r - b.r)
      .slice(0, 8);

    // single-line strength chart (per-session best, real lb scale)
    let chart = null;
    if (trend.length >= 2) {
      const W = 300, H = 110, top = 12, bottom = 88, left = 34, right = 292;
      let min = Math.min(...trend), max = Math.max(...trend);
      if (max - min < 4) { max += 2; min -= 2; }
      const pad = (max - min) * 0.15; max += pad; min -= pad;
      const x = (i) => left + (i / (trend.length - 1)) * (right - left);
      const y = (v) => bottom - ((v - min) / (max - min)) * (bottom - top);
      const pts = trend.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      chart = (
        <Svg width="100%" height={110} viewBox={`0 0 ${W} ${H}`}>
          <Line x1={left} y1={bottom} x2={right} y2={bottom} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
          <Line x1={left} y1={top} x2={right} y2={top} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          <SvgText x={left - 5} y={bottom + 3} fill={colors.dim} fontSize="8" textAnchor="end">{Math.round(min)}</SvgText>
          <SvgText x={left - 5} y={top + 3} fill={colors.dim} fontSize="8" textAnchor="end">{Math.round(max)}</SvgText>
          <Polyline points={pts} fill="none" stroke={colors.acc} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={x(trend.length - 1)} cy={y(trend[trend.length - 1])} r={3.4} fill={colors.acc} />
        </Svg>
      );
    }

    return (
      <Modal visible animationType="slide" onRequestClose={() => setExDetail(null)}>
        <SafeAreaView style={s.safe}>
          <View style={s.detailHeader}>
            <TouchableOpacity onPress={() => setExDetail(null)}>
              <Text style={s.backBtn}>← BACK</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.detailScroll} showsVerticalScrollIndicator={false}>
            <Text style={s.detailWhen}>{capitalize(rec.muscle)}</Text>
            <Text style={s.detailName}>{rec.name.toUpperCase()}</Text>

            <View style={s.statStrip}>
              <View style={s.statCell}>
                <Text style={s.statVal}>{rec.best.w} × {rec.best.r}</Text>
                <Text style={s.statLbl}>ALL-TIME BEST</Text>
              </View>
              {rec.big && (
                <View style={[s.statCell, s.statCellBorder]}>
                  <Text style={s.statVal}>{Math.round(rec.best.e)}</Text>
                  <Text style={s.statLbl}>EST 1RM</Text>
                </View>
              )}
              <View style={[s.statCell, s.statCellBorder]}>
                <Text style={s.statVal}>{rec.sessions.length}</Text>
                <Text style={s.statLbl}>SESSIONS</Text>
              </View>
            </View>

            {chart && (
              <View style={s.exBlock}>
                <View style={s.exHeader}>
                  <Text style={s.exName}>STRENGTH TREND</Text>
                  <Text style={s.exMuscle}>{rec.big ? 'EST 1RM · LB' : 'TOP-SET BASIS'}</Text>
                </View>
                {chart}
              </View>
            )}

            {repRows.length > 0 && (
              <View style={s.exBlock}>
                <View style={s.exHeader}>
                  <Text style={s.exName}>BEST BY REPS</Text>
                </View>
                {repRows.map(rr => (
                  <View key={rr.r} style={s.setRow}>
                    <View style={s.setNum}><Text style={s.setNumText}>{rr.r}</Text></View>
                    <Text style={s.setData}>{rr.w} lbs × {rr.r} reps</Text>
                    <Text style={s.repWhen}>{shortDate(rr.t)}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={s.exBlock}>
              <View style={s.exHeader}>
                <Text style={s.exName}>EVERY SESSION</Text>
                <Text style={s.exMuscle}>{rec.sessions.length} TOTAL</Text>
              </View>
              {rec.sessions.slice(0, 20).map((sx, i) => (
                <View key={i} style={s.setRow}>
                  <Text style={[s.setData, { flex: 1 }]}>{shortDate(sx.t)}</Text>
                  <Text style={s.sessTop}>{sx.top.w} × {sx.top.r}</Text>
                  <Text style={s.sessSets}>  ·  {sx.sets} sets</Text>
                  {sx.isPr && <View style={s.prTag}><Text style={s.prTagText}>★ PR</Text></View>}
                </View>
              ))}
              {rec.sessions.length > 20 && <Text style={s.moreNote}>Showing the most recent 20.</Text>}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>HISTORY</Text>
        <View style={s.countChip}>
          <Text style={s.countChipText}>{sessions.length}{'\n'}LOGGED</Text>
        </View>
      </View>

      {/* Segments — RECORDS lands first */}
      <View style={s.segRow}>
        {[['records', 'RECORDS'], ['sessions', 'SESSIONS']].map(([k, label]) => (
          <TouchableOpacity key={k} style={[s.segBtn, segment === k && s.segOn]} onPress={() => setSegment(k)} activeOpacity={0.8}>
            <Text style={[s.segText, segment === k && { color: colors.acc }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading
        ? <ActivityIndicator color={colors.acc} style={{ marginTop: 40 }} />
        : segment === 'records'
          ? renderRecords()
          : sessions.length === 0
            ? <View style={s.empty}><Text style={s.emptyText}>NO SESSIONS YET</Text><Text style={s.emptySub}>Log your first workout and it will appear here.</Text></View>
            : <FlatList data={listData} keyExtractor={i => i.id} renderItem={renderListItem} contentContainerStyle={s.list} showsVerticalScrollIndicator={false} />
      }

      {/* Per-lift story */}
      {renderExDetail()}

      {/* Strength Score explainer */}
      <Modal visible={showStrInfo} transparent animationType="fade" onRequestClose={() => setShowStrInfo(false)}>
        <TouchableOpacity style={s.infoOverlay} activeOpacity={1} onPress={() => setShowStrInfo(false)}>
          <View style={s.infoCard}>
            <Text style={s.infoTitle}>STRENGTH SCORE</Text>
            <Text style={s.infoBody}>
              The sum of your best estimated 1-rep max across the big lifts:
            </Text>
            <Text style={s.infoItem}>· Bench Press</Text>
            <Text style={s.infoItem}>· Deadlift — trap-bar counts ×0.9</Text>
            <Text style={s.infoItem}>· Squat — back or Zercher</Text>
            <Text style={s.infoItem}>· Weighted Pull-Up — includes your bodyweight; or Lat Pulldown 3RM if you don’t do weighted pull-ups</Text>
            <Text style={s.infoBody}>
              Log all four to complete it. One number to track raw strength over time — and chase.
            </Text>
            <TouchableOpacity style={s.infoBtn} onPress={() => setShowStrInfo(false)}>
              <Text style={s.infoBtnText}>GOT IT</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Session detail modal */}
      <Modal visible={!!selectedSession} animationType="slide" onRequestClose={() => setSelected(null)}>
        <SafeAreaView style={s.safe}>
          <View style={s.detailHeader}>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Text style={s.backBtn}>← BACK</Text>
            </TouchableOpacity>
            {selectedSession && (
              <TouchableOpacity onPress={() => {
                const id = selectedSession.id;
                setSelected(null);
                navigation.navigate('WorkoutLogger', { editSessionId: id });
              }}>
                <Text style={s.editBtn}>EDIT</Text>
              </TouchableOpacity>
            )}
          </View>
          {selectedSession && (
            <ScrollView contentContainerStyle={s.detailScroll} showsVerticalScrollIndicator={false}>
              <Text style={s.detailWhen}>{relativeTime(selectedSession.performed_at)}</Text>
              <Text style={s.detailName}>{selectedSession.session_name.toUpperCase()}</Text>

              {/* Stat strip */}
              <View style={s.statStrip}>
                <View style={s.statCell}>
                  <Text style={s.statVal}>{selectedSession.exCount}</Text>
                  <Text style={s.statLbl}>EXERCISES</Text>
                </View>
                <View style={[s.statCell, s.statCellBorder]}>
                  <Text style={s.statVal}>{fmtVol(selectedSession.vol)}</Text>
                  <Text style={s.statLbl}>VOLUME</Text>
                </View>
                {selectedSession.prCount > 0 && (
                  <View style={[s.statCell, s.statCellBorder, s.statCellPR]}>
                    <Text style={[s.statVal, { color: colors.acc }]}>{selectedSession.prCount}</Text>
                    <Text style={[s.statLbl, { color: colors.acc }]}>PRS HIT</Text>
                  </View>
                )}
              </View>

              {detailLoading
                ? <ActivityIndicator color={colors.acc} style={{ marginTop: 32 }} />
                : selectedSession.exercises.map(ex => {
                    let workingIdx = 0;
                    return (
                      <View key={ex.id} style={s.exBlock}>
                        <View style={s.exHeader}>
                          <Text style={s.exName}>{ex.exercises?.name?.toUpperCase()}</Text>
                          <Text style={s.exMuscle}>{capitalize(ex.exercises?.primary_muscle)}</Text>
                        </View>
                        {ex.set_logs.map((set, i) => {
                          const label = set.is_warmup ? 'W' : `${++workingIdx}`;
                          const wt    = set.weight ? `${set.weight} lbs` : 'BW';
                          const rpe   = set.rpe ? `  ·  RPE ${set.rpe}` : '';
                          return (
                            <View key={i} style={[s.setRow, set.isPR && s.setRowPR]}>
                              <View style={[s.setNum, set.is_warmup && s.setNumW, set.isPR && s.setNumPR]}>
                                <Text style={[s.setNumText, set.is_warmup && s.setNumTextW]}>{label}</Text>
                              </View>
                              <Text style={[s.setData, set.isPR && { color: colors.text }]}>{wt} × {set.reps} reps{rpe}</Text>
                              {set.isPR && <View style={s.prTag}><Text style={s.prTagText}>★ PR</Text></View>}
                            </View>
                          );
                        })}
                      </View>
                    );
                  })
              }
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md },
  title: { fontFamily: fonts.display, fontSize: 36, color: colors.text, textTransform: 'uppercase' },
  countChip: { borderWidth: 1.5, borderColor: colors.line2, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center' },
  countChipText: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, textAlign: 'center' },

  segRow: { flexDirection: 'row', gap: 6, paddingHorizontal: space.lg, marginBottom: space.md },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderWidth: 1.5, borderColor: colors.line2 },
  segOn: { borderColor: colors.acc, backgroundColor: 'rgba(255,255,255,0.04)' },
  segText: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, letterSpacing: 1.2, textTransform: 'uppercase' },

  list: { paddingHorizontal: space.lg, paddingBottom: 40 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf, borderRadius: 10, paddingHorizontal: 12, height: 42, marginBottom: space.sm },
  searchInput: { flex: 1, fontFamily: fonts.bodyMed, fontSize: 14, color: colors.text, padding: 0 },
  searchEmpty: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 24 },

  monthRule: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, marginBottom: space.sm },
  monthLabel: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.6 },
  monthLine: { flex: 1, height: 1, backgroundColor: colors.line },

  // records wall
  statsRow: { flexDirection: 'row', borderWidth: 1.5, borderColor: colors.line },
  statCellW: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  statCellWB: { borderLeftWidth: 1.5, borderLeftColor: colors.line },
  statValW: { fontFamily: fonts.display, fontSize: 21, color: colors.text },
  statLblW: { fontFamily: fonts.bodySemi, fontSize: 7.5, color: colors.muted, letterSpacing: 1, marginTop: 3, textTransform: 'uppercase' },

  recRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf, paddingVertical: 11, paddingHorizontal: 12, marginBottom: 7 },
  recTrophy: { width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(255,90,30,0.12)', alignItems: 'center', justifyContent: 'center' },
  recTrophyFresh: { backgroundColor: 'rgba(70,194,106,0.14)' },
  recName: { fontFamily: fonts.display, fontSize: 15, color: colors.text, textTransform: 'uppercase', flexShrink: 1 },
  newTag: { backgroundColor: 'rgba(70,194,106,0.15)', borderWidth: 1, borderColor: 'rgba(70,194,106,0.4)', paddingHorizontal: 5, paddingVertical: 1, marginLeft: 6 },
  newTagText: { fontFamily: fonts.bodyBold, fontSize: 7.5, color: colors.statusGood, letterSpacing: 1 },
  recWhen: { fontFamily: fonts.body, fontSize: 10, color: colors.muted, marginTop: 2 },
  recBest: { fontFamily: fonts.display, fontSize: 17, color: colors.text },
  recE1rm: { fontFamily: fonts.body, fontSize: 9, color: colors.muted, marginTop: 2 },

  // Strength category + score
  strBlock: { marginBottom: 4 },
  strScore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: colors.accDim, backgroundColor: colors.accSurf, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, marginBottom: 8 },
  strScoreNum: { fontFamily: fonts.display, fontSize: 34, color: colors.acc, lineHeight: 42, paddingTop: 4 },
  strScoreLbl: { fontFamily: fonts.bodySemi, fontSize: 8.5, color: colors.muted, letterSpacing: 1, marginTop: 2, textTransform: 'uppercase' },
  strScoreCount: { alignItems: 'center', borderLeftWidth: 1.5, borderLeftColor: colors.accDim, paddingLeft: 16 },
  strScoreCountNum: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  strScoreCountLbl: { fontFamily: fonts.bodySemi, fontSize: 8, color: colors.muted, letterSpacing: 1, marginTop: 2 },
  strMissing: { opacity: 0.7, borderStyle: 'dashed' },
  strTrophyEmpty: { backgroundColor: 'rgba(255,255,255,0.04)' },
  strAddVal: { fontFamily: fonts.display, fontSize: 17, color: colors.dim, marginLeft: 4 },

  // Strength score explainer modal
  infoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  infoCard: { width: '100%', borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf, borderRadius: 16, padding: space.lg },
  infoTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.acc, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  infoBody: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: 8 },
  infoItem: { fontFamily: fonts.bodyMed, fontSize: 13, color: colors.text, lineHeight: 19, marginTop: 4 },
  infoBtn: { backgroundColor: colors.acc, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: space.lg },
  infoBtnText: { fontFamily: fonts.display, fontSize: 15, color: colors.onAcc, textTransform: 'uppercase', letterSpacing: 0.5 },

  repWhen: { fontFamily: fonts.body, fontSize: 11, color: colors.dim },
  sessTop: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'] },
  sessSets: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  moreNote: { fontFamily: fonts.body, fontSize: 11, color: colors.dim, marginTop: 8, textAlign: 'center' },

  card: { borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf, padding: space.md, marginBottom: space.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  cardName: { fontFamily: fonts.display, fontSize: 22, color: colors.text, textTransform: 'uppercase', flex: 1 },
  cardWhen: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginLeft: space.sm },
  cardMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  cardMuscles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  cardMuscleTag: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf2, paddingHorizontal: 8, paddingVertical: 3 },
  cardMuscleName: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardMuscleCount: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.acc },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80, paddingHorizontal: 40 },
  emptyText: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textTransform: 'uppercase', marginBottom: 8 },
  emptySub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1.5, borderBottomColor: colors.line },
  editBtn: { fontFamily: fonts.display, fontSize: 14, color: colors.acc, textTransform: 'uppercase', letterSpacing: 0.5 },
  backBtn: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.acc, textTransform: 'uppercase', letterSpacing: 1 },
  detailScroll: { padding: space.lg, paddingBottom: 60 },
  detailWhen: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.8, marginBottom: 4 },
  detailName: { fontFamily: fonts.display, fontSize: 30, color: colors.text, textTransform: 'uppercase', lineHeight: 34, marginBottom: space.lg },
  statStrip: { flexDirection: 'row', borderWidth: 1.5, borderColor: colors.line, marginBottom: space.xl },
  statCell: { flex: 1, padding: space.md },
  statCellBorder: { borderLeftWidth: 1.5, borderLeftColor: colors.line },
  statCellPR: { backgroundColor: colors.accSurf },
  statVal: { fontFamily: fonts.display, fontSize: 18, color: colors.text, textTransform: 'uppercase' },
  statLbl: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 3 },
  exBlock: { marginBottom: space.xl },
  exHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.sm },
  exName: { fontFamily: fonts.display, fontSize: 16, color: colors.text, textTransform: 'uppercase', flex: 1 },
  exMuscle: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1.5, borderBottomColor: colors.line },
  setRowPR: { borderBottomColor: colors.accDim },
  setNum: { width: 26, height: 26, backgroundColor: colors.acc, alignItems: 'center', justifyContent: 'center', marginRight: space.md },
  setNumW: { backgroundColor: colors.surf3 },
  setNumPR: { backgroundColor: colors.acc },
  setNumText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.onAcc },
  setNumTextW: { color: colors.muted },
  setData: { flex: 1, fontFamily: fonts.bodyMed, fontSize: 14, color: colors.muted },
  prTag: { backgroundColor: colors.accSurf, borderWidth: 1, borderColor: colors.accDim, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 },
  prTagText: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.acc, textTransform: 'uppercase' },
});
