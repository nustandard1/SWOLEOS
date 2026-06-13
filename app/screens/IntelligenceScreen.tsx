// @ts-nocheck
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { getIntelligence } from '../lib/trendPairs';
import TrainingScore from '../components/TrainingScore';
import TrendViews from '../components/TrendViews';
import { colors, fonts, space } from '../theme/forge';

// One descending thread: SCORE → WHY (verdicts) → DO THIS → breakdown on tap.
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
const DO_ICON = {
  calendar: 'calendar-blank', 'trending-down': 'trending-down', flame: 'fire',
  check: 'check-circle-outline', 'arrow-down': 'arrow-down-thick',
  'alert-triangle': 'alert-outline', target: 'target',
  alert: 'alert-outline', 'trending-up': 'trending-up',
};
const INSIGHT_TONE = { good: '#46C26A', mid: '#FF8A3D', flag: '#FF5A4A' };

export default function IntelligenceScreen() {
  const navigation = useNavigation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const loadedOnce = useRef(false);

  useFocusEffect(useCallback(() => { load(); setFocusKey(k => k + 1); }, []));

  async function load() {
    if (!loadedOnce.current) setLoading(true);
    loadedOnce.current = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setData(await getIntelligence(user.id));
    } catch (e) { /* keep last good data */ }
    setLoading(false);
  }

  const bd = data?.breakdown;
  const maxSets = bd ? Math.max(1, ...bd.muscles.map(m => m.sets)) : 1;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.muted} />
        </TouchableOpacity>
        <Text style={s.kicker}>SWOLE/OS INTELLIGENCE</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.acc} style={{ marginTop: 60 }} />
      ) : !data || !data.hasData ? (
        <View style={s.empty}>
          <MaterialCommunityIcons name="chart-line-variant" size={28} color={colors.acc2} />
          <Text style={s.emptyTitle}>INTELLIGENCE WARMING UP</Text>
          <Text style={s.emptyBody}>Log a few sessions and your Training Status, trend reads, and weekly directives appear here — and sharpen every time you train.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <TrainingScore score={data.score} trigger={focusKey} />

          <TrendViews views={data.views} onConnect={load} />

          {/* FOCUS THIS WEEK — what to do */}
          {data.doThis?.length > 0 && (
            <View style={s.doCard}>
              <Text style={s.doHead}>FOCUS THIS WEEK</Text>
              {data.doThis.map((d, i) => (
                <View key={i} style={[s.doRow, i > 0 && s.doRowBorder]}>
                  <MaterialCommunityIcons name={DO_ICON[d.icon] || 'chevron-right'} size={16} color={colors.acc2} style={{ marginTop: 1 }} />
                  <Text style={s.doText}>{d.text}</Text>
                </View>
              ))}
            </View>
          )}

          {/* INSIGHTS — noteworthy observations you may not have clocked */}
          <View style={s.inCard}>
            <Text style={s.inHead}>INSIGHTS</Text>
            {data.insights?.length > 0 ? data.insights.map((it, i) => (
              <View key={i} style={[s.inRow, i > 0 && s.inRowBorder]}>
                <MaterialCommunityIcons name={DO_ICON[it.icon] || 'circle-small'} size={16} color={INSIGHT_TONE[it.tone] || colors.muted} style={{ marginTop: 1 }} />
                <Text style={s.inText}>{it.text}</Text>
              </View>
            )) : (
              <Text style={s.inEmpty}>Patterns surface here as you log across real weeks — a muscle stalling, volume drifting, pressing falling behind the rest. They need training spread over time to spot, so keep going and they’ll appear.</Text>
            )}
          </View>

          {/* FULL BREAKDOWN — reference data behind a tap */}
          <TouchableOpacity style={s.moreRow} onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
            <Text style={s.moreLabel}>FULL BREAKDOWN — VOLUME, MUSCLES, RPE</Text>
            <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
          </TouchableOpacity>

          {expanded && bd && (
            <View style={s.bd}>
              <View style={s.bdStats}>
                <View style={s.bdStat}><Text style={s.bdStatV}>{bd.sessionCount}</Text><Text style={s.bdStatL}>SESSIONS</Text></View>
                <View style={[s.bdStat, s.bdStatB]}><Text style={s.bdStatV}>{bd.workingSets}</Text><Text style={s.bdStatL}>WORKING SETS</Text></View>
                <View style={[s.bdStat, s.bdStatB]}><Text style={s.bdStatV}>{bd.avgRpe ?? '—'}</Text><Text style={s.bdStatL}>AVG RPE</Text></View>
              </View>
              <Text style={s.bdWindow}>LAST 28 DAYS</Text>
              <Text style={s.bdSecLbl}>WEEKLY SETS vs LANDMARKS</Text>
              {bd.muscles.length === 0 ? (
                <Text style={s.bdEmpty}>No working sets in the window yet.</Text>
              ) : bd.muscles.map(m => {
                // ~weekly hard sets (28-day total / 4) vs MEV/MAV bands (spec §4.5).
                const wk = Math.round((m.sets / 4) * 10) / 10;
                const lm = wk < 6 ? { t: 'LOW', c: '#FF8A3D' } : wk <= 16 ? { t: 'PRODUCTIVE', c: '#46C26A' } : wk <= 25 ? { t: 'HIGH', c: '#FF8A3D' } : { t: 'EXCESS', c: '#FF5A4A' };
                return (
                  <View key={m.m} style={s.musRow}>
                    <Text style={s.musName}>{cap(m.m)}</Text>
                    <View style={s.musTrack}>
                      <View style={[s.musFill, { width: `${Math.round((m.sets / maxSets) * 100)}%` }]} />
                    </View>
                    <Text style={s.musWk}>{wk}/wk</Text>
                    <Text style={[s.musVerdict, { color: lm.c }]}>{lm.t}</Text>
                  </View>
                );
              })}
              <Text style={s.bdBands}>MEV ~6 · productive 6–16 · diminishing 17–25 · likely junk 25+ (hard sets / week)</Text>
            </View>
          )}

          <View style={{ height: 28 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm, alignItems: 'center', justifyContent: 'center' },
  backBtn: { position: 'absolute', left: space.lg - 4, top: space.lg - 2 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.dim, letterSpacing: 2.5, textTransform: 'uppercase' },
  scroll: { paddingHorizontal: space.lg, paddingTop: space.sm },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, paddingBottom: 60, gap: 12 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textTransform: 'uppercase' },
  emptyBody: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 },

  // Do This
  doCard: { borderWidth: 1, borderColor: 'rgba(255,90,30,0.5)', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 15, padding: 14, marginBottom: space.sm },
  doHead: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.acc, letterSpacing: 1.6, marginBottom: 9 },
  doRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 7 },
  doRowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  doText: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: colors.text, lineHeight: 17 },

  // Insights
  inCard: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 15, padding: 14, marginBottom: space.sm },
  inHead: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.muted, letterSpacing: 1.8, marginBottom: 9 },
  inRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  inRowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  inText: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: colors.text, lineHeight: 17 },
  inEmpty: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, lineHeight: 18 },

  // Breakdown
  moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, marginTop: 4 },
  moreLabel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, letterSpacing: 1 },
  bd: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderTopWidth: 0, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, padding: 14, marginTop: -2 },
  bdStats: { flexDirection: 'row', borderWidth: 1.5, borderColor: colors.line },
  bdStat: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  bdStatB: { borderLeftWidth: 1.5, borderLeftColor: colors.line },
  bdStatV: { fontFamily: fonts.display, fontSize: 19, color: colors.text },
  bdStatL: { fontFamily: fonts.bodySemi, fontSize: 7.5, color: colors.muted, letterSpacing: 1, marginTop: 2, textTransform: 'uppercase' },
  bdWindow: { fontFamily: fonts.bodySemi, fontSize: 8, color: colors.dim, letterSpacing: 1, textAlign: 'center', marginTop: 7 },
  bdSecLbl: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, letterSpacing: 1.4, marginTop: 14, marginBottom: 8, textTransform: 'uppercase' },
  bdEmpty: { fontFamily: fonts.body, fontSize: 12, color: colors.dim },
  musRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  musName: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, width: 64, textTransform: 'uppercase', letterSpacing: 0.3 },
  musTrack: { flex: 1, height: 8, backgroundColor: colors.surf2, borderRadius: 4, overflow: 'hidden' },
  musFill: { height: '100%', backgroundColor: colors.acc, borderRadius: 4 },
  musWk: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.muted, width: 38, textAlign: 'right', fontVariant: ['tabular-nums'] },
  musVerdict: { fontFamily: fonts.bodyBold, fontSize: 8.5, letterSpacing: 0.6, width: 64, textAlign: 'right' },
  bdBands: { fontFamily: fonts.body, fontSize: 10, color: colors.dim, lineHeight: 15, marginTop: 6 },
});
