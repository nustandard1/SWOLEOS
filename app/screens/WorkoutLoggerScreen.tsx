import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, SafeAreaView, Alert, ActivityIndicator, Modal,
  FlatList, KeyboardAvoidingView, Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { getLastSession, getProgressionTargets, formatSessionDate, SetData, ExerciseHistory } from '../lib/intelligence';

interface Exercise {
  id: string;
  name: string;
  primary_muscle: string;
}

interface LoggedSet {
  weight: string;
  reps: string;
  rpe: string;
  is_warmup: boolean;
}

interface LoggedExercise {
  exercise: Exercise;
  sets: LoggedSet[];
  history: ExerciseHistory | null;
  showHistory: boolean;
}

export default function WorkoutLoggerScreen({ onFinish }: { onFinish: () => void }) {
  const [sessionName, setSessionName] = useState('');
  const [exercises, setExercises] = useState<LoggedExercise[]>([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
    loadExercises();
    timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  async function loadExercises() {
    const { data } = await supabase
      .from('exercises')
      .select('id, name, primary_muscle')
      .order('name');
    if (data) setAllExercises(data);
  }

  async function addExercise(exercise: Exercise) {
    setShowExercisePicker(false);
    setSearch('');

    let history: ExerciseHistory | null = null;
    if (userId) {
      history = await getLastSession(userId, exercise.id);
    }

    // Pre-fill sets from last session or default to 3 empty sets
    const defaultSets: LoggedSet[] = history?.sets.length
      ? history.sets.map(s => ({
          weight: s.weight?.toString() || '',
          reps: s.reps.toString(),
          rpe: s.rpe?.toString() || '',
          is_warmup: false,
        }))
      : [
          { weight: '', reps: '', rpe: '', is_warmup: false },
          { weight: '', reps: '', rpe: '', is_warmup: false },
          { weight: '', reps: '', rpe: '', is_warmup: false },
        ];

    setExercises(prev => [...prev, {
      exercise,
      sets: defaultSets,
      history,
      showHistory: true,
    }]);
  }

  function updateSet(exIdx: number, setIdx: number, field: keyof LoggedSet, value: string | boolean) {
    setExercises(prev => {
      const updated = [...prev];
      updated[exIdx] = {
        ...updated[exIdx],
        sets: updated[exIdx].sets.map((s, i) =>
          i === setIdx ? { ...s, [field]: value } : s
        ),
      };
      return updated;
    });
  }

  function addSet(exIdx: number) {
    setExercises(prev => {
      const updated = [...prev];
      const lastSet = updated[exIdx].sets[updated[exIdx].sets.length - 1];
      updated[exIdx] = {
        ...updated[exIdx],
        sets: [...updated[exIdx].sets, { ...lastSet, rpe: '' }],
      };
      return updated;
    });
  }

  function removeSet(exIdx: number, setIdx: number) {
    setExercises(prev => {
      const updated = [...prev];
      if (updated[exIdx].sets.length <= 1) return prev;
      updated[exIdx] = {
        ...updated[exIdx],
        sets: updated[exIdx].sets.filter((_, i) => i !== setIdx),
      };
      return updated;
    });
  }

  function removeExercise(exIdx: number) {
    Alert.alert('Remove Exercise', 'Remove this exercise from the session?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        setExercises(prev => prev.filter((_, i) => i !== exIdx));
      }},
    ]);
  }

  async function finishWorkout() {
    if (exercises.length === 0) {
      Alert.alert('No exercises', 'Add at least one exercise before finishing.');
      return;
    }
    if (!userId) return;
    setSaving(true);

    const name = sessionName.trim() || `Workout — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;

    const { data: session, error: sessionError } = await supabase
      .from('workout_sessions')
      .insert({ user_id: userId, session_name: name, performed_at: new Date().toISOString() })
      .select()
      .single();

    if (sessionError || !session) {
      setSaving(false);
      Alert.alert('Error', 'Failed to save workout. Try again.');
      return;
    }

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      const { data: sessionEx } = await supabase
        .from('session_exercises')
        .insert({
          workout_session_id: session.id,
          exercise_id: ex.exercise.id,
          exercise_order: i + 1,
        })
        .select()
        .single();

      if (sessionEx) {
        const setsToInsert = ex.sets
          .filter(s => s.reps && parseInt(s.reps) > 0)
          .map((s, idx) => ({
            session_exercise_id: sessionEx.id,
            set_number: idx + 1,
            weight: s.weight ? parseFloat(s.weight) : null,
            reps: parseInt(s.reps),
            rpe: s.rpe ? parseFloat(s.rpe) : null,
            is_warmup: s.is_warmup,
          }));

        if (setsToInsert.length > 0) {
          await supabase.from('set_logs').insert(setsToInsert);
        }
      }
    }

    setSaving(false);
    Alert.alert('Workout saved!', `${name} has been logged.`, [
      { text: 'Done', onPress: onFinish }
    ]);
  }

  function formatTimer(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const filteredExercises = allExercises.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.primary_muscle.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => Alert.alert('Cancel Workout', 'Discard this session?', [
            { text: 'Keep Going', style: 'cancel' },
            { text: 'Discard', style: 'destructive', onPress: onFinish },
          ])}>
            <Text style={styles.cancelBtn}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.timer}>{formatTimer(elapsedSeconds)}</Text>
          <TouchableOpacity style={styles.finishBtn} onPress={finishWorkout} disabled={saving}>
            {saving ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.finishBtnText}>Finish</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

          {/* Session Name */}
          <TextInput
            style={styles.sessionNameInput}
            placeholder="Session name (e.g. Push Day)"
            placeholderTextColor="#444"
            value={sessionName}
            onChangeText={setSessionName}
          />

          {/* Exercises */}
          {exercises.map((ex, exIdx) => {
            const targets = ex.history ? getProgressionTargets(ex.history.sets) : null;
            return (
              <View key={exIdx} style={styles.exerciseCard}>

                {/* Exercise Header */}
                <View style={styles.exerciseHeader}>
                  <View style={styles.exerciseTitleRow}>
                    <Text style={styles.exerciseName}>{ex.exercise.name}</Text>
                    <Text style={styles.muscleTag}>{ex.exercise.primary_muscle}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeExercise(exIdx)}>
                    <Text style={styles.removeExBtn}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Last Session */}
                {ex.history && (
                  <TouchableOpacity
                    style={styles.historyBanner}
                    onPress={() => setExercises(prev => {
                      const updated = [...prev];
                      updated[exIdx] = { ...updated[exIdx], showHistory: !updated[exIdx].showHistory };
                      return updated;
                    })}
                  >
                    <Text style={styles.historyLabel}>
                      Last session · {formatSessionDate(ex.history.date)}
                    </Text>
                    <Text style={styles.historyToggle}>{ex.showHistory ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                )}

                {ex.history && ex.showHistory && (
                  <View style={styles.historyDetail}>
                    {ex.history.sets.map((s, i) => (
                      <Text key={i} style={styles.historySet}>
                        Set {s.set_number}: {s.weight ? `${s.weight}lbs` : 'BW'} × {s.reps} reps{s.rpe ? ` @ RPE ${s.rpe}` : ''}
                      </Text>
                    ))}
                    <Text style={styles.historyVolume}>
                      Total volume: {ex.history.total_volume.toLocaleString()} lbs · {ex.history.total_reps} reps
                    </Text>

                    {/* Potential Targets */}
                    {targets && (
                      <View style={styles.targetsSection}>
                        <Text style={styles.targetsTitle}>Potential targets:</Text>
                        {Object.values(targets).map((t, i) => (
                          <Text key={i} style={styles.targetItem}>· {t.label}</Text>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* Set Logging */}
                <View style={styles.setHeaderRow}>
                  <Text style={[styles.setHeaderCell, { flex: 0.4 }]}>SET</Text>
                  <Text style={[styles.setHeaderCell, { flex: 1 }]}>WEIGHT</Text>
                  <Text style={[styles.setHeaderCell, { flex: 1 }]}>REPS</Text>
                  <Text style={[styles.setHeaderCell, { flex: 0.8 }]}>RPE</Text>
                  <Text style={[styles.setHeaderCell, { flex: 0.4 }]}></Text>
                </View>

                {ex.sets.map((set, setIdx) => (
                  <View key={setIdx} style={[styles.setRow, set.is_warmup && styles.warmupRow]}>
                    <TouchableOpacity
                      style={[styles.setNumBtn, set.is_warmup && styles.setNumBtnWarmup]}
                      onPress={() => updateSet(exIdx, setIdx, 'is_warmup', !set.is_warmup)}
                    >
                      <Text style={styles.setNumText}>
                        {set.is_warmup ? 'W' : setIdx + 1 - ex.sets.slice(0, setIdx).filter(s => !s.is_warmup).length + ex.sets.slice(0, setIdx).filter(s => !s.is_warmup).length - ex.sets.slice(0, setIdx).filter(s => !s.is_warmup).length}
                      </Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.setInput}
                      placeholder="lbs"
                      placeholderTextColor="#444"
                      keyboardType="decimal-pad"
                      value={set.weight}
                      onChangeText={v => updateSet(exIdx, setIdx, 'weight', v)}
                    />
                    <TextInput
                      style={styles.setInput}
                      placeholder="reps"
                      placeholderTextColor="#444"
                      keyboardType="number-pad"
                      value={set.reps}
                      onChangeText={v => updateSet(exIdx, setIdx, 'reps', v)}
                    />
                    <TextInput
                      style={[styles.setInput, { flex: 0.8 }]}
                      placeholder="RPE"
                      placeholderTextColor="#444"
                      keyboardType="decimal-pad"
                      value={set.rpe}
                      onChangeText={v => updateSet(exIdx, setIdx, 'rpe', v)}
                    />
                    <TouchableOpacity onPress={() => removeSet(exIdx, setIdx)} style={{ flex: 0.4, alignItems: 'center' }}>
                      <Text style={styles.removeSetBtn}>−</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity style={styles.addSetBtn} onPress={() => addSet(exIdx)}>
                  <Text style={styles.addSetBtnText}>+ Add Set</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Add Exercise Button */}
          <TouchableOpacity style={styles.addExerciseBtn} onPress={() => setShowExercisePicker(true)}>
            <Text style={styles.addExerciseBtnText}>+ Add Exercise</Text>
          </TouchableOpacity>

        </ScrollView>

        {/* Exercise Picker Modal */}
        <Modal visible={showExercisePicker} animationType="slide">
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Exercise</Text>
              <TouchableOpacity onPress={() => { setShowExercisePicker(false); setSearch(''); }}>
                <Text style={styles.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder="Search exercises or muscle group..."
              placeholderTextColor="#555"
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            <FlatList
              data={filteredExercises}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.exercisePickerRow} onPress={() => addExercise(item)}>
                  <Text style={styles.exercisePickerName}>{item.name}</Text>
                  <Text style={styles.exercisePickerMuscle}>{item.primary_muscle}</Text>
                </TouchableOpacity>
              )}
              keyboardShouldPersistTaps="handled"
            />
          </SafeAreaView>
        </Modal>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  cancelBtn: { color: '#666', fontSize: 15 },
  timer: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  finishBtn: { backgroundColor: '#e8ff47', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  finishBtnText: { color: '#000', fontWeight: '800', fontSize: 14 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 60 },

  sessionNameInput: {
    color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 20,
    borderBottomWidth: 1, borderBottomColor: '#222', paddingBottom: 10,
  },

  exerciseCard: {
    backgroundColor: '#111', borderRadius: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#1e1e1e', overflow: 'hidden',
  },
  exerciseHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, paddingBottom: 10,
  },
  exerciseTitleRow: { flex: 1, gap: 6 },
  exerciseName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  muscleTag: { color: '#555', fontSize: 12, textTransform: 'capitalize' },
  removeExBtn: { color: '#444', fontSize: 18, paddingLeft: 12 },

  historyBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#0d1a00', paddingHorizontal: 14, paddingVertical: 8,
  },
  historyLabel: { color: '#6a9a00', fontSize: 12, fontWeight: '600' },
  historyToggle: { color: '#6a9a00', fontSize: 10 },

  historyDetail: { backgroundColor: '#0a1400', padding: 14, gap: 4 },
  historySet: { color: '#888', fontSize: 13 },
  historyVolume: { color: '#666', fontSize: 12, marginTop: 6, fontStyle: 'italic' },

  targetsSection: { marginTop: 10, gap: 4 },
  targetsTitle: { color: '#e8ff47', fontSize: 12, fontWeight: '700', marginBottom: 2 },
  targetItem: { color: '#a8cc00', fontSize: 13 },

  setHeaderRow: {
    flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: '#1a1a1a',
  },
  setHeaderCell: { color: '#444', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, flex: 1 },

  setRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6 },
  warmupRow: { opacity: 0.6 },
  setNumBtn: {
    flex: 0.4, width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center',
  },
  setNumBtnWarmup: { backgroundColor: '#1a1a00' },
  setNumText: { color: '#888', fontSize: 12, fontWeight: '700' },
  setInput: {
    flex: 1, color: '#fff', fontSize: 15, fontWeight: '600',
    backgroundColor: '#1a1a1a', borderRadius: 8, padding: 8,
    marginHorizontal: 3, textAlign: 'center',
  },
  removeSetBtn: { color: '#444', fontSize: 20 },

  addSetBtn: { margin: 14, marginTop: 8, paddingVertical: 10, alignItems: 'center' },
  addSetBtnText: { color: '#555', fontSize: 14, fontWeight: '600' },

  addExerciseBtn: {
    borderWidth: 1, borderColor: '#e8ff47', borderRadius: 14, borderStyle: 'dashed',
    paddingVertical: 18, alignItems: 'center', marginTop: 4,
  },
  addExerciseBtnText: { color: '#e8ff47', fontSize: 16, fontWeight: '700' },

  modalSafe: { flex: 1, backgroundColor: '#0a0a0a' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalClose: { color: '#e8ff47', fontSize: 15, fontWeight: '600' },
  searchInput: {
    backgroundColor: '#1a1a1a', color: '#fff', margin: 12, borderRadius: 10,
    padding: 12, fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a',
  },
  exercisePickerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#111',
  },
  exercisePickerName: { color: '#fff', fontSize: 15, flex: 1 },
  exercisePickerMuscle: { color: '#555', fontSize: 12, textTransform: 'capitalize' },
});
