import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { supabase } from '../lib/supabase';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const [name, setName] = useState('');

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('users')
          .select('name')
          .eq('id', user.id)
          .single();
        if (data?.name) setName(data.name);
      }
    }
    loadUser();
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()}{name ? `, ${name}` : ''}.</Text>
            <Text style={styles.subheading}>Ready to train?</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>FREE</Text>
          </View>
        </View>

        {/* Start Workout CTA */}
        <TouchableOpacity style={styles.startButton} onPress={() => navigation.navigate('WorkoutLogger')}>
          <Text style={styles.startButtonText}>Start Workout</Text>
          <Text style={styles.startButtonSub}>Log today's session</Text>
        </TouchableOpacity>

        {/* Quick Stats */}
        <Text style={styles.sectionTitle}>This Week</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Workouts</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Hard Sets</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>0 lbs</Text>
            <Text style={styles.statLabel}>Total Volume</Text>
          </View>
        </View>

        {/* Recent Activity */}
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No workouts logged yet.</Text>
          <Text style={styles.emptySubText}>
            Start your first session and SWOLE OS will begin tracking your progress.
          </Text>
        </View>

        {/* Intelligence Preview */}
        <Text style={styles.sectionTitle}>Intelligence</Text>
        <View style={styles.intelCard}>
          <Text style={styles.intelTitle}>Log a few sessions to unlock insights.</Text>
          <Text style={styles.intelBody}>
            SWOLE OS will start showing you progression targets, volume analysis, and plateau
            detection once you have training history.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
  },
  greeting: { color: '#fff', fontSize: 24, fontWeight: '700' },
  subheading: { color: '#666', fontSize: 14, marginTop: 2 },
  badge: {
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  badgeText: { color: '#666', fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  startButton: {
    backgroundColor: '#e8ff47',
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  startButtonText: { color: '#000', fontSize: 20, fontWeight: '800' },
  startButtonSub: { color: '#000', fontSize: 13, opacity: 0.6, marginTop: 2 },

  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.5,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222',
    alignItems: 'center',
  },
  statValue: { color: '#e8ff47', fontSize: 20, fontWeight: '800' },
  statLabel: { color: '#666', fontSize: 11, marginTop: 4, textAlign: 'center' },

  emptyCard: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 28,
  },
  emptyText: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 6 },
  emptySubText: { color: '#666', fontSize: 13, lineHeight: 20 },

  intelCard: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1e2a00',
  },
  intelTitle: { color: '#e8ff47', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  intelBody: { color: '#888', fontSize: 13, lineHeight: 20 },
});
