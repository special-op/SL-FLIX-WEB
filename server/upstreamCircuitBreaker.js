const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_OPEN_MS = 60_000;
const DEFAULT_FAILURE_CACHE_MS = 15_000;

export function createUpstreamCircuitBreaker({
    failureThreshold = DEFAULT_FAILURE_THRESHOLD,
    openMs = DEFAULT_OPEN_MS,
    failureCacheMs = DEFAULT_FAILURE_CACHE_MS
} = {}) {
    const states = new Map();
    const failures = new Map();

    const unavailable = (host, now = Date.now()) => {
        const state = states.get(host);
        const retryAfterSeconds = Math.max(1, Math.ceil(((state?.openedAt || now) + openMs - now) / 1000));
        return { error: 'upstream_unavailable', host, retryAfterSeconds };
    };

    const beforeRequest = (host, key = host, now = Date.now()) => {
        const cached = failures.get(key);
        if (cached && cached.expiresAt > now) return { allowed: false, response: cached.response };
        if (cached) failures.delete(key);

        const state = states.get(host);
        if (!state) return { allowed: true, halfOpen: false };
        if (state.openedAt && now - state.openedAt < openMs) {
            return { allowed: false, response: unavailable(host, now) };
        }
        if (state.halfOpen) return { allowed: false, response: unavailable(host, now) };
        state.halfOpen = true;
        return { allowed: true, halfOpen: true };
    };

    const recordFailure = (host, key = host, now = Date.now()) => {
        const state = states.get(host) || { failures: 0, openedAt: 0, halfOpen: false };
        state.failures += 1;
        state.halfOpen = false;
        if (state.failures >= failureThreshold) state.openedAt = now;
        states.set(host, state);
        const response = unavailable(host, now);
        failures.set(key, { response, expiresAt: now + failureCacheMs });
        return response;
    };

    const recordSuccess = (host) => states.delete(host);

    return {
        beforeRequest,
        recordFailure,
        recordSuccess,
        unavailable,
        _states: states,
        _failures: failures
    };
}

export const UPSTREAM_CIRCUIT_DEFAULTS = Object.freeze({
    failureThreshold: DEFAULT_FAILURE_THRESHOLD,
    openMs: DEFAULT_OPEN_MS,
    failureCacheMs: DEFAULT_FAILURE_CACHE_MS
});
