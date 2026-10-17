export declare const GOOD_RECOVERY_MS: number;
export declare function classifyNetworkQuality(
  current: 'good' | 'slow' | 'offline',
  online: boolean,
  badSignals: number,
  now: number,
  previousGoodSince: number | null,
): { quality: 'good' | 'slow' | 'offline'; goodSince: number | null };
export declare function calculateRetryDelay(attempt: number, initialDelay?: number, maxDelay?: number, random?: () => number, multiplier?: number): number;
