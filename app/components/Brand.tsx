import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme/forge';

// ─── App Icon — "Loaded Bar" ─────────────────────────────────────────────────
export function AppIcon({ size = 52 }: { size?: number }) {
  const gap = size * 0.045;
  const plateW = size * 0.075;
  const outerH = size * 0.28;  // shorter, dimmer
  const innerH = size * 0.42;  // taller, full opacity

  return (
    <View style={[styles.iconContainer, {
      width: size, height: size, borderRadius: size * 0.25, gap,
    }]}>
      {/* Left outer plate — shorter, dimmer */}
      <View style={[styles.plate, { height: outerH, width: plateW, opacity: 0.55 }]} />
      {/* Left inner plate — taller, full */}
      <View style={[styles.plate, { height: innerH, width: plateW }]} />
      {/* S */}
      <Text style={[styles.iconS, { fontSize: size * 0.52, marginHorizontal: size * 0.05 }]}>S</Text>
      {/* Right inner plate */}
      <View style={[styles.plate, { height: innerH, width: plateW }]} />
      {/* Right outer plate */}
      <View style={[styles.plate, { height: outerH, width: plateW, opacity: 0.55 }]} />
    </View>
  );
}

// ─── Wordmark — "SWOLE/OS" ───────────────────────────────────────────────────
export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <View style={styles.wordmarkRow}>
      <Text style={[styles.wordmarkSwole, { fontSize: size }]}>SWOLE</Text>
      <Text style={[styles.wordmarkSlash, { fontSize: size * 1.1 }]}>/</Text>
      <Text style={[styles.wordmarkOs, { fontSize: size }]}>OS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Icon
  iconContainer: {
    backgroundColor: colors.surf,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  plate: {
    backgroundColor: colors.acc,
    borderRadius: 1,
  },
  iconS: {
    fontFamily: fonts.display,
    color: colors.text,
    textTransform: 'uppercase',
    lineHeight: undefined,
  },

  // Wordmark
  wordmarkRow: { flexDirection: 'row', alignItems: 'baseline' },
  wordmarkSwole: {
    fontFamily: fonts.display,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  wordmarkSlash: {
    fontFamily: fonts.display,
    color: colors.acc,
    textTransform: 'uppercase',
  },
  wordmarkOs: {
    fontFamily: fonts.display,
    color: colors.acc,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
