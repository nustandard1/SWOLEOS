import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, TextStyle } from 'react-native';

// Animated number that counts 0 → value on mount / when value changes.
// Base-safe: if it can't run, it still ends on the real value.
export default function CountUp({
  value,
  style,
  duration = 900,
  format,
  trigger,
}: {
  value: number;
  style?: TextStyle | TextStyle[];
  duration?: number;
  format?: (n: number) => string;
  trigger?: any; // change this (e.g. on screen focus) to replay the count-up
}) {
  const [display, setDisplay] = useState(value);
  const av = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    av.setValue(0);
    const id = av.addListener(({ value: p }) => setDisplay(value * p));
    Animated.timing(av, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false })
      .start(() => { setDisplay(value); });
    return () => av.removeListener(id);
  }, [value, trigger]);

  return <Text style={style}>{format ? format(display) : Math.round(display).toString()}</Text>;
}
