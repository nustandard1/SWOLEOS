import React from 'react';
import Svg, { Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { intelGradient } from '../theme/forge';

// Gradient-filled word (Intelligence identity). Small labels only — gradient-clipped
// text is unreliable at large sizes, so keep big titles solid white.
export default function GradientText({
  text,
  fontSize = 10,
  fontFamily = 'Saira_600SemiBold',
  letterSpacing = 1.8,
  width,
  height,
  align = 'left',
}: {
  text: string;
  fontSize?: number;
  fontFamily?: string;
  letterSpacing?: number;
  width?: number;
  height?: number;
  align?: 'left' | 'center';
}) {
  const w = width ?? Math.ceil(text.length * (fontSize * 0.7 + letterSpacing) + 8);
  const h = height ?? Math.ceil(fontSize * 1.6);
  const center = align === 'center';
  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id="intelGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={intelGradient.colors[0]} />
          <Stop offset="0.48" stopColor={intelGradient.colors[1]} />
          <Stop offset="1" stopColor={intelGradient.colors[2]} />
        </LinearGradient>
      </Defs>
      <SvgText
        x={center ? w / 2 : 0}
        y={fontSize}
        textAnchor={center ? 'middle' : 'start'}
        fill="url(#intelGrad)"
        fontFamily={fontFamily}
        fontSize={fontSize}
        letterSpacing={letterSpacing}
      >
        {text}
      </SvgText>
    </Svg>
  );
}
