// @ts-nocheck
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import CountUp from './CountUp';
import GlowPulse from './GlowPulse';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts } from '../theme/forge';

// Compact Training Score for Home — the daily glance that taps into the full
// Intelligence screen. Keeps the ring alive: band-colored glow + arc draw + count-up.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const bandColor = (tone) => (tone === 'good' ? colors.statusGood : tone === 'mid' ? colors.statusMid : colors.statusLow);
const TINT = { good: 'rgba(70,194,106,0.06)', mid: 'rgba(255,138,61,0.06)', flag: 'rgba(255,90,74,0.06)' };
const BORDER = { good: 'rgba(70,194,106,0.22)', mid: 'rgba(255,138,61,0.22)', flag: 'rgba(255,90,74,0.22)' };

function MiniRing({ value, color, trigger }) {
  const size = 60, stroke = 6, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const av = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    av.setValue(0);
    Animated.timing(av, { toValue: 1, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value, trigger]);
  const dashoffset = av.interpolate({ inputRange: [0, 1], outputRange: [circ, circ * (1 - Math.max(0, Math.min(100, value)) / 100)] });
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surf2} strokeWidth={stroke} fill="none" />
      <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={circ} strokeDashoffset={dashoffset} strokeLinecap="round" />
    </Svg>
  );
}

export default function ScoreChip({ score, trigger, onPress }) {
  if (!score) return null;
  const color = bandColor(score.tone);
  return (
    <TouchableOpacity
      style={[s.card, { borderColor: BORDER[score.tone] || colors.line2, backgroundColor: TINT[score.tone] || colors.surf }]}
      onPress={onPress} activeOpacity={0.85}
    >
      <View style={s.ringWrap}>
        <View pointerEvents="none" style={s.glow}><GlowPulse size={74} color={color} /></View>
        <MiniRing value={score.overall} color={color} trigger={trigger} />
        <View style={s.ringCenter}><CountUp value={score.overall} trigger={trigger} duration={1000} style={s.num} /></View>
      </View>
      <View style={s.col}>
        <Text style={s.kicker}>TRAINING SCORE</Text>
        <Text style={[s.band, { color }]}>{score.band}{score.baseline ? ' · BASELINE' : ''}</Text>
        <Text style={s.cap} numberOfLines={2}>{score.caption}</Text>
      </View>
      <View style={s.more}>
        <Text style={s.moreText}>SEE{'\n'}MORE</Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderRadius: 15, paddingVertical: 12, paddingHorizontal: 14, overflow: 'hidden' },
  ringWrap: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  num: { fontFamily: fonts.display, fontSize: 23, color: colors.text, lineHeight: 25 },
  col: { flex: 1 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 8, color: colors.muted, letterSpacing: 1.5, textTransform: 'uppercase' },
  band: { fontFamily: fonts.display, fontSize: 18, letterSpacing: 1, textTransform: 'uppercase', marginTop: 1 },
  cap: { fontFamily: fonts.body, fontSize: 10.5, color: colors.muted, lineHeight: 14, marginTop: 2 },
  more: { flexDirection: 'row', alignItems: 'center' },
  moreText: { fontFamily: fonts.bodySemi, fontSize: 8, color: colors.muted, letterSpacing: 1, textAlign: 'right', lineHeight: 10 },
});
