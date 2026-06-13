// @ts-nocheck
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Pulse from './Pulse';
import { isHealthAvailable, requestHealthPermissions } from '../lib/health';
import { colors, fonts, space } from '../theme/forge';

// The 3 paired trend views — Performance / Training / Physique. Tabs carry a
// verdict-colored dot (all three states at a glance); the active card shows the
// indexed chart + a ONE-LINE verdict. Driven by `views` from the parent.

const TONE = {
  good:    { c: colors.statusGood, bg: 'rgba(70,194,106,0.07)', ic: 'rgba(70,194,106,0.16)', icon: 'trending-up' },
  mid:     { c: colors.statusMid,  bg: 'rgba(255,138,61,0.07)', ic: 'rgba(255,138,61,0.16)', icon: 'trending-neutral' },
  flag:    { c: colors.statusLow,  bg: 'rgba(255,90,74,0.07)',  ic: 'rgba(255,90,74,0.16)',  icon: 'alert' },
  neutral: { c: colors.muted,      bg: 'rgba(255,255,255,0.03)', ic: 'rgba(255,255,255,0.08)', icon: 'minus' },
};
// Line colors per view: A = first metric, B = second. Real contrast, never two warm lines.
const LINE = {
  performance: { a: colors.acc, b: colors.statusGood },   // strength orange · lean green
  training:    { a: '#A7A7A2', b: colors.acc },           // volume input (steel) · strength output (orange)
  physique:    { a: colors.acc, b: '#22D3EE' },           // weight orange · body fat cyan
};

// Catmull-Rom → cubic bezier: a smooth curve through the points (premium feel).
function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function PairChart({ series, viewKey }) {
  const W = 300, top = 14, bottom = 94, left = 18, right = 290;
  const lines = LINE[viewKey] || LINE.performance;
  const all = [...(series.a || []), ...(series.b || [])].filter(v => v != null);
  if (!all.length) return null;
  let min = Math.min(...all, 0), max = Math.max(...all, 0);
  if (max - min < 4) { max += 2; min -= 2; }
  const pad = (max - min) * 0.14; max += pad; min -= pad;
  const n = series.labels.length;
  const x = (i) => left + (i / Math.max(1, n - 1)) * (right - left);
  const y = (v) => bottom - ((v - min) / (max - min)) * (bottom - top);
  const toPts = (vals) => (vals || []).map((v, i) => (v == null ? null : { x: x(i), y: y(v) })).filter(Boolean);
  const aPts = toPts(series.a), bPts = series.b ? toPts(series.b) : [];
  const zeroY = y(0);
  const endDot = (pts, color, key) => {
    if (!pts.length) return null;
    const p = pts[pts.length - 1];
    return [
      <Circle key={`${key}h`} cx={p.x} cy={p.y} r={6.5} fill={color} opacity={0.16} />,
      <Circle key={`${key}d`} cx={p.x} cy={p.y} r={3.2} fill={color} />,
    ];
  };
  return (
    <Svg width="100%" height={112} viewBox={`0 0 ${W} 112`}>
      <Line x1={left} y1={zeroY} x2={right} y2={zeroY} stroke="rgba(255,255,255,0.10)" strokeWidth={1} strokeDasharray="2 3" />
      <SvgText x={left - 4} y={zeroY + 3} fill={colors.dim} fontSize="8" textAnchor="end">0</SvgText>
      {bPts.length > 0 && <Path d={smoothPath(bPts)} fill="none" stroke={lines.b} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />}
      <Path d={smoothPath(aPts)} fill="none" stroke={lines.a} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
      {endDot(bPts, lines.b, 'b')}
      {endDot(aPts, lines.a, 'a')}
      {series.labels.map((lb, i) => (
        (i === 0 || i === n - 1) ? (
          <SvgText key={i} x={i === 0 ? left : right} y={108} fill={i === n - 1 ? colors.muted : colors.dim} fontSize="8" textAnchor={i === 0 ? 'start' : 'end'}>{lb}</SvgText>
        ) : null
      ))}
    </Svg>
  );
}

