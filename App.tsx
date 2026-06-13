import 'react-native-gesture-handler'; // MUST be the first import (gesture-handler requirement)
import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Animated, Easing } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { Session } from '@supabase/supabase-js';
import { useFonts } from 'expo-font';
import {
  Saira_400Regular,
  Saira_500Medium,
  Saira_600SemiBold,
  Saira_700Bold,
} from '@expo-google-fonts/saira';
import {
  SairaCondensed_700Bold,
  SairaCondensed_800ExtraBold,
} from '@expo-google-fonts/saira-condensed';
import { supabase } from './app/lib/supabase';
import LoginScreen from './app/screens/LoginScreen';
import SignupScreen from './app/screens/SignupScreen';
import OnboardingScreen from './app/screens/OnboardingScreen';
import RootNavigator from './app/navigation/RootNavigator';
import SplashScreen from './app/components/SplashScreen';
import GrainOverlay from './app/components/GrainOverlay';
import { colors } from './app/theme/forge';
import { onReplayOnboarding, onPreviewPaywall, consumeJustSignedUp } from './app/lib/devBus';
import PaywallScreen from './app/screens/PaywallScreen';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [onbChecked, setOnbChecked] = useState(false); // have we resolved onboarding for this session?
  const [previewOnboarding, setPreviewOnboarding] = useState(false); // dev: replay flow
  const [previewPaywall, setPreviewPaywall] = useState(false); // dev/preview: peek the paywall
  const [startTab, setStartTab] = useState('Home');
  const [startSegment, setStartSegment] = useState<string | null>(null); // e.g. Train → 'programs'
  const [splashDone, setSplashDone] = useState(false);

  // Fade the app in once the splash hands off — smoother than a hard cut.
  const appFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!splashDone) return;
    appFade.setValue(0);
    Animated.timing(appFade, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [splashDone]);

  // Dev-only: let a "Replay Onboarding" button re-show the flow in preview mode.
  useEffect(() => onReplayOnboarding(() => setPreviewOnboarding(true)), []);
  // Dev/preview: let a "Preview Paywall" button show the paywall standalone.
  useEffect(() => onPreviewPaywall(() => setPreviewPaywall(true)), []);

  const [fontsLoaded] = useFonts({
    Saira_400Regular,
    Saira_500Medium,
    Saira_600SemiBold,
    Saira_700Bold,
    SairaCondensed_700Bold,
    SairaCondensed_800ExtraBold,
  });

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 3000);
    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      setSession(session);
      if (session) checkOnboarding(session.user.id);
      else setOnbChecked(false);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        if (consumeJustSignedUp()) {
          // Brand-new account from our signup form — go straight to onboarding,
          // no users-row round trip (kills the flash between signup and intro).
          setStartTab('Home');
          setNeedsOnboarding(true);
          setOnbChecked(true);
        } else {
          checkOnboarding(session.user.id);
        }
      } else { setOnbChecked(false); setNeedsOnboarding(false); setStartTab('Home'); }
      setLoading(false);
    });
    return () => { clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  async function checkOnboarding(userId: string) {
    setStartTab('Home'); // every (re)login lands on Home; onboarding overrides after if needed
    const { data } = await supabase
      .from('users').select('goal').eq('id', userId).single();
    setNeedsOnboarding(!data?.goal);
    setOnbChecked(true);
  }

  let content;
  if (previewPaywall) {
    // Preview-only: peek the paywall standalone (any action just closes it).
    const close = () => setPreviewPaywall(false);
    content = <PaywallScreen onStartTrial={close} onSkip={close} onRestore={close} />;
  } else if (!fontsLoaded || loading) {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.acc} />
      </View>
    );
  } else if (!splashDone) {
    // Brief branded splash (logo + quote/pro-tip) once per cold start.
    content = <SplashScreen onDone={() => setSplashDone(true)} />;
  } else if (!session) {
    content = showLogin
      ? <LoginScreen onSwitch={() => setShowLogin(false)} />
      : <SignupScreen onSwitch={() => setShowLogin(true)} />;
  } else if (!onbChecked && !previewOnboarding) {
    // Session exists but we haven't resolved onboarding yet — hold on the loader so the
    // main app never flashes for a frame before onboarding (signup transition).
    content = (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.acc} />
      </View>
    );
  } else if (needsOnboarding || previewOnboarding) {
    content = (
      <OnboardingScreen
        preview={previewOnboarding && !needsOnboarding}
        onComplete={(tab?: string, segment?: string) => { setStartTab(tab || 'Home'); setStartSegment(segment || null); setPreviewOnboarding(false); setNeedsOnboarding(false); }}
      />
    );
  } else {
    content = (
      <NavigationContainer>
        <RootNavigator startTab={startTab} startSegment={startSegment} />
      </NavigationContainer>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {splashDone
          ? <Animated.View style={{ flex: 1, opacity: appFade }}>{content}</Animated.View>
          : content}
        <GrainOverlay />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
});
