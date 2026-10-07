import { useEffect, useRef, type DependencyList } from 'react';
import { AppState, Keyboard } from 'react-native';
import { BACKEND_URL } from './api';
const listeners = new Set<() => void>();
let keyboardVisible = false;
const emit = () => { if (!keyboardVisible) listeners.forEach(listener => listener()); };
export function useLiveEffect(effect: () => void | (() => void), dependencies: DependencyList) {
  const latest = useRef(effect);
  latest.current = effect;
  useEffect(() => {
    let cleanup = latest.current();
    const refresh = () => {
      if (AppState.currentState !== 'active') return;
      if (typeof cleanup === 'function') cleanup();
      cleanup = latest.current();
    };
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
      if (typeof cleanup === 'function') cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
}
export function useLiveUpdates(token: string) {
  useEffect(() => {
    let stopped = false, pending = false, version: string | undefined, ticks = 0;
    const check = async (force = false) => {
      if (stopped || pending || AppState.currentState !== 'active') return;
      pending = true;
      try {
        const response = await fetch(`${BACKEND_URL}/api/live/revision`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Update check unavailable');
        const data = await response.json();
        if (stopped) return;
        const changed = version !== undefined && version !== data.version;
        version = data.version;
        if (changed || force || ++ticks % 4 === 0) emit();
      } catch {
        if (!stopped && (force || ++ticks % 4 === 0)) emit();
      } finally { pending = false; }
    };
    check();
    const timer = setInterval(() => { check(); }, 15000);
    const state = AppState.addEventListener('change', next => { if (next === 'active') check(true); });
    const shown = Keyboard.addListener('keyboardDidShow', () => { keyboardVisible = true; });
    const hidden = Keyboard.addListener('keyboardDidHide', () => { keyboardVisible = false; });
    return () => { stopped = true; clearInterval(timer); state.remove(); shown.remove(); hidden.remove(); keyboardVisible = false; };
  }, [token]);
}
