export const GOOD_RECOVERY_MS = 30_000;

export function classifyNetworkQuality(current, online, badSignals, now, previousGoodSince) {
  if (!online) return { quality: 'offline', goodSince: null };
  if (badSignals >= 2) return { quality: 'slow', goodSince: null };
  if (current === 'offline') return { quality: 'slow', goodSince: now };
  if (current === 'slow') {
    const goodSince = previousGoodSince ?? now;
    return now - goodSince >= GOOD_RECOVERY_MS
      ? { quality: 'good', goodSince }
      : { quality: 'slow', goodSince };
  }
  return { quality: 'good', goodSince: previousGoodSince ?? now };
}

export function calculateRetryDelay(attempt, initialDelay = 300, maxDelay = 10_000, random = Math.random, multiplier = 2) {
  const exponential = Math.min(maxDelay, initialDelay * Math.pow(multiplier, Math.max(0, attempt)));
  return exponential * (0.8 + random() * 0.4);
}
