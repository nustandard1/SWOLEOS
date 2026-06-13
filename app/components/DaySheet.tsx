// @ts-nocheck
import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, PanResponder } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, fonts, space } from '../theme/forge';

const WD = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const fmtVol = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : `${v}`);

// Adaptive bottom sheet shown when a calendar day is tapped — shows the scheduled
// session (muscle groups + its exercises, scrollable) and the right action for the
// day's state (completed / today / upcoming / missed / rest).
export default function DaySheet({ day, onClose, onView, onStart, onLog }) {
  // Swipe-down-to-close: drag the header/handle down past a threshold to dismiss.
  const translateY = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Slide up on open (we render our own overlay now, not a Modal, so we animate entry).
  useEffect(() => {
    if (day) {
      translateY.setValue(900);
      Animated.timing(translateY, { toValue: 0, duration: 240, useNativeDriver: false }).start();
    }
  }, [day]);

  // For a COMPLETED day, pull a scannable preview of what they actually did.
  const [detail, setDetail] = useState(null);
  const sid = day?.info?.sessionId || null;
  useEffect(() => {
    let active = true;
    setDetail(null);
    if (!sid) return;
    (async () => {
      const { data } = await supabase
        .from('workout_sessions')
        .select('session_exercises(exercise_order, exercises(name), set_logs(weight, reps, is_warmup, cluster_reps))')
        .eq('id', sid).single();
      if (!active || !data) return;
      const exs = [...(data.session_exercises || [])].sort((a, b) => (a.exercise_order ?? 0) - (b.exercise_order ?? 0));
      let volume = 0, totalSets = 0;
      const rows = exs.map(ex => {
        const sets = (ex.set_logs || []).filter(s => !s.is_warmup && s.reps > 0);
        let topW = 0, topR = 0, topE = -1;
        for (const s of sets) {
          const clusters = (s.cluster_reps || []).reduce((a, b) => a + (b || 0), 0);
          volume += (s.weight || 0) * (s.reps + clusters);
          const e = (s.weight || 0) * (1 + s.reps / 30);
          if (e > topE) { topE = e; topW = s.weight || 0; topR = s.reps; }
        }
        totalSets += sets.length;
        return { name: ex.exercises?.name || 'Exercise', sets: sets.length, topW, topR };
      }).filter(r => r.sets > 0);
      setDetail({ forSid: sid, rows, volume: Math.round(volume), sets: totalSets });
    })();
    return () => { active = false; };
  }, [sid]);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 90 || g.vy > 1.1) {
        Animated.timing(translateY, { toValue: 900, duration: 180, useNativeDriver: false }).start(() => closeRef.current && closeRef.current());
      } else {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: false, bounciness: 4 }).start();
      }
    },
  })).current;

  if (!day) return null;
  const { dateKey, info } = day;
  const d = new Date(dateKey + 'T12:00:00');
  const title = `${WD[d.getDay()]}`;
  const sub = `${MO[d.getMonth()]} ${d.getDate()}`;
  const { sessionId, isToday, isFuture, isPast, scheduled } = info;

  let status, statusColor = colors.muted;
  if (sessionId) { status = 'WORKOUT LOGGED'; statusColor = colors.statusGood; }
  else if (scheduled && isToday) { status = "TODAY'S SESSION"; statusColor = colors.acc; }
  else if (scheduled && isFuture) { status = 'SCHEDULED'; statusColor = colors.acc; }
  else if (scheduled && isPast) { status = 'SCHEDULED — NOT LOGGED'; statusColor = colors.statusMid; }
  else if (isFuture) status = 'REST DAY';
  else status = 'NO SESSION';

  const muscles = scheduled?.muscles || [];
  const exercises = scheduled?.exercises || [];
  // Already logged that day → no "Start" (the session is done; View/Edit is the action).
  const canStart = scheduled && scheduled.built && (isToday || isFuture) && !sessionId;
  const canLog = !sessionId && (isToday || isPast);

  return (
    <View style={sh.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[sh.sheet, { transform: [{ translateY }] }]} {...pan.panHandlers}>
          <View>
            <View style={sh.handle} />
            <Text style={sh.day}>{title}</Text>
            <Text style={sh.date}>{sub}</Text>
            <Text style={[sh.status, { color: statusColor }]}>{status}{scheduled ? ` · ${scheduled.name.toUpperCase()}` : ''}</Text>

            {/* Muscle groups — for an upcoming scheduled session (not a completed one) */}
            {!sessionId && scheduled && muscles.length > 0 && (
              <View style={sh.muscleRow}>
                {muscles.map((m, i) => (
                  <View key={i} style={sh.muscleChip}><Text style={sh.muscleChipText}>{cap(m)}</Text></View>
                ))}
              </View>
            )}
          </View>

          {/* COMPLETED day → a scannable preview of what they actually did */}
          {sessionId && detail && detail.forSid === sessionId && (
            <>
              <View style={sh.statRow}>
                <View style={sh.statCell}><Text style={sh.statVal}>{detail.rows.length}</Text><Text style={sh.statLbl}>EXERCISES</Text></View>
                <View style={[sh.statCell, sh.statBorder]}><Text style={sh.statVal}>{detail.sets}</Text><Text style={sh.statLbl}>SETS</Text></View>
                <View style={[sh.statCell, sh.statBorder]}><Text style={sh.statVal}>{fmtVol(detail.volume)}</Text><Text style={sh.statLbl}>VOLUME</Text></View>
              </View>
              {detail.rows.length > 0 && (
                <ScrollView style={sh.exScroll} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator>
                  {detail.rows.map((r, i) => (
                    <View key={i} style={sh.exRow}>
                      <Text style={sh.exNum}>{String(i + 1).padStart(2, '0')}</Text>
                      <Text style={sh.exName}>{r.name}</Text>
                      {r.topW > 0 ? <Text style={sh.exTop}>{r.topW}×{r.topR}</Text> : null}
                    </View>
                  ))}
                </ScrollView>
              )}
            </>
          )}

          {/* The scheduled session's planned exercises — only if not yet completed */}
          {!sessionId && scheduled && exercises.length > 0 && (
            <ScrollView style={sh.exScroll} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator>
              {exercises.map((n, i) => (
                <View key={i} style={sh.exRow}>
                  <Text style={sh.exNum}>{String(i + 1).padStart(2, '0')}</Text>
                  <Text style={sh.exName}>{n}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {sessionId && (
            <TouchableOpacity style={sh.primary} onPress={() => onView(sessionId)} activeOpacity={0.85}>
              <Text style={sh.primaryText}>VIEW / EDIT SESSION</Text>
            </TouchableOpacity>
          )}

          {canStart && (
            <TouchableOpacity style={sh.primary} onPress={() => onStart(scheduled)} activeOpacity={0.85}>
              <Text style={sh.primaryText}>START {scheduled.name.toUpperCase()}{isFuture ? ' EARLY' : ''}</Text>
            </TouchableOpacity>
          )}

          {scheduled && !scheduled.built && !sessionId && (
            <Text style={sh.note}>This session has no exercises yet — build it in the Train tab.</Text>
          )}

          {canLog && (
            <TouchableOpacity style={[sh.secondary, !sessionId && !canStart && sh.primary]} onPress={() => onLog(dateKey, isToday)} activeOpacity={0.85}>
              <Text style={[sh.secondaryText, !sessionId && !canStart && sh.primaryText]}>
                {isToday ? 'LOG A WORKOUT' : 'LOG A WORKOUT FOR THIS DAY'}
              </Text>
            </TouchableOpacity>
          )}

          {isFuture && !scheduled && (
            <Text style={sh.note}>Nothing planned. Enjoy the recovery.</Text>
          )}

          <TouchableOpacity style={sh.cancel} onPress={onClose}>
            <Text style={sh.cancelText}>CLOSE</Text>
          </TouchableOpacity>
        </Animated.View>
    </View>
  );
}

const sh = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', zIndex: 100, elevation: 100 },
  sheet: { backgroundColor: colors.surf, borderTopWidth: 1.5, borderTopColor: colors.line2, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xl, maxHeight: '88%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line2, marginBottom: space.md },
  day: { fontFamily: fonts.display, fontSize: 26, color: colors.text, textTransform: 'uppercase' },
  date: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
  status: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, marginTop: space.md, marginBottom: space.sm },

  muscleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.md },
  muscleChip: { borderWidth: 1.5, borderColor: colors.line2, paddingHorizontal: 9, paddingVertical: 4 },
  muscleChipText: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },

  statRow: { flexDirection: 'row', borderWidth: 1.5, borderColor: colors.line, marginBottom: space.md },
  statCell: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  statBorder: { borderLeftWidth: 1.5, borderLeftColor: colors.line },
  statVal: { fontFamily: fonts.display, fontSize: 20, color: colors.acc },
  statLbl: { fontFamily: fonts.bodySemi, fontSize: 8, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },

  exScroll: { maxHeight: 210, marginBottom: space.md },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1.5, borderBottomColor: colors.line },
  exNum: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.dim, fontVariant: ['tabular-nums'], width: 20 },
  exName: { flex: 1, fontFamily: fonts.bodyMed, fontSize: 14, color: colors.text },
  exTop: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.acc2, fontVariant: ['tabular-nums'] },

  primary: { backgroundColor: colors.acc, paddingVertical: 16, alignItems: 'center', marginBottom: space.sm },
  primaryText: { fontFamily: fonts.display, fontSize: 16, color: colors.onAcc, textTransform: 'uppercase', letterSpacing: 0.5 },
  secondary: { borderWidth: 1.5, borderColor: colors.line2, paddingVertical: 14, alignItems: 'center', marginBottom: space.sm },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  note: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, lineHeight: 19, marginBottom: space.md },
  cancel: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
});
