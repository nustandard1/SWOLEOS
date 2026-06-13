// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, FlatList,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SPLIT_DEFINITIONS } from '../lib/splitDefinitions';
import { supabase } from '../lib/supabase';
import { colors, fonts, space } from '../theme/forge';

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

export default function SplitPickerScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const preselectId = route.params?.splitId;
  const [selected, setSelected] = useState(
    preselectId ? (SPLIT_DEFINITIONS.find(s => s.id === preselectId) || null) : null
  );

  // Soft recommendations from the lifter's own answers — frequency is the honest,
  // transparent axis ("fits your 4 days/week"). They can still pick anything.
  const [userDays, setUserDays] = useState(null);
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('users').select('training_days_per_week').eq('id', user.id).maybeSingle();
      if (data?.training_days_per_week) setUserDays(data.training_days_per_week);
    })();
  }, []);

  // Build the browse list: RECOMMENDED first (exact day match, else ±1), then ALL
  // splits grouped by days/week ascending — the natural browse axis.
  const recIds = (() => {
    if (!userDays) return [];
    const exact = SPLIT_DEFINITIONS.filter(d => d.daysPerWeek === userDays);
    const pool = exact.length ? exact : SPLIT_DEFINITIONS.filter(d => Math.abs(d.daysPerWeek - userDays) === 1);
    return pool.slice(0, 3).map(d => d.id);
  })();
  const listItems = (() => {
    const items = [];
    if (recIds.length) {
      items.push({ type: 'header', key: 'rec', label: `RECOMMENDED FOR YOU — FITS YOUR ${userDays} DAYS/WEEK` });
      for (const id of recIds) items.push({ type: 'split', key: `rec-${id}`, def: SPLIT_DEFINITIONS.find(d => d.id === id), rec: true });
    }
    const byDays = [...SPLIT_DEFINITIONS].sort((a, b) => a.daysPerWeek - b.daysPerWeek);
    let lastDays = null;
    for (const def of byDays) {
      if (def.daysPerWeek !== lastDays) {
        lastDays = def.daysPerWeek;
        items.push({ type: 'header', key: `h-${lastDays}`, label: `${lastDays} DAYS / WEEK` });
      }
      items.push({ type: 'split', key: def.id, def, rec: false });
    }
    return items;
  })();

  if (selected) {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.detailScroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => setSelected(null)} style={{ marginBottom: space.lg }}>
            <Text style={s.backBtn}>← BACK</Text>
          </TouchableOpacity>

          <View style={s.detailTop}>
            <View style={s.dayBadge}>
              <Text style={s.dayBadgeNum}>{selected.daysPerWeek}</Text>
              <Text style={s.dayBadgeLabel}>DAYS/WK</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.detailName}>{selected.name.toUpperCase()}</Text>
              <Text style={s.detailIdeal}>{selected.idealFor}</Text>
            </View>
          </View>

          {/* Day dots */}
          <View style={s.dotsRow}>
            {Array.from({ length: 7 }, (_, i) => (
              <View key={i} style={[s.dot, i < selected.daysPerWeek && s.dotOn]} />
            ))}
          </View>

          <View style={s.descList}>
            {selected.description.split('. ').map(x => x.trim()).filter(Boolean).map((x, i) => (
              <View key={i} style={s.descRow}>
                <Text style={s.descBullet}>•</Text>
                <Text style={s.descBulletText}>{x.endsWith('.') ? x : x + '.'}</Text>
              </View>
            ))}
          </View>

          {/* Sessions */}
          <Text style={s.sectionLabel}>SESSIONS</Text>
          <View style={s.sessionsList}>
            {selected.sessions.map((sess, i) => (
              <View key={i} style={s.sessionRow}>
                <View style={s.sessionIndex}><Text style={s.sessionIndexText}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sessionName}>{sess.name.toUpperCase()}</Text>
                  <Text style={s.sessionMuscles}>{sess.focusMuscles.map(cap).join(' · ')}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Pros & Cons */}
          <View style={s.prosConsRow}>
            <View style={s.prosCard}>
              <Text style={s.prosLabel}>PROS</Text>
              {selected.pros.map((p, i) => <Text key={i} style={s.prosItem}>+ {p}</Text>)}
            </View>
            <View style={s.consCard}>
              <Text style={s.consLabel}>CONS</Text>
              {selected.cons.map((c, i) => <Text key={i} style={s.consItem}>− {c}</Text>)}
            </View>
          </View>

          {/* Volume */}
          <View style={s.volumeNote}>
            <Text style={s.volumeLabel}>VOLUME TARGETS</Text>
            <Text style={s.volumeText}>{selected.volumeNote}</Text>
          </View>

          {/* CTA */}
          <TouchableOpacity style={s.useBtn} onPress={() => navigation.replace('TemplateBuilder', { splitId: selected.id })} activeOpacity={0.85}>
            <Text style={s.useBtnText}>BUILD WITH THIS SPLIT →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.altBtn} onPress={() => setSelected(null)}>
            <Text style={s.altBtnText}>CHOOSE A DIFFERENT SPLIT</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.closeBtn}>✕</Text>
        </TouchableOpacity>
        <Text style={s.title}>CHOOSE A SPLIT</Text>
        <View style={{ width: 28 }} />
      </View>
      <Text style={s.subtitle}>Tap a split to learn more before committing.</Text>

      <FlatList
        data={listItems}
        keyExtractor={item => item.key}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <View style={s.sectionHead}>
                <Text style={[s.sectionHeadText, item.key === 'rec' && { color: colors.acc }]}>{item.label}</Text>
                <View style={s.sectionHeadLine} />
              </View>
            );
          }
          const d = item.def;
          return (
            <TouchableOpacity style={[s.splitCard, item.rec && s.splitCardRec]} onPress={() => setSelected(d)} activeOpacity={0.75}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Text style={[s.splitName, { flexShrink: 1 }]}>{d.name.toUpperCase()}</Text>
                  {item.rec && <View style={s.recBadge}><Text style={s.recBadgeText}>FOR YOU</Text></View>}
                </View>
                <Text style={s.splitIdeal} numberOfLines={2}>{d.idealFor}</Text>
              </View>
              <View style={s.splitRight}>
                <Text style={s.splitDays}>{d.daysPerWeek}</Text>
                <Text style={s.splitDaysLabel}>DAYS</Text>
                <View style={s.miniDots}>
                  {Array.from({ length: 7 }, (_, i) => (
                    <View key={i} style={[s.miniDot, i < d.daysPerWeek && s.miniDotOn]} />
                  ))}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={(
          <View style={s.customCard}>
            <Text style={s.customTitle}>BUILD FROM SCRATCH</Text>
            <Text style={s.customSub}>Run your own programming — you pick the days, the structure, and every exercise. How many days per week?</Text>
            <View style={s.customDays}>
              {[2, 3, 4, 5, 6].map(d => (
                <TouchableOpacity
                  key={d}
                  style={s.customDayChip}
                  onPress={() => navigation.replace('TemplateBuilder', { splitId: `custom_${d}day` })}
                  activeOpacity={0.8}
                >
                  <Text style={s.customDayNum}>{d}</Text>
                  <Text style={s.customDayLbl}>DAYS</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textTransform: 'uppercase' },
  closeBtn: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.acc },
  backBtn: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.acc, textTransform: 'uppercase', letterSpacing: 1 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, paddingHorizontal: space.lg, marginBottom: space.md },

  list: { paddingHorizontal: space.lg, paddingBottom: 40 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, marginBottom: space.sm },
  sectionHeadText: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, letterSpacing: 1.5 },
  sectionHeadLine: { flex: 1, height: 1, backgroundColor: colors.line },
  recBadge: { backgroundColor: colors.acc, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  recBadgeText: { fontFamily: fonts.bodyBold, fontSize: 8, color: colors.onAcc, letterSpacing: 0.8 },
  splitCardRec: { borderColor: colors.accDim, backgroundColor: colors.accSurf },
  splitCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf, borderRadius: 12, padding: space.md, marginBottom: space.sm },
  // Build-from-scratch — the escape hatch for lifters who run their own programming.
  customCard: { borderWidth: 1.5, borderColor: colors.accDim, backgroundColor: colors.accSurf, borderRadius: 12, padding: space.md, marginTop: space.sm },
  customTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.acc, textTransform: 'uppercase', marginBottom: 4 },
  customSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, lineHeight: 17, marginBottom: space.md },
  customDays: { flexDirection: 'row', gap: 8 },
  customDayChip: { flex: 1, alignItems: 'center', borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf, borderRadius: 10, paddingVertical: 10 },
  customDayNum: { fontFamily: fonts.display, fontSize: 20, color: colors.text, lineHeight: 22 },
  customDayLbl: { fontFamily: fonts.bodySemi, fontSize: 8, color: colors.muted, letterSpacing: 1 },
  splitName: { fontFamily: fonts.display, fontSize: 16, color: colors.text, textTransform: 'uppercase', marginBottom: 4 },
  splitIdeal: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, lineHeight: 17 },
  splitRight: { alignItems: 'center', minWidth: 48 },
  splitDays: { fontFamily: fonts.display, fontSize: 24, color: colors.acc, lineHeight: 28 },
  splitDaysLabel: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.dim, textTransform: 'uppercase', letterSpacing: 1 },
  miniDots: { flexDirection: 'row', gap: 2, marginTop: 6 },
  miniDot: { width: 5, height: 5, backgroundColor: colors.line2 },
  miniDotOn: { backgroundColor: colors.acc },

  detailScroll: { padding: space.lg, paddingBottom: 60 },
  detailTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginBottom: space.md },
  dayBadge: { width: 64, height: 64, borderWidth: 1.5, borderColor: colors.acc, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surf },
  dayBadgeNum: { fontFamily: fonts.display, fontSize: 26, color: colors.acc, lineHeight: 28 },
  dayBadgeLabel: { fontFamily: fonts.bodySemi, fontSize: 8, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  detailName: { fontFamily: fonts.display, fontSize: 22, color: colors.text, textTransform: 'uppercase', lineHeight: 24, marginBottom: 4 },
  detailIdeal: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, lineHeight: 18 },

  dotsRow: { flexDirection: 'row', gap: 6, marginBottom: space.lg },
  dot: { width: 12, height: 4, backgroundColor: colors.line2 },
  dotOn: { backgroundColor: colors.acc },

  detailDesc: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, lineHeight: 22, marginBottom: space.xl },
  descList: { marginBottom: space.xl, gap: 7 },
  descRow: { flexDirection: 'row', gap: 8 },
  descBullet: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.acc, lineHeight: 20 },
  descBulletText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.muted, lineHeight: 20 },

  sectionLabel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.8, marginBottom: space.md },
  sessionsList: { marginBottom: space.xl, borderWidth: 1.5, borderColor: colors.line },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.md, borderBottomWidth: 1.5, borderBottomColor: colors.line },
  sessionIndex: { width: 28, height: 28, borderWidth: 1.5, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surf2 },
  sessionIndexText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted },
  sessionName: { fontFamily: fonts.display, fontSize: 14, color: colors.text, textTransform: 'uppercase', marginBottom: 2 },
  sessionMuscles: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },

  prosConsRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  prosCard: { flex: 1, borderWidth: 1.5, borderColor: colors.accDim, backgroundColor: colors.accSurf, padding: space.md },
  consCard: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,122,107,0.34)', backgroundColor: colors.surf, padding: space.md },
  prosLabel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.acc, letterSpacing: 1, marginBottom: 8 },
  consLabel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.dangerTxt, letterSpacing: 1, marginBottom: 8 },
  prosItem: { fontFamily: fonts.body, fontSize: 12, color: colors.acc2, lineHeight: 18, marginBottom: 4 },
  consItem: { fontFamily: fonts.body, fontSize: 12, color: colors.dangerTxt, lineHeight: 18, marginBottom: 4, opacity: 0.85 },

  volumeNote: { borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf, padding: space.md, marginBottom: space.xl },
  volumeLabel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, letterSpacing: 1, marginBottom: 6 },
  volumeText: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, lineHeight: 20 },

  useBtn: { backgroundColor: colors.acc, paddingVertical: 18, alignItems: 'center', marginBottom: space.sm },
  useBtnText: { fontFamily: fonts.display, fontSize: 17, color: colors.onAcc, textTransform: 'uppercase' },
  altBtn: { paddingVertical: 14, alignItems: 'center' },
  altBtnText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
});
