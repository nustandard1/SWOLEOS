import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';

type Goal = 'build_muscle' | 'get_stronger' | 'hybrid_tactical_athlete' | 'fat_loss' | 'general_fitness';
type Muscle = 'chest' | 'back' | 'delts' | 'arms' | 'quads' | 'hamstrings' | 'glutes' | 'calves';

const GOALS = [
  { key: 'build_muscle', label: 'Build Muscle' },
  { key: 'get_stronger', label: 'Get Stronger' },
  { key: 'hybrid_tactical_athlete', label: 'Hybrid / Tactical / Athlete' },
  { key: 'fat_loss', label: 'Fat Loss' },
  { key: 'general_fitness', label: 'General Fitness' },
];

const DAYS = [2, 3, 4, 5, 6];

const MUSCLES: { key: Muscle; label: string }[] = [
  { key: 'chest', label: 'Chest' },
  { key: 'back', label: 'Back' },
  { key: 'delts', label: 'Delts' },
  { key: 'arms', label: 'Arms' },
  { key: 'quads', label: 'Quads' },
  { key: 'hamstrings', label: 'Hamstrings' },
  { key: 'glutes', label: 'Glutes' },
  { key: 'calves', label: 'Calves' },
];

const NO_FOCUS_KEY = 'balanced';

// Volume recommendations by goal (sets/week)
const VOLUME_TARGETS: Record<string, Record<string, string>> = {
  build_muscle: {
    chest: '12–18', back: '12–18', delts: '14–22', arms: '10–16',
    quads: '12–18', hamstrings: '10–16', glutes: '10–16', calves: '8–14',
  },
  get_stronger: {
    chest: '8–14', back: '10–16', delts: '8–12', arms: '6–10',
    quads: '10–16', hamstrings: '8–14', glutes: '8–12', calves: '6–10',
  },
  hybrid_tactical_athlete: {
    chest: '10–16', back: '12–18', delts: '10–16', arms: '8–12',
    quads: '10–16', hamstrings: '10–14', glutes: '8–12', calves: '6–10',
  },
  fat_loss: {
    chest: '10–16', back: '10–16', delts: '10–14', arms: '8–12',
    quads: '10–14', hamstrings: '8–12', glutes: '10–14', calves: '6–10',
  },
  general_fitness: {
    chest: '8–12', back: '8–14', delts: '8–12', arms: '6–10',
    quads: '8–12', hamstrings: '6–10', glutes: '6–10', calves: '4–8',
  },
};

