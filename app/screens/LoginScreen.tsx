import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  SafeAreaView, ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, fonts, type as t, space, borders } from '../theme/forge';
import { AppIcon, Wordmark } from '../components/Brand';

export default function LoginScreen({ onSwitch }: { onSwitch: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Login failed', error.message);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Ghost "S" watermark */}
          <Text style={styles.ghost} numberOfLines={1}>S</Text>

          {/* Top bar */}
          <View style={styles.topBar}>
            <AppIcon size={48} />
            <View style={{ marginLeft: 10 }}>
              <Wordmark size={20} />
            </View>
          </View>

          {/* Headline */}
          <Text style={styles.headline}>THE OPERATING{'\n'}SYSTEM FOR{'\n'}SERIOUS LIFTERS.</Text>

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
              placeholder="••••••••"
              placeholderTextColor={colors.dim}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPassFocused(true)}
              onBlur={() => setPassFocused(false)}
              onSubmitEditing={handleLogin}
              returnKeyType="go"
            />

            {/* Primary CTA */}
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={colors.onAcc} />
                : <>
                    <Text style={styles.primaryBtnText}>LOG IN</Text>
                    <Text style={styles.primaryBtnArrow}>→</Text>
                  </>
              }
            </TouchableOpacity>

            {/* OR divider */}
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>OR</Text>
              <View style={styles.orLine} />
            </View>

            {/* Apple button */}
            <TouchableOpacity style={styles.appleBtn} activeOpacity={0.8}>
              <Text style={styles.appleBtnText}>CONTINUE WITH APPLE</Text>
            </TouchableOpacity>

            {/* Switch to signup */}
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>New to SWOLE/OS?{'  '}</Text>
              <TouchableOpacity onPress={onSwitch}>
                <Text style={styles.switchLink}>CREATE ACCOUNT</Text>
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

  // Ghost watermark
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

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.xl,
  },

  kicker: {
    ...t.kicker,
    marginBottom: space.sm,
  },
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

  fieldLabel: {
    ...t.kicker,
    marginBottom: space.xs + 2,
  },
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
  inputFocused: {
    borderColor: colors.acc,
  },

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

  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: space.lg,
    gap: space.md,
  },
  orLine: { flex: 1, height: 1.5, backgroundColor: colors.line },
  orText: {
    ...t.kicker,
    color: colors.dim,
  },

  appleBtn: {
    borderWidth: 1.5,
    borderColor: colors.line2,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
  },
  appleBtnText: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: space.xl,
  },
  switchText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
  },
  switchLink: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.acc,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
