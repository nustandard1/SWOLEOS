import React from 'react';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { intelGradient } from '../theme/forge';

// Small gradient-filled dot — same Intelligence identity (magenta → purple → cyan)
// as the gradient wordmark. Used for the live Pulse dot.
export default function GradientDot({ size = 9 }: { size?: number }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id="intelDot" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={intelGradient.colors[0]} />
          <Stop offset="0.48" stopColor={intelGradient.colors[1]} />
          <Stop offset="1" stopColor={intelGradient.colors[2]} />
        </LinearGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill="url(#intelDot)" />
    </Svg>
  );
}
