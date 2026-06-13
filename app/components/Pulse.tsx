// @ts-nocheck
import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

// A gentle "heartbeat" — scales + breathes opacity in a slow loop. Built-in
// Animated only (no deps). Wrap any node to make it pulse: the Home INTELLIGENCE
// label, a live status dot, etc.
export default function Pulse({
  children,
  scaleTo = 1.05,
  minOpacity = 0.6,
  duration = 1100,
  style,
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [duration]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, scaleTo] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [minOpacity, 1] });
  return (
    <Animated.View style={[style, { transform: [{ scale }], opacity }]}>
      {children}
    </Animated.View>
  );
}
