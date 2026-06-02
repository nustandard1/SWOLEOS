import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function LogScreen() {
  const navigation = useNavigation<NavProp>();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Log Workout</Text>
        <Text style={styles.subtitle}>How do you want to train today?</Text>
        <View style={styles.options}>
          <TouchableOpacity style={styles.optionCard} onPress={() => navigation.navigate('WorkoutLogger')}>
            <Text style={styles.optionTitle}>Build My Own</Text>
            <Text style={styles.optionSub}>Create a custom session</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.optionCard, styles.optionDisabled]}>
            <Text style={styles.optionTitle}>Use a Template</Text>
            <Text style={styles.optionSub}>Start from a saved split — coming soon</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionCard} onPress={() => navigation.navigate('WorkoutLogger')}>
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
    backgroundColor: '#141414',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#222',
  },
  optionTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  optionSub: { color: '#666', fontSize: 13, marginTop: 4 },
  optionDisabled: { opacity: 0.4 },
});
