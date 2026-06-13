// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { resolveSplitDef } from '../lib/splitDefinitions';
import { defaultDows, buildSchedule } from '../lib/schedule';
import { colors, fonts, space } from '../theme/forge';

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

export default function TemplateBuilderScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { splitId, templateId } = route.params;
  const splitDef = resolveSplitDef(splitId);

  const [templateName, setTemplateName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState(templateId ?? null);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    if (!templateId) setTemplateName(splitDef.shortName);
  }, []);

  useFocusEffect(useCallback(() => {
    if (activeTemplateId) loadExisting(activeTemplateId);
  }, [activeTemplateId]));

  async function loadExisting(id) {
    setLoading(true);
    const { data } = await supabase
      .from('workout_templates')
      .select(`title, template_sessions(id, name, session_order, scheduled_dow,
        template_session_exercises(id, target_sets, exercises(primary_muscle)))`)
      .eq('id', id).single();
    if (data) {
      setTemplateName(data.title);
      const sorted = [...(data.template_sessions || [])].sort((a, b) => a.session_order - b.session_order);
      setSessions(sorted.map(s => {
        const exList = s.template_session_exercises || [];
        const muscle_sets = {};
        for (const ex of exList) {
          const m = ex.exercises?.primary_muscle;
          if (m) muscle_sets[m] = (muscle_sets[m] || 0) + (ex.target_sets || 0);
        }
        return { id: s.id, name: s.name, session_order: s.session_order, exercise_count: exList.length, muscle_sets, scheduled_dow: s.scheduled_dow ?? null };
      }));
    }
    setLoading(false);
  }

  async function createTemplate() {
    if (!templateName.trim()) { Alert.alert('Name required', 'Give your template a name first.'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { data: tmpl, error } = await supabase.from('workout_templates').insert({
      user_id: user.id, title: templateName.trim(), split_type: splitId,
      is_active: false, current_session_index: 0, description: splitDef.description,
    }).select().single();
    if (error || !tmpl) { Alert.alert('Error', 'Failed to create template.'); setSaving(false); return; }
    // Lay out only daysPerWeek training days — extra session variants (A/B) rotate in.
    const dows = defaultDows(splitDef.daysPerWeek || splitDef.sessions.length);
    const inserts = splitDef.sessions.map((s, i) => ({ template_id: tmpl.id, name: s.name, session_order: i, focus_muscles: s.focusMuscles, scheduled_dow: dows[i] ?? null }));
    const { data: created } = await supabase.from('template_sessions').insert(inserts).select();
    setActiveTemplateId(tmpl.id);
    setSessions((created || []).sort((a, b) => a.session_order - b.session_order)
      .map(s => ({ id: s.id, name: s.name, session_order: s.session_order, exercise_count: 0, muscle_sets: {}, scheduled_dow: s.scheduled_dow ?? null })));
    setSaving(false);
  }

  // Assign a weekday to a session (toggle off if tapped again). One session per day —
  // assigning a day that's taken frees it from the other session.
  async function setSessionDow(sessionId, dow) {
    const target = sessions.find(s => s.id === sessionId);
    const newDow = target?.scheduled_dow === dow ? null : dow;
    const conflict = newDow != null ? sessions.find(s => s.id !== sessionId && s.scheduled_dow === dow) : null;
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) return { ...s, scheduled_dow: newDow };
      if (conflict && s.id === conflict.id) return { ...s, scheduled_dow: null };
      return s;
    }));
    if (conflict) await supabase.from('template_sessions').update({ scheduled_dow: null }).eq('id', conflict.id);
    await supabase.from('template_sessions').update({ scheduled_dow: newDow }).eq('id', sessionId);
  }

  async function saveTitle() {
    if (!activeTemplateId || !templateName.trim()) return;
    await supabase.from('workout_templates').update({ title: templateName.trim() }).eq('id', activeTemplateId);
  }

  // Finish the build — optionally setting this template active ON THE SPOT (no detour
  // through the Train tab). Same semantics as TemplatesScreen's SET ACTIVE: one active
  // template per user.
  async function finishTemplate(activate) {
    if (!activeTemplateId) { navigation.navigate('Tabs'); return; }
    if (activate) {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('workout_templates').update({ is_active: false }).eq('user_id', user.id);
        await supabase.from('workout_templates').update({ is_active: true }).eq('id', activeTemplateId);
      }
      setSaving(false);
    }
    navigation.navigate('Tabs');
  }

  // Effective scheduled day per session (explicit, else auto-default) — for chip highlight.
  const effDow = {};
  { const map = buildSchedule(sessions); for (const dow in map) effDow[map[dow].id] = +dow; }

  const isCreated = !!activeTemplateId;
  const pct = sessions.length === 0 ? 0 : Math.round((sessions.filter(s => s.exercise_count > 0).length / sessions.length) * 100);
  const allFilled = sessions.length > 0 && sessions.every(s => s.exercise_count > 0);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.cancelBtn}>{isCreated ? '← BACK' : 'CANCEL'}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{isCreated ? 'BUILD TEMPLATE' : 'NAME TEMPLATE'}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Split pill */}
        <View style={s.splitPill}>
          <Text style={s.splitPillName}>{splitDef.shortName.toUpperCase()}</Text>
          <Text style={s.splitPillDays}>{splitDef.daysPerWeek} DAYS/WEEK</Text>
        </View>

        {/* Name */}
        <Text style={s.label}>NAME YOUR TEMPLATE</Text>
        <TextInput
          style={s.nameInput}
          value={templateName}
          onChangeText={setTemplateName}
          placeholder={splitDef.shortName}
          placeholderTextColor={colors.dim}
          onBlur={isCreated ? saveTitle : undefined}
        />

        {!isCreated ? (
          <>
            <Text style={s.hint}>You'll build out each training day individually after creating your template.</Text>
            <TouchableOpacity style={s.primaryBtn} onPress={createTemplate} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={colors.onAcc} /> : <Text style={s.primaryBtnText}>CREATE TEMPLATE →</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Progress */}
            <View style={s.progressRow}>
              <Text style={s.progressLabel}>SESSIONS BUILT</Text>
              <Text style={s.progressPct}>{pct}%</Text>
            </View>
            <View style={s.progressTrack}><View style={[s.progressFill, { width: `${pct}%` }]} /></View>

            <Text style={s.sessionsLabel}>BUILD YOUR TRAINING DAYS</Text>
            <Text style={s.sessionsSub}>Tap each day to add exercises and targets.</Text>

            {loading ? <ActivityIndicator color={colors.acc} style={{ marginTop: 20 }} /> : (
              sessions.map((sess, i) => {
                const slotDef = splitDef.sessions[i];
                const built = sess.exercise_count > 0;
                return (
                  <View key={sess.id} style={{ marginBottom: space.md }}>
                  <TouchableOpacity
                    style={[s.sessionCard, { marginBottom: 0 }]}
                    onPress={() => navigation.navigate('TemplateSessionBuilder', {
                      templateId: activeTemplateId, sessionId: sess.id, sessionName: sess.name, splitId, sessionIndex: i,
                    })}
                    activeOpacity={0.75}
                  >
                    <View style={s.sessionLeft}>
                      <View style={[s.sessionDot, built && s.sessionDotOn]}>
                        <Text style={[s.sessionDotText, built && s.sessionDotTextOn]}>{built ? '✓' : (i + 1)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.sessionName}>{sess.name.toUpperCase()}</Text>
                        {slotDef?.focusMuscles.length > 0 && (
                          <Text style={s.sessionMuscles}>{slotDef.focusMuscles.map(cap).join(' · ')}</Text>
                        )}
                        {slotDef?.setTargets.length > 0 && !built && (
                          <View style={s.targetsGuide}>
                            {slotDef.setTargets.map((t, ti) => (
                              <View key={ti} style={s.targetGuideTag}>
                                <Text style={s.targetGuideText}>{cap(t.muscle)}: {t.min}–{t.max}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={s.sessionRight}>
                      {built ? (
                        <View style={s.muscleSetTags}>
                          {Object.entries(sess.muscle_sets).sort((a, b) => b[1] - a[1]).map(([m, n]) => (
                            <View key={m} style={s.muscleSetTag}>
                              <Text style={s.muscleSetTagText}>{cap(m)} <Text style={s.muscleSetCount}>{n}</Text></Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={s.addEx}>TAP TO BUILD</Text>
                      )}
                      <Text style={s.chevron}>›</Text>
                    </View>
                  </TouchableOpacity>
                  {/* Weekday scheduling */}
                  <View style={s.dowRow}>
                    <Text style={s.dowRowLabel}>DAY</Text>
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, di) => {
                      const on = effDow[sess.id] === di;
                      return (
                        <TouchableOpacity key={di} style={[s.dowChip, on && s.dowChipOn]} onPress={() => setSessionDow(sess.id, di)} activeOpacity={0.7}>
                          <Text style={[s.dowChipText, on && s.dowChipTextOn]}>{d}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  </View>
                );
              })
            )}

            {/* Weekly volume reference — working sets per muscle across all days */}
            {(() => {
              const wv = {};
              for (const sx of sessions) for (const m in (sx.muscle_sets || {})) wv[m] = (wv[m] || 0) + sx.muscle_sets[m];
              const entries = Object.entries(wv).sort((a, b) => b[1] - a[1]);
              if (!entries.length) return null;
              return (
                <View style={s.weeklyBox}>
                  <Text style={s.weeklyLabel}>WEEKLY SETS PER MUSCLE</Text>
                  <View style={s.weeklyTags}>
                    {entries.map(([m, n]) => (
                      <View key={m} style={s.weeklyTag}>
                        <Text style={s.weeklyTagText}>{cap(m)} <Text style={s.weeklyTagCount}>{n}</Text></Text>
                      </View>
                    ))}
                  </View>
                  <Text style={s.weeklyHint}>A quick balance check — make sure no muscle is starved or buried.</Text>
                </View>
              );
            })()}

            {allFilled ? (
              <>
                <TouchableOpacity style={s.doneBtn} onPress={() => finishTemplate(true)} disabled={saving} activeOpacity={0.85}>
                  {saving ? <ActivityIndicator color={colors.onAcc} /> : <Text style={s.doneBtnText}>SET ACTIVE & FINISH ✓</Text>}
                </TouchableOpacity>
                <Text style={s.doneSub}>It'll be placed on your calendar.</Text>
                <TouchableOpacity style={s.finishQuiet} onPress={() => finishTemplate(false)} disabled={saving} activeOpacity={0.8}>
                  <Text style={s.finishQuietText}>FINISH WITHOUT ACTIVATING</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={s.setActiveHint}>Build every training day to finish — you can set it active right here when it's ready.</Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: 14, borderBottomWidth: 1.5, borderBottomColor: colors.line },
  cancelBtn: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.acc, textTransform: 'uppercase', letterSpacing: 1 },
  headerTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.text, textTransform: 'uppercase' },
  content: { padding: space.lg, paddingBottom: 60 },

  splitPill: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf, paddingHorizontal: space.md, paddingVertical: 10, marginBottom: space.xl, borderRadius: 12 },
  splitPillName: { fontFamily: fonts.display, fontSize: 13, color: colors.acc, textTransform: 'uppercase' },
  splitPillDays: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, letterSpacing: 0.5 },

  label: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.8, marginBottom: 8 },
  nameInput: { backgroundColor: colors.surf2, color: colors.text, fontFamily: fonts.display, fontSize: 18, textTransform: 'uppercase', paddingHorizontal: space.md, paddingVertical: 14, borderWidth: 1.5, borderColor: colors.line, marginBottom: space.md, borderRadius: 10 },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, lineHeight: 20, marginBottom: space.xl },

  primaryBtn: { backgroundColor: colors.acc, paddingVertical: 18, alignItems: 'center', borderRadius: 10 },
  primaryBtnText: { fontFamily: fonts.display, fontSize: 17, color: colors.onAcc, textTransform: 'uppercase' },

  weeklyBox: { borderWidth: 1.5, borderColor: colors.accDim, backgroundColor: colors.accSurf, padding: space.md, marginTop: space.sm, marginBottom: space.lg, borderRadius: 12 },
  weeklyLabel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.acc, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: space.sm },
  weeklyTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  weeklyTag: { borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf, paddingHorizontal: 9, paddingVertical: 5 },
  weeklyTagText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  weeklyTagCount: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.acc2 },
  weeklyHint: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: space.sm, lineHeight: 16 },

  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  progressPct: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.acc },
  progressTrack: { height: 3, backgroundColor: colors.line2, marginBottom: space.xl, borderRadius: 1.5, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: colors.acc },

  sessionsLabel: { fontFamily: fonts.display, fontSize: 15, color: colors.acc, textTransform: 'uppercase', marginBottom: 4 },
  sessionsSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginBottom: space.md },

  sessionCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf, padding: space.md, marginBottom: space.sm, borderRadius: 12 },
  sessionLeft: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 },
  sessionDot: { width: 32, height: 32, borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' },
  sessionDotOn: { backgroundColor: colors.acc, borderColor: colors.acc },
  sessionDotText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },
  sessionDotTextOn: { color: colors.onAcc },
  sessionName: { fontFamily: fonts.display, fontSize: 15, color: colors.text, textTransform: 'uppercase', marginBottom: 3 },
  sessionMuscles: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginBottom: 6 },
  targetsGuide: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  targetGuideTag: { borderWidth: 1, borderColor: colors.accDim, backgroundColor: colors.accSurf, paddingHorizontal: 7, paddingVertical: 2 },
  targetGuideText: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.acc2, textTransform: 'uppercase' },

  sessionRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muscleSetTags: { alignItems: 'flex-end', gap: 4 },
  muscleSetTag: { borderWidth: 1, borderColor: colors.accDim, backgroundColor: colors.accSurf, paddingHorizontal: 7, paddingVertical: 2 },
  muscleSetTagText: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase' },
  muscleSetCount: { color: colors.acc, fontFamily: fonts.bodyBold },
  addEx: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  chevron: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.dim },
  dowRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingLeft: 2 },
  dowRowLabel: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.dim, letterSpacing: 1, marginRight: 4 },
  dowChip: { flex: 1, height: 30, borderWidth: 1.5, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surf, borderRadius: 8 },
  dowChipOn: { backgroundColor: colors.acc, borderColor: colors.acc },
  dowChipText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted },
  dowChipTextOn: { color: colors.onAcc },

  doneBtn: { backgroundColor: colors.acc, paddingVertical: 18, alignItems: 'center', marginTop: space.md, marginBottom: space.sm, borderRadius: 10 },
  doneBtnText: { fontFamily: fonts.display, fontSize: 17, color: colors.onAcc, textTransform: 'uppercase' },
  setActiveHint: { fontFamily: fonts.bodyMed, fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19, paddingTop: 12 },
  doneSub: { fontFamily: fonts.bodyMed, fontSize: 12, color: colors.muted, textAlign: 'center', marginBottom: space.sm },
  finishQuiet: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20 },
  finishQuietText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.dim, textTransform: 'uppercase', letterSpacing: 1.5 },
});
