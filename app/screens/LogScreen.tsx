import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { supabase } from '../lib/supabase';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface NextSession {
  templateId: string;
  templateTitle: string;
  sessionId: string;
  sessionName: string;
  exerciseCount: number;
}

export default function LogScreen() {
  const navigation = useNavigation<NavProp>();
  const [nextSession, setNextSession] = useState<NextSession | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadActiveTemplate();
    }, [])
  );

  async function loadActiveTemplate() {
    setLoadingTemplate(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingTemplate(false); return; }

    const { data } = await supabase
      .from('workout_templates')
      .select(`
        id, title, current_session_index,
        template_sessions(id, name, session_order, template_session_exercises(id))
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (data) {
      const sessions = [...(data.template_sessions || [])].sort(
        (a: any, b: any) => a.session_order - b.session_order
      );
      const idx = data.current_session_index ?? 0;
      const next = sessions[idx % sessions.length];
      if (next) {
        setNextSession({
          templateId: data.id,
          templateTitle: data.title,
          sessionId: next.id,
          sessionName: next.name,
          exerciseCount: next.template_session_exercises?.length ?? 0,
        });
      }
    } else {
      setNextSession(null);
    }
    setLoadingTemplate(false);
  }

  async function startTemplateSession() {
    if (!nextSession) {
      navigation.navigate('Tabs', { screen: 'Programs' } as any);
      return;
    }
    if (nextSession.exerciseCount === 0) {
      Alert.alert(
        'Session not built',
        `${nextSession.sessionName} has no exercises yet. Build it out in the Programs tab first.`,
        [{ text: 'OK' }]
      );
      return;
    }
    navigation.navigate('WorkoutLogger', {
      templateSessionId: nextSession.sessionId,
      templateId: nextSession.templateId,
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Log Workout</Text>
        <Text style={styles.subtitle}>How do you want to train today?</Text>
        <View style={styles.options}>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => navigation.navigate('WorkoutLogger', undefined)}
          >
            <Text style={styles.optionTitle}>Build My Own</Text>
            <Text style={styles.optionSub}>Create a custom session</Text>
          </TouchableOpacity>

          {/* Use a Template */}
          {loadingTemplate ? (
            <View style={styles.optionCard}>
              <ActivityIndicator color="#e8ff47" size="small" />
            </View>
          ) : nextSession ? (
            <TouchableOpacity style={[styles.optionCard, styles.optionCardActive]} onPress={startTemplateSession}>
              <View style={styles.nextBadge}>
                <Text style={styles.nextBadgeText}>NEXT UP</Text>
              </View>
              <Text style={styles.optionTitle}>{nextSession.sessionName}</Text>
              <Text style={styles.optionSub}>{nextSession.templateTitle}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.optionCard}
              onPress={() => navigation.navigate('SplitPicker')}
            >
              <Text style={styles.optionTitle}>Use a Template</Text>
              <Text style={styles.optionSub}>Set up a split to get queued sessions</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => navigation.navigate('WorkoutLogger', undefined)}
          >
            <Text style={styles.optionTitle}>Quick Log</Text>
            <Text style={styles.optionSub}>Jump straight in</Text>
          </TouchableOpacity>

        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: '#555', fontSize: 14, marginBottom: 32 },
  options: { gap: 12 },
  optionCard: {
    backgroundColor: '#141414', borderRadius: 14,
    padding: 20, borderWidth: 1, borderColor: '#222',
  },
  optionCardActive: {
    borderColor: '#e8ff47', backgroundColor: '#111',
  },
  nextBadge: {
    backgroundColor: '#e8ff47', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start', marginBottom: 8,
  },
  nextBadgeText: { color: '#000', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  optionTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  optionSub: { color: '#666', fontSize: 13, marginTop: 4 },
});
