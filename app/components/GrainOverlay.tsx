import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

// ~4% fractal grain so the near-black surfaces aren't dead-flat. Tiled, non-interactive.
export default function GrainOverlay() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        source={require('../../assets/grain.png')}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFill, { opacity: 0.045 }]}
      />
    </View>
  );
}
