// @ts-nocheck
import React, { useEffect } from 'react';
import { Modal, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

// Shared bottom-sheet shell: backdrop tap closes, and the sheet GENUINELY swipes down
// to dismiss (standing rule: if it looks draggable, it is). GestureHandlerRootView
// inside the Modal is required for gestures under Fabric. Children bring their own
// sheet styling (background, radius, padding).
export default function SwipeSheet({ visible, onClose, keyboardAvoid, children }) {
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
    <TouchableOpacity style={s.overlay} onPress={onClose} activeOpacity={1}>
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

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
});
