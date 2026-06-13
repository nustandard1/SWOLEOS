// @ts-nocheck
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useScreenCache } from '../lib/useScreenCache';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { SPLIT_DEFINITIONS } from '../lib/splitDefinitions';
import { PRO_PROGRAMS, activateProgram } from '../lib/proPrograms';
import { colors, fonts, space } from '../theme/forge';

// ─── Templates Panel ──────────────────────────────────────────────────────────
function TemplatesPanel({ navigation }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const loadedOnce = useRef(false); // spinner only on first load; refresh quietly after

  // Stale-while-revalidate — show last templates instantly on open.
  const { applied: cacheApplied, persist } = useScreenCache('train', (c) => {
    if (loadedOnce.current) return;
    if (c.templates) { setTemplates(c.templates); setLoading(false); }
  });
  useEffect(() => { if (!loading) persist({ templates }); }, [loading, templates]);

  useFocusEffect(useCallback(() => { loadTemplates(); }, []));

  async function loadTemplates() {
    if (!loadedOnce.current && !cacheApplied.current) setLoading(true);
    loadedOnce.current = true;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('workout_templates')
      .select(`id, title, split_type, is_active, current_session_index, created_at,
        template_sessions(id, name, session_order)`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    const mapped = (data || []).map(t => {
      const sessions = [...(t.template_sessions || [])].sort((a, b) => a.session_order - b.session_order);
      const idx = t.current_session_index ?? 0;
      const next = sessions[idx % (sessions.length || 1)];
      return {
        id: t.id, title: t.title, split_type: t.split_type,
        is_active: t.is_active ?? false,
        session_count: sessions.length,
        next_session_name: next?.name ?? '—',
      };
    });
    setTemplates(mapped);
    setLoading(false);
  }

  async function setActive(id) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('workout_templates').update({ is_active: false }).eq('user_id', user.id);
    await supabase.from('workout_templates').update({ is_active: true }).eq('id', id);
    loadTemplates();
  }

  async function setInactive(id) {
    await supabase.from('workout_templates').update({ is_active: false }).eq('id', id);
    loadTemplates();
  }

  function deleteTemplate(id) {
    Alert.alert('Delete Template', 'Permanently delete this template and all its sessions?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('workout_templates').delete().eq('id', id);
        loadTemplates();
      }},
    ]);
  }

  const getSplitDef = (t) => SPLIT_DEFINITIONS.find(s => s.id === t);

  // Render the header immediately + an inline spinner — the screen "appears" at once
  // instead of flashing a blank pinwheel (premium flow).
  if (loading) return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}><Text style={s.title}>TRAIN</Text></View>
      <ActivityIndicator color={colors.acc} style={{ marginTop: 40 }} />
    </SafeAreaView>
  );

  // ── Empty state: show the split catalog directly ──
  if (templates.length === 0) {
    return (
      <ScrollView contentContainerStyle={s.panelScroll} showsVerticalScrollIndicator={false}>
        <Text style={s.panelIntro}>Pick a split to start. SWOLE/OS guides you through building it into a template, then queues your sessions automatically.</Text>
        <Text style={s.catalogLabel}>CHOOSE A SPLIT</Text>
        {SPLIT_DEFINITIONS.map(item => (
          <TouchableOpacity
            key={item.id}
            style={s.splitCard}
            onPress={() => navigation.navigate('SplitPicker', { splitId: item.id })}
            activeOpacity={0.75}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={s.splitName}>{item.name.toUpperCase()}</Text>
              <Text style={s.splitIdeal} numberOfLines={2}>{item.idealFor}</Text>
            </View>
            <View style={s.splitRight}>
              <Text style={s.splitDays}>{item.daysPerWeek}</Text>
              <Text style={s.splitDaysLabel}>DAYS</Text>
              <View style={s.miniDots}>
                {Array.from({ length: 7 }, (_, i) => (
                  <View key={i} style={[s.miniDot, i < item.daysPerWeek && s.miniDotOn]} />
                ))}
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.panelScroll} showsVerticalScrollIndicator={false}>
      <Text style={s.panelIntro}>Your templates. SWOLE/OS queues your next session automatically.</Text>

      {/* New template button */}
      <TouchableOpacity style={s.newBtn} onPress={() => navigation.navigate('SplitPicker')} activeOpacity={0.85}>
        <Text style={s.newBtnText}>+ NEW TEMPLATE</Text>
      </TouchableOpacity>

      {(
        templates.map(t => {
          const def = getSplitDef(t.split_type);
          return (
            <View key={t.id} style={[s.card, t.is_active && s.cardActive]}>
              {t.is_active && (
                <View style={s.activeBadge}><Text style={s.activeBadgeText}>ACTIVE</Text></View>
              )}
              <Text style={s.cardName}>{t.title.toUpperCase()}</Text>
              <Text style={s.cardMeta}>{def?.shortName ?? t.split_type} · {t.session_count} sessions</Text>

              {t.is_active && (
                <View style={s.nextRow}>
                  <Text style={s.nextLabel}>NEXT UP</Text>
                  <Text style={s.nextSession}>{t.next_session_name.toUpperCase()}</Text>
                </View>
              )}

              <View style={s.cardActions}>
                {!t.is_active ? (
                  <TouchableOpacity style={s.actionBtn} onPress={() => setActive(t.id)}>
                    <Text style={s.actionBtnText}>SET ACTIVE</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={s.actionBtn} onPress={() => setInactive(t.id)}>
                    <Text style={s.actionBtnText}>SET INACTIVE</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.actionBtn} onPress={() => navigation.navigate('TemplateBuilder', { splitId: t.split_type, templateId: t.id })}>
                  <Text style={s.actionBtnText}>EDIT</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.actionBtn, s.actionBtnDanger]} onPress={() => deleteTemplate(t.id)}>
                  <Text style={[s.actionBtnText, s.actionBtnDangerText]}>DELETE</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

// ─── Programs Panel (Pro) ─────────────────────────────────────────────────────
function ProgramsPanel() {
  const navigation = useNavigation();
  const [detail, setDetail] = useState(null);   // the program being viewed
  const [activating, setActivating] = useState(false);
  const [cardW, setCardW] = useState(0);        // day-card carousel width
  const [dayIdx, setDayIdx] = useState(0);      // current day card (for dots)

  function openDetail(p) { setDayIdx(0); setDetail(p); }

  async function activate(program) {
    setActivating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setActivating(false); return; }
    const res = await activateProgram(user.id, program);
    setActivating(false);
    setDetail(null);
    if (res?.error) { Alert.alert('Could not activate', res.error); return; }
    Alert.alert(
      'Program activated',
      `${program.name} is now your active program. Your sessions are queued — head to the + button or Home to start.`,
      [{ text: 'Got it', onPress: () => navigation.navigate('Home') }],
    );
  }

  return (
    <ScrollView contentContainerStyle={s.panelScroll} showsVerticalScrollIndicator={false}>
      <Text style={s.panelIntro}>Expert-built training systems with auto-progression baked in. Tap one to see the full plan, then activate it as your program.</Text>

      {PRO_PROGRAMS.map(p => (
        <TouchableOpacity key={p.id} style={s.progCard} onPress={() => openDetail(p)} activeOpacity={0.85}>
          <View style={{ flex: 1 }}>
            <View style={s.progTopRow}>
              <Text style={s.progName}>{p.name.toUpperCase()}</Text>
              <View style={s.proBadge}><MaterialCommunityIcons name="crown" size={11} color={colors.acc} /><Text style={s.proBadgeText}>PRO</Text></View>
            </View>
            <Text style={s.progMeta}>{p.weeks} WEEKS · {p.daysPerWeek} DAYS/WEEK · {p.difficulty.toUpperCase()}</Text>
            <Text style={s.progMetaSub}>{p.schedule} · {p.sessions.length} rotating sessions</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
        </TouchableOpacity>
      ))}

      {/* Program detail */}
      <Modal visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)}>
        <SafeAreaView style={s.safe}>
          {detail && (
            <>
              <View style={s.detailHead}>
                <TouchableOpacity onPress={() => setDetail(null)}><Text style={s.detailBack}>← BACK</Text></TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
                <View style={{ paddingHorizontal: space.lg }}>
                  <Text style={s.dProgName}>{detail.name.toUpperCase()}</Text>
                  <View style={s.dChips}>
                    {[`${detail.weeks} WK`, `${detail.daysPerWeek} DAYS/WK`, detail.purpose, detail.difficulty].map(c => (
                      <View key={c} style={s.dChip}><Text style={s.dChipText}>{c.toUpperCase()}</Text></View>
                    ))}
                  </View>
                  <Text style={s.dSchedule}>{detail.schedule}</Text>

                  {(detail.highlights || []).map((h, i) => (
                    <View key={i} style={s.dBullet}>
                      <MaterialCommunityIcons name="check-circle" size={15} color={colors.acc} style={{ marginTop: 1 }} />
                      <Text style={s.dBulletText}>{h}</Text>
                    </View>
                  ))}

                  <View style={s.dDaysLabelRow}>
                    <Text style={s.dDaysLabel}>THE TRAINING DAYS</Text>
                    <Text style={s.dDaysSwipe}>SWIPE →</Text>
                  </View>
                </View>

                {/* Swipeable day cards — preview: exercise + sets/reps only */}
                <View onLayout={e => { const w = e.nativeEvent.layout.width; if (w && Math.abs(w - cardW) > 1) setCardW(w); }}>
                  {cardW > 0 && (
                    <ScrollView
                      key={detail.id}
                      horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                      onMomentumScrollEnd={e => setDayIdx(Math.round(e.nativeEvent.contentOffset.x / cardW))}
                    >
                      {detail.sessions.map((sess, i) => (
                        <View key={i} style={{ width: cardW, paddingHorizontal: space.lg }}>
                          <View style={s.dDayCard}>
                            <Text style={s.dDayName}>{sess.name.toUpperCase()}</Text>
                            <Text style={s.dDayCount}>{sess.exercises.length} EXERCISES</Text>
                            {sess.exercises.map((ex, j) => (
                              <View key={j} style={s.dDayExRow}>
                                <Text style={s.dDayExName} numberOfLines={1}>{ex.name}</Text>
                                <Text style={s.dDayExSets}>{ex.sets} × {ex.repMin === ex.repMax ? ex.repMin : `${ex.repMin}-${ex.repMax}`}{ex.prog === 'double' ? '+' : ''}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                  <View style={s.dDots}>
                    {detail.sessions.map((_, i) => (
                      <View key={i} style={[s.dDot, i === dayIdx && s.dDotOn]} />
                    ))}
                  </View>
                </View>

                <Text style={s.dFootnote}>“+” = double progression — beat the top of the rep range, then add load. The app guides every lift in the logger.</Text>
              </ScrollView>

              <View style={s.dActivateBar}>
                <TouchableOpacity style={s.dActivateBtn} onPress={() => activate(detail)} disabled={activating} activeOpacity={0.88}>
                  {activating
                    ? <ActivityIndicator color={colors.onAcc} />
                    : <Text style={s.dActivateText}>ACTIVATE THIS PROGRAM</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
}

// ─── Train Shell ──────────────────────────────────────────────────────────────
export default function TrainScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const [tab, setTab] = useState(route.params?.segment === 'programs' ? 'programs' : 'templates'); // 'templates' | 'programs'

  // React to a segment param arriving after mount (e.g. the FAB "Browse PRO programs").
  React.useEffect(() => {
    if (route.params?.segment === 'programs') setTab('programs');
    else if (route.params?.segment === 'templates') setTab('templates');
  }, [route.params?.segment]);

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>TRAIN</Text>
      </View>

      {/* Segment control */}
      <View style={s.segment}>
        <TouchableOpacity
          style={[s.segBtn, tab === 'templates' && s.segBtnOn]}
          onPress={() => setTab('templates')}
        >
          <Text style={[s.segText, tab === 'templates' && s.segTextOn]}>MY TEMPLATES</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.segBtn, tab === 'programs' && s.segBtnOn]}
          onPress={() => setTab('programs')}
        >
          <Text style={[s.segText, tab === 'programs' && s.segTextOn]}>PROGRAMS</Text>
          <View style={s.proPill}><Text style={s.proPillText}>PRO</Text></View>
        </TouchableOpacity>
      </View>

      {tab === 'templates'
        ? <TemplatesPanel navigation={navigation} />
        : <ProgramsPanel />
      }
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md },
  title: { fontFamily: fonts.display, fontSize: 36, color: colors.text, textTransform: 'uppercase' },

  // Segment
  segment: { flexDirection: 'row', marginHorizontal: space.lg, marginBottom: space.lg, borderWidth: 1.5, borderColor: colors.line },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: colors.bg },
  segBtnOn: { backgroundColor: colors.acc },
  segText: { fontFamily: fonts.display, fontSize: 14, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  segTextOn: { color: colors.onAcc },
  proPill: { backgroundColor: colors.acc, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  proPillText: { fontFamily: fonts.bodyBold, fontSize: 8, color: colors.onAcc, letterSpacing: 1.2 },

  panelScroll: { paddingHorizontal: space.lg, paddingBottom: 40 },
  panelIntro: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, lineHeight: 19, marginBottom: space.lg },

  // New template button
  newBtn: { borderWidth: 1.5, borderColor: colors.acc, borderStyle: 'dashed', paddingVertical: 16, alignItems: 'center', marginBottom: space.lg },
  newBtnText: { fontFamily: fonts.display, fontSize: 15, color: colors.acc, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Template card
  card: { borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf, padding: space.md, marginBottom: space.md },
  cardActive: { borderColor: colors.acc },
  activeBadge: { backgroundColor: colors.acc, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, marginBottom: space.sm },
  activeBadgeText: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.onAcc, letterSpacing: 1.5, textTransform: 'uppercase' },
  cardName: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textTransform: 'uppercase', marginBottom: 4 },
  cardMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginBottom: space.md },
  nextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surf2, padding: 12, marginBottom: space.md, borderWidth: 1.5, borderColor: colors.line },
  nextLabel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  nextSession: { fontFamily: fonts.display, fontSize: 14, color: colors.acc, textTransform: 'uppercase' },
  cardActions: { flexDirection: 'row', gap: space.sm },
  actionBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.line2, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.surf2 },
  actionBtnText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  actionBtnDanger: { borderColor: '#3A1512', backgroundColor: '#1A0E0C' },
  actionBtnDangerText: { color: colors.dangerTxt },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text, textTransform: 'uppercase', marginBottom: 8 },
  emptyBody: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },

  // Inline split catalog (empty state)
  catalogLabel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.8, marginBottom: space.md },
  splitCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf, padding: space.md, marginBottom: space.sm },
  splitName: { fontFamily: fonts.display, fontSize: 16, color: colors.text, textTransform: 'uppercase', marginBottom: 4 },
  splitIdeal: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, lineHeight: 17 },
  splitRight: { alignItems: 'center', minWidth: 48 },
  splitDays: { fontFamily: fonts.display, fontSize: 24, color: colors.acc, lineHeight: 28 },
  splitDaysLabel: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.dim, textTransform: 'uppercase', letterSpacing: 1 },
  miniDots: { flexDirection: 'row', gap: 2, marginTop: 6 },
  miniDot: { width: 5, height: 5, backgroundColor: colors.line2 },
  miniDotOn: { backgroundColor: colors.acc },

  // Program card (Pro)
  progCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf, borderRadius: 12, padding: space.md, marginBottom: space.md },
  progTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  progName: { fontFamily: fonts.display, fontSize: 19, color: colors.text, textTransform: 'uppercase' },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: colors.acc, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  proBadgeText: { fontFamily: fonts.bodyBold, fontSize: 8, color: colors.acc, letterSpacing: 1 },
  progMeta: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, letterSpacing: 0.8 },
  progMetaSub: { fontFamily: fonts.body, fontSize: 11, color: colors.dim, marginTop: 2 },

  // Program detail
  detailHead: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  detailBack: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.acc, textTransform: 'uppercase', letterSpacing: 1 },
  dProgName: { fontFamily: fonts.display, fontSize: 30, color: colors.text, textTransform: 'uppercase', lineHeight: 34, marginBottom: space.sm },
  dChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.sm },
  dChip: { borderWidth: 1, borderColor: colors.line2, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  dChipText: { fontFamily: fonts.bodySemi, fontSize: 8.5, color: colors.muted, letterSpacing: 1 },
  dSchedule: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.acc, letterSpacing: 1, marginBottom: space.md },
  dDesc: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, lineHeight: 20, marginBottom: space.md },
  dNoteBox: { borderWidth: 1, borderColor: 'rgba(255,90,30,0.5)', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 13, marginBottom: space.lg },
  dNoteLabel: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.acc, letterSpacing: 1.5, marginBottom: 6 },
  dNote: { fontFamily: fonts.body, fontSize: 12.5, color: colors.text, lineHeight: 19 },
  dSession: { marginBottom: space.lg },
  dSessHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: space.sm },
  dSessName: { fontFamily: fonts.display, fontSize: 17, color: colors.acc, textTransform: 'uppercase', letterSpacing: 0.5 },
  dSessLine: { flex: 1, height: 1.5, backgroundColor: colors.line },
  dExRow: { flexDirection: 'row', gap: 11, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  dExNum: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.dim, width: 20, paddingTop: 2 },
  dExName: { fontFamily: fonts.bodyMed, fontSize: 14, color: colors.text },
  dExMeta: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.acc2, marginTop: 2, letterSpacing: 0.3 },
  dExNote: { fontFamily: fonts.body, fontSize: 11.5, color: colors.muted, lineHeight: 16, marginTop: 3 },
  dExSwap: { fontFamily: fonts.bodySemi, fontSize: 9.5, color: colors.dim, letterSpacing: 0.5, marginTop: 3 },
  dFootnote: { fontFamily: fonts.body, fontSize: 11, color: colors.dim, lineHeight: 16, marginTop: 12, marginHorizontal: space.lg },

  // Highlights bullets
  dBullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 8 },
  dBulletText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text, lineHeight: 19 },

  // Day-card carousel
  dDaysLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.sm },
  dDaysLabel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, letterSpacing: 1.8, textTransform: 'uppercase' },
  dDaysSwipe: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.acc, letterSpacing: 1 },
  dDayCard: { borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf, borderRadius: 14, padding: space.md },
  dDayName: { fontFamily: fonts.display, fontSize: 22, color: colors.acc, textTransform: 'uppercase', letterSpacing: 0.5 },
  dDayCount: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, letterSpacing: 1, marginTop: 2, marginBottom: 10 },
  dDayExRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderTopWidth: 1.5, borderTopColor: colors.line },
  dDayExName: { flex: 1, fontFamily: fonts.bodyMed, fontSize: 14, color: colors.text },
  dDayExSets: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.acc2, fontVariant: ['tabular-nums'] },
  dDots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: space.md },
  dDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line2 },
  dDotOn: { width: 16, backgroundColor: colors.acc },
  dActivateBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: 28, backgroundColor: colors.bg, borderTopWidth: 1.5, borderTopColor: colors.line },
  dActivateBtn: { backgroundColor: colors.acc, borderRadius: 10, paddingVertical: 16, alignItems: 'center', minHeight: 54, justifyContent: 'center' },
  dActivateText: { fontFamily: fonts.display, fontSize: 16, color: colors.onAcc, textTransform: 'uppercase', letterSpacing: 0.5 },
});