export default function TrendViews({ views = [], onConnect }) {
  const [tab, setTab] = useState('performance');
  if (!views.length) return null;

  const active = views.find(v => v.key === tab) || views[0];
  const tone = TONE[active.verdict.tone] || TONE.neutral;
  const lines = LINE[active.key] || LINE.performance;

  async function connect() {
    try { await requestHealthPermissions(); } catch (e) { /* declined — fine */ }
    onConnect && onConnect();
  }

  return (
    <View style={s.block}>
      <View style={s.tabs}>
        {views.map(v => {
          const t = TONE[v.verdict.tone] || TONE.neutral;
          return (
            <TouchableOpacity key={v.key} style={[s.tabBtn, v.key === tab && s.tabOn]} onPress={() => setTab(v.key)} activeOpacity={0.8}>
              <View style={[s.tabDot, { backgroundColor: t.c }]} />
              <Text style={[s.tabText, v.key === tab && { color: colors.acc }]}>{v.tab}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.card}>
        <View style={s.cardHead}>
          <Text style={s.question}>{active.question}</Text>
          {active.key === 'physique' && active.phaseLabel
            ? <Text style={s.phasePill}>PHASE · {active.phaseLabel}</Text>
            : <Text style={s.window}>LAST {active.series.labels.length} WKS</Text>}
        </View>

        {active.ok ? (
          <>
            <View style={s.bigRow}>
              {active.big.map((b, i) => (
                <View key={i} style={s.bigCell}>
                  <Text style={[s.bigVal, { color: b.v === '—' ? colors.dim : lines[b.line] }]}>{b.v}</Text>
                  <Text style={s.bigLbl}>{b.label}</Text>
                </View>
              ))}
            </View>
            <View style={s.chartWrap}><PairChart series={active.series} viewKey={active.key} /></View>
            <View style={s.legend}>
              <View style={s.legItem}><View style={[s.swatch, { backgroundColor: lines.a }]} /><Text style={s.legText}>{active.aLabel}</Text></View>
              {active.series.b && <View style={s.legItem}><View style={[s.swatch, { backgroundColor: lines.b }]} /><Text style={s.legText}>{active.bLabel}</Text></View>}
              <View style={{ flex: 1 }} />
              <Text style={s.axisNote}>% CHANGE · INDEXED</Text>
            </View>
          </>
        ) : null}

        {/* one-line verdict — punchy, no paragraph */}
        <View style={[s.verdict, { backgroundColor: tone.bg }]}>
          <View style={[s.vIcon, { backgroundColor: tone.ic }]}>
            <MaterialCommunityIcons name={tone.icon} size={18} color={tone.c} />
          </View>
          <Text style={s.vHead}>{active.verdict.headline}</Text>
        </View>

        {/* Health status — pulsing dot, short line (never a paragraph) */}
        {active.bodyInfo?.state === 'syncing' && (
          <View style={s.syncRow}>
            <Pulse scaleTo={1.5} minOpacity={0.4} duration={1100}><View style={s.syncDot} /></Pulse>
            <Text style={s.syncText}>Health connected — trends unlock at 2 weeks of data.</Text>
          </View>
        )}
        {active.needsHealth && isHealthAvailable() && (
          <TouchableOpacity style={s.connectBtn} onPress={connect} activeOpacity={0.8}>
            <View style={s.connectIcon}><MaterialCommunityIcons name="heart-pulse" size={16} color="#FF2D55" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.connectText}>CONNECT APPLE HEALTH</Text>
              <Text style={s.connectSub}>Weigh-ins & body comp, read against your training</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  block: { marginBottom: space.lg },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: space.sm },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderWidth: 1.5, borderColor: colors.line2 },
  tabOn: { borderColor: colors.acc, backgroundColor: 'rgba(255,255,255,0.04)' },
  tabDot: { width: 5, height: 5, borderRadius: 3 },
  tabText: { fontFamily: fonts.bodySemi, fontSize: 8.5, color: colors.muted, letterSpacing: 0.8, textTransform: 'uppercase' },

  card: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 15, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 13 },
  question: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.muted, letterSpacing: 1.3, textTransform: 'uppercase' },
  window: { fontFamily: fonts.body, fontSize: 9, color: colors.dim, letterSpacing: 0.5 },
  phasePill: { fontFamily: fonts.bodySemi, fontSize: 8.5, color: colors.acc, letterSpacing: 1, textTransform: 'uppercase' },

  bigRow: { flexDirection: 'row', gap: 24, paddingHorizontal: 14, paddingTop: 7 },
  bigCell: {},
  bigVal: { fontFamily: fonts.display, fontSize: 23, lineHeight: 25 },
  bigLbl: { fontFamily: fonts.bodySemi, fontSize: 8, color: colors.muted, letterSpacing: 0.8, marginTop: 3, textTransform: 'uppercase' },

  chartWrap: { paddingHorizontal: 6, paddingTop: 6 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingBottom: 11 },
  legItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 13, height: 3, borderRadius: 2 },
  legText: { fontFamily: fonts.bodySemi, fontSize: 8.5, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  axisNote: { fontFamily: fonts.body, fontSize: 8, color: colors.dim, letterSpacing: 0.5 },

  verdict: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  vIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  vHead: { flex: 1, fontFamily: fonts.display, fontSize: 15, color: colors.text, textTransform: 'uppercase', lineHeight: 17 },

  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 2 },
  syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.statusGood },
  syncText: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: colors.muted },

  connectBtn: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: 'rgba(255,255,255,0.04)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', paddingVertical: 11, paddingHorizontal: 14 },
  connectIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,45,85,0.14)', alignItems: 'center', justifyContent: 'center' },
  connectText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.text, textTransform: 'uppercase', letterSpacing: 1 },
  connectSub: { fontFamily: fonts.body, fontSize: 10, color: colors.muted, marginTop: 1 },
});
