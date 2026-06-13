import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import CountUp from './CountUp';
import { colors, fonts } from '../theme/forge';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Circular training-score ring, stroke colored by score (green/amber/red),
// arc draws from empty to value on mount; number counts up in the center.
export default function ScoreRing({ value, size = 150, stroke = 11 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const color = value >= 75 ? colors.statusGood : value >= 60 ? colors.statusMid : colors.statusLow;

  const av = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    av.setValue(0);
    Animated.timing(av, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value]);
  const strokeDashoffset = av.interpolate({ inputRange: [0, 1], outputRange: [circ, circ * (1 - Math.max(0, Math.min(100, value)) / 100)] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line2} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={circ} strokeDashoffset={strokeDashoffset} strokeLinecap="round"
        />
      </Svg>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <CountUp value={value} duration={1100} style={[s.num, { color }]} />
        <Text style={s.of}>/100</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  num: { fontFamily: fonts.display, fontSize: 48, lineHeight: 52, paddingTop: 6 },
  of: { fontFamily: fonts.display, fontSize: 16, color: colors.muted, marginLeft: 2 },
});
