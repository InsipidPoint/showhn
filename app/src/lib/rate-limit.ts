/**
 * Simple in-memory token bucket rate limiter.
 * Used by on-demand refresh to cap HN API calls from the web process.
 */

export interface RateLimiter {
  tryConsume(): boolean;
}

export function createRateLimiter({
  maxTokens,
  refillRate,
  refillIntervalMs,
}: {
  maxTokens: number;
  refillRate: number;
  refillIntervalMs: number;
}): RateLimiter {
  let tokens = maxTokens;
  let lastRefill = Date.now();

  return {
    tryConsume(): boolean {
      const now = Date.now();
      const elapsed = now - lastRefill;
      if (elapsed >= refillIntervalMs) {
        const intervals = Math.floor(elapsed / refillIntervalMs);
        tokens = Math.min(maxTokens, tokens + intervals * refillRate);
        lastRefill += intervals * refillIntervalMs;
      }

      if (tokens > 0) {
        tokens--;
        return true;
      }
      return false;
    },
  };
}
