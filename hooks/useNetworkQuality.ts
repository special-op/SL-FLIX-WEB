import { useCallback, useEffect, useState } from 'react';
import { classifyNetworkQuality as classifyQuality } from '../utils/networkQuality.js';

export type NetworkQuality = 'good' | 'slow' | 'offline';
export type LowDataOverride = 'auto' | 'on' | 'off';

interface FetchSample {
  durationMs: number;
  timedOut: boolean;
  at: number;
}

interface NetworkSnapshot {
  quality: NetworkQuality;
  online: boolean;
  fetchSamples: FetchSample[];
  socketRttMs: number | null;
  hlsBandwidth: number | null;
  hlsStalls: number[];
  effectiveType?: string;
  saveData: boolean;
}

const GOOD_RECOVERY_MS = 30_000;
const BAD_FETCH_MS = 1_800;
const BAD_SOCKET_RTT_MS = 1_200;
const BAD_BANDWIDTH_BPS = 800_000;
const listeners = new Set<() => void>();

let snapshot: NetworkSnapshot = {
  quality: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'good',
  online: typeof navigator === 'undefined' || navigator.onLine !== false,
  fetchSamples: [],
  socketRttMs: null,
  hlsBandwidth: null,
  hlsStalls: [],
  saveData: false,
};
let goodSince: number | null = snapshot.quality === 'good' ? Date.now() : null;

const emit = () => listeners.forEach(listener => listener());

export function classifyNetworkQuality(
  current: NetworkQuality,
  online: boolean,
  badSignals: number,
  now: number,
  previousGoodSince: number | null,
): { quality: NetworkQuality; goodSince: number | null } {
  return classifyQuality(current, online, badSignals, now, previousGoodSince);
}

const connectionHints = () => {
  if (typeof navigator === 'undefined') return { effectiveType: undefined, saveData: false };
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  return {
    effectiveType: typeof connection?.effectiveType === 'string' ? connection.effectiveType : undefined,
    saveData: connection?.saveData === true,
  };
};

const badSignalCount = (now: number) => {
  const hints = connectionHints();
  const recentFetches = snapshot.fetchSamples.filter(sample => now - sample.at < 60_000);
  const badFetches = recentFetches.filter(sample => sample.timedOut || sample.durationMs >= BAD_FETCH_MS).length;
  const badSocket = snapshot.socketRttMs !== null && snapshot.socketRttMs >= BAD_SOCKET_RTT_MS ? 1 : 0;
  const badHls = snapshot.hlsBandwidth !== null && snapshot.hlsBandwidth < BAD_BANDWIDTH_BPS ? 1 : 0;
  const badConnection = hints.saveData || ['slow-2g', '2g', '3g'].includes(hints.effectiveType || '') ? 1 : 0;
  return badFetches + badSocket + badHls + badConnection + snapshot.hlsStalls.filter(stall => now - stall < 60_000).length;
};

const recalculate = (now = Date.now()) => {
  const hints = connectionHints();
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  const badSignals = badSignalCount(now);
  const wasQuality = snapshot.quality;
  snapshot = { ...snapshot, online, effectiveType: hints.effectiveType, saveData: hints.saveData };
  const next = classifyNetworkQuality(snapshot.quality, online, badSignals, now, goodSince);
  const quality = next.quality;
  goodSince = next.goodSince;

  snapshot = { ...snapshot, quality };
  if (wasQuality !== quality || wasQuality === 'good' || badSignals > 0) emit();
};

export const recordFetchSample = (durationMs: number, timedOut = false) => {
  const sample: FetchSample = { durationMs: Math.max(0, durationMs), timedOut, at: Date.now() };
  snapshot = { ...snapshot, fetchSamples: [...snapshot.fetchSamples, sample].slice(-5) };
  recalculate(sample.at);
};

export const recordSocketPing = (rttMs: number) => {
  snapshot = { ...snapshot, socketRttMs: Math.max(0, rttMs) };
  recalculate();
};

export const recordHlsBandwidth = (bitsPerSecond: number | null | undefined) => {
  if (!Number.isFinite(bitsPerSecond)) return;
  snapshot = { ...snapshot, hlsBandwidth: Math.max(0, Number(bitsPerSecond)) };
  recalculate();
};

export const recordHlsStall = () => {
  snapshot = { ...snapshot, hlsStalls: [...snapshot.hlsStalls, Date.now()].slice(-10) };
  recalculate();
};

export const recordConnectionHint = () => recalculate();

export const subscribeNetworkQuality = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const getNetworkQualitySnapshot = () => snapshot;

export const isLowDataMode = () => {
  let saved: LowDataOverride = 'auto';
  try {
    const value = localStorage.getItem('slflix_low_data_override');
    if (value === 'on' || value === 'off') saved = value;
  } catch {}
  return saved === 'on' || (saved === 'auto' && snapshot.quality !== 'good');
};

export function useNetworkQuality(socket?: { connected?: boolean; emit?: (...args: any[]) => void }) {
  const [state, setState] = useState<NetworkSnapshot>(getNetworkQualitySnapshot);
  const [override, setOverrideState] = useState<LowDataOverride>(() => {
    try {
      const saved = localStorage.getItem('slflix_low_data_override');
      return saved === 'on' || saved === 'off' ? saved : 'auto';
    } catch {
      return 'auto';
    }
  });

  useEffect(() => subscribeNetworkQuality(() => setState({ ...getNetworkQualitySnapshot() })), []);

  useEffect(() => {
    const handleNetworkChange = () => {
      recordConnectionHint();
      setState({ ...getNetworkQualitySnapshot() });
    };
    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    connection?.addEventListener?.('change', handleNetworkChange);
    const timer = window.setInterval(() => {
      recalculate();
      setState({ ...getNetworkQualitySnapshot() });
    }, 5_000);
    return () => {
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
      connection?.removeEventListener?.('change', handleNetworkChange);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!socket?.emit) return;
    const ping = () => {
      if (!socket.connected) return;
      const started = Date.now();
      socket.emit?.('network_quality_ping', started, () => recordSocketPing(Date.now() - started));
    };
    ping();
    const timer = window.setInterval(ping, 10_000);
    return () => window.clearInterval(timer);
  }, [socket]);

  const setOverride = useCallback((next: LowDataOverride) => {
    setOverrideState(next);
    try {
      localStorage.setItem('slflix_low_data_override', next);
    } catch {}
  }, []);

  const lowDataMode = override === 'on' || (override === 'auto' && state.quality !== 'good');
  return { ...state, lowDataMode, override, setOverride };
}
