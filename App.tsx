import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { Session } from '@supabase/supabase-js';
import { supabase } from './app/lib/supabase';
import LoginScreen from './app/screens/LoginScreen';
import SignupScreen from './app/screens/SignupScreen';
import OnboardingScreen from './app/screens/OnboardingScreen';
import RootNavigator from './app/navigation/RootNavigator';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 3000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      setSession(session);
      if (session) checkOnboarding(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkOnboarding(session.user.id);
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  async function checkOnboarding(userId: string) {
    const { data } = await supabase
      .from('users')
      .select('goal')
      .eq('id', userId)
      .single();
    setNeedsOnboarding(!data?.goal);
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#e8ff47" />
      </View>
    );
  }

  if (!session) {
    return showLogin
      ? <LoginScreen onSwitch={() => setShowLogin(false)} />
      : <SignupScreen onSwitch={() => setShowLogin(true)} />;
  }

  if (needsOnboarding) {
    return <OnboardingScreen onComplete={() => setNeedsOnboarding(false)} />;
  }

  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
