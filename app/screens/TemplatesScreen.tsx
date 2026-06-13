import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { supabase } from '../lib/supabase';
import { resolveSplitDef } from '../lib/splitDefinitions';
import { colors, fonts, space } from '../theme/forge';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface Template {
  id: string;
  title: string;
  split_type: string;
  is_active: boolean;
  current_session_index: number;
  session_count: number;
  next_session_name: string;
  created_at: string;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function TemplatesScreen() {
  const navigation = useNavigation<NavProp>();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadTemplates();
    }, [])
  );

  async function loadTemplates() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('workout_templates')
      .select(`
        id, title, split_type, is_active, current_session_index, created_at,
        template_sessions(id, name, session_order)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error || !data) { setLoading(false); return; }

    const mapped: Template[] = data.map((t: any) => {
      const sessions = [...(t.template_sessions || [])].sort(
        (a: any, b: any) => a.session_order - b.session_order
      );
      const idx = t.current_session_index ?? 0;
      const nextSession = sessions[idx % sessions.length];
      return {
        id: t.id,
        title: t.title,
        split_type: t.split_type,
        is_active: t.is_active ?? false,
        current_session_index: idx,
        session_count: sessions.length,
        next_session_name: nextSession?.name ?? '—',
        created_at: t.created_at,
      };
    });

    setTemplates(mapped);
    setLoading(false);
  }

  async function setActive(templateId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Deactivate all, then activate selected
    await supabase.from('workout_templates').update({ is_active: false }).eq('user_id', user.id);
    await supabase.from('workout_templates').update({ is_active: true }).eq('id', templateId);
    loadTemplates();
  }

  async function deleteTemplate(templateId: string) {
    Alert.alert('Delete Program', 'This will permanently delete this program and all its sessions. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('workout_templates').delete().eq('id', templateId);
          loadTemplates();
        }
      },
    ]);
  }

  function getSplitDef(splitType: string) {
    return resolveSplitDef(splitType);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Programs</Text>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => navigation.navigate('SplitPicker')}
        >
          <Text style={styles.createBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.headerSub}>
        Build your own program — from a proven split or fully custom — and add it to your calendar.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.acc} style={{ marginTop: 40 }} />
      ) : templates.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No programs yet</Text>
          <Text style={styles.emptyBody}>
            Create your first training program and SWOLE OS will queue your sessions automatically.
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => navigation.navigate('SplitPicker')}
          >
            <Text style={styles.emptyBtnText}>Choose a Split</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {templates.map(t => {
            const splitDef = getSplitDef(t.split_type);
            return (
              <View key={t.id} style={[styles.card, t.is_active && styles.cardActive]}>
                {t.is_active && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>ACTIVE</Text>
                  </View>
                )}

                <Text style={styles.cardName}>{t.title}</Text>
                <Text style={styles.cardSplit}>{splitDef?.shortName ?? t.split_type} · {t.session_count} sessions</Text>

                {t.is_active && (
                  <View style={styles.nextSessionRow}>
                    <Text style={styles.nextLabel}>Next up</Text>
                    <Text style={styles.nextSession}>{t.next_session_name}</Text>
                  </View>
                )}

                <View style={styles.cardActions}>
                  {!t.is_active && (
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => setActive(t.id)}
                    >
                      <Text style={styles.actionBtnText}>Set Active</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => navigation.navigate('TemplateBuilder', {
                      splitId: t.split_type,
                      templateId: t.id,
                    })}
                  >
                    <Text style={styles.actionBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnDanger]}
                    onPress={() => deleteTemplate(t.id)}
                  >
                    <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// FORGE-styled (was legacy yellow/#e8ff47 — pre-rebrand leftover).
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: space.lg, paddingTop: 16, paddingBottom: 4,
  },
  headerSub: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: space.lg, paddingBottom: 14 },
  title: { fontFamily: fonts.display, color: colors.text, fontSize: 26, textTransform: 'uppercase', letterSpacing: 0.4 },
  createBtn: {
    backgroundColor: colors.acc, borderRadius: 9,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  createBtnText: { fontFamily: fonts.bodyBold, color: colors.onAcc, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 },

  list: { paddingHorizontal: space.lg, paddingBottom: 40 },

  card: {
    backgroundColor: colors.surf, borderRadius: 14,
    padding: space.md, marginBottom: space.md,
    borderWidth: 1.5, borderColor: colors.line,
  },
  cardActive: { borderColor: colors.acc },
  activeBadge: {
    backgroundColor: colors.acc, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start', marginBottom: 10,
  },
  activeBadgeText: { fontFamily: fonts.bodyBold, color: colors.onAcc, fontSize: 9, letterSpacing: 1.2 },
  cardName: { fontFamily: fonts.display, color: colors.text, fontSize: 19, textTransform: 'uppercase', marginBottom: 2 },
  cardSplit: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, marginBottom: space.md },

  nextSessionRow: {
    backgroundColor: colors.accSurf, borderWidth: 1, borderColor: colors.accDim, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: space.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  nextLabel: { fontFamily: fonts.bodySemi, color: colors.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2 },
  nextSession: { fontFamily: fonts.bodyBold, color: colors.acc, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.4 },

  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, backgroundColor: colors.surf2, borderRadius: 9,
    paddingVertical: 9, alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.line2,
  },
  actionBtnText: { fontFamily: fonts.bodySemi, color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  actionBtnDanger: { borderColor: 'rgba(255,90,74,0.3)', backgroundColor: 'rgba(255,90,74,0.06)' },
  actionBtnDangerText: { color: colors.statusLow },

  empty: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32, paddingBottom: 80,
  },
  emptyTitle: { fontFamily: fonts.display, color: colors.text, fontSize: 20, textTransform: 'uppercase', marginBottom: 8 },
  emptyBody: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: {
    backgroundColor: colors.acc, borderRadius: 10,
    paddingHorizontal: 28, paddingVertical: 14,
  },
  emptyBtnText: { fontFamily: fonts.display, color: colors.onAcc, fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5 },
});
