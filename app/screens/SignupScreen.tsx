import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  SafeAreaView, ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, fonts, type as t, space } from '../theme/forge';
import { AppIcon, Wordmark } from '../components/Brand';
import { markJustSignedUp, clearJustSignedUp } from '../lib/devBus';

export default function SignupScreen({ onSwitch }: { onSwitch: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  async function handleSignup() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    // Flag BEFORE signUp so App routes the new account straight to onboarding the
    // instant the auth event fires — no users-row query, no flash frame.
    markJustSignedUp();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { clearJustSignedUp(); setLoading(false); Alert.alert('Signup failed', error.message); return; }
    if (data.user) {
      await supabase.from('users').insert({ id: data.user.id, email, name: name || email.split('@')[0], tier: 'free' });
    }
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Ghost watermark */}
          <Text style={styles.ghost} numberOfLines={1}>S</Text>

          {/* Top bar */}
          <View style={styles.topBar}>
            <AppIcon size={48} />
            <View style={{ marginLeft: 10 }}>
              <Wordmark size={20} />
            </View>
          </View>

          {/* Kicker + Headline */}
          <Text style={styles.kicker}>CREATE ACCOUNT</Text>
          <Text style={styles.headline}>BUILD A{'\n'}SYSTEM THAT{'\n'}TRAINS YOU{'\n'}BACK.</Text>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.fieldLabel}>EMAIL</Text>
            <TextInput
              style={[styles.input, emailFocused && styles.inputFocused]}
              placeholder="you@email.com"
              placeholderTextColor={colors.dim}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
            />

            <Text style={[styles.fieldLabel, { marginTop: space.md }]}>PASSWORD</Text>
            <TextInput
              style={[styles.input, passFocused && styles.inputFocused]}
              placeholder="8+ characters"
              placeholderTextColor={colors.dim}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPassFocused(true)}
              onBlur={() => setPassFocused(false)}
              onSubmitEditing={handleSignup}
              returnKeyType="go"
            />

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={colors.onAcc} />
                : <>
                    <Text style={styles.primaryBtnText}>CREATE ACCOUNT</Text>
                    <Text style={styles.primaryBtnArrow}>→</Text>
                  </>
              }
            </TouchableOpacity>

            <Text style={styles.legalText}>
              By continuing you agree to the Terms & Privacy Policy.
            </Text>

            <View style={styles.switchRow}>
              <Text style={styles.switchText}>Already have an account?{'  '}</Text>
              <TouchableOpacity onPress={onSwitch}>
                <Text style={styles.switchLink}>LOG IN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: 40 },

  ghost: {
    position: 'absolute',
    right: -40,
    top: 60,
    fontFamily: fonts.display,
    fontSize: 320,
    color: '#120E09',
    textTransform: 'uppercase',
    lineHeight: 280,
    overflow: 'hidden',
  },

  topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xl },

  kicker: { ...t.kicker, marginBottom: space.sm },
  headline: {
    fontFamily: fonts.display,
    fontSize: 42,
    lineHeight: 46,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingTop: 8,
    marginBottom: space.xl + 4,
  },

  form: { gap: 0 },

  fieldLabel: { ...t.kicker, marginBottom: space.xs + 2 },
  input: {
    backgroundColor: colors.surf2,
    color: colors.text,
    fontFamily: fonts.bodyMed,
    fontSize: 15,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 0,
  },
  inputFocused: { borderColor: colors.acc },

  primaryBtn: {
    backgroundColor: colors.acc,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: space.lg,
    borderRadius: 0,
    minHeight: 54,
  },
  primaryBtnText: {
    fontFamily: fonts.display,
    fontSize: 17,
    color: colors.onAcc,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  primaryBtnArrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.onAcc,
  },

  legalText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.dim,
    textAlign: 'center',
    marginTop: space.md,
    lineHeight: 16,
  },

  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: space.xl,
  },
  switchText: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  switchLink: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.acc,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
