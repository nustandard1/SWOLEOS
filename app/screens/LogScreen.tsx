import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';

export default function LogScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Log Workout</Text>
        <Text style={styles.subtitle}>Coming soon — workout logger</Text>
        <View style={styles.options}>
          <TouchableOpacity style={styles.optionCard}>
            <Text style={styles.optionTitle}>Build My Own</Text>
            <Text style={styles.optionSub}>Create a custom session</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionCard}>
            <Text style={styles.optionTitle}>Use a Template</Text>
            <Text style={styles.optionSub}>Start from a saved split</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionCard}>
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
});
