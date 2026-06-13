// @ts-nocheck
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

// A pulsing orange radial glow — sits BEHIND a logo/icon to make it feel alive and
// powerful (not floating; the logo stays put, the energy radiates behind it).
export default function GlowPulse({ size = 260, color = '#FF5A1E' }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.12] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] });
  const r = size / 2;
  return (
    <Animated.View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center', transform: [{ scale }], opacity }} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity="0.6" />
            <Stop offset="0.55" stopColor={color} stopOpacity="0.2" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill="url(#glow)" />
      </Svg>
    </Animated.View>
  );
}
