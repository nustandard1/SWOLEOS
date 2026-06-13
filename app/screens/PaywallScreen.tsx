// @ts-nocheck
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fonts, space } from '../theme/forge';
import GlowPulse from '../components/GlowPulse';
import { BlurView } from 'expo-blur';

const hBump = () => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) { /* */ } };
const hTap  = () => { try { Haptics.selectionAsync(); } catch (e) { /* */ } };

// Just the 3 most impactful, sellable props — people don't read long lists.
const BENEFITS = [
  { icon: 'flash',                 title: 'UNFAIR ADVANTAGE',            sub: 'Training autopsies, per-muscle-group analysis, progression targets.' },
  { icon: 'heart-pulse',           title: 'ADVANCED TRAINING ANALYTICS', sub: 'Sync your Hume pod or other devices to analyze body comp, training & recovery trends in one place.' },
  { icon: 'view-dashboard-outline', title: 'THE FULL OS',                sub: 'A full library of expert pre-built programs, live training-status updates and progression targets for every session.' },
];

// PLACEHOLDER plans — real pricing flows from the RevenueCat offering once App Store
// Connect products exist. Replace `PLANS` with offering.availablePackages then.
const PLANS = [
  { id: 'annual',  big: '$37', per: 'per year',  price: '$37 / yr', badge: 'BEST VALUE' },
  { id: 'monthly', big: '$9',  per: 'per month', price: '$9 / mo',  badge: null },
];

export default function PaywallScreen({ onStartTrial, onSkip, onRestore }) {
  const [plan, setPlan] = useState('annual');
  const selected = PLANS.find(p => p.id === plan) || PLANS[0];

  function startTrial() {
    hBump();
    // TODO(RevenueCat): Purchases.purchasePackage(selectedPackage) → onStartTrial() on success.
    onStartTrial?.(plan);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero — title + tagline grouped */}
        <View style={s.hero}>
          <GlowPulse size={200} />
          <Text style={s.heroWord}>SWOLE/OS <Text style={s.heroPro}>PRO</Text></Text>
          <Text style={s.heroSub}>Your training, weaponized by intelligence.</Text>
        </View>

        {/* 3 benefits — frosted-glass cards */}
        <View style={s.benefits}>
          {BENEFITS.map((b, i) => (
            <View key={i} style={s.benefitRow}>
              <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={s.benefitInner}>
                <View style={s.benefitIcon}><MaterialCommunityIcons name={b.icon} size={20} color={colors.acc} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.benefitTitle}>{b.title}</Text>
                  <Text style={s.benefitSub}>{b.sub}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Free-trial headline + cancel-anytime reassurance, right at the decision point */}
        <View style={s.trialWrap}>
          <View pointerEvents="none" style={s.trialGlow}><GlowPulse size={170} /></View>
          <Text style={s.trialBig}>30 DAYS FREE</Text>
        </View>
        <View style={s.cancelPill}>
          <MaterialCommunityIcons name="check" size={12} color={colors.acc2} />
          <Text style={s.cancelPillText}>CANCEL ANYTIME</Text>
        </View>

        {/* Plans */}
        <View style={s.plans}>
          {PLANS.map(p => {
            const on = plan === p.id;
            return (
              <TouchableOpacity key={p.id} style={[s.plan, on && s.planOn]} onPress={() => { hTap(); setPlan(p.id); }} activeOpacity={0.85}>
                <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={[s.planInner, on && s.planOnInner]}>
                  {p.badge
                    ? <View style={s.planBadge}><Text style={s.planBadgeText}>{p.badge}</Text></View>
                    : <View style={s.planBadgeSpacer} />}
                  <Text style={[s.planBig, on && { color: colors.text }]}>{p.big}</Text>
                  <Text style={s.planPer}>{p.per}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* CTA */}
        <TouchableOpacity style={s.cta} onPress={startTrial} activeOpacity={0.85}>
          <Text style={s.ctaText}>START FREE TRIAL</Text>
        </TouchableOpacity>
        <Text style={s.trust}>Then {selected.price} after your free trial. Cancel anytime.</Text>

        <TouchableOpacity onPress={() => { hTap(); onSkip?.(); }} style={s.later} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.laterText}>CONTINUE FREE WITH LIMITED FEATURES</Text>
        </TouchableOpacity>

        <View style={s.legalRow}>
          <TouchableOpacity onPress={() => onRestore?.()}><Text style={s.legalLink}>Restore</Text></TouchableOpacity>
          <Text style={s.legalDot}>·</Text>
          <Text style={s.legal}>Terms</Text>
          <Text style={s.legalDot}>·</Text>
          <Text style={s.legal}>Privacy</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.xl, alignItems: 'center' },

  hero: { alignItems: 'center', justifyContent: 'center', paddingTop: space.lg, paddingBottom: space.lg },
  heroWord: { fontFamily: fonts.display, fontSize: 34, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroPro: { color: colors.acc },
  heroSub: { fontFamily: fonts.bodyMed, fontSize: 15, color: colors.text, textAlign: 'center', marginTop: 6 },

  benefits: { width: '100%', gap: space.sm, marginBottom: space.lg },
  benefitRow: { borderRadius: 13, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  benefitInner: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13, backgroundColor: 'rgba(255,255,255,0.04)' },
  benefitIcon: { width: 38, height: 38, borderRadius: 9, backgroundColor: 'rgba(255,90,30,0.14)', alignItems: 'center', justifyContent: 'center' },
  benefitTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.4 },
  benefitSub: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 2 },

  trialWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  trialGlow: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  trialBig: { fontFamily: fonts.display, fontSize: 30, color: colors.acc, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  cancelPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf, paddingHorizontal: 12, paddingVertical: 6, marginBottom: space.md },
  cancelPillText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.text, textTransform: 'uppercase', letterSpacing: 1.2 },

  plans: { flexDirection: 'row', width: '100%', gap: space.sm, marginBottom: space.md },
  plan: { flex: 1, borderRadius: 13, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  planOn: { borderWidth: 1.5, borderColor: colors.acc },
  planInner: { paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.04)' },
  planOnInner: { backgroundColor: 'rgba(255,90,30,0.08)' },
  planBadge: { backgroundColor: colors.acc, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
  planBadgeText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.onAcc, letterSpacing: 1 },
  planBadgeSpacer: { height: 17, marginBottom: 4 },
  planBig: { fontFamily: fonts.display, fontSize: 22, color: colors.muted },
  planPer: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },

  cta: { width: '100%', backgroundColor: colors.acc, paddingVertical: 18, alignItems: 'center' },
  ctaText: { fontFamily: fonts.display, fontSize: 19, color: colors.onAcc, textTransform: 'uppercase', letterSpacing: 0.5 },
  trust: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: space.sm },

  later: { paddingVertical: space.md, marginTop: space.xs },
  laterText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.dim, textTransform: 'uppercase', letterSpacing: 1.5 },

  legalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legalLink: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted },
  legal: { fontFamily: fonts.body, fontSize: 11, color: colors.dim },
  legalDot: { color: colors.dim, fontSize: 11 },
});
