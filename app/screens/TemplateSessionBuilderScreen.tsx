// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Modal, FlatList,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Keyboard, Dimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { resolveSplitDef } from '../lib/splitDefinitions';
import { colors, fonts, space } from '../theme/forge';

function parseRepRange(range) {
  const parts = range.split('-').map(x => parseInt(x.trim())).filter(n => !isNaN(n));
  if (parts.length === 2) return { min: parts[0], max: parts[1] };
  if (parts.length === 1) return { min: parts[0], max: parts[0] };
  return { min: 8, max: 12 };
}

// Alphabetical (after All) — predictable scanning beats anatomical ordering.
const MUSCLE_GROUPS = [
  { label: 'All', value: '' },
  { label: 'Abs', value: 'abs' }, { label: 'Athlete', value: 'athlete' }, { label: 'Back', value: 'back' },
  { label: 'Biceps', value: 'biceps' }, { label: 'Calves', value: 'calves' }, { label: 'Cardio', value: 'cardio' },
  { label: 'Chest', value: 'chest' }, { label: 'Delts', value: 'delts' }, { label: 'Glutes', value: 'glutes' },
  { label: 'Hamstrings', value: 'hamstrings' }, { label: 'Quads', value: 'quads' },
  { label: 'Tactical', value: 'tactical' }, { label: 'Triceps', value: 'triceps' },
];

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

// Alphabetical — zero-friction scanning, same rule as every picker in the app.
const CREATE_MUSCLES = [
  'abs', 'athlete', 'back', 'biceps', 'calves', 'cardio', 'chest',
  'delts', 'glutes', 'hamstrings', 'quads', 'tactical', 'triceps',
];

