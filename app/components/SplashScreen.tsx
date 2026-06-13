import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { AppIcon, Wordmark } from './Brand';
import GlowPulse from './GlowPulse';
import { colors, fonts, space } from '../theme/forge';
import { pickMotivation } from '../lib/motivation';

// Brief branded load screen: breathing logo over a pulsing glow, a fading
// quote/pro-tip, and a filling progress bar. Shows once on cold start.
export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const fade = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const [m] = useState(() => pickMotivation(Math.floor(Date.now())));

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    Animated.timing(bar, { toValue: 1, duration: 3750, easing: Easing.inOut(Easing.quad), useNativeDriver: false }).start();
    // Icon "breathes" (GlowPulse handles its own glow loop).
    Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
    // ~1.25s longer than the original 2650 — people read the quotes.
    const t = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => onDone());
    }, 3900);
    return () => clearTimeout(t);
  }, []);

  const barW = bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const iconScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });

  return (
    <View style={s.root}>
      <Animated.View style={[s.center, { opacity: fade }]}>
        <View style={s.iconWrap}>
          {/* The molten radial glow from the onboarding hero — alive, not a flat circle.
              GlowPulse runs its own breathing loop. */}
          <View pointerEvents="none" style={s.glowWrap}>
            <GlowPulse size={300} />
          </View>
          <Animated.View style={{ transform: [{ scale: iconScale }] }}>
            <AppIcon size={68} />
          </Animated.View>
        </View>
        <View style={{ height: space.md }} />
        <Wordmark size={30} />
        <Text style={s.kicker}>WEAPONIZE YOUR TRAINING</Text>

        <View style={s.quoteWrap}>
          {m.kind === 'tip' && <Text style={s.tipLabel}>PRO TIP</Text>}
          <Text style={s.quote}>{m.kind === 'quote' ? `"${m.text}"` : m.text}</Text>
          {m.kind === 'quote' && m.author ? <Text style={s.author}>— {m.author}</Text> : null}
        </View>
      </Animated.View>

      {/* Loading bar — molten fill with a white-hot leading edge, not a flat line */}
      <View style={s.barTrack}>
        <View style={s.barRow}>
          <Animated.View style={[s.barFill, { width: barW }]} />
          <View style={s.barHead} />
          <View style={s.barTip} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36 },
  center: { alignItems: 'center' },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  glowWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.acc2, letterSpacing: 3, marginTop: 10 },
  quoteWrap: { marginTop: space.xxl, alignItems: 'center', minHeight: 110, justifyContent: 'flex-start' },
  tipLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.acc, letterSpacing: 2, marginBottom: 8 },
  quote: { fontFamily: fonts.bodyMed, fontSize: 19, color: colors.text, textAlign: 'center', lineHeight: 28 },
  author: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.acc2, marginTop: 10, textTransform: 'uppercase', letterSpacing: 1 },

  barTrack: { position: 'absolute', bottom: 70, left: 48, right: 48, height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden' },
  barRow: { flexDirection: 'row', height: '100%' },
  barFill: { height: '100%', backgroundColor: colors.acc },
  barHead: { width: 14, height: '100%', backgroundColor: '#FF8A3D' },
  barTip: { width: 5, height: '100%', backgroundColor: '#FFD9A8' },
});
