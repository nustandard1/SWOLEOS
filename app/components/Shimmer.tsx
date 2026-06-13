import React, { useEffect, useRef } from 'react';
import { Animated, View, Easing, StyleSheet } from 'react-native';

// Marks the Intelligence identity as "alive": a gentle opacity breathe on the
// whole word plus a light-sweep that passes across it. Pure Animated.
export default function Shimmer({ children, sweepWidth = 150 }: { children: React.ReactNode; sweepWidth?: number }) {
  const x = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sweep = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(1200),
      ]),
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    sweep.start();
    pulse.start();
    return () => { sweep.stop(); pulse.stop(); };
  }, []);

  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-sweepWidth, sweepWidth] });
  const opacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  return (
    <Animated.View style={{ overflow: 'hidden', opacity }}>
      {children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ translateX }, { skewX: '-18deg' }] }]}>
        <View style={{ width: 30, height: '200%', marginTop: '-50%', backgroundColor: 'rgba(255,255,255,0.4)' }} />
      </Animated.View>
    </Animated.View>
  );
}
