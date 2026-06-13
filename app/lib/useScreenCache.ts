// @ts-nocheck
// Stale-while-revalidate cache for a tab's rendered data (premium-feel: no cold-load
// flash/jump). On mount, hydrate the last snapshot INSTANTLY; persist a fresh snapshot
// whenever the live data settles. `applied.current` lets the loader skip its spinner.
import { useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useScreenCache(key, apply) {
  const applied = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem('cache:' + key).then(raw => {
      if (!raw) return;
      try { const snap = JSON.parse(raw); applied.current = true; apply(snap); } catch (e) { /* corrupt — ignore */ }
    }).catch(() => {});
  }, []);
  const persist = (snap) => { AsyncStorage.setItem('cache:' + key, JSON.stringify(snap)).catch(() => {}); };
  return { applied, persist };
}
