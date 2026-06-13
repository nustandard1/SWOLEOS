// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, SafeAreaView, Alert, ActivityIndicator, Modal,
  FlatList, KeyboardAvoidingView, Platform, Animated, Keyboard, Dimensions,
  ImageBackground, Linking,
} from 'react-native';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withSpring, runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import YoutubePlayer from 'react-native-youtube-iframe';
import { BlurView } from 'expo-blur';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { getLastSession, getExerciseHistory, buildProgressionGuidance, computeRhrFlag, computeSleepFlag, formatSessionDate } from '../lib/intelligence';
import { getRecoveryMetrics } from '../lib/health';
import CountUp from '../components/CountUp';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fonts, space } from '../theme/forge';

// ─── Types ────────────────────────────────────────────────────────────────────
function mkSet(ghost, type) {
  return { type: type || 'normal', w: '', r: '', rpe: '', done: false, ghost: ghost || null, clusters: [] };
}
const sumClusters = (s) => (s?.clusters || []).reduce((a, b) => a + (+b || 0), 0);

// Per-set ghost from last session — set 3's placeholder is last session's SET 3, not a
// copy of set 1 (falls back to the last logged set when today has more sets than then).
function ghostFor(history, i) {
  const hs = history?.sets;
  if (!hs || !hs.length) return null;
  const src = hs[Math.min(i, hs.length - 1)];
  return src ? { w: src.weight?.toString() || '', r: src.reps?.toString() || '' } : null;
}

// ─── Numeric Keypad ───────────────────────────────────────────────────────────
// RPE is a bounded scale (6–10 in halves) — it gets a one-tap chip pad, not digits.
// Weight/reps keep the full digit grid.
const RPE_PAD = ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10'];
const KEYS = ['1','2','3','4','5','6','7','8','9','.','0','del'];

