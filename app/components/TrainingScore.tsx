// @ts-nocheck
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import CountUp from './CountUp';
import GlowPulse from './GlowPulse';
import { colors, fonts, space } from '../theme/forge';

// The hero: one live Training Score (0–100) over a band-colored molten glow, the
// arc drawing in on mount, the number counting up. Pillars exposed below so the
// score is never a black box.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const bandColor = (tone) => (tone === 'good' ? colors.statusGood : tone === 'mid' ? colors.statusMid : colors.statusLow);
const pillarColor = (v) => (v == null ? colors.line2 : v >= 80 ? colors.statusGood : v >= 65 ? colors.statusMid : colors.statusLow);

function Ring({ value, color, trigger }) {
  const size = 156, stroke = 11, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const av = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    av.setValue(0);
    Animated.timing(av, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value, trigger]);
  const dashoffset = av.interpolate({ inputRange: [0, 1], outputRange: [circ, circ * (1 - Math.max(0, Math.min(100, value)) / 100)] });
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surf2} strokeWidth={stroke} fill="none" />
      <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={circ} strokeDashoffset={dashoffset} strokeLinecap="round" />
    </Svg>
  );
}

export default function TrainingScore({ score, trigger }) {
  if (!score) return null;
  const color = bandColor(score.tone);
  const pills = [
    { k: 'CONSISTENCY', v: score.pillars?.consistency },
    { k: 'PROGRESSION', v: score.pillars?.progression },
    { k: 'EFFORT', v: score.pillars?.effort },
  ];
  return (
    <View style={s.wrap}>
      <View style={s.hero}>
        <View style={s.ringWrap}>
          <View pointerEvents="none" style={s.glow}><GlowPulse size={190} color={color} /></View>
          <Ring value={score.overall} color={color} trigger={trigger} />
          <View style={s.ringCenter}>
            <CountUp value={score.overall} trigger={trigger} duration={1100} style={s.scoreNum} />
            <Text style={s.scoreSub}>TRAINING SCORE</Text>
          </View>
        </View>
        <View style={s.labelRow}>
          <Text style={[s.band, { color }]}>{score.band}</Text>
          {score.baseline && <View style={s.baselineTag}><Text style={s.baselineText}>BASELINE</Text></View>}
        </View>
        <Text style={s.caption}>{score.caption}</Text>
      </View>

      <View style={s.pillars}>
        {pills.map(p => (
          <View key={p.k} style={s.pill}>
            <Text style={s.pillVal}>{p.v == null ? '—' : p.v}</Text>
            <Text style={s.pillLbl}>{p.k}</Text>
            <View style={s.pillTrack}>
              <View style={[s.pillFill, { width: `${p.v == null ? 0 : p.v}%`, backgroundColor: pillarColor(p.v) }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  hero: { alignItems: 'center', paddingTop: 6 },
  ringWrap: { width: 156, height: 156, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  scoreNum: { fontFamily: fonts.display, fontSize: 50, lineHeight: 54, color: colors.text, paddingTop: 4 },
  scoreSub: { fontFamily: fonts.bodySemi, fontSize: 8, color: colors.dim, letterSpacing: 2, marginTop: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  band: { fontFamily: fonts.display, fontSize: 17, letterSpacing: 2, textTransform: 'uppercase' },
  baselineTag: { borderWidth: 1, borderColor: colors.line2, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  baselineText: { fontFamily: fonts.bodySemi, fontSize: 8, color: colors.muted, letterSpacing: 1 },
  caption: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, textAlign: 'center', lineHeight: 18, paddingHorizontal: 18, marginTop: 8 },

  pillars: { flexDirection: 'row', gap: 7, marginTop: 18 },
  pill: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 8, alignItems: 'center' },
  pillVal: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  pillLbl: { fontFamily: fonts.bodySemi, fontSize: 7.5, color: colors.muted, letterSpacing: 0.8, marginTop: 1 },
  pillTrack: { height: 3, borderRadius: 2, backgroundColor: colors.surf2, marginTop: 6, width: '100%', overflow: 'hidden' },
  pillFill: { height: '100%', borderRadius: 2 },
});
