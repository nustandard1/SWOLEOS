// @ts-nocheck
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, space } from '../theme/forge';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function mondayOf(d) {
  const m = new Date(d); m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

const DOT_COLOR = { done: colors.statusGood, planned: colors.acc, missed: colors.statusLow };

// Log + schedule calendar with corner dots. Forgiving: a logged session fulfills a
// planned one regardless of weekday, so "missed" only reflects a past WEEK's shortfall.
export default function WeekStrip({ loggedDates = {}, schedule = {}, scheduleStart = null, onDayPress }) {
  const [offset, setOffset] = useState(0);
  const [width, setWidth] = useState(0);
  const scrollRef = useRef(null);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);

  // Schedule dots only apply within the program window: from its start date to ~8
  // weeks ahead. Logged sessions still show outside this (real history).
  const startMs = scheduleStart ? (() => { const d = new Date(scheduleStart); d.setHours(0, 0, 0, 0); return d.getTime(); })() : null;
  const forwardMaxMs = today.getTime() + 56 * 86400000;
  function inRange(d) {
    const t = d.getTime();
    if (startMs != null && t < startMs) return false;
    if (t > forwardMaxMs) return false;
    return true;
  }
  const schedFor = (d) => (inRange(d) ? (schedule[(d.getDay() + 6) % 7] || null) : null);

  function weekDays(weekOffset) {
    const base = mondayOf(today);
    base.setDate(base.getDate() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return d; });
  }

  const cur = weekDays(offset);
  const first = cur[0], last = cur[6];
  const label = first.getMonth() === last.getMonth()
    ? `${MONTHS[first.getMonth()]} ${first.getFullYear()}`
    : `${MONTHS[first.getMonth()]} – ${MONTHS[last.getMonth()]}`;

  // Weekly summary for the displayed week (frequency-based, only within program window).
  // Numerator is capped at the plan: ad-hoc/self-added sessions never push it past
  // the program's target (so 3 logged on a 2-day plan reads "2/2", never "3/2").
  const curPlanned = cur.filter(d => schedFor(d)).length;
  const curLoggedRaw = cur.filter(d => loggedDates[dateKey(d)]).length;
  const curLogged = Math.min(curLoggedRaw, curPlanned);
  const curPast = last.getTime() < today.getTime();

  function renderWeek(weekOffset) {
    const days = weekDays(weekOffset);
    const isPastWeek = days[6].getTime() < today.getTime();
    const logged = days.filter(d => loggedDates[dateKey(d)]).length;
    const plannedThisWeek = days.filter(d => schedFor(d)).length;
    const shortfall = isPastWeek ? Math.max(0, plannedThisWeek - logged) : 0;
    // Unfulfilled planned day indices; only the trailing `shortfall` of them are "missed".
    const unfulfilled = [];
    days.forEach((d, i) => {
      if (schedFor(d) && !loggedDates[dateKey(d)]) unfulfilled.push(i);
    });
    const missedIdx = new Set(isPastWeek ? unfulfilled.slice(Math.max(0, unfulfilled.length - shortfall)) : []);

    return (
      <View style={[s.row, width ? { width } : null]}>
        {days.map((d, i) => {
          const key = dateKey(d);
          const sessionId = loggedDates[key] || null;
          const isToday = key === todayKey;
          const isFuture = d.getTime() > today.getTime();
          const isPast = d.getTime() < today.getTime();
          const scheduled = schedFor(d);

          let dot = null;
          if (sessionId) dot = 'done';
          else if (scheduled) {
            if (missedIdx.has(i)) dot = 'missed';
            else if (!isPast) dot = 'planned'; // today or future this/next week
          }
          let state = 'rest';
          if (sessionId) state = 'completed';
          else if (dot === 'missed') state = 'missed';
          else if (scheduled && isToday) state = 'due';
          else if (scheduled && !isPast) state = 'upcoming';

          const info = { sessionId, isToday, isFuture, isPast, scheduled, state };
          return (
            <TouchableOpacity key={key} style={s.cell} activeOpacity={0.7} onPress={() => onDayPress && onDayPress(key, info)}>
              <Text style={[s.dow, isToday && { color: colors.acc }]}>{DOW[i]}</Text>
              <View style={[s.dateTile, isToday && s.dateTileToday]}>
                <Text style={[s.dayNum, isToday && { color: colors.acc }, isFuture && !dot && { color: colors.dim }]}>{d.getDate()}</Text>
                {dot && <View style={[s.dot, { backgroundColor: DOT_COLOR[dot] }]} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  function onMomentumEnd(e) {
    if (!width) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    if (page !== 1) {
      setOffset(o => o + (page - 1));
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ x: width, animated: false }));
    }
  }

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setOffset(o => o - 1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
        </TouchableOpacity>
        <Text style={s.monthLabel}>{label}</Text>
        <TouchableOpacity onPress={() => setOffset(o => o + 1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
        </TouchableOpacity>
      </View>

      <View onLayout={e => { const w = e.nativeEvent.layout.width; if (w && Math.abs(w - width) > 1) setWidth(w); }}>
        {width > 0 ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: width, y: 0 }}
            onMomentumScrollEnd={onMomentumEnd}
            scrollEventThrottle={16}
          >
            {[-1, 0, 1].map(p => <View key={p} style={{ width }}>{renderWeek(offset + p)}</View>)}
          </ScrollView>
        ) : renderWeek(offset)}
      </View>

      {curPlanned > 0 && (
        <Text style={[
          s.summary,
          curLogged >= curPlanned ? { color: colors.statusGood } : curPast ? { color: colors.statusMid } : { color: colors.muted },
        ]}>
          {curLogged >= curPlanned
            ? `${curLogged}/${curPlanned} SESSIONS · WEEK COMPLETE`
            : `${curLogged}/${curPlanned} SESSIONS${curPast ? ' · CAME UP SHORT' : ' THIS WEEK'}`}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  monthLabel: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { alignItems: 'center', flex: 1 },
  dow: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.dim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  dateTile: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  dateTileToday: { borderBottomWidth: 2, borderBottomColor: colors.acc },
  dayNum: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  dot: { position: 'absolute', top: 2, right: 3, width: 7, height: 7, borderRadius: 4 },

  summary: { fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', marginTop: 10 },
});