// The advance key chains the fields: weight → reps → RPE → ✓done. It's orange
// ("NEXT") while moving through fields, green ("DONE") on the RPE step where one
// tap marks the set done and jumps to the next set's weight. Skip RPE by tapping
// DONE without choosing one.
function Keypad({ visible, label, isRpe, value, onKey, onChipRpe, onClearRpe, onDone, onAdvance, advanceDone }) {
  if (!visible) return null;
  return (
    <View style={kp.container}>
      <View style={kp.bar}>
        <Text style={kp.label}>{label || 'Enter value'}</Text>
        <TouchableOpacity style={kp.doneBtn} onPress={onDone}>
          <Text style={kp.doneText}>CLOSE</Text>
        </TouchableOpacity>
      </View>
      <View style={kp.body}>
        <View style={kp.leftCol}>
          {isRpe ? (
            <>
              <View style={kp.rpeGrid}>
                {RPE_PAD.map(v => (
                  <TouchableOpacity key={v} style={[kp.rpeKey, value === v && kp.rpeKeyOn]} onPress={() => onChipRpe(v)}>
                    <Text style={[kp.rpeKeyText, value === v && kp.rpeKeyTextOn]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={kp.rpeClear} onPress={onClearRpe}>
                <Text style={kp.rpeClearText}>CLEAR RPE</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={kp.grid}>
              {KEYS.map(k => (
                <TouchableOpacity key={k} style={kp.key} onPress={() => onKey(k)}>
                  <Text style={kp.keyText}>{k === 'del' ? '⌫' : k}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        <TouchableOpacity style={[kp.adv, advanceDone ? kp.advDone : kp.advNext]} onPress={onAdvance} activeOpacity={0.82}>
          <MaterialCommunityIcons name={advanceDone ? 'check-bold' : 'arrow-right'} size={30} color="#0C0B0A" />
          <Text style={kp.advLbl}>{advanceDone ? 'DONE' : 'NEXT'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── SwipeSheet ───────────────────────────────────────────────────────────────
// Shared bottom-sheet shell: backdrop tap closes, and the sheet GENUINELY swipes
// down to dismiss (standing rule: if it looks scrollable/draggable, it is).
// GestureHandlerRootView inside the Modal is required for gestures under Fabric.
function SwipeSheet({ visible, onClose, keyboardAvoid, children }) {
  const ty = useSharedValue(0);
  useEffect(() => { if (visible) ty.value = 0; }, [visible]);
  const pan = Gesture.Pan()
    .activeOffsetY(14)
    .failOffsetY(-14)
    .onUpdate((e) => { ty.value = Math.max(0, e.translationY); })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 800) runOnJS(onClose)();
      else ty.value = withSpring(0, { damping: 22, stiffness: 260 });
    });
  const aStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  const body = (
    <TouchableOpacity style={sh.overlay} onPress={onClose} activeOpacity={1}>
      <GestureDetector gesture={pan}>
        <Reanimated.View style={aStyle}>
          <TouchableOpacity activeOpacity={1}>
            {children}
          </TouchableOpacity>
        </Reanimated.View>
      </GestureDetector>
    </TouchableOpacity>
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {keyboardAvoid
          ? <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>{body}</KeyboardAvoidingView>
          : body}
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Set Options Sheet ────────────────────────────────────────────────────────
// Tapping the set number opens this — its sole job now is clusters (warmup labeling and
// "duplicate set" were removed: log working sets, and Add Set already clones the last one).
function SetOptionsSheet({ visible, set, onAddCluster, onCancel }) {
  const hasClusters = (set?.clusters?.length || 0) > 0;
  return (
    <SwipeSheet visible={visible} onClose={onCancel}>
      <View style={sh.sheet}>
        <View style={sh.handle} />
        <Text style={sh.title}>CLUSTERS / MYO-REPS</Text>
        <TouchableOpacity style={sh.row} onPress={onAddCluster}>
          <Text style={sh.rowText}>✛  Add cluster{hasClusters ? ' (another)' : ' set'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sh.cancelBtn} onPress={onCancel}>
          <Text style={sh.cancelText}>CANCEL</Text>
        </TouchableOpacity>
      </View>
    </SwipeSheet>
  );
}

// Exercise ⋯ menu — note / reorder / remove all live here (occasional actions, one
// predictable place; same pattern Hevy uses). Logging actions stay on the card.
function ExerciseOptionsSheet({ visible, name, hasNote, canUp, canDown, onNote, onUp, onDown, onRemove, onCancel }) {
  return (
    <SwipeSheet visible={visible} onClose={onCancel}>
      <View style={sh.sheet}>
          <View style={sh.handle} />
          <Text style={sh.title} numberOfLines={1}>{name}</Text>
          <TouchableOpacity style={sh.row} onPress={onNote}>
            <Text style={sh.rowText}>✎  {hasNote ? 'Edit note' : 'Add note'}</Text>
          </TouchableOpacity>
          {canUp && (
            <TouchableOpacity style={sh.row} onPress={onUp}>
              <Text style={sh.rowText}>▲  Move up</Text>
            </TouchableOpacity>
          )}
          {canDown && (
            <TouchableOpacity style={sh.row} onPress={onDown}>
              <Text style={sh.rowText}>▼  Move down</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={sh.row} onPress={onRemove}>
            <Text style={[sh.rowText, { color: colors.statusLow }]}>✕  Remove exercise</Text>
          </TouchableOpacity>
          <TouchableOpacity style={sh.cancelBtn} onPress={onCancel}>
            <Text style={sh.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
    </SwipeSheet>
  );
}

// ─── RPE explainer ────────────────────────────────────────────────────────────
const RPE_SCALE = [
  { n: '10', t: 'Max effort — no reps left in the tank' },
  { n: '9',  t: '1 rep left' },
  { n: '8',  t: '2 reps left' },
  { n: '7',  t: '3–4 reps left' },
  { n: '6',  t: 'Warm-up effort' },
];
function RpeHelpSheet({ visible, onClose }) {
  return (
    <SwipeSheet visible={visible} onClose={onClose}>
      <View style={[sh.sheet, { paddingBottom: space.xl }]}>
        <View style={sh.handle} />
        <Text style={sh.title}>WHAT IS RPE?</Text>
        <Text style={sh.rpeIntro}>Rate of Perceived Exertion — how hard a set felt. The closer to failure, the higher the number. Logging it honestly sharpens every target.</Text>
        {RPE_SCALE.map(r => (
          <View key={r.n} style={sh.rpeRow}>
            <View style={sh.rpeNum}><Text style={sh.rpeNumText}>{r.n}</Text></View>
            <Text style={sh.rpeText}>{r.t}</Text>
          </View>
        ))}
        <TouchableOpacity style={sh.cancelBtn} onPress={onClose}>
          <Text style={sh.cancelText}>GOT IT</Text>
        </TouchableOpacity>
      </View>
    </SwipeSheet>
  );
}

// ─── Note Sheet ───────────────────────────────────────────────────────────────
function NoteSheet({ visible, title, value, onChange, onSave, onClose }) {
  return (
    <SwipeSheet visible={visible} onClose={onClose} keyboardAvoid>
      <View style={[sh.sheet, { paddingBottom: space.xl }]}>
        <View style={sh.handle} />
        <Text style={sh.title}>{title}</Text>
        <TextInput
          style={sh.noteInput}
          multiline
          placeholder="Add a note..."
          placeholderTextColor={colors.dim}
          value={value}
          onChangeText={onChange}
          autoFocus
        />
        <TouchableOpacity style={sh.saveBtn} onPress={onSave}>
          <Text style={sh.saveBtnText}>SAVE NOTE</Text>
        </TouchableOpacity>
      </View>
    </SwipeSheet>
  );
}

// ─── Finish Overlay ───────────────────────────────────────────────────────────
// A 1..count tap-scale with anchor labels (or the picked word for the 5-point ones).
function ScaleRow({ count, value, onChange, lowLabel, highLabel, labels }) {
  return (
    <View style={fo.scaleWrap}>
      <View style={fo.scaleRow}>
        {Array.from({ length: count }, (_, i) => {
          const n = i + 1;
          const sel = value === n;
          return (
            <TouchableOpacity
              key={n}
              style={[fo.scaleChip, sel && fo.scaleChipSel]}
              onPress={() => onChange(sel ? null : n)}
              activeOpacity={0.8}
            >
              <Text style={[fo.scaleChipTxt, sel && fo.scaleChipTxtSel]}>{n}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {labels && value ? (
        <Text style={fo.scaleSel}>{labels[value - 1]}</Text>
      ) : (
        <View style={fo.scaleAnchors}>
          <Text style={fo.scaleAnchor}>{lowLabel}</Text>
          <Text style={fo.scaleAnchor}>{highLabel}</Text>
        </View>
      )}
    </View>
  );
}

const SORENESS_LABELS = ['NONE', 'MILD', 'MODERATE', 'HIGH', 'SEVERE'];
const READINESS_LABELS = ['DRAINED', 'LOW', 'OK', 'GOOD', 'PRIMED'];

function FinishOverlay({ visible, sessionName, volume, hardSets, onDone }) {
  const [rpe, setRpe] = useState(null);
  const [soreness, setSoreness] = useState(null);
  const [readiness, setReadiness] = useState(null);
  function fmtVol(v) {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return `${v}`;
  }
  // NOTE: rendered as an absolute in-screen overlay (NOT a nested <Modal>).
  // A RN Modal inside this screen — which is itself a native fullScreenModal —
  // caused a black screen on iOS when dismissing + navigating in the same tick.
  if (!visible) return null;
  const anySelected = rpe != null || soreness != null || readiness != null;
  return (
    <View style={fo.overlay} pointerEvents="auto">
      <SafeAreaView style={fo.safe}>
        <ScrollView contentContainerStyle={fo.scroll} showsVerticalScrollIndicator={false}>
          <View style={fo.badge}><Text style={fo.check}>✓</Text></View>
          <Text style={fo.kicker}>WORKOUT LOGGED</Text>
          <Text style={fo.name}>{sessionName?.toUpperCase()}</Text>
          <View style={fo.statsRow}>
            <View style={fo.statCell}>
              <CountUp value={volume} format={fmtVol} style={[fo.statVal, { color: colors.acc }]} />
              <Text style={fo.statLbl}>VOLUME (LBS)</Text>
            </View>
            <View style={[fo.statCell, fo.statCellBorder]}>
              <CountUp value={hardSets} style={[fo.statVal, { color: colors.acc }]} />
              <Text style={fo.statLbl}>WORKING SETS</Text>
            </View>
          </View>

          {/* Quick check-in — feeds recovery/readiness insight. Optional. */}
          <View style={fo.checkin}>
            <Text style={fo.checkinHead}>QUICK CHECK-IN</Text>
            <Text style={fo.checkinSub}>Takes 5 seconds — sharpens your recovery insights.</Text>

            <Text style={fo.qLabel}>How <Text style={fo.qKey}>hard</Text> did this session feel?</Text>
            <ScaleRow count={5} value={rpe} onChange={setRpe} lowLabel="EASY" highLabel="ALL-OUT" />

            <Text style={fo.qLabel}>How <Text style={fo.qKey}>sore</Text> are you today?</Text>
            <ScaleRow count={5} value={soreness} onChange={setSoreness} labels={SORENESS_LABELS} lowLabel="NONE" highLabel="SEVERE" />

            <Text style={fo.qLabel}>How did you <Text style={fo.qKey}>feel</Text> coming in?</Text>
            <ScaleRow count={5} value={readiness} onChange={setReadiness} labels={READINESS_LABELS} lowLabel="DRAINED" highLabel="PRIMED" />
          </View>

          <TouchableOpacity
            style={fo.doneBtn}
            onPress={() => onDone({ session_rpe: rpe, soreness, readiness })}
            activeOpacity={0.85}
          >
            <Text style={fo.doneBtnText}>{anySelected ? 'SAVE & FINISH' : 'SKIP & FINISH'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── Main Logger ──────────────────────────────────────────────────────────────
// Alphabetical (after All) — predictable scanning beats anatomical ordering.
const MUSCLE_GROUPS = [
  { label: 'All', value: '' },
  { label: 'Abs', value: 'abs' },
  { label: 'Athlete', value: 'athlete' },
  { label: 'Back', value: 'back' },
  { label: 'Biceps', value: 'biceps' },
  { label: 'Calves', value: 'calves' },
  { label: 'Cardio', value: 'cardio' },
  { label: 'Chest', value: 'chest' },
  { label: 'Delts', value: 'delts' },
  { label: 'Glutes', value: 'glutes' },
  { label: 'Hamstrings', value: 'hamstrings' },
  { label: 'Quads', value: 'quads' },
  { label: 'Tactical', value: 'tactical' },
  { label: 'Triceps', value: 'triceps' },
];

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
// Session clock, mm:ss (h:mm:ss past an hour).
function fmtElapsed(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), ss = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}

// Valid primary_muscle values for a user-created exercise (no 'All' / sub-groups).
// Alphabetical — zero-friction scanning, same rule as every picker in the app.
const CREATE_MUSCLES = [
  'abs', 'athlete', 'back', 'biceps', 'calves', 'cardio', 'chest',
  'delts', 'glutes', 'hamstrings', 'quads', 'tactical', 'triceps',
];

// One medium haptic "thunk" the moment an exercise seals shut.
function foldHaptic() {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) { /* ignore */ }
}

// Spring for the fold — damped enough to land cleanly, a touch of life on the open.
const FOLD_SPRING = { damping: 18, stiffness: 170, mass: 0.9 };

// An exercise card that folds via SPRING and DRAG, both on the UI thread. One shared
// `open` value (1 = open, 0 = folded) drives everything:
//  • external state (auto-collapse on complete / FOLD UP / tap-summary) springs `open` to match `collapsed`
//  • dragging the grab handle scrubs `open` live; release springs to the nearest state,
//    honoring fling velocity — so you can catch the fold mid-flight.
// Body and folded-summary cross-fade in one region whose height interpolates between the
// measured summary height and the full body height.
function FoldableCard({ collapsed, onSetCollapsed, cardStyle, header, summary, children }) {
  const open = useSharedValue(collapsed ? 0 : 1);
  const bodyH = useSharedValue(0);
  const sumH = useSharedValue(0);
  const dragging = useSharedValue(false);
  const startOpen = useSharedValue(1);

  useEffect(() => {
    if (dragging.value) return; // don't fight an active drag
    open.value = withSpring(collapsed ? 0 : 1, FOLD_SPRING);
  }, [collapsed]);

  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .failOffsetX([-20, 20])
    .onStart(() => { dragging.value = true; startOpen.value = open.value; })
    .onUpdate((e) => {
      const range = Math.max(1, bodyH.value - sumH.value);
      const v = startOpen.value + e.translationY / range; // drag down opens, up folds
      open.value = v < 0 ? 0 : v > 1 ? 1 : v;
    })
    .onEnd((e) => {
      dragging.value = false;
      const target = e.velocityY > 350 ? 1 : e.velocityY < -350 ? 0 : (open.value > 0.5 ? 1 : 0);
      open.value = withSpring(target, FOLD_SPRING);
      if (target === 0) runOnJS(foldHaptic)();
      runOnJS(onSetCollapsed)(target === 0);
    });

  const regionStyle = useAnimatedStyle(() => ({
    height: bodyH.value === 0 ? undefined : sumH.value + (bodyH.value - sumH.value) * open.value,
  }));
  const bodyStyle = useAnimatedStyle(() => ({ opacity: open.value }));
  const sumStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, open.value * 1.4),
    transform: [{ scale: 0.94 + 0.06 * (1 - open.value) }],
  }));

  return (
    <View style={cardStyle}>
      <GestureDetector gesture={pan}>
        <View style={s.grabStrip}><View style={s.grabBar} /></View>
      </GestureDetector>
      {header}
      <Reanimated.View style={[s.foldRegion, regionStyle]}>
        <Reanimated.View style={bodyStyle} onLayout={e => { const h = e.nativeEvent.layout.height; if (h) bodyH.value = h; }}>
          {children}
        </Reanimated.View>
        <Reanimated.View
          pointerEvents={collapsed ? 'auto' : 'none'}
          onLayout={e => { const h = e.nativeEvent.layout.height; if (h) sumH.value = h; }}
          style={[s.foldSummaryAbs, sumStyle]}
        >
          <TouchableOpacity activeOpacity={0.85} onPress={() => onSetCollapsed(false)}>
            {summary}
          </TouchableOpacity>
        </Reanimated.View>
      </Reanimated.View>
    </View>
  );
}

// Static compact summary shown once an exercise is folded — fade/scale is handled by the
// FoldableCard wrapper; tapping it (also wrapper-handled) re-opens the card.
function SummaryRow({ setCount, topW, topR, isPr }) {
  return (
    <View style={s.summaryRow}>
      <View style={s.summaryCheck}><Text style={s.summaryCheckMark}>✓</Text></View>
      <Text style={s.summaryText} numberOfLines={1}>
        {setCount} {setCount === 1 ? 'SET' : 'SETS'}{topW ? `  ·  TOP ${topW}×${topR}` : ''}
      </Text>
      {isPr ? <View style={s.summaryPr}><Text style={s.summaryPrText}>PR</Text></View> : null}
      <View style={{ flex: 1 }} />
      <Text style={s.summaryChevron}>▾</Text>
    </View>
  );
}

// Strong-style inline rest divider — renders BETWEEN set rows (after the set that
// started the rest). Counts down, presets restick the default, SKIP/DISMISS clears.
function RestDivider({ rest, onPreset, onSkip }) {
  const done = rest.remaining <= 0;
  const pct = Math.max(0, Math.min(1, rest.remaining / rest.duration));
  const fmt = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  return (
    <View style={s.restDivider}>
      <View style={s.restDividerContent}>
        {done ? (
          <>
            <Text style={[s.restDividerTime, { color: colors.acc }]}>REST DONE</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={onSkip} hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}>
              <Text style={s.restDividerCtrl}>DISMISS</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.restDividerLabel}>REST</Text>
            <Text style={s.restDividerTime}>{fmt(rest.remaining)}</Text>
            <View style={{ flex: 1 }} />
            <View style={s.restDividerPills}>
              {[60, 90, 120, 180].map(secs => (
                <TouchableOpacity key={secs} style={[s.restDivPill, rest.duration === secs && s.restDivPillOn]} onPress={() => onPreset(secs)} hitSlop={{ top: 12, bottom: 12, left: 2, right: 2 }}>
                  <Text style={[s.restDivPreset, rest.duration === secs && s.restDivPresetOn]}>{fmt(secs)}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={onSkip} hitSlop={{ top: 12, bottom: 12, left: 6, right: 8 }}>
                <Text style={s.restDividerCtrl}>SKIP</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
      {/* Single crisp progress line — the ONLY accent. No fill wash (reads brown on near-black). */}
      <View style={[s.restDividerBar, { width: `${(done ? 1 : pct) * 100}%` }]} />
    </View>
  );
}

// ─── Exercise demo video (Hevy-style) ──────────────────────────────────────────
// Small thumbnail tucked in the card header → tap → an in-app inline player (modal
// with a Back button). Uses react-native-webview via react-native-youtube-iframe, so
// it ships in a BUILD (not an OTA). PLACEHOLDER_DEMO renders on every card so the
// flow is visible before real per-exercise `exercises.video_url`s are populated.
const PLACEHOLDER_DEMO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
function ytVideoId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : null;
}
// Compact play-thumbnail for the card header (Hevy puts it upper-left of the name).
function VideoThumb({ url, onPress }) {
  const id = ytVideoId(url);
  if (!id) return null;
  return (
    <TouchableOpacity style={s.vThumb} onPress={onPress} activeOpacity={0.85} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      <ImageBackground source={{ uri: `https://img.youtube.com/vi/${id}/mqdefault.jpg` }} style={s.vThumbImg} resizeMode="cover">
        <View style={s.vThumbOverlay} />
        <MaterialCommunityIcons name="play" size={15} color="#fff" style={{ marginLeft: 1 }} />
      </ImageBackground>
    </TouchableOpacity>
  );
}
// Full inline player — opens bigger, Back returns to the session (never leaves the app).
function VideoPlayerModal({ url, title, onClose }) {
  const id = ytVideoId(url);
  return (
    <Modal visible={!!url} animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={s.vModalSafe}>
        <View style={s.vModalBar}>
          <TouchableOpacity style={s.vBack} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 6, right: 14 }}>
            <MaterialCommunityIcons name="chevron-left" size={26} color={colors.text} />
            <Text style={s.vBackText}>BACK</Text>
          </TouchableOpacity>
          <Text style={s.vModalTitle} numberOfLines={1}>{(title || '').toUpperCase()}</Text>
          <View style={{ width: 58 }} />
        </View>
        <View style={s.vPlayerWrap}>
          {id ? <YoutubePlayer height={230} play videoId={id} webViewProps={{ allowsInlineMediaPlayback: true }} /> : null}
        </View>
        <Text style={s.vModalHint}>Tap Back to return to your session.</Text>
      </SafeAreaView>
    </Modal>
  );
}

export default function WorkoutLoggerScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const templateSessionId = route.params?.templateSessionId;
  const templateId        = route.params?.templateId;
  const editSessionId     = route.params?.editSessionId;
  const logDate           = route.params?.logDate; // 'YYYY-MM-DD' — back-date an off-schedule session
  const isEditing         = !!editSessionId;

  const [sessionName, setSessionName] = useState('');
  const [sessionNote, setSessionNote] = useState('');
  const [exercises, setExercises]     = useState([]);
  // Pre-loading a scheduled/edited session takes a beat — hold a loader instead of
  // flashing the empty "ADD EXERCISE" state (premium-feel killer).
  const [loadingSession, setLoadingSession] = useState(!!(route.params?.templateSessionId || route.params?.editSessionId));
  const [userId, setUserId]           = useState(null);
  const [saving, setSaving]           = useState(false);
  const profileRef                     = useRef({}); // calibration profile for the engine
  const checkinRef                     = useRef(null); // last session's post-session check-in (optional)
  const rhrRef                         = useRef(null); // resting-HR readiness flag (Apple Health; optional)
  const sleepRef                       = useRef(null); // sleep readiness flag (Apple Health; optional)

  // Keypad state
  const [sel, setSel] = useState(null); // {exIdx, setIdx, field}

  // Sheets
  const [menuTarget, setMenuTarget]   = useState(null); // {exIdx, setIdx}
  const [exMenuTarget, setExMenuTarget] = useState(null); // exIdx — the ⋯ exercise menu

  // Session clock (top bar) — counts from logger open; not shown in edit mode.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (isEditing) return;
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const [showRpeHelp, setShowRpeHelp] = useState(false);
  const [videoModal, setVideoModal]   = useState(null); // { url, name } — the inline demo player
  const [noteTarget, setNoteTarget]   = useState(null); // {type:'session'} | {type:'ex', exIdx}
  const [noteDraft, setNoteDraft]     = useState('');

  // Exercise picker
  const [showPicker, setShowPicker]   = useState(false);
  const [allExercises, setAllExercises] = useState([]);
  const [search, setSearch]           = useState('');
  const [muscleFilter, setMuscleFilter] = useState('');

  // Create-custom-exercise sheet
  const [showCreate, setShowCreate]   = useState(false);
  const [createName, setCreateName]   = useState('');
  const [createMuscle, setCreateMuscle] = useState('');
  const [creating, setCreating]       = useState(false);

  // Rest timer
  const [rest, setRest]               = useState(null); // {remaining, duration, id}
  const restRef                        = useRef(null);
  const restCounter                    = useRef(0);
  const restDefault                    = useRef(150); // user's chosen rest length (2:30 default), sticks for the session
  function setRestDuration(secs) {
    restDefault.current = secs;
    setRest(r => (r ? { ...r, remaining: secs, duration: secs } : r));
  }
  // Auto-rest preference — user can switch off the timer entirely (persisted across sessions).
  const [autoRest, setAutoRest]       = useState(true);
  useEffect(() => {
    AsyncStorage.getItem('swoleos_auto_rest').then(v => { if (v === 'false') setAutoRest(false); }).catch(() => {});
  }, []);
  function toggleAutoRest() {
    setAutoRest(prev => {
      const next = !prev;
      AsyncStorage.setItem('swoleos_auto_rest', next ? 'true' : 'false').catch(() => {});
      if (!next) setRest(null); // turning OFF also clears any running timer
      try { Haptics.selectionAsync(); } catch (e) { /* ignore */ }
      return next;
    });
  }

  // Finish overlay
  const [showFinish, setShowFinish]   = useState(false);
  const [finishData, setFinishData]   = useState(null);

  // PR toast (slides down from top when a working set beats last time)
  const [prToast, setPrToast]         = useState(null); // { exercise, detail }
  const toastY                         = useRef(new Animated.Value(-120)).current;
  const toastTimer                     = useRef(null);

  function showPrToast(exercise, detail) {
    setPrToast({ exercise, detail });
    Animated.spring(toastY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 70 }).start();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastY, { toValue: -120, duration: 250, useNativeDriver: true }).start(() => setPrToast(null));
    }, 2200);
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: prof } = await supabase
        .from('users')
        .select('rep_preference, experience_level, archetype, goal, current_phase')
        .eq('id', user.id)
        .single();
      profileRef.current = prof || {};
      // Most recent post-session check-in (soreness/readiness/session RPE) — softens
      // today's progression targets when the lifter reported rough recovery. Optional data.
      const { data: lastCk } = await supabase
        .from('workout_sessions')
        .select('performed_at, session_rpe, soreness, readiness')
        .eq('user_id', user.id)
        .order('performed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastCk && (lastCk.session_rpe != null || lastCk.soreness != null || lastCk.readiness != null)) {
        checkinRef.current = lastCk;
      }
      // Resting-HR readiness (Apple Health) — confirmatory recovery signal for the engine.
      // Optional: no HealthKit / not enough history → stays null and the engine ignores it.
      try {
        const rec = await getRecoveryMetrics();
        rhrRef.current = computeRhrFlag(rec?.restingHr);
        sleepRef.current = computeSleepFlag(rec?.sleep);
      } catch (e) { /* health unavailable — engine runs fine on training data alone */ }
      loadExercises(user.id);
      if (editSessionId) loadEditSession();
      else if (templateSessionId) loadTemplateSession(user.id);
      else {
        const d = logDate ? new Date(logDate + 'T12:00:00') : new Date();
        setSessionName(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
      }
    })();
    return () => { if (restRef.current) clearInterval(restRef.current); };
  }, []);

  // Rest timer countdown — re-subscribes only when a NEW rest starts (rest.id changes)
  useEffect(() => {
    if (!rest) return;
    const id = setInterval(() => {
      setRest(r => {
        if (!r) return null;
        if (r.remaining <= 1) return { ...r, remaining: 0 };
        return { ...r, remaining: r.remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [rest?.id]);

  // Buzz once when a rest timer reaches zero (phone may be in a pocket).
  const buzzedId = useRef(null);
  useEffect(() => {
    if (rest && rest.remaining === 0 && buzzedId.current !== rest.id) {
      buzzedId.current = rest.id;
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) { /* */ }
    }
  }, [rest?.remaining, rest?.id]);

  async function loadExercises(uid) {
    // Globals (user_id null) + this user's own custom exercises.
    const { data: std } = await supabase
      .from('exercises')
      .select('id, name, primary_muscle, movement_pattern, sub_group, equipment, user_id')
      .or(`user_id.is.null,user_id.eq.${uid}`)
      .order('name');
    setAllExercises(std || []);
  }

  async function loadTemplateSession(uid) {
    try {
    const { data } = await supabase
      .from('template_sessions')
      .select(`name, template_session_exercises(
        exercise_order, target_sets, target_rep_min, target_rep_max, target_rpe, notes, rest_seconds, swaps, progression_type,
        exercises(id, name, primary_muscle, movement_pattern, equipment)
      )`)
      .eq('id', templateSessionId)
      .single();
    if (!data) return;
    setSessionName(data.name);
    const sorted = [...(data.template_session_exercises || [])].sort((a, b) => a.exercise_order - b.exercise_order);
    const preLoaded = await Promise.all(sorted.map(async row => {
      const ex = row.exercises;
      const sessions = await getExerciseHistory(uid, ex.id, 4);
      const history = sessions[0] || null;
      const guidance = buildProgressionGuidance(sessions, profileRef.current, ex, checkinRef.current, rhrRef.current, sleepRef.current);
      const sets = Array.from({ length: row.target_sets || 3 }, (_, i) => mkSet(ghostFor(history, i)));
      const dbl = row.progression_type === 'double';
      const target = row.target_rep_min && row.target_rep_max
        ? `${row.target_sets} sets · ${row.target_rep_min}–${row.target_rep_max}${dbl ? '+' : ''} reps${row.target_rpe ? ` · RPE ${row.target_rpe}` : ''}`
        : null;
      // Prescription = the program's coaching note for this lift (myo-rep / cluster
      // instructions live here). Rest auto-sets the timer; swaps shown as a hint.
      return {
        exercise: ex, sets, history, guidance, target, note: '', showAdv: false,
        prescription: row.notes || null, swaps: row.swaps || null,
        restSeconds: row.rest_seconds ?? null, progressionType: row.progression_type || null,
      };
    }));
    setExercises(preLoaded);
    } finally { setLoadingSession(false); }
  }

  // Load an existing completed session for editing
  async function loadEditSession() {
    try {
    const { data } = await supabase
      .from('workout_sessions')
      .select(`session_name, notes,
        session_exercises(exercise_order,
          exercises(id, name, primary_muscle, movement_pattern),
          set_logs(set_number, weight, reps, rpe, is_warmup, cluster_reps))`)
      .eq('id', editSessionId)
      .single();
    if (!data) return;
    setSessionName(data.session_name || '');
    setSessionNote(data.notes || '');
    const sorted = [...(data.session_exercises || [])].sort((a, b) => a.exercise_order - b.exercise_order);
    const loaded = sorted.map(row => {
      const ex = row.exercises;
      const sets = [...(row.set_logs || [])]
        .sort((a, b) => a.set_number - b.set_number)
        .map(sl => ({
          type: sl.is_warmup ? 'warmup' : 'normal',
          w: sl.weight != null ? String(sl.weight) : '',
          r: sl.reps != null ? String(sl.reps) : '',
          rpe: sl.rpe != null ? String(sl.rpe) : '',
          done: true,
          ghost: null,
          clusters: sl.cluster_reps || [],
        }));
      return { exercise: ex, sets: sets.length ? sets : [mkSet()], history: null, target: null, note: '', showAdv: false };
    });
    setExercises(loaded);
    } finally { setLoadingSession(false); }
  }

  // Live stats
  const liveVolume = exercises.reduce((total, ex) => {
    return total + ex.sets.reduce((sum, s) => {
      if (!s.done || s.type === 'warmup') return sum;
      return sum + ((+s.w || 0) * ((+s.r || 0) + sumClusters(s)));
    }, 0);
  }, 0);
  // A set with clusters counts as 2 working sets (the set + the cluster block as one).
  const liveHardSets = exercises.reduce((total, ex) =>
    total + ex.sets.reduce((n, s) => {
      if (!s.done || s.type === 'warmup') return n;
      return n + 1 + (sumClusters(s) > 0 ? 1 : 0);
    }, 0), 0);

  // Keypad — each keystroke applies directly to exercise state.
  // Re-opening a field that already holds a value starts FRESH: the first digit
  // replaces the old value (205 → tap → "5" gives 5, not 2055). Delete still edits.
  const freshField = useRef(false);
  function openKeypad(exIdx, setIdx, field) {
    freshField.current = true;
    setSel({ exIdx, setIdx, field });
    ensureRowVisible(exIdx, setIdx);
  }
  function closeKeypad() { setSel(null); }
  function handleKey(k) {
    if (!sel) return;
    const fresh = freshField.current && k !== 'del';
    freshField.current = false;
    setExercises(prev => prev.map((ex, i) => i !== sel.exIdx ? ex : {
      ...ex,
      sets: ex.sets.map((s, j) => {
        if (j !== sel.setIdx) return s;
        const cur = fresh ? '' : (s[sel.field] || '');
        let next;
        if (k === 'del') next = cur.slice(0, -1);
        else if (k === '.') next = cur.includes('.') ? cur : (cur || '0') + '.';
        else next = (cur + k).slice(0, 5);
        return { ...s, [sel.field]: next };
      }),
    }));
  }
  function handleRpeChip(v) {
    if (!sel) return;
    const { exIdx, setIdx } = sel;
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: ex.sets.map((s, j) => j !== setIdx ? s : { ...s, rpe: v }),
    }));
    try { Haptics.selectionAsync(); } catch (e) { /* ignore */ }
    // Stay on RPE — the NEXT/✓ key drives the flow (so you can re-pick before done).
  }
  // The arrow key: weight → reps → RPE, then ✓ marks the set done + jumps to the
  // next undone set's weight. Tapping ✓ without an RPE skips it (logs null).
  function handleAdvance() {
    if (!sel) return;
    const { exIdx, setIdx, field } = sel;
    if (field === 'w') { freshField.current = true; setSel({ exIdx, setIdx, field: 'r' }); ensureRowVisible(exIdx, setIdx); return; }
    if (field === 'r') { freshField.current = true; setSel({ exIdx, setIdx, field: 'rpe' }); ensureRowVisible(exIdx, setIdx); return; }
    // RPE step → complete the set, then advance to the next undone set's weight.
    const ex = exercises[exIdx];
    if (ex && !ex.sets[setIdx].done) toggleDone(exIdx, setIdx);
    const next = ex ? ex.sets.findIndex((st, j) => j > setIdx && !st.done) : -1;
    if (next >= 0) {
      freshField.current = true;
      setSel({ exIdx, setIdx: next, field: 'w' });
      ensureRowVisible(exIdx, next);
    } else {
      closeKeypad();
    }
  }
  function clearRpe() {
    if (!sel) return;
    setExercises(prev => prev.map((ex, i) => i !== sel.exIdx ? ex : {
      ...ex,
      sets: ex.sets.map((s, j) => j !== sel.setIdx ? s : { ...s, rpe: '' }),
    }));
  }
  function doneKeypad() { closeKeypad(); }

  // ── Auto-scroll: keep the selected set row visible above the keypad ──────────
  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);
  const rowRefs = useRef({});
  const KEYPAD_H = 340; // keypad + bar height (matches the scroll paddingBottom)
  function ensureRowVisible(exIdx, setIdx) {
    const node = rowRefs.current[`${exIdx}-${setIdx}`];
    if (!node || !scrollRef.current) return;
    // Wait a frame so layout (keypad opening / selection change) settles first.
    requestAnimationFrame(() => {
      node.measureInWindow((x, y, w, h) => {
        if (y == null) return;
        const winH = Dimensions.get('window').height;
        const keypadTop = winH - KEYPAD_H;
        if (y + h > keypadTop - 8) {
          scrollRef.current?.scrollTo({ y: scrollYRef.current + (y + h - (keypadTop - 8)), animated: true });
        } else if (y < 110) {
          scrollRef.current?.scrollTo({ y: Math.max(0, scrollYRef.current - (110 - y)), animated: true });
        }
      });
    });
  }

  // Set operations
  function toggleDone(exIdx, setIdx) {
    // Will checking this set leave the whole exercise complete? If so, after a short
    // beat (so it doesn't yank away the instant you tap) we fold the card up.
    const exPre = exercises[exIdx];
    const setPre = exPre.sets[setIdx];
    const turningOnSet = !setPre.done;
    // Numbers this set carries once done (typed, else its ghost) — used to pre-fill later sets.
    const fillW = setPre.w || setPre.ghost?.w || '';
    const fillR = setPre.r || setPre.ghost?.r || '';
    const newAllDone = exPre.sets.length > 0 &&
      exPre.sets.every((st, j) => (j === setIdx ? !setPre.done : st.done));
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: ex.sets.map((s, j) => {
        if (j === setIdx) {
          const on = !s.done;
          const ns = { ...s, done: on };
          if (on && s.ghost) {
            if (!ns.w && s.ghost.w) ns.w = s.ghost.w;
            if (!ns.r && s.ghost.r) ns.r = s.ghost.r;
          }
          return ns;
        }
        // Auto-populate: completing a set seeds later untouched sets with its numbers
        // (as ghosts, so they stay editable and fill in on check — Strong/Hevy behavior).
        if (turningOnSet && j > setIdx && !s.done && !s.w && !s.r && (fillW || fillR)) {
          return { ...s, ghost: { w: fillW, r: fillR } };
        }
        return s;
      }),
    }));
    const ex = exercises[exIdx];
    const set = ex.sets[setIdx];
    const turningOn = !set.done;
    // Completing this set finishes the whole session → no rest timer needed.
    const finishesSession = exercises.every((e, ei) =>
      e.sets.every((st, si) => (ei === exIdx && si === setIdx) || st.done || st.type === 'warmup')
    );
    // Completing the LAST set of an exercise (card folds) — kill any running timer so it
    // disappears completely, and don't start a new one. Rest is for BETWEEN sets only.
    if (turningOn && newAllDone) setRest(null);
    if (turningOn && set.type !== 'warmup' && !finishesSession) {
      // Auto-set the rest to the program's prescribed rest (if any), else the user default —
      // unless the user has switched the timer off, or this set finished the exercise.
      if (autoRest && !newAllDone) {
        const restLen = ex.restSeconds || restDefault.current;
        setRest({ remaining: restLen, duration: restLen, id: ++restCounter.current, exIdx, setIdx });
      }
      // PR / overload detection vs last session's best working set.
      const lastBest = (ex.history?.sets || [])
        .filter(x => (x.weight || 0) > 0 && x.reps > 0)
        .reduce((m, x) => Math.max(m, (x.weight || 0) * (1 + x.reps / 30)), 0);
      // Best already achieved this session (other completed working sets) — a set that
      // only MATCHES the current best is not a new PR.
      let priorBest = lastBest;
      ex.sets.forEach((st, j) => {
        if (j === setIdx || !st.done || st.type === 'warmup') return;
        const sw = +st.w || +(st.ghost?.w) || 0;
        const sr = +st.r || +(st.ghost?.r) || 0;
        if (sw > 0 && sr > 0) priorBest = Math.max(priorBest, sw * (1 + sr / 30));
      });
      const w = +set.w || +(set.ghost?.w) || 0;
      const r = +set.r || +(set.ghost?.r) || 0;
      const overload = lastBest > 0 && w > 0 && r > 0 && w * (1 + r / 30) > priorBest + 0.5;
      try {
        if (overload) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showPrToast(ex.exercise.name, `${w} lbs × ${r}`);
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } catch (e) { /* haptics unsupported — ignore */ }
    }
    // Completed → haptic thunk, then auto-fold after the beat.
    if (newAllDone) { foldHaptic(); scheduleCollapse(exIdx); }
    closeKeypad();
  }

  // Fold an exercise up ~280ms after it's completed (the "beat") — re-checks that
  // every set is still done so a quick un-check during the beat cancels the fold.
  function scheduleCollapse(exIdx) {
    setTimeout(() => {
      setExercises(prev => prev.map((ex, i) =>
        (i === exIdx && ex.sets.length > 0 && ex.sets.every(st => st.done)) ? { ...ex, collapsed: true } : ex
      ));
    }, 280);
  }

  // Tap the DONE column header to complete (or clear) every set for the exercise
  function toggleAllDone(exIdx) {
    const allDone = exercises[exIdx].sets.every(st => st.done);
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: ex.sets.map(st => {
        if (allDone) return { ...st, done: false };
        const ns = { ...st, done: true };
        if (st.ghost) {
          if (!ns.w && st.ghost.w) ns.w = st.ghost.w;
          if (!ns.r && st.ghost.r) ns.r = st.ghost.r;
        }
        return ns;
      }),
    }));
    // Completing the whole exercise: haptic + a single PR toast for the best overload set.
    if (!allDone) {
      const ex = exercises[exIdx];
      const lastBest = (ex.history?.sets || [])
        .filter(x => (x.weight || 0) > 0 && x.reps > 0)
        .reduce((m, x) => Math.max(m, (x.weight || 0) * (1 + x.reps / 30)), 0);
      let best = null;
      for (const st of ex.sets) {
        if (st.type === 'warmup') continue;
        const w = +st.w || +(st.ghost?.w) || 0;
        const r = +st.r || +(st.ghost?.r) || 0;
        const e = w * (1 + r / 30);
        if (lastBest > 0 && w > 0 && r > 0 && e > lastBest + 0.5 && (!best || e > best.e)) best = { e, w, r };
      }
      try {
        if (best) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); showPrToast(ex.exercise.name, `${best.w} lbs × ${best.r}`); }
        else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) { /* ignore */ }
      foldHaptic();            // haptic thunk
      scheduleCollapse(exIdx); // fold up after the beat
    }
    closeKeypad();
  }

  // Set an exercise's folded state explicitly. FoldableCard springs `open` to match, and
  // also calls this from a drag release. Used by FOLD UP, tap-to-reopen, and the gesture.
  function setCollapsedFor(exIdx, val) {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, collapsed: val }));
  }

  function addSet(exIdx) {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      const last = ex.sets[ex.sets.length - 1];
      // Clone the last set's typed numbers (else its ghost) so a new set starts pre-filled.
      const ghost = (last && (last.w || last.r))
        ? { w: last.w || last.ghost?.w || '', r: last.r || last.ghost?.r || '' }
        : (last?.ghost || null);
      return { ...ex, sets: [...ex.sets, mkSet(ghost)] };
    }));
  }

  // Clusters: extra mini-sets after a working set. Default new cluster = 3 reps.
  function addCluster(exIdx, setIdx) {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: ex.sets.map((st, j) => j !== setIdx ? st : { ...st, clusters: [...(st.clusters || []), 3] }),
    }));
    setMenuTarget(null);
  }
  function stepCluster(exIdx, setIdx, ci, delta) {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: ex.sets.map((st, j) => {
        if (j !== setIdx) return st;
        const clusters = [...(st.clusters || [])];
        const v = (+clusters[ci] || 0) + delta;
        if (v <= 0) clusters.splice(ci, 1); else clusters[ci] = v;
        return { ...st, clusters };
      }),
    }));
  }
  // Remove ONE cluster set (added one too many) — distinct from clearing the whole block.
  function removeCluster(exIdx, setIdx, ci) {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: ex.sets.map((st, j) => {
        if (j !== setIdx) return st;
        const clusters = [...(st.clusters || [])];
        clusters.splice(ci, 1);
        return { ...st, clusters };
      }),
    }));
  }
  // Clear the whole cluster block off a set (the obvious "delete all").
  function removeClusters(exIdx, setIdx) {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: ex.sets.map((st, j) => j !== setIdx ? st : { ...st, clusters: [] }),
    }));
  }

  function deleteSet(exIdx, setIdx) {
    setExercises(prev => prev.map((ex, i) =>
      i !== exIdx ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) }
    ));
    setMenuTarget(null);
  }

  function removeExercise(exIdx) {
    Alert.alert('Remove Exercise', 'Remove this exercise from the session?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setExercises(p => p.filter((_, i) => i !== exIdx)) },
    ]);
  }

  // Tap WEIGHT / REPS header to fill every set with the first entered value.
  function fillColumn(exIdx, field) {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      const src = ex.sets.find(st => st[field])?.[field];
      if (!src) return ex;
      return { ...ex, sets: ex.sets.map(st => ({ ...st, [field]: src })) };
    }));
    closeKeypad();
  }

  // Reorder an exercise up (-1) or down (+1) within the session.
  function moveExercise(exIdx, dir) {
    setExercises(prev => {
      const j = exIdx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const arr = [...prev];
      [arr[exIdx], arr[j]] = [arr[j], arr[exIdx]];
      return arr;
    });
  }

  async function addExercise(exercise) {
    const sessions = userId ? await getExerciseHistory(userId, exercise.id, 4) : [];
    const history = sessions[0] || null;
    const guidance = buildProgressionGuidance(sessions, profileRef.current, exercise, checkinRef.current, rhrRef.current, sleepRef.current);
    const sets = [0, 1, 2].map(i => mkSet(ghostFor(history, i)));
    setExercises(prev => [...prev, { exercise, sets, history, guidance, target: null, note: '', showAdv: false }]);
    setShowPicker(false);
    setSearch('');
    setMuscleFilter('');
  }

  // Create a private custom exercise (lives in exercises with user_id = me).
  async function createCustomExercise() {
    const name = createName.trim();
    if (!name || !createMuscle) { Alert.alert('Missing info', 'Enter a name and pick a muscle group.'); return; }
    setCreating(true);
    const { data, error } = await supabase
      .from('exercises')
      .insert({ name, primary_muscle: createMuscle, movement_pattern: 'isolation', user_id: userId })
      .select('id, name, primary_muscle, movement_pattern, sub_group, equipment, user_id')
      .single();
    setCreating(false);
    if (error || !data) { Alert.alert('Error', 'Could not create the exercise.'); return; }
    setAllExercises(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setShowCreate(false); setCreateName(''); setCreateMuscle('');
    addExercise(data);
  }

  // Notes
  function openNote(target, current) {
    setNoteTarget(target);
    setNoteDraft(current || '');
  }
  function saveNote() {
    if (!noteTarget) return;
    if (noteTarget.type === 'session') {
      setSessionNote(noteDraft.trim());
    } else {
      setExercises(prev => prev.map((ex, i) =>
        i === noteTarget.exIdx ? { ...ex, note: noteDraft.trim() } : ex
      ));
    }
    setNoteTarget(null);
    setNoteDraft('');
  }

  // Save workout
  async function finishWorkout() {
    if (exercises.length === 0) {
      Alert.alert('No exercises', 'Add at least one exercise before finishing.');
      return;
    }
    const hasAnySet = exercises.some(ex => ex.sets.some(s => s.r && parseInt(s.r) > 0));
    if (!hasAnySet) {
      Alert.alert('No sets logged', 'Log at least one set before finishing.');
      return;
    }
    setSaving(true);
    const name = sessionName || `Workout — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;

    let session;
    if (isEditing) {
      // Update the existing session: rename, wipe old exercises/sets, re-insert
      await supabase.from('workout_sessions')
        .update({ session_name: name, notes: sessionNote || null })
        .eq('id', editSessionId);
      await supabase.from('session_exercises').delete().eq('workout_session_id', editSessionId);
      session = { id: editSessionId };
    } else {
      const { data, error } = await supabase
        .from('workout_sessions')
        .insert({ user_id: userId, session_name: name, performed_at: (logDate ? new Date(logDate + 'T12:00:00') : new Date()).toISOString(), notes: sessionNote || null })
        .select().single();
      if (error || !data) { setSaving(false); Alert.alert('Error', 'Failed to save.'); return; }
      session = data;
    }

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      const { data: sessionEx } = await supabase
        .from('session_exercises')
        .insert({ workout_session_id: session.id, exercise_id: ex.exercise.id, exercise_order: i })
        .select().single();
      if (sessionEx) {
        const toInsert = ex.sets
          .filter(s => s.r && parseInt(s.r) > 0)
          .map((s, idx) => ({
            session_exercise_id: sessionEx.id,
            set_number: idx + 1,
            weight: s.w ? parseFloat(s.w) : null,
            reps: parseInt(s.r),
            rpe: s.rpe ? parseFloat(s.rpe) : null,
            is_warmup: s.type === 'warmup',
            cluster_reps: (s.clusters && s.clusters.length) ? s.clusters.map(n => parseInt(n)).filter(n => n > 0) : null,
          }));
        if (toInsert.length > 0) await supabase.from('set_logs').insert(toInsert);
      }
    }
    // Advance template index (only on a fresh logged session, not edits)
    if (templateId && !isEditing) {
      const { data: tmpl } = await supabase.from('workout_templates').select('current_session_index, template_sessions(id)').eq('id', templateId).single();
      if (tmpl) {
        const count = tmpl.template_sessions?.length ?? 1;
        await supabase.from('workout_templates').update({ current_session_index: ((tmpl.current_session_index ?? 0) + 1) % count }).eq('id', templateId);
      }
    }
    setSaving(false);
    if (isEditing) {
      Alert.alert('Session updated', 'Your changes have been saved.', [{ text: 'Done', onPress: navigation.goBack }]);
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) { /* ignore */ }
    setFinishData({ name, volume: liveVolume, hardSets: liveHardSets, sessionId: session.id });
    setShowFinish(true);
  }

  function setNumLabel(sets, i) {
    const s = sets[i];
    if (s.type === 'warmup') return 'W';
    return '' + (sets.slice(0, i).filter(x => x.type === 'normal').length + 1);
  }

  function cellDisplay(set, field) {
    const val = set[field];
    if (val) return { text: val, ghost: false };
    if (set.ghost && set.ghost[field === 'w' ? 'w' : field === 'r' ? 'r' : null]) {
      return { text: set.ghost[field === 'w' ? 'w' : 'r'], ghost: true };
    }
    const placeholder = field === 'rpe' ? '—' : field === 'r' ? 'reps' : 'lbs';
    return { text: placeholder, ghost: true };
  }

  const activeFilter = MUSCLE_GROUPS.find(mg => mg.value === muscleFilter);
  const filteredExercises = allExercises.filter(e => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = !muscleFilter || (
      activeFilter?.filterBy === 'sub'
        ? (e.primary_muscle === 'back' && e.sub_group === muscleFilter)
        : e.primary_muscle === muscleFilter
    );
    return matchSearch && matchFilter;
  });

  const keypadVisible = !!sel;
  const currentKeypadVal = sel ? (exercises[sel.exIdx]?.sets[sel.setIdx]?.[sel.field] ?? '') : '';

  return (
    <SafeAreaView style={s.safe}>
      {/* PR toast */}
      {prToast && (
        <Animated.View style={[s.prToast, { top: Math.max(insets.top, 16) + 8, transform: [{ translateY: toastY }] }]} pointerEvents="none">
          <BlurView intensity={36} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={s.prToastInner}>
            <View style={s.prToastIcon}>
              <MaterialCommunityIcons name="trophy" size={17} color={colors.statusGood} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.prToastKick}>NEW PR</Text>
              <Text style={s.prToastName} numberOfLines={1}>{prToast.exercise}</Text>
            </View>
            <Text style={s.prToastDetail}>{prToast.detail}</Text>
          </View>
        </Animated.View>
      )}

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => Alert.alert(
          isEditing ? 'Discard Changes' : 'Cancel Workout',
          isEditing ? 'Discard your edits to this session?' : 'Discard this session?',
          [
            { text: 'Keep Going', style: 'cancel' },
            { text: 'Discard', style: 'destructive', onPress: navigation.goBack },
          ])}>
          <Text style={s.cancelBtn}>CANCEL</Text>
        </TouchableOpacity>
        <View style={s.liveStats}>
          <Text style={s.liveVol}>{liveVolume > 0 ? `${liveVolume >= 1000 ? (liveVolume/1000).toFixed(1)+'K' : liveVolume} lbs` : '0 lbs'}</Text>
          <Text style={s.liveSets}>{liveHardSets} WORKING {liveHardSets === 1 ? 'SET' : 'SETS'}{isEditing ? ' · EDITING' : ` · ${fmtElapsed(elapsed)}`}</Text>
        </View>
        <TouchableOpacity style={s.finishBtn} onPress={finishWorkout} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.onAcc} size="small" /> : <Text style={s.finishBtnText}>{isEditing ? 'SAVE' : 'FINISH'}</Text>}
        </TouchableOpacity>
      </View>

      {loadingSession ? (
        <View style={s.sessionLoading}>
          <ActivityIndicator size="large" color={colors.acc} />
        </View>
      ) : (
      <GHScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[s.scrollContent, keypadVisible && { paddingBottom: 340 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
        {/* Session header */}
        <View style={s.sessionHeader}>
          <Text style={s.sessionKicker}>SESSION</Text>
          {/* Display-only — auto-named; an accidental tap shouldn't summon the keyboard */}
          <Text style={s.sessionName} numberOfLines={1}>
            {sessionName || `Workout — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`}
          </Text>
          <View style={s.sessionDivider} />
          <View style={s.sessionMetaRow}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => openNote({ type: 'session' }, sessionNote)}>
              <Text style={s.noteLink} numberOfLines={1}>
                {sessionNote ? sessionNote : '+ Session note'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.restToggle} onPress={toggleAutoRest} hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }}>
              <MaterialCommunityIcons name={autoRest ? 'timer-outline' : 'timer-off-outline'} size={13} color={autoRest ? colors.acc : colors.dim} />
              <Text style={[s.restToggleText, { color: autoRest ? colors.acc : colors.dim }]}>REST TIMER {autoRest ? 'ON' : 'OFF'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Exercises */}
        {exercises.map((item, exIdx) => {
          const exLastBest = (item.history?.sets || [])
            .filter(x => (x.weight || 0) > 0 && x.reps > 0)
            .reduce((m, x) => Math.max(m, (x.weight || 0) * (1 + x.reps / 30)), 0);
          let runBest = exLastBest; // running best e1RM this exercise (incl. last session) — PR marks the set that BEATS it
          // Folded-summary data: working-set count + heaviest set by e1RM + PR flag.
          const doneSets = item.sets.filter(st => st.done && st.type !== 'warmup');
          let topW = 0, topR = 0, topE = -1, collapsedPr = false;
          doneSets.forEach(st => {
            const w = +st.w || +(st.ghost?.w) || 0;
            const r = +st.r || +(st.ghost?.r) || 0;
            if (w <= 0 || r <= 0) return;
            const e = w * (1 + r / 30);
            if (e > topE) { topE = e; topW = w; topR = r; }
            if (exLastBest > 0 && e > exLastBest + 0.5) collapsedPr = true;
          });
          const allDone = item.sets.length > 0 && item.sets.every(st => st.done);
          return (
          <FoldableCard
            key={exIdx}
            collapsed={item.collapsed}
            onSetCollapsed={(c) => setCollapsedFor(exIdx, c)}
            cardStyle={[s.exCard, item.collapsed && s.exCardDone]}
            summary={<SummaryRow setCount={doneSets.length} topW={topW} topR={topR} isPr={collapsedPr} />}
            header={(
            <View style={s.exCardHeader}>
              {/* Demo video — small thumbnail upper-left; tap opens the inline player */}
              <VideoThumb
                url={item.exercise?.video_url || PLACEHOLDER_DEMO}
                onPress={() => setVideoModal({ url: item.exercise?.video_url || PLACEHOLDER_DEMO, name: item.exercise.name })}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.exName} numberOfLines={2}>{item.exercise.name.toUpperCase()}</Text>
              </View>
              <View style={s.muscleTag}>
                <Text style={s.muscleTagText}>{(item.exercise.primary_muscle || '').toUpperCase()}</Text>
              </View>
              <TouchableOpacity
                style={[s.moreBtn, item.note && { borderColor: colors.acc }]}
                onPress={() => setExMenuTarget(exIdx)}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              >
                <Text style={[s.moreBtnText, item.note && { color: colors.acc }]}>⋯</Text>
              </TouchableOpacity>
            </View>
            )}
          >
            {/* Note — only when set (add/edit via the ✎ in the header) */}
            {item.note ? (
              <TouchableOpacity style={s.exNoteLine} onPress={() => openNote({ type: 'ex', exIdx }, item.note)}>
                <Text style={s.exNoteText} numberOfLines={2}>✎  {item.note}</Text>
              </TouchableOpacity>
            ) : null}

            {/* Program coaching cue — one quiet gray line (myo-rep/cluster instructions too).
                Swaps live in the FOOTER now (keeps the top lean — room for a demo video later). */}
            {item.prescription ? (
              <Text style={s.cueLine}>{item.prescription}</Text>
            ) : null}

            {/* Coaching call — progressive disclosure (spec §12). Collapsed: action chip +
                severity accent + the prescription + a short reason. Tap → the "why", the
                data it used, and confidence. No apply buttons — the inputs already pre-fill. */}
            {(() => {
              const g = item.guidance;
              if (!g || (!g.coachNote && !g.prescription)) {
                // First exposure / no data yet — a quiet baseline tag, not a full card.
                return (
                  <View style={s.targetPlaceholderRow}>
                    <Text style={s.targetPlaceholderText}>Baseline — log clean sets and your targets start building.</Text>
                  </View>
                );
              }
              const sev = g.severity || 'green';
              const sevColor = sev === 'red' ? colors.statusLow : sev === 'yellow' ? colors.statusMid : colors.statusGood;
              const sevDark = sev === 'red' ? '#3A0D0A' : sev === 'yellow' ? '#2B1605' : '#06210F';
              const confColor = g.confidence === 'high' ? colors.statusGood : g.confidence === 'medium' ? colors.muted : colors.dim;
              const open = !!item.coachOpen;
              const toggle = () => setExercises(p => p.map((e, i) => i === exIdx ? { ...e, coachOpen: !e.coachOpen } : e));
              return (
                <View style={[s.coachCard, { borderLeftColor: sevColor }]}>
                  <TouchableOpacity style={s.coachHead} activeOpacity={0.7} onPress={toggle}>
                    <View style={[s.coachChip, { backgroundColor: sevColor }]}>
                      <Text style={[s.coachChipText, { color: sevDark }]}>{(g.actionLabel || '').toUpperCase()}</Text>
                    </View>
                    <Text style={s.coachRx} numberOfLines={1}>{g.prescription || g.coachNote}</Text>
                    <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.dim} />
                  </TouchableOpacity>
                  {g.reason ? <Text style={s.coachReason} numberOfLines={1}>{g.reason}</Text> : null}
                  {open && (
                    <View style={s.coachExp}>
                      {g.coachNote ? (
                        <Text style={s.coachWhy}><Text style={s.coachWhyLabel}>Why — </Text>{g.coachNote}</Text>
                      ) : null}
                      {g.dataUsed?.length ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.coachDataRow} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
                          {g.dataUsed.map((d, di) => (
                            <View key={di} style={s.coachDataChip}><Text style={s.coachDataChipText} numberOfLines={1}>{d}</Text></View>
                          ))}
                        </ScrollView>
                      ) : null}
                      <Text style={s.coachConf}>CONFIDENCE: <Text style={{ color: confColor }}>{(g.confidence || 'low').toUpperCase()}</Text></Text>
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Column headers */}
            <View style={s.colHeaders}>
              <Text style={[s.colHdr, { width: 30, textAlign: 'center' }]}>SET</Text>
              <Text style={[s.colHdr, { width: 50, textAlign: 'center' }]}>LAST</Text>
              <TouchableOpacity style={s.colHdrTap} onPress={() => fillColumn(exIdx, 'w')} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}>
                <Text style={s.colHdr}>WEIGHT{item.sets.length > 1 ? ' ▾' : ''}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.colHdrTap} onPress={() => fillColumn(exIdx, 'r')} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}>
                <Text style={s.colHdr}>REPS{item.sets.length > 1 ? ' ▾' : ''}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 }} onPress={() => setShowRpeHelp(true)} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}>
                <Text style={s.colHdr}>RPE</Text>
                <Text style={[s.colHdr, { color: colors.muted }]}>ⓘ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ width: 36 }} onPress={() => toggleAllDone(exIdx)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text numberOfLines={1} style={[s.colHdr, s.colHdrDone, { letterSpacing: 0.4 }]}>{item.sets.every(st => st.done) ? 'CLEAR' : 'DONE'}</Text>
              </TouchableOpacity>
            </View>

            {/* Sets — swipe a row left to delete it */}
            {item.sets.map((set, setIdx) => {
              const isSelected = sel?.exIdx === exIdx && sel?.setIdx === setIdx;
              const label = setNumLabel(item.sets, setIdx);
              const isWarmup = set.type === 'warmup';
              // LAST column = this set's number from the previous logged session (history),
              // independent of any applied target (which can overwrite the input ghost).
              const lastG = ghostFor(item.history, setIdx);
              const lastDisp = (lastG && lastG.w) ? `${lastG.w}×${lastG.r}` : '—';
              const wDisp = cellDisplay(set, 'w');
              const rDisp = cellDisplay(set, 'r');
              const rpeDisp = set.rpe ? { text: set.rpe, ghost: false } : { text: '—', ghost: true };
              // PR marks only the set that BEATS the running best (incl. last session + earlier sets this session).
              const setE = (+set.w || 0) * (1 + (+set.r || 0) / 30);
              const overload = set.done && !isWarmup && exLastBest > 0 && setE > runBest + 0.5;
              if (set.done && !isWarmup && setE > runBest) runBest = setE;

              return (
                <View key={setIdx}>
                <ReanimatedSwipeable
                  overshootRight={false}
                  rightThreshold={36}
                  renderRightActions={() => (
                    <TouchableOpacity style={s.swipeDelete} onPress={() => deleteSet(exIdx, setIdx)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color="#fff" />
                    </TouchableOpacity>
                  )}
                >
                <View
                  style={[s.setRow, set.done && s.setRowDone]}
                  ref={node => { if (node) rowRefs.current[`${exIdx}-${setIdx}`] = node; }}
                >

                  {/* Set number — quiet text; tap for warmup/duplicate/cluster options */}
                  <TouchableOpacity
                    style={s.setNum}
                    onPress={() => setMenuTarget({ exIdx, setIdx })}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                  >
                    <Text style={[
                      s.setNumText,
                      set.done && { color: colors.statusGood },
                      isSelected && !set.done && { color: colors.acc },
                      isWarmup && s.setNumTextWarmup,
                    ]}>{label}</Text>
                  </TouchableOpacity>

                  {/* LAST — previous session's value for this set (reference only) */}
                  <View style={s.lastCell}>
                    <Text style={[s.lastCellText, lastDisp === '—' && s.lastCellEmpty]} numberOfLines={1}>{lastDisp}</Text>
                  </View>

                  {/* Weight cell */}
                  <TouchableOpacity
                    style={[s.cell, set.done && s.cellDoneRow, isSelected && sel.field === 'w' && s.cellActive]}
                    onPress={() => openKeypad(exIdx, setIdx, 'w')}
                  >
                    <Text style={[s.cellText, wDisp.ghost && s.cellGhost, isSelected && sel.field === 'w' && s.cellTextActive]}>{wDisp.text}</Text>
                  </TouchableOpacity>

                  {/* Reps cell */}
                  <TouchableOpacity
                    style={[s.cell, set.done && s.cellDoneRow, isSelected && sel.field === 'r' && s.cellActive]}
                    onPress={() => openKeypad(exIdx, setIdx, 'r')}
                  >
                    <Text style={[s.cellText, rDisp.ghost && s.cellGhost, isSelected && sel.field === 'r' && s.cellTextActive]}>{rDisp.text}</Text>
                  </TouchableOpacity>

                  {/* RPE cell */}
                  <TouchableOpacity
                    style={[s.cell, set.done && s.cellDoneRow, isSelected && sel.field === 'rpe' && s.cellActive]}
                    onPress={() => openKeypad(exIdx, setIdx, 'rpe')}
                  >
                    <Text style={[s.cellText, rpeDisp.ghost && s.cellGhost, isSelected && sel.field === 'rpe' && s.cellTextActive]}>{rpeDisp.text}</Text>
                  </TouchableOpacity>

                  {/* Check — empty until done, green when complete */}
                  <TouchableOpacity
                    style={[s.checkBtn, set.done && s.checkBtnDone, overload && s.checkBtnOverload]}
                    onPress={() => toggleDone(exIdx, setIdx)}
                  >
                    {set.done ? <Text style={s.checkMarkDone}>✓</Text> : null}
                    {overload && <View style={s.overloadBadge}><Text style={s.overloadBadgeText}>PR</Text></View>}
                  </TouchableOpacity>
                </View>
                </ReanimatedSwipeable>
                {set.clusters?.length > 0 && (
                  <View style={s.clusterRow}>
                    <Text style={s.clusterLabel}>CLUSTERS</Text>
                    {set.clusters.map((cr, ci) => (
                      <View key={ci} style={s.clusterChip}>
                        <TouchableOpacity onPress={() => stepCluster(exIdx, setIdx, ci, -1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}>
                          <Text style={s.clusterStep}>−</Text>
                        </TouchableOpacity>
                        <Text style={s.clusterVal}>{cr}</Text>
                        <TouchableOpacity onPress={() => stepCluster(exIdx, setIdx, ci, 1)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 6 }}>
                          <Text style={s.clusterStep}>+</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeCluster(exIdx, setIdx, ci)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
                          <Text style={s.clusterChipX}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity style={s.clusterAdd} onPress={() => addCluster(exIdx, setIdx)}>
                      <Text style={s.clusterAddText}>+ CLUSTER</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.clusterRemove} onPress={() => removeClusters(exIdx, setIdx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={s.clusterRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {/* Inline rest timer — sits under the set that started it (Strong-style). */}
                {rest && rest.exIdx === exIdx && rest.setIdx === setIdx && (
                  <RestDivider rest={rest} onPreset={setRestDuration} onSkip={() => setRest(null)} />
                )}
                </View>
              );
            })}

            {/* Footer — add set (left) + fold-up (right, once complete). One compact row. */}
            <View style={s.exFooter}>
              <TouchableOpacity style={s.addSetBtn} onPress={() => addSet(exIdx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 12 }}>
                <Text style={s.addSetText}>+ ADD SET</Text>
              </TouchableOpacity>
              {allDone && (
                <TouchableOpacity style={s.foldUpBtn} onPress={() => setCollapsedFor(exIdx, true)} hitSlop={{ top: 10, bottom: 10, left: 12, right: 8 }}>
                  <Text style={s.foldUpLabel}>FOLD UP</Text>
                  <Text style={s.foldUpIcon}>▴</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Swaps — moved out of the top stack to a quiet footer line (reference, not in the way) */}
            {item.swaps ? (
              <View style={s.swapFooter}>
                <MaterialCommunityIcons name="swap-horizontal" size={13} color={colors.dim} />
                <Text style={s.swapFooterText} numberOfLines={2}><Text style={s.swapFooterLabel}>SWAP  </Text>{item.swaps}</Text>
              </View>
            ) : null}
          </FoldableCard>
          );
        })}

        {/* + ADD EXERCISE */}
        <TouchableOpacity style={s.addExBtn} onPress={() => setShowPicker(true)}>
          <Text style={s.addExText}>+ ADD EXERCISE</Text>
        </TouchableOpacity>

        {/* Finish at the bottom (you're here after logging your last set) */}
        {exercises.length > 0 && (
          <TouchableOpacity style={s.bottomFinish} onPress={finishWorkout} disabled={saving}>
            {saving
              ? <ActivityIndicator color={colors.onAcc} size="small" />
              : <Text style={s.bottomFinishText}>{isEditing ? 'SAVE SESSION' : 'FINISH SESSION'}</Text>}
          </TouchableOpacity>
        )}
      </GHScrollView>
      )}

      {/* Rest timer is INLINE-only (the capsule under the active set). When an exercise
          folds up, its rest is cleared in toggleDone — no stray bottom bar. */}

      {/* Custom keypad */}
      <Keypad
        visible={keypadVisible}
        label={sel?.field === 'w' ? 'WEIGHT (LBS)' : sel?.field === 'r' ? 'REPS' : 'RPE'}
        isRpe={sel?.field === 'rpe'}
        value={currentKeypadVal}
        onKey={handleKey}
        onChipRpe={handleRpeChip}
        onClearRpe={clearRpe}
        onDone={doneKeypad}
        onAdvance={handleAdvance}
        advanceDone={sel?.field === 'rpe'}
      />

      {/* RPE explainer */}
      <RpeHelpSheet visible={showRpeHelp} onClose={() => setShowRpeHelp(false)} />

      {/* Inline demo-video player */}
      <VideoPlayerModal url={videoModal?.url} title={videoModal?.name} onClose={() => setVideoModal(null)} />

      {/* Exercise ⋯ menu */}
      <ExerciseOptionsSheet
        visible={exMenuTarget != null}
        name={exMenuTarget != null ? (exercises[exMenuTarget]?.exercise.name || '').toUpperCase() : ''}
        hasNote={exMenuTarget != null && !!exercises[exMenuTarget]?.note}
        canUp={exMenuTarget != null && exMenuTarget > 0}
        canDown={exMenuTarget != null && exMenuTarget < exercises.length - 1}
        onNote={() => { const i = exMenuTarget; setExMenuTarget(null); openNote({ type: 'ex', exIdx: i }, exercises[i]?.note); }}
        onUp={() => { const i = exMenuTarget; setExMenuTarget(null); moveExercise(i, -1); }}
        onDown={() => { const i = exMenuTarget; setExMenuTarget(null); moveExercise(i, 1); }}
        onRemove={() => { const i = exMenuTarget; setExMenuTarget(null); removeExercise(i); }}
        onCancel={() => setExMenuTarget(null)}
      />

      {/* Set options sheet */}
      <SetOptionsSheet
        visible={!!menuTarget}
        set={menuTarget ? exercises[menuTarget.exIdx]?.sets[menuTarget.setIdx] : null}
        onAddCluster={() => addCluster(menuTarget.exIdx, menuTarget.setIdx)}
        onCancel={() => setMenuTarget(null)}
      />

      {/* Note sheet */}
      <NoteSheet
        visible={!!noteTarget}
        title={noteTarget?.type === 'session' ? 'SESSION NOTE' : 'SETUP NOTE'}
        value={noteDraft}
        onChange={setNoteDraft}
        onSave={saveNote}
        onClose={() => setNoteTarget(null)}
      />

      {/* Exercise picker */}
      <Modal visible={showPicker} animationType="slide">
        <SafeAreaView style={s.safe}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.pickerHeader} onStartShouldSetResponderCapture={() => { Keyboard.dismiss(); return false; }}>
              <Text style={s.pickerTitle}>ADD EXERCISE</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                <TouchableOpacity onPress={() => { setCreateName(search.trim()); setCreateMuscle(''); setShowCreate(true); }}>
                  <Text style={s.pickerNew}>+ NEW</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowPicker(false); setSearch(''); setMuscleFilter(''); }}>
                  <Text style={s.pickerClose}>CLOSE</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={s.pickerSearchRow}>
              <TextInput
                style={s.pickerSearch}
                placeholder="Search exercises..."
                placeholderTextColor={colors.dim}
                value={search}
                onChangeText={setSearch}
              />
            </View>
            {/* Any touch on the chips or the list (tap OR scroll) drops the keyboard so
                the full exercise list is visible — the search box alone keeps it up. */}
            <View style={s.chipsGrid} onStartShouldSetResponderCapture={() => { Keyboard.dismiss(); return false; }}>
              {MUSCLE_GROUPS.map(mg => (
                <TouchableOpacity key={mg.value} style={[s.chip, muscleFilter === mg.value && s.chipOn]} onPress={() => { Keyboard.dismiss(); setMuscleFilter(mg.value); }}>
                  <Text style={[s.chipText, muscleFilter === mg.value && s.chipTextOn]}>{mg.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <FlatList
              data={filteredExercises}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScrollBeginDrag={() => Keyboard.dismiss()}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.pickerRow} onPress={() => addExercise(item)}>
                  <Text style={s.pickerRowName}>{item.name}{item.user_id ? '  ·  CUSTOM' : ''}</Text>
                  <Text style={s.pickerRowMuscle}>{capitalize(item.primary_muscle)}</Text>
                </TouchableOpacity>
              )}
              ListFooterComponent={(
                <TouchableOpacity
                  style={s.createRow}
                  onPress={() => { setCreateName(search.trim()); setCreateMuscle(''); setShowCreate(true); }}
                >
                  <Text style={s.createRowText}>+ CREATE NEW EXERCISE</Text>
                  <Text style={s.createRowSub}>Add your own (private to you)</Text>
                </TouchableOpacity>
              )}
            />
          </KeyboardAvoidingView>
        </SafeAreaView>

        {/* Create custom exercise sheet */}
        <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
          <KeyboardAvoidingView style={s.createBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowCreate(false)} />
            <View style={s.createSheet}>
              <Text style={s.createTitle}>NEW EXERCISE</Text>
              <TextInput
                style={s.createInput}
                placeholder="Exercise name"
                placeholderTextColor={colors.dim}
                value={createName}
                onChangeText={setCreateName}
                autoFocus
              />
              <Text style={s.createLabel}>MUSCLE GROUP</Text>
              <View style={s.chipsGrid}>
                {CREATE_MUSCLES.map(m => (
                  <TouchableOpacity key={m} style={[s.chip, createMuscle === m && s.chipOn]} onPress={() => setCreateMuscle(m)}>
                    <Text style={[s.chipText, createMuscle === m && s.chipTextOn]}>{capitalize(m)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={s.createBtnRow}>
                <TouchableOpacity onPress={() => setShowCreate(false)}>
                  <Text style={s.createCancel}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.createSave} onPress={createCustomExercise} disabled={creating}>
                  {creating ? <ActivityIndicator color={colors.onAcc} size="small" /> : <Text style={s.createSaveText}>CREATE & ADD</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </Modal>

      {/* Finish overlay */}
      <FinishOverlay
        visible={showFinish}
        sessionName={finishData?.name || sessionName}
        volume={finishData?.volume || liveVolume}
        hardSets={finishData?.hardSets || liveHardSets}
        onDone={async (checkin) => {
          const id = finishData?.sessionId;
          if (id && checkin && (checkin.session_rpe != null || checkin.soreness != null || checkin.readiness != null)) {
            try {
              await supabase.from('workout_sessions').update({
                session_rpe: checkin.session_rpe ?? null,
                soreness: checkin.soreness ?? null,
                readiness: checkin.readiness ?? null,
              }).eq('id', id);
            } catch (e) { /* non-blocking — the session is already saved */ }
          }
          setShowFinish(false);
          navigation.navigate('Tabs', { screen: 'Home' }); // finishing a session always lands on Home
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingBottom: 40 },

  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: 12, borderBottomWidth: 1.5, borderBottomColor: colors.line },
  cancelBtn: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  liveStats: { alignItems: 'center' },
  liveVol: { fontFamily: fonts.display, fontSize: 18, color: colors.text, textTransform: 'uppercase' },
  liveSets: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 1 },
  finishBtn: { backgroundColor: colors.acc, paddingHorizontal: 14, paddingVertical: 6 },
  finishBtnText: { fontFamily: fonts.display, fontSize: 13, lineHeight: 18, paddingTop: 2, color: colors.onAcc, textTransform: 'uppercase', textAlign: 'center' },

  // Session header
  sessionHeader: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md },
  sessionKicker: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.8, marginBottom: 10 },
  sessionName: { fontFamily: fonts.display, fontSize: 28, color: colors.text, textTransform: 'uppercase', paddingVertical: 4, lineHeight: 38 },
  sessionDivider: { height: 1.5, backgroundColor: colors.line, marginVertical: space.sm },
  sessionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  noteLink: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  restToggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  restToggleText: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },

  // Exercise card
  exCard: { marginHorizontal: space.lg, marginBottom: space.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf, borderRadius: 14, overflow: 'hidden' },
  exCardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingTop: 2, paddingBottom: space.sm, gap: space.sm },
  // Drag handle — grab strip at the top of each card; drag it to fold/unfold.
  // Tall touch target + a visible bar so it reads as grabbable (iOS sheet handle).
  grabStrip: { alignItems: 'center', justifyContent: 'center', paddingTop: 9, paddingBottom: 5 },
  grabBar: { width: 44, height: 5, borderRadius: 2.5, backgroundColor: colors.dim },
  // Cross-fade region: body + folded summary share this space; its height interpolates.
  foldRegion: { overflow: 'hidden' },
  foldSummaryAbs: { position: 'absolute', left: 0, right: 0, top: 0 },
  // Folded (all sets checked) — green left bar signals "done".
  exCardDone: { borderLeftWidth: 3, borderLeftColor: colors.statusGood },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: 2, paddingBottom: 14, borderTopWidth: 1.5, borderTopColor: colors.line },
  summaryCheck: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.statusGood, alignItems: 'center', justifyContent: 'center' },
  summaryCheckMark: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onAcc, lineHeight: 17 },
  summaryText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontVariant: ['tabular-nums'] },
  summaryPr: { backgroundColor: colors.statusGood, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 2 },
  summaryPrText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.onAcc, letterSpacing: 1 },
  summaryChevron: { fontFamily: fonts.bodyMed, fontSize: 16, color: colors.muted },
  // Footer row — advanced disclosure + fold-up control.
  exFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1.5, borderTopColor: colors.line },
  swapFooter: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingHorizontal: space.md, paddingTop: 9, paddingBottom: 11, borderTopWidth: 1, borderTopColor: '#1B1B19' },
  swapFooterLabel: { fontFamily: fonts.bodySemi, color: colors.dim, letterSpacing: 1.2 },
  swapFooterText: { flex: 1, fontFamily: fonts.body, fontSize: 11.5, color: colors.muted, lineHeight: 16 },
  foldUpBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: space.md, paddingVertical: 10 },
  foldUpLabel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.2 },
  foldUpIcon: { fontFamily: fonts.bodyMed, fontSize: 15, color: colors.muted, lineHeight: 15 },
  exName: { fontFamily: fonts.display, fontSize: 18, color: colors.text, textTransform: 'uppercase', lineHeight: 21 },
  muscleTag: { borderWidth: 1.5, borderColor: colors.acc, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  muscleTagText: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.acc, textTransform: 'uppercase', letterSpacing: 1 },
  // ⋯ — note / reorder / remove live behind this (occasional actions, one place)
  moreBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.line2, borderRadius: 8 },
  moreBtnText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.muted, lineHeight: 18, marginTop: -4 },

  setupNote: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 8, borderTopWidth: 1.5, borderTopColor: colors.line },
  setupNoteSet: { backgroundColor: colors.accSurf, borderTopColor: colors.accDim },
  setupNoteText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.dim },
  setupNoteTextSet: { color: colors.muted },
  setupNoteEdit: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.acc, textTransform: 'uppercase', letterSpacing: 1 },

  lastRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 7, borderTopWidth: 1.5, borderTopColor: colors.line, gap: space.sm },
  lastLabel: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  lastData: { fontFamily: fonts.body, fontSize: 12, color: colors.dim },

  targetRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.md, paddingVertical: 9, borderTopWidth: 1.5, borderTopColor: colors.accDim, backgroundColor: colors.accSurf, gap: 8 },
  targetDot: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.acc, marginTop: 2 },
  targetKicker: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 3 },
  targetText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.acc2, letterSpacing: 0.2, lineHeight: 18 },

  // Exercise demo video — compact header thumbnail + full inline player modal
  vThumb: { width: 46, height: 46, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.line2, marginRight: 10 },
  vThumbImg: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  vThumbOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.32)' },
  vModalSafe: { flex: 1, backgroundColor: colors.bg },
  vModalBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingVertical: 10, borderBottomWidth: 1.5, borderBottomColor: colors.line },
  vBack: { flexDirection: 'row', alignItems: 'center', width: 58 },
  vBackText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text, textTransform: 'uppercase', letterSpacing: 1 },
  vModalTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 15, color: colors.text, textTransform: 'uppercase' },
  vPlayerWrap: { marginTop: space.lg, backgroundColor: '#000' },
  vModalHint: { textAlign: 'center', fontFamily: fonts.body, fontSize: 12, color: colors.dim, marginTop: space.lg },

  // Compact intelligence strip (LAST + TARGET merged) + inline note line
  exNoteLine: { paddingHorizontal: space.md, paddingVertical: 6, borderTopWidth: 1.5, borderTopColor: colors.line },
  exNoteText: { fontFamily: fonts.body, fontSize: 12, color: colors.acc2, lineHeight: 17 },
  cueLine: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, lineHeight: 17, marginHorizontal: space.md, marginTop: 8 },
  rxSwap: { fontFamily: fonts.bodySemi, fontSize: 9.5, color: colors.dim, letterSpacing: 0.5, marginHorizontal: space.md, marginTop: 5 },
  intelStrip: { borderTopWidth: 1.5, borderTopColor: colors.accDim, backgroundColor: colors.accSurf, paddingHorizontal: space.md, paddingVertical: 7 },
  intelLastRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  intelLastLabel: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.2 },
  intelLastData: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.dim },
  intelTargetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  intelTargetText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13, color: colors.acc2, lineHeight: 18 },
  // Appliable target = a real button: bordered row + APPLY chip; loaded = green + ✓.
  targetBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,90,30,0.35)', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, marginTop: 5 },
  targetBtnOn: { borderColor: 'rgba(70,194,106,0.55)', backgroundColor: 'rgba(70,194,106,0.07)' },
  targetChip: { borderWidth: 1, borderColor: colors.acc, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  targetChipOn: { borderColor: 'transparent', backgroundColor: colors.statusGood },
  targetChipText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.acc, letterSpacing: 0.8 },
  targetChipTextOn: { color: '#0C2914' },
  moreTargets: { alignSelf: 'flex-start', paddingTop: 6, paddingBottom: 1 },
  moreTargetsText: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.dim, letterSpacing: 1 },

  // Coaching call — progressive-disclosure card (§12). Severity = left accent bar.
  coachCard: { borderTopWidth: 1.5, borderTopColor: '#2A2A2A', borderLeftWidth: 3, backgroundColor: '#161514' },
  coachHead: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: space.md, paddingTop: 10, paddingBottom: 3 },
  coachChip: { paddingHorizontal: 8, paddingVertical: 3 },
  coachChipText: { fontFamily: fonts.display, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  coachRx: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  coachReason: { fontFamily: fonts.body, fontSize: 12, color: '#C9A86A', paddingHorizontal: space.md, paddingBottom: 10 },
  coachExp: { paddingHorizontal: space.md, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: '#232323' },
  coachWhy: { fontFamily: fonts.body, fontSize: 12.5, color: '#D9D4CC', lineHeight: 18 },
  coachWhyLabel: { fontFamily: fonts.bodySemi, color: colors.muted },
  coachDataRow: { marginTop: 10, flexGrow: 0 },
  coachDataChip: { borderWidth: 1, borderColor: colors.line2, paddingHorizontal: 7, paddingVertical: 3 },
  coachDataChipText: { fontFamily: fonts.bodySemi, fontSize: 9.5, color: colors.muted, letterSpacing: 0.5 },
  coachConf: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.dim, letterSpacing: 1, marginTop: 9 },

  // Per-set LAST column — faint reference, never competes with the live inputs.
  lastCell: { width: 50, alignItems: 'center', justifyContent: 'center' },
  lastCellText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.dim, fontVariant: ['tabular-nums'] },
  lastCellEmpty: { color: colors.line2 },

  plateauRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.md, paddingVertical: 8, borderTopWidth: 1.5, borderTopColor: 'rgba(255,138,61,0.34)', backgroundColor: colors.surf, gap: 8 },
  plateauRowFlag: { borderTopColor: 'rgba(255,122,107,0.34)', backgroundColor: colors.surf },
  plateauIcon: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.acc2, marginTop: 1 },
  plateauIconFlag: { color: colors.dangerTxt },
  plateauText: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: '#C9A86A', lineHeight: 16 },
  plateauTextFlag: { color: colors.dangerTxt },

  targetPlaceholderRow: { paddingHorizontal: space.md, paddingVertical: 8, borderTopWidth: 1.5, borderTopColor: colors.line },
  targetPlaceholderText: { fontFamily: fonts.body, fontSize: 11, color: colors.dim, fontStyle: 'italic' },

  colHeaders: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingVertical: 10, gap: 4, borderTopWidth: 1.5, borderTopColor: colors.line, borderBottomWidth: 1.5, borderBottomColor: colors.line },
  colHdr: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.dim, textTransform: 'uppercase', letterSpacing: 1.4, textAlign: 'center' },
  colHdrTap: { flex: 1, paddingVertical: 4 },
  colHdrDone: { color: colors.acc },

  // Set rows — quiet chrome, the lifter's numbers carry the weight. Color = state only.
  setRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 5, gap: 8, borderBottomWidth: 1, borderBottomColor: '#1B1B19', backgroundColor: colors.surf },
  // No done-row band — the green set number + green check already signal completion.
  setRowDone: {},
  setNum: { width: 30, alignItems: 'center', justifyContent: 'center' },
  setNumText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.dim, fontVariant: ['tabular-nums'] },
  setNumTextWarmup: { color: colors.muted },

  // Input pills — visible tap affordance; active = orange ring; done rows melt to text.
  cell: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surf2, borderWidth: 1, borderColor: '#242424', borderRadius: 8 },
  cellActive: { borderWidth: 1.5, borderColor: colors.acc },
  cellDoneRow: { backgroundColor: 'transparent', borderColor: 'transparent' },
  cellText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  cellTextActive: { color: colors.acc },
  // Ghosts = last session's numbers as placeholders. Deliberately faint so they can't
  // be mistaken for entered values (they fill in on check if left untouched).
  cellGhost: { color: '#4A4A46' },
  // Ghosts after a target is LOADED — clearly visible (this is your plan for today),
  // still dimmer than typed values so they read as pre-fill, not entered data.
  cellGhostApplied: { color: colors.muted },
  sessionLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Swipe-left delete pane behind each row
  swipeDelete: { width: 64, backgroundColor: '#D8412F', alignItems: 'center', justifyContent: 'center' },

  checkBtn: { width: 30, height: 30, borderWidth: 1.5, borderColor: colors.line2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  checkBtnDone: { backgroundColor: colors.statusGood, borderColor: colors.statusGood },
  checkBtnOverload: { borderColor: colors.statusGood },
  // PR toast — frosted glass + trophy, premium not slab (spec doc: old orange/black "looked cheap")
  prToast: { position: 'absolute', top: 8, left: space.lg, right: space.lg, zIndex: 100, elevation: 100, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  prToastInner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.md, paddingVertical: 11, backgroundColor: 'rgba(18,18,18,0.45)' },
  prToastIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(70,194,106,0.16)', alignItems: 'center', justifyContent: 'center' },
  prToastKick: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.statusGood, letterSpacing: 1.5 },
  prToastName: { fontFamily: fonts.display, fontSize: 15, color: colors.text, textTransform: 'uppercase', lineHeight: 18 },
  prToastDetail: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.statusGood, fontVariant: ['tabular-nums'] },
  clusterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingLeft: 52, paddingRight: space.sm, paddingBottom: 8, marginTop: -2 },
  clusterLabel: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.acc2, letterSpacing: 1.2, marginRight: 2 },
  clusterChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf2, paddingHorizontal: 8, paddingVertical: 3, gap: 7 },
  clusterChipX: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted, marginLeft: 1 },
  clusterStep: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.acc, lineHeight: 18, width: 14, textAlign: 'center' },
  clusterVal: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, minWidth: 14, textAlign: 'center' },
  clusterAdd: { borderWidth: 1.5, borderColor: colors.acc, borderStyle: 'dashed', paddingHorizontal: 8, paddingVertical: 4 },
  clusterAddText: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.acc, letterSpacing: 0.8 },
  clusterRemove: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  clusterRemoveText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  overloadBadge: { position: 'absolute', top: -8, right: -10, backgroundColor: colors.statusGood, height: 16, minWidth: 22, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.bg },
  overloadBadgeText: { fontFamily: fonts.bodyBold, fontSize: 9, color: '#06210F', letterSpacing: 0.3 },
  checkMarkDone: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onAcc },

  addSetBtn: { paddingVertical: 11, paddingHorizontal: space.md },
  addSetText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.acc, textTransform: 'uppercase', letterSpacing: 1.2 },


  keypadBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9 },
  addExBtn: { marginHorizontal: space.lg, marginTop: space.md, borderWidth: 1.5, borderColor: colors.acc, borderStyle: 'dashed', paddingVertical: 18, alignItems: 'center' },
  addExText: { fontFamily: fonts.display, fontSize: 16, color: colors.acc, textTransform: 'uppercase', letterSpacing: 0.5 },
  bottomFinish: { marginHorizontal: space.lg, marginTop: space.md, backgroundColor: colors.acc, paddingVertical: 18, alignItems: 'center' },
  bottomFinishText: { fontFamily: fonts.display, fontSize: 18, color: colors.onAcc, textTransform: 'uppercase', letterSpacing: 0.5 },

  createRow: { paddingHorizontal: space.lg, paddingVertical: 18, borderTopWidth: 1.5, borderTopColor: colors.line, marginTop: 4 },
  createRowText: { fontFamily: fonts.display, fontSize: 16, color: colors.acc, textTransform: 'uppercase', letterSpacing: 0.5 },
  createRowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
  createBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  createSheet: { backgroundColor: colors.surf, borderTopWidth: 1.5, borderTopColor: colors.line2, padding: space.lg, paddingBottom: space.xl },
  createTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.text, textTransform: 'uppercase', marginBottom: space.md },
  createInput: { backgroundColor: colors.surf2, color: colors.text, fontFamily: fonts.bodyMed, fontSize: 16, paddingHorizontal: space.md, paddingVertical: 14, borderWidth: 1.5, borderColor: colors.line, marginBottom: space.md },
  createLabel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: space.sm },
  createBtnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg },
  createCancel: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  createSave: { backgroundColor: colors.acc, paddingHorizontal: space.lg, paddingVertical: 14 },
  createSaveText: { fontFamily: fonts.display, fontSize: 15, color: colors.onAcc, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Rest timer
  restBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 56, backgroundColor: colors.surf, borderTopWidth: 1.5, borderTopColor: colors.line, overflow: 'hidden' },
  restBarDone: { borderTopColor: colors.acc },
  restFill: { position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: colors.accDim },
  restContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg },
  restLabel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginRight: space.sm },
  restTime: { fontFamily: fonts.display, fontSize: 18, color: colors.acc, fontVariant: ['tabular-nums'] },
  restControls: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  restPill: { borderWidth: 1.5, borderColor: colors.line2, paddingHorizontal: 8, paddingVertical: 6 },
  restPillOn: { borderColor: colors.acc, backgroundColor: colors.accSurf },
  restPreset: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted, fontVariant: ['tabular-nums'] },
  restPresetOn: { color: colors.acc },
  restCtrl: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },

  // Inline rest timer = its OWN feature, not a table row. An elevated true-black capsule
  // inset from the card edges + orange edge → it lifts off the charcoal table. The bold
  // condensed countdown carries it; a crisp orange line rides the bottom as progress.
  restDivider: { position: 'relative', marginHorizontal: space.md, marginTop: 7, marginBottom: 9, borderRadius: 11, backgroundColor: '#000000', borderWidth: 1, borderColor: 'rgba(255,90,30,0.55)', overflow: 'hidden' },
  restDividerContent: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, paddingVertical: 10 },
  restDividerLabel: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.acc2, textTransform: 'uppercase', letterSpacing: 2 },
  restDividerTime: { fontFamily: fonts.display, fontSize: 20, lineHeight: 22, paddingTop: 2, color: colors.acc, fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  restDividerPills: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  restDivPill: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  restDivPillOn: { borderColor: colors.acc },
  restDivPreset: { fontFamily: fonts.bodySemi, fontSize: 10.5, color: colors.muted, fontVariant: ['tabular-nums'] },
  restDivPresetOn: { color: colors.acc },
  restDividerCtrl: { fontFamily: fonts.bodySemi, fontSize: 10.5, color: colors.acc2, textTransform: 'uppercase', letterSpacing: 1 },
  restDividerBar: { position: 'absolute', left: 0, bottom: 0, height: 3, backgroundColor: colors.acc },

  // Picker
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 14, borderBottomWidth: 1.5, borderBottomColor: colors.line },
  pickerTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.text, textTransform: 'uppercase' },
  pickerClose: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.acc, textTransform: 'uppercase', letterSpacing: 1 },
  pickerNew: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.acc2, textTransform: 'uppercase', letterSpacing: 1 },
  pickerSearchRow: { paddingHorizontal: space.lg, paddingVertical: space.sm },
  pickerSearch: { backgroundColor: colors.surf2, color: colors.text, fontFamily: fonts.bodyMed, fontSize: 15, paddingHorizontal: space.md, paddingVertical: 12, borderWidth: 1.5, borderColor: colors.line },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 14, borderBottomWidth: 1.5, borderBottomColor: colors.line },
  pickerRowName: { fontFamily: fonts.bodyMed, fontSize: 15, color: colors.text, flex: 1 },
  pickerRowMuscle: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  chipsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.lg, paddingVertical: space.sm, gap: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf },
  chipOn: { backgroundColor: colors.acc, borderColor: colors.acc },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  chipTextOn: { color: colors.onAcc },
});

// Keypad styles
const kp = StyleSheet.create({
  container: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surf, borderTopWidth: 1.5, borderTopColor: colors.line2, zIndex: 10 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 12, borderBottomWidth: 1.5, borderBottomColor: colors.line },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.acc, textTransform: 'uppercase', letterSpacing: 1.5 },
  doneBtn: { borderWidth: 1.5, borderColor: colors.line2, borderRadius: 7, paddingHorizontal: 14, paddingVertical: 6 },
  doneText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },

  // Field-chain layout: keys on the left, full-height advance key on the right.
  body: { flexDirection: 'row', alignItems: 'stretch', paddingBottom: 6 },
  leftCol: { flex: 1 },
  adv: { width: 86, marginVertical: 6, marginRight: 6, marginLeft: 4, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  advNext: { backgroundColor: colors.acc },
  advDone: { backgroundColor: colors.statusGood },
  advLbl: { fontFamily: fonts.bodyBold, fontSize: 9, color: '#0C0B0A', letterSpacing: 2, marginTop: 3 },
  // One-tap RPE pad — 3×3 grid of the real scale (6–10 in halves), big targets.
  rpeGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 6, gap: 6 },
  rpeKey: { width: '31.5%', height: 50, borderWidth: 1.5, borderColor: colors.line2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surf2 },
  rpeKeyOn: { backgroundColor: colors.acc, borderColor: colors.acc },
  rpeKeyText: { fontFamily: fonts.display, fontSize: 19, color: colors.text },
  rpeKeyTextOn: { color: colors.onAcc },
  rpeClear: { alignSelf: 'center', paddingVertical: 9, paddingHorizontal: 24, marginBottom: 4 },
  rpeClearText: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, letterSpacing: 1.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  key: { width: '33.33%', height: 52, borderWidth: 0.75, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surf2 },
  keyText: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
});

// Sheet styles
const sh = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surf, borderTopWidth: 1.5, borderTopColor: colors.line2, paddingBottom: space.xl },
  handle: { width: 36, height: 4, backgroundColor: colors.line2, alignSelf: 'center', marginTop: space.sm, marginBottom: space.md, borderRadius: 2 },
  title: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.8, paddingHorizontal: space.lg, marginBottom: space.md },
  row: { paddingHorizontal: space.lg, paddingVertical: 16, borderTopWidth: 1.5, borderTopColor: colors.line },
  rowDanger: { backgroundColor: 'rgba(197,52,27,0.08)' },
  rowText: { fontFamily: fonts.bodyMed, fontSize: 16, color: colors.text },
  rowTextDanger: { fontFamily: fonts.bodyMed, fontSize: 16, color: colors.dangerTxt },
  cancelBtn: { marginHorizontal: space.lg, marginTop: space.md, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: colors.line2 },
  cancelText: { fontFamily: fonts.display, fontSize: 14, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  rpeIntro: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, lineHeight: 19, paddingHorizontal: space.lg, marginBottom: space.md },
  rpeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingVertical: 7 },
  rpeNum: { width: 34, height: 34, borderWidth: 1.5, borderColor: colors.acc, alignItems: 'center', justifyContent: 'center' },
  rpeNumText: { fontFamily: fonts.display, fontSize: 16, color: colors.acc },
  rpeText: { flex: 1, fontFamily: fonts.bodyMed, fontSize: 14, color: colors.text },
  noteInput: { marginHorizontal: space.lg, marginTop: space.sm, backgroundColor: colors.surf2, color: colors.text, fontFamily: fonts.bodyMed, fontSize: 15, padding: space.md, borderWidth: 1.5, borderColor: colors.line, minHeight: 100, textAlignVertical: 'top' },
  saveBtn: { marginHorizontal: space.lg, marginTop: space.md, backgroundColor: colors.acc, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontFamily: fonts.display, fontSize: 15, color: colors.onAcc, textTransform: 'uppercase' },
});

// Finish overlay styles
const fo = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, zIndex: 50, elevation: 50 },
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.lg },
  badge: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.acc, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
  check: { fontFamily: fonts.bodyBold, fontSize: 28, color: colors.onAcc },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.8, marginBottom: space.sm },
  name: { fontFamily: fonts.display, fontSize: 30, color: colors.text, textTransform: 'uppercase', textAlign: 'center', lineHeight: 34, marginBottom: space.lg },
  statsRow: { flexDirection: 'row', borderWidth: 1.5, borderColor: colors.line, width: '100%', marginBottom: space.md },
  statCell: { flex: 1, padding: space.md, alignItems: 'center' },
  statCellBorder: { borderLeftWidth: 1.5, borderLeftColor: colors.line },
  statVal: { fontFamily: fonts.display, fontSize: 24, textTransform: 'uppercase' },
  statLbl: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 },
  note: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: space.xl },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.lg },
  doneBtn: { backgroundColor: colors.acc, width: '100%', paddingVertical: 16, alignItems: 'center', marginTop: space.md },
  doneBtnText: { fontFamily: fonts.display, fontSize: 18, color: colors.onAcc, textTransform: 'uppercase' },

  // Quick check-in
  checkin: { width: '100%', borderTopWidth: 1.5, borderTopColor: colors.line, paddingTop: space.md, marginTop: space.xs },
  checkinHead: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text, textTransform: 'uppercase', letterSpacing: 1.5, textAlign: 'center' },
  checkinSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 3, marginBottom: space.md },
  qLabel: { fontFamily: fonts.bodyMed, fontSize: 14, color: colors.text, marginBottom: 6 },
  qKey: { fontFamily: fonts.bodySemi, color: colors.acc },
  scaleWrap: { marginBottom: space.md },
  scaleRow: { flexDirection: 'row', gap: 5 },
  scaleChip: { flex: 1, height: 38, borderWidth: 1.5, borderColor: colors.line2, backgroundColor: colors.surf, alignItems: 'center', justifyContent: 'center' },
  scaleChipSel: { backgroundColor: colors.acc, borderColor: colors.acc },
  scaleChipTxt: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted, fontVariant: ['tabular-nums'] },
  scaleChipTxtSel: { color: colors.onAcc },
  scaleAnchors: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  scaleAnchor: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.dim, textTransform: 'uppercase', letterSpacing: 0.8 },
  scaleSel: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.acc2, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginTop: 6 },
});
