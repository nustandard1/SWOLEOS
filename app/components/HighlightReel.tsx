// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, space } from '../theme/forge';

const ROTATE_MS = 5000;

// The "Highlights" reel — a swipeable, auto-advancing feed of recent wins.
// Loops SEAMLESSLY: a clone of the first card sits at the end, so advancing past
// the last slide scrolls smoothly RIGHT onto the clone, then silently snaps back
// to the real first (identical frame → invisible). Touch pauses; dots track page.
export default function HighlightReel({ highlights = [], onTip }) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const scrollRef = useRef(null);
  const idxRef = useRef(0);        // current scroll index, 0..n  (n = clone of slide 0)
  const pausedRef = useRef(false);
  const resetTO = useRef(null);
  const n = highlights.length;
  const loop = n > 1;
  const data = loop ? [...highlights, highlights[0]] : highlights;

  useEffect(() => {
    if (!loop || !width) return;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      const next = idxRef.current + 1;
      idxRef.current = next;
      setPage(next % n);
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      if (next === n) {
        // Smoothly arrived on the clone of slide 0 → snap back to the real 0 once
        // the animation settles. Same frame, so the jump can't be seen.
        if (resetTO.current) clearTimeout(resetTO.current);
        resetTO.current = setTimeout(() => {
          idxRef.current = 0;
          scrollRef.current?.scrollTo({ x: 0, animated: false });
        }, 430);
      }
    }, ROTATE_MS);
    return () => { clearInterval(id); if (resetTO.current) clearTimeout(resetTO.current); };
  }, [loop, width, n]);

  function onMomentumEnd(e) {
    if (!width) return;
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (loop && p === n) {            // user swiped onto the clone → seamless reset
      idxRef.current = 0;
      setPage(0);
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    } else {
      idxRef.current = p;
      setPage(n ? p % n : 0);
    }
  }

  function renderCard(h, i) {
    const good = h.tone === 'good';
    const tone = good ? colors.statusGood : colors.acc;
    const tappable = !!(h.action && onTip);
    const Wrapper = tappable ? TouchableOpacity : View;
    const wrapProps = tappable ? { activeOpacity: 0.8, onPress: () => onTip(h.action) } : {};
    return (
      <Wrapper key={i} {...wrapProps} style={[s.card, tappable && s.cardTap, width ? { width } : null]}>
        <View style={[s.iconWrap, { backgroundColor: good ? 'rgba(70,194,106,0.14)' : 'rgba(255,90,30,0.14)' }]}>
          <MaterialCommunityIcons name={h.icon || 'rocket-launch'} size={22} color={tone} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.kicker, { color: tone }]} numberOfLines={1}>{h.kicker}</Text>
          <Text style={s.title} numberOfLines={1}>{h.title}</Text>
          {h.sub ? <Text style={s.sub} numberOfLines={h.sub2 ? 2 : 1}>{h.sub}</Text> : null}
        </View>
        {tappable ? (
          <View style={s.tapCta}>
            <Text style={s.tapCtaText}>{h.cta || 'TAP'}</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={colors.acc} />
          </View>
        ) : h.big ? <Text style={[s.big, { color: tone }]}>{h.big}</Text> : null}
      </Wrapper>
    );
  }

  return (
    <View>
      <View onLayout={e => { const w = e.nativeEvent.layout.width; if (w && Math.abs(w - width) > 1) setWidth(w); }}>
        {!loop || !width ? (
          renderCard(highlights[0] || { icon: 'rocket-launch', kicker: '', title: '' }, 0)
        ) : (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
            onTouchStart={() => { pausedRef.current = true; }}
            onTouchEnd={() => { pausedRef.current = false; }}
            onScrollEndDrag={() => { pausedRef.current = false; }}
            scrollEventThrottle={16}
          >
            {data.map(renderCard)}
          </ScrollView>
        )}
      </View>

      {loop && (
        <View style={s.dots}>
          {highlights.map((_, i) => (
            <View key={i} style={[s.dot, i === page && s.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surf,
    paddingVertical: 14, paddingHorizontal: 14, minHeight: 76,
  },
  cardTap: { borderColor: 'rgba(255,90,30,0.45)' },
  tapCta: { flexDirection: 'row', alignItems: 'center', gap: 1, marginLeft: 8, borderWidth: 1, borderColor: 'rgba(255,90,30,0.45)', borderRadius: 6, paddingLeft: 8, paddingRight: 4, paddingVertical: 5 },
  tapCtaText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.acc, letterSpacing: 1 },
  iconWrap: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.text, textTransform: 'uppercase', marginTop: 3 },
  sub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
  big: { fontFamily: fonts.display, fontSize: 20, marginLeft: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 10 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.line2 },
  dotOn: { width: 14, backgroundColor: colors.acc },
});