export default function TemplateSessionBuilderScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { templateId, sessionId, sessionName, splitId, sessionIndex } = route.params;
  const splitDef = resolveSplitDef(splitId);
  const slotDef = splitDef?.sessions[sessionIndex];

  const [exercises, setExercises] = useState([]);
  const [allExercises, setAllExercises] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState(null);

  // ── Keyboard autoscroll — focusing SETS / REP RANGE must never hide the input ──
  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);
  const kbHRef = useRef(336); // sensible default until the OS reports the real height
  const cardRefs = useRef({});
  useEffect(() => {
    const sub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => { if (e?.endCoordinates?.height) kbHRef.current = e.endCoordinates.height; }
    );
    return () => sub.remove();
  }, []);
  function ensureCardVisible(idx) {
    // Small delay so the keyboard's height/animation is underway before measuring.
    setTimeout(() => {
      const node = cardRefs.current[idx];
      if (!node || !scrollRef.current) return;
      node.measureInWindow((x, y, w, h) => {
        if (y == null) return;
        const kbTop = Dimensions.get('window').height - kbHRef.current;
        if (y + h > kbTop - 8) {
          scrollRef.current?.scrollTo({ y: scrollYRef.current + (y + h - (kbTop - 8)), animated: true });
        }
      });
    }, 220);
  }

  // Create-custom-exercise sheet
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createMuscle, setCreateMuscle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);
    const exQuery = supabase.from('exercises').select('id, name, primary_muscle, movement_pattern, sub_group, user_id').order('name');
    const [exRes, sessionExRes] = await Promise.all([
      user ? exQuery.or(`user_id.is.null,user_id.eq.${user.id}`) : exQuery,
      supabase.from('template_session_exercises')
        .select('id, exercise_order, target_sets, target_rep_min, target_rep_max, exercises(id, name, primary_muscle, movement_pattern)')
        .eq('template_session_id', sessionId).order('exercise_order'),
    ]);
    if (exRes.data) setAllExercises(exRes.data);
    if (sessionExRes.data) {
      setExercises(sessionExRes.data.map(row => ({
        id: row.id, exercise: row.exercises,
        target_sets: row.target_sets?.toString() ?? '3',
        target_rep_range: row.target_rep_min === row.target_rep_max
          ? (row.target_rep_min?.toString() ?? '8')
          : `${row.target_rep_min ?? 8}-${row.target_rep_max ?? 12}`,
        exercise_order: row.exercise_order,
      })));
    }
    setLoading(false);
  }

  const activeFilter = MUSCLE_GROUPS.find(mg => mg.value === muscleFilter);
  const filtered = allExercises.filter(e => {
    const ms = !search || e.name.toLowerCase().includes(search.toLowerCase());
    const mf = !muscleFilter || (activeFilter?.filterBy === 'sub' ? (e.primary_muscle === 'back' && e.sub_group === muscleFilter) : e.primary_muscle === muscleFilter);
    return ms && mf;
  });

  function addExercise(ex) {
    if (exercises.find(e => e.exercise.id === ex.id)) return;
    setExercises(prev => [...prev, { exercise: ex, target_sets: '3', target_rep_range: '8-12', exercise_order: prev.length }]);
    setShowPicker(false); setSearch(''); setMuscleFilter('');
  }
  async function createCustomExercise() {
    const name = createName.trim();
    if (!name || !createMuscle) { Alert.alert('Missing info', 'Enter a name and pick a muscle group.'); return; }
    setCreating(true);
    const { data, error } = await supabase
      .from('exercises')
      .insert({ name, primary_muscle: createMuscle, movement_pattern: 'isolation', user_id: userId })
      .select('id, name, primary_muscle, movement_pattern, sub_group, user_id')
      .single();
    setCreating(false);
    if (error || !data) { Alert.alert('Error', 'Could not create the exercise.'); return; }
    setAllExercises(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setShowCreate(false); setCreateName(''); setCreateMuscle('');
    addExercise(data);
  }

  function removeExercise(idx) { setExercises(prev => prev.filter((_, i) => i !== idx)); }
  function moveExercise(idx, dir) {
    setExercises(prev => {
      const ni = idx + dir;
      if (ni < 0 || ni >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[ni]] = [next[ni], next[idx]];
      return next;
    });
  }
  function updateField(idx, field, value) {
    setExercises(prev => { const u = [...prev]; u[idx] = { ...u[idx], [field]: value }; return u; });
  }

  async function saveSession() {
    if (exercises.length === 0) { Alert.alert('No exercises', 'Add at least one exercise before saving.'); return; }
    setSaving(true);
    await supabase.from('template_session_exercises').delete().eq('template_session_id', sessionId);
    const toInsert = exercises.map((e, i) => {
      const { min, max } = parseRepRange(e.target_rep_range);
      return { template_session_id: sessionId, exercise_id: e.exercise.id, exercise_order: i,
        target_sets: parseInt(e.target_sets) || 3, target_rep_min: min, target_rep_max: max, target_rpe: null };
    });
    const { error } = await supabase.from('template_session_exercises').insert(toInsert);
    setSaving(false);
    if (error) Alert.alert('Error', 'Failed to save session.');
    else navigation.goBack();
  }

  const muscleSetCounts = {};
  for (const ex of exercises) {
    const m = ex.exercise.primary_muscle;
    muscleSetCounts[m] = (muscleSetCounts[m] || 0) + (parseInt(ex.target_sets) || 0);
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={s.backBtn}>← BACK</Text></TouchableOpacity>
        <Text style={s.headerTitle}>{sessionName.toUpperCase()}</Text>
        <TouchableOpacity onPress={saveSession} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.acc} size="small" /> : <Text style={s.saveBtn}>SAVE</Text>}
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator color={colors.acc} style={{ marginTop: 40 }} /> : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[s.content, { paddingBottom: 360 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
        >
          {/* Guide banner — only when the split prescribes targets (custom days don't) */}
          {slotDef && slotDef.setTargets.length > 0 && (
            <View style={s.guideBanner}>
              <Text style={s.guideTitle}>SESSION GUIDE</Text>
              <View style={s.guideTargets}>
                {slotDef.setTargets.map((t, i) => {
                  const logged = muscleSetCounts[t.muscle] || 0;
                  const onTrack = logged >= t.min;
                  const over = logged > t.max;
                  const col = logged === 0 ? colors.muted : over ? colors.acc2 : onTrack ? colors.acc : colors.dim;
                  return (
                    <View key={i} style={s.guideTarget}>
                      <Text style={s.guideMuscle}>{cap(t.muscle)}</Text>
                      <Text style={[s.guideCount, { color: col }]}>{logged > 0 ? `${logged} sets` : `${t.min}–${t.max}`}</Text>
                    </View>
                  );
                })}
              </View>
              {slotDef.notes && <Text style={s.guideNote}>{slotDef.notes}</Text>}
            </View>
          )}

          {/* Exercises */}
          {exercises.map((item, idx) => (
            <View key={idx} style={s.exCard} ref={node => { if (node) cardRefs.current[idx] = node; }}>
              <View style={s.exRow}>
                {exercises.length > 1 && (
                  <View style={s.reorderCol}>
                    <TouchableOpacity onPress={() => moveExercise(idx, -1)} disabled={idx === 0} hitSlop={{ top: 6, bottom: 2, left: 8, right: 8 }}>
                      <Text style={[s.reorderArrow, idx === 0 && s.reorderDim]}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveExercise(idx, 1)} disabled={idx === exercises.length - 1} hitSlop={{ top: 2, bottom: 6, left: 8, right: 8 }}>
                      <Text style={[s.reorderArrow, idx === exercises.length - 1 && s.reorderDim]}>▼</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <View style={s.exOrderDot}><Text style={s.exOrderText}>{idx + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.exName}>{item.exercise.name.toUpperCase()}</Text>
                  <Text style={s.exMuscle}>{cap(item.exercise.primary_muscle)}</Text>
                </View>
                <TouchableOpacity onPress={() => removeExercise(idx)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={s.removeBtn}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={s.fieldsRow}>
                <View style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>SETS</Text>
                  <TextInput style={s.fieldInput} value={item.target_sets} onChangeText={v => updateField(idx, 'target_sets', v)} onFocus={() => ensureCardVisible(idx)} keyboardType="number-pad" maxLength={2} selectTextOnFocus />
                </View>
                <View style={s.fieldDivider} />
                <View style={[s.fieldGroup, { flex: 2 }]}>
                  <Text style={s.fieldLabel}>REP RANGE</Text>
                  <TextInput style={s.fieldInput} value={item.target_rep_range} onChangeText={v => updateField(idx, 'target_rep_range', v)} onFocus={() => ensureCardVisible(idx)} keyboardType="numbers-and-punctuation" maxLength={7} placeholder="e.g. 6-8" placeholderTextColor={colors.dim} selectTextOnFocus />
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity style={s.addBtn} onPress={() => setShowPicker(true)}>
            <Text style={s.addBtnText}>+ ADD EXERCISE</Text>
          </TouchableOpacity>

          {exercises.length > 0 && (
            <TouchableOpacity style={s.bottomSave} onPress={saveSession} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={colors.onAcc} /> : <Text style={s.bottomSaveText}>SAVE SESSION</Text>}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* Picker */}
      <Modal visible={showPicker} animationType="slide">
        <SafeAreaView style={s.safe}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.pickerHeader} onStartShouldSetResponderCapture={() => { Keyboard.dismiss(); return false; }}>
              <Text style={s.pickerTitle}>ADD EXERCISE</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                <TouchableOpacity onPress={() => { setCreateName(search.trim()); setCreateMuscle(''); setShowCreate(true); }}>
                  <Text style={s.pickerNew}>+ NEW</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowPicker(false); setSearch(''); setMuscleFilter(''); }}>
                  <Text style={s.pickerDone}>DONE</Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* No autoFocus — the keyboard appears ONLY when the search box is tapped.
                Any touch on the chips or the list (tap OR scroll) drops it again. */}
            <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
              <TextInput style={s.searchInput} placeholder="Search exercises..." placeholderTextColor={colors.dim} value={search} onChangeText={setSearch} />
            </View>
            <View style={s.chipsGrid} onStartShouldSetResponderCapture={() => { Keyboard.dismiss(); return false; }}>
              {MUSCLE_GROUPS.map(mg => (
                <TouchableOpacity key={mg.value} style={[s.chip, muscleFilter === mg.value && s.chipOn]} onPress={() => { Keyboard.dismiss(); setMuscleFilter(mg.value); }}>
                  <Text style={[s.chipText, muscleFilter === mg.value && s.chipTextOn]}>{mg.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <FlatList
              data={filtered}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScrollBeginDrag={() => Keyboard.dismiss()}
              renderItem={({ item }) => {
                const added = !!exercises.find(e => e.exercise.id === item.id);
                return (
                  <TouchableOpacity style={[s.pickerRow, added && s.pickerRowAdded]} onPress={() => !added && addExercise(item)} disabled={added}>
                    <Text style={[s.pickerName, added && s.pickerNameAdded]}>{item.name}{item.user_id ? '  ·  CUSTOM' : ''}</Text>
                    <Text style={s.pickerMuscle}>{added ? '✓ ADDED' : cap(item.primary_muscle)}</Text>
                  </TouchableOpacity>
                );
              }}
              ListFooterComponent={(
                <TouchableOpacity style={s.createRow} onPress={() => { setCreateName(search.trim()); setCreateMuscle(''); setShowCreate(true); }}>
                  <Text style={s.createRowText}>+ CREATE NEW EXERCISE</Text>
                  <Text style={s.createRowSub}>Add your own (private to you)</Text>
                </TouchableOpacity>
              )}
            />
          </KeyboardAvoidingView>
        </SafeAreaView>

        {/* Create custom exercise sheet */}
        <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
          <KeyboardAvoidingView style={s.createBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowCreate(false)} />
            <View style={s.createSheet}>
              <Text style={s.createTitle}>NEW EXERCISE</Text>
              <TextInput style={s.createInput} placeholder="Exercise name" placeholderTextColor={colors.dim} value={createName} onChangeText={setCreateName} autoFocus />
              <Text style={s.createLabel}>MUSCLE GROUP</Text>
              <View style={s.chipsGrid}>
                {CREATE_MUSCLES.map(m => (
                  <TouchableOpacity key={m} style={[s.chip, createMuscle === m && s.chipOn]} onPress={() => setCreateMuscle(m)}>
                    <Text style={[s.chipText, createMuscle === m && s.chipTextOn]}>{cap(m)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={s.createBtnRow}>
                <TouchableOpacity onPress={() => setShowCreate(false)}><Text style={s.createCancel}>CANCEL</Text></TouchableOpacity>
                <TouchableOpacity style={s.createSave} onPress={createCustomExercise} disabled={creating}>
                  {creating ? <ActivityIndicator color={colors.onAcc} size="small" /> : <Text style={s.createSaveText}>CREATE & ADD</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: 14, borderBottomWidth: 1.5, borderBottomColor: colors.line },
  backBtn: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.acc, textTransform: 'uppercase', letterSpacing: 1 },
  headerTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.text, textTransform: 'uppercase' },
  saveBtn: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.acc, textTransform: 'uppercase', letterSpacing: 1 },
  content: { padding: space.md, paddingBottom: 60 },

  guideBanner: { borderWidth: 1.5, borderColor: colors.accDim, backgroundColor: colors.accSurf, padding: space.md, marginBottom: space.lg },
  guideTitle: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.acc, textTransform: 'uppercase', letterSpacing: 1.8, marginBottom: space.md },
  guideTargets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  guideTarget: { borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', minWidth: 70 },
  guideMuscle: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, textTransform: 'uppercase', marginBottom: 3 },
  guideCount: { fontFamily: fonts.bodyBold, fontSize: 13 },
  guideNote: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, lineHeight: 18 },

  exCard: { borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf, padding: space.md, marginBottom: space.sm },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: space.md },
  exOrderDot: { width: 28, height: 28, backgroundColor: colors.acc, alignItems: 'center', justifyContent: 'center' },
  exOrderText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.onAcc },
  exName: { fontFamily: fonts.display, fontSize: 15, color: colors.text, textTransform: 'uppercase', marginBottom: 2 },
  exMuscle: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  removeBtn: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.dim, padding: 4 },

  fieldsRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.line },
  fieldGroup: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  fieldDivider: { width: 1.5, alignSelf: 'stretch', backgroundColor: colors.line },
  fieldLabel: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  fieldInput: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text, padding: 0 },

  addBtn: { borderWidth: 1.5, borderColor: colors.acc, borderStyle: 'dashed', paddingVertical: 18, alignItems: 'center', marginTop: 4 },
  addBtnText: { fontFamily: fonts.display, fontSize: 15, color: colors.acc, textTransform: 'uppercase', letterSpacing: 0.5 },
  reorderCol: { marginRight: 8, justifyContent: 'center' },
  reorderArrow: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted, lineHeight: 15, textAlign: 'center' },
  reorderDim: { color: colors.line2 },
  bottomSave: { backgroundColor: colors.acc, paddingVertical: 17, alignItems: 'center', marginTop: space.lg },
  bottomSaveText: { fontFamily: fonts.display, fontSize: 17, color: colors.onAcc, textTransform: 'uppercase', letterSpacing: 0.5 },

  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 14, borderBottomWidth: 1.5, borderBottomColor: colors.line },
  pickerTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textTransform: 'uppercase' },
  pickerDone: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.acc, textTransform: 'uppercase', letterSpacing: 1 },
  pickerNew: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.acc2, textTransform: 'uppercase', letterSpacing: 1 },
  searchInput: { backgroundColor: colors.surf2, color: colors.text, fontFamily: fonts.bodyMed, fontSize: 15, paddingHorizontal: space.md, paddingVertical: 12, borderWidth: 1.5, borderColor: colors.line },
  chipsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.lg, paddingVertical: space.sm, gap: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf },
  chipOn: { backgroundColor: colors.acc, borderColor: colors.acc },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  chipTextOn: { color: colors.onAcc },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 14, borderBottomWidth: 1.5, borderBottomColor: colors.line },
  pickerRowAdded: { opacity: 0.4 },
  pickerName: { fontFamily: fonts.bodyMed, fontSize: 15, color: colors.text, flex: 1 },
  pickerNameAdded: { color: colors.muted },
  pickerMuscle: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  createRow: { paddingHorizontal: space.lg, paddingVertical: 18, borderTopWidth: 1.5, borderTopColor: colors.line, marginTop: 4 },
  createRowText: { fontFamily: fonts.display, fontSize: 16, color: colors.acc, textTransform: 'uppercase', letterSpacing: 0.5 },
  createRowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
  createBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  createSheet: { backgroundColor: colors.surf, borderTopWidth: 1.5, borderTopColor: colors.line2, padding: space.lg, paddingBottom: space.xl },
  createTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.text, textTransform: 'uppercase', marginBottom: space.md },
  createInput: { backgroundColor: colors.surf2, color: colors.text, fontFamily: fonts.bodyMed, fontSize: 16, paddingHorizontal: space.md, paddingVertical: 14, borderWidth: 1.5, borderColor: colors.line, marginBottom: space.md },
  createLabel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: space.sm },
  createBtnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg },
  createCancel: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  createSave: { backgroundColor: colors.acc, paddingHorizontal: space.lg, paddingVertical: 14 },
  createSaveText: { fontFamily: fonts.display, fontSize: 15, color: colors.onAcc, textTransform: 'uppercase', letterSpacing: 0.5 },
});
