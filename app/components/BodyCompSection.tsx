// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, fonts, space } from '../theme/forge';
import { isHealthAvailable, requestHealthPermissions, getBodyMetrics } from '../lib/health';
import { clampBodyMetrics } from '../lib/trendPairs';
import { readBodyComp } from '../lib/bodyComp';

// Same six goals as the Profile selector (both write users.current_phase — edit in
// either place). 'lean_gain' runs the gain pivot; 'none' = observational only.
const PHASES = [
  { k: 'gain', label: 'BULK' },
  { k: 'lean_gain', label: 'LEAN GAIN' },
  { k: 'recomp', label: 'RECOMP' },
  { k: 'maintain', label: 'MAINTAIN' },
  { k: 'lean', label: 'CUT' },
  { k: 'none', label: 'NO GOAL' },
];
// Map UI goal keys → bodyComp engine phases.
const enginePhase = (p) => (p === 'lean_gain' ? 'gain' : p === 'none' ? null : p);

export default function BodyCompSection({ strengthDir }) {
  const [available] = useState(isHealthAvailable());
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);
  const [phase, setPhase] = useState(null);
  const [userId, setUserId] = useState(null);
  const sinceRef = React.useRef(0); // account creation — Health history before the app doesn't count

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      sinceRef.current = user.created_at ? new Date(user.created_at).getTime() : 0;
      const { data } = await supabase.from('users').select('current_phase').eq('id', user.id).maybeSingle();
      if (data?.current_phase) setPhase(data.current_phase);
    }
    if (available) setMetrics(clampBodyMetrics(await getBodyMetrics(), Date.now() - 56 * 86400000));
    setLoading(false);
  }

  async function connect() {
    setLoading(true);
    await requestHealthPermissions();
    setMetrics(clampBodyMetrics(await getBodyMetrics(), Date.now() - 56 * 86400000));
    setLoading(false);
  }

  async function pickPhase(k) {
    const next = phase === k ? null : k;
    setPhase(next);
    if (userId) await supabase.from('users').update({ current_phase: next }).eq('id', userId);
  }

  const everData = metrics && metrics.weight && metrics.weight.length >= 1;
  const read = everData ? readBodyComp({ metrics, phase: enginePhase(phase), strengthDir, maxWindowDays: 14 }) : null;

  return (
    <View style={s.block}>
      <View style={s.head}>
        <MaterialCommunityIcons name="heart-pulse" size={16} color={colors.acc} style={{ marginRight: 8 }} />
        <Text style={s.headLabel}>BODY COMPOSITION</Text>
        <View style={s.line} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.acc} style={{ marginVertical: 16 }} />
      ) : !available ? (
        <View style={s.card}>
          <Text style={s.cardBody}>Apple Health connects in the installed app. Sync your scale or Hume pod and SWOLE/OS reads your body composition against your training.</Text>
        </View>
      ) : !everData ? (
        <View style={s.card}>
          <Text style={s.cardBody}>Connect Apple Health to bring in your weight & body-composition trends — SWOLE/OS reads them against your training to tell training apart from nutrition.</Text>
          <TouchableOpacity style={s.connectBtn} onPress={connect} activeOpacity={0.8}>
            <View style={s.connectIcon}>
              <MaterialCommunityIcons name="heart-pulse" size={16} color="#FF2D55" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.connectText}>CONNECT APPLE HEALTH</Text>
              <Text style={s.connectSub}>Weigh-ins & body comp, read against your training</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={s.phaseLbl}>CURRENT PHASE</Text>
          <View style={s.phaseRow}>
            {PHASES.map(p => (
              <TouchableOpacity key={p.k} style={[s.phaseChip, phase === p.k && s.phaseChipOn]} onPress={() => pickPhase(p.k)} activeOpacity={0.8}>
                <Text style={[s.phaseChipText, phase === p.k && { color: colors.acc }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {read ? (
            <View style={s.readCard}>
              <View style={s.readTop}>
                <Text style={s.readHead}>{read.headline}</Text>
                <View style={[s.tagChip, { borderColor: read.tag.tone === 'good' ? colors.statusGood : read.tag.tone === 'flag' ? colors.statusLow : colors.line2 }]}>
                  <Text style={[s.tagText, { color: read.tag.tone === 'good' ? colors.statusGood : read.tag.tone === 'flag' ? colors.statusLow : colors.muted }]}>{read.tag.label}</Text>
                </View>
              </View>
              <Text style={s.readDetail}>{read.detail}</Text>
              <View style={s.metricRow}>
                <MetricCell label="WEIGHT" delta={read.weightDelta} unit="lb" />
                <MetricCell label="LEAN MASS" delta={read.leanDelta} unit="lb" border />
                <MetricCell label="BODY FAT" delta={read.bodyFatDelta} unit="pt" border />
              </View>
              <Text style={s.windowNote}>Last ~{read.windowDays} days — scale data is noisy, so we read direction, not single weigh-ins. SWOLE/OS folds these into your training analysis as you keep logging.</Text>
            </View>
          ) : (
            <View style={s.card}>
              <Text style={s.cardBody}>Apple Health is connected. Log a few weigh-ins over the next couple of weeks and your body-composition trend appears here — then SWOLE/OS reads it alongside your training.</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function MetricCell({ label, delta, unit, border }) {
  const has = delta != null;
  const up = has && delta > 0.05, down = has && delta < -0.05;
  const color = !has ? colors.dim : up ? colors.acc2 : down ? colors.muted : colors.muted;
  return (
    <View style={[s.metricCell, border && s.metricBorder]}>
      <Text style={[s.metricVal, { color }]}>{has ? `${up ? '+' : ''}${delta.toFixed(1)}` : '—'}</Text>
      <Text style={s.metricLbl}>{label} ({unit})</Text>
    </View>
  );
}

const s = StyleSheet.create({
  block: { marginBottom: space.xl },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  headLabel: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.text, textTransform: 'uppercase', letterSpacing: 1.5 },
  line: { flex: 1, height: 1.5, backgroundColor: colors.line, marginLeft: space.sm },

  card: { borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf, padding: space.md },
  cardBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.muted },
  // Health connect — quiet glass row (Apple Health red heart), matches TrendViews
  connectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 11, paddingVertical: 11, paddingHorizontal: 12, marginTop: space.md,
  },
  connectIcon: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,45,85,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  connectText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.text, textTransform: 'uppercase', letterSpacing: 1 },
  connectSub: { fontFamily: fonts.body, fontSize: 10, color: colors.muted, marginTop: 1 },

  phaseLbl: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: space.sm },
  phaseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.md },
  phaseChip: { flex: 1, borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf, paddingVertical: 9, alignItems: 'center' },
  phaseChipOn: { borderColor: colors.acc, backgroundColor: colors.accSurf },
  phaseChipText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },

  readCard: { borderWidth: 1.5, borderColor: colors.accDim, backgroundColor: colors.accSurf, padding: space.md },
  readTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  readHead: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  tagChip: { borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontFamily: fonts.bodyBold, fontSize: 8, letterSpacing: 1 },
  readDetail: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.muted, marginBottom: space.md },
  metricRow: { flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: colors.accDim, paddingTop: space.md },
  metricCell: { flex: 1, alignItems: 'center' },
  metricBorder: { borderLeftWidth: 1.5, borderLeftColor: colors.line },
  metricVal: { fontFamily: fonts.display, fontSize: 22 },
  metricLbl: { fontFamily: fonts.bodySemi, fontSize: 8, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 },
  windowNote: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, lineHeight: 16, marginTop: space.md },
});
