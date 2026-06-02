import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';

export default function HistoryScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>History</Text>
        <Text style={styles.subtitle}>Your past sessions will appear here.</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No sessions logged yet.</Text>
          <Text style={styles.emptySubText}>
            Complete your first workout and it will show up here.
          </Text>
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
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySubText: { color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