export default function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<Goal[]>([]);

  function toggleGoal(g: Goal) {
    if (goal.includes(g)) {
      setGoal(goal.filter(x => x !== g));
    } else {
      setGoal([...goal, g]);
    }
  }
  const [days, setDays] = useState<number | null>(null);
  const [muscles, setMuscles] = useState<Muscle[]>([]);
  const [balanced, setBalanced] = useState(false);
  const [saving, setSaving] = useState(false);

  function toggleMuscle(m: Muscle) {
    if (muscles.includes(m)) {
      setMuscles(muscles.filter(x => x !== m));
    } else if (muscles.length < 3) {
      setMuscles([...muscles, m]);
    }
  }

  async function finish() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('users').update({
      goal: goal.join(','),
      training_days_per_week: days,
    }).eq('id', user.id);

    if (muscles.length > 0) {
      await supabase.from('user_priority_muscles').insert(
        muscles.map(m => ({ user_id: user.id, muscle_group: m }))
      );
    }

    setSaving(false);
    onComplete();
  }

  // Step 1 — Goal
  if (step === 1) return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.stepLabel}>Step 1 of 4</Text>
        <Text style={styles.question}>What are your training goals?</Text>
        <Text style={styles.subtext}>Select all that apply.</Text>
        <View style={styles.options}>
          {GOALS.map(g => (
            <TouchableOpacity
              key={g.key}
              style={[styles.optionBtn, goal.includes(g.key as Goal) && styles.optionSelected]}
              onPress={() => toggleGoal(g.key as Goal)}
            >
              <Text style={[styles.optionText, goal.includes(g.key as Goal) && styles.optionTextSelected]}>
                {g.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[styles.nextBtn, goal.length === 0 && styles.nextBtnDisabled]}
          onPress={() => goal.length > 0 && setStep(2)}
          disabled={goal.length === 0}
        >
          <Text style={styles.nextBtnText}>Next</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  // Step 2 — Training Days
  if (step === 2) return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.stepLabel}>Step 2 of 4</Text>
        <Text style={styles.question}>How many days per week do you want to train?</Text>
        <View style={styles.daysRow}>
          {DAYS.map(d => (
            <TouchableOpacity
              key={d}
              style={[styles.dayBtn, days === d && styles.optionSelected]}
              onPress={() => setDays(d)}
            >
              <Text style={[styles.dayText, days === d && styles.optionTextSelected]}>
                {d === 6 ? '6+' : d}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[styles.nextBtn, !days && styles.nextBtnDisabled]}
          onPress={() => days && setStep(3)}
          disabled={!days}
        >
          <Text style={styles.nextBtnText}>Next</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setStep(1)} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  // Step 3 — Priority Muscles
  if (step === 3) return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.stepLabel}>Step 3 of 4</Text>
        <Text style={styles.question}>Any body parts you want to prioritize?</Text>
        <Text style={styles.subtext}>Choose up to 3, or select Balanced.</Text>

        {/* Balanced option */}
        <TouchableOpacity
          style={[styles.optionBtn, { marginBottom: 16 }, balanced && styles.optionSelected]}
          onPress={() => { setBalanced(!balanced); setMuscles([]); }}
        >
          <Text style={[styles.optionText, balanced && styles.optionTextSelected]}>
            No Focus / Balanced
          </Text>
        </TouchableOpacity>

        <View style={[styles.muscleGrid, balanced && { opacity: 0.3 }]}>
          {MUSCLES.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[
                styles.muscleBtn,
                muscles.includes(m.key) && styles.optionSelected,
                (!muscles.includes(m.key) && muscles.length >= 3) && styles.muscleBtnDisabled,
              ]}
              onPress={() => { if (!balanced) toggleMuscle(m.key); }}
            >
              <Text style={[
                styles.muscleText,
                muscles.includes(m.key) && styles.optionTextSelected,
              ]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.nextBtn, (!balanced && muscles.length === 0) && styles.nextBtnDisabled]}
          onPress={() => (balanced || muscles.length > 0) && setStep(4)}
          disabled={!balanced && muscles.length === 0}
        >
          <Text style={styles.nextBtnText}>Next</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setStep(2)} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  // Step 4 — Summary
  if (step === 4) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.stepLabel}>Step 4 of 4</Text>
          <Text style={styles.question}>You're all set.</Text>
          <Text style={styles.subtext}>Here's how SWOLE OS works.</Text>

          <View style={styles.notesCard}>
            <Text style={styles.noteText}>
              After a few sessions, you'll start seeing exactly how much quality volume you're doing
              per muscle group, whether or not you're demonstrating progressive overload, and
              recommendations on how to attack future sessions and weeks.
            </Text>
          </View>

          <View style={styles.recommendCard}>
            <View style={styles.recommendRow}>
              <Text style={styles.recommendMuscle}>General volume guideline</Text>
            </View>
            <View style={[styles.recommendRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.noteText}>
                Most muscle groups: <Text style={{ color: '#e8ff47', fontWeight: '700' }}>6–18 hard working sets/week</Text> depending on your training style, intensity, and recovery capacity. SWOLE OS will track this for you automatically.
              </Text>
            </View>
          </View>

          <View style={styles.notesCard}>
            <Text style={styles.noteText}>
              Priority muscles should be trained 2–3x per week when possible.
            </Text>
            <Text style={styles.noteText}>
              Non-priority muscles: 1–2x per week is plenty.
            </Text>
            <Text style={styles.noteText}>
              Every workout logged makes SWOLE OS smarter about your training.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.nextBtn}
            onPress={finish}
            disabled={saving}
          >
            <Text style={styles.nextBtnText}>
              {saving ? 'Saving...' : "Let's Train"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  container: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40 },

  stepLabel: { color: '#555', fontSize: 13, fontWeight: '600', marginBottom: 12, letterSpacing: 1 },
  question: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 8, lineHeight: 34 },
  subtext: { color: '#666', fontSize: 14, marginBottom: 24 },

  options: { gap: 10, marginBottom: 32 },
  optionBtn: {
    backgroundColor: '#141414',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  optionSelected: {
    backgroundColor: '#1a2200',
    borderColor: '#e8ff47',
  },
  optionText: { color: '#aaa', fontSize: 16, fontWeight: '600' },
  optionTextSelected: { color: '#e8ff47' },

  daysRow: { flexDirection: 'row', gap: 10, marginBottom: 32 },
  dayBtn: {
    flex: 1,
    backgroundColor: '#141414',
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  dayText: { color: '#aaa', fontSize: 18, fontWeight: '700' },

  muscleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 32,
  },
  muscleBtn: {
    backgroundColor: '#141414',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  muscleBtnDisabled: { opacity: 0.4 },
  muscleText: { color: '#aaa', fontSize: 15, fontWeight: '600' },

  nextBtn: {
    backgroundColor: '#e8ff47',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },

  backBtn: { alignItems: 'center', paddingVertical: 8 },
  backText: { color: '#555', fontSize: 14 },

  recommendCard: {
    backgroundColor: '#141414',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 16,
    overflow: 'hidden',
  },
  recommendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  recommendLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recommendMuscle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  priorityTag: {
    backgroundColor: '#1a2200',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#e8ff47',
  },
  priorityTagText: { color: '#e8ff47', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  recommendTarget: { color: '#888', fontSize: 13 },

  notesCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginBottom: 32,
  },
  noteText: { color: '#666', fontSize: 13, lineHeight: 20 },
});
