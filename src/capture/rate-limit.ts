/** Spaces calls at least `minIntervalMs` apart (captureVisibleTab quota). */
export function createRateLimiter(
  minIntervalMs: number,
  now: () => number = () => Date.now(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
) {
  let last = -Infinity;
  return {
    async wait(): Promise<void> {
      const elapsed = now() - last;
      if (elapsed < minIntervalMs) await sleep(minIntervalMs - elapsed);
      last = now();
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
