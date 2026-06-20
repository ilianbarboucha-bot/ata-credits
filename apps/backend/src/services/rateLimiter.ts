export class SimpleRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  assertWithinLimit(key: string, maxEvents: number, windowMs: number): void {
    const now = Date.now();
    const cutoff = now - windowMs;
    const recent = (this.buckets.get(key) ?? []).filter((value) => value >= cutoff);
    if (recent.length >= maxEvents) {
      throw new Error("RATE_LIMITED");
    }

    recent.push(now);
    this.buckets.set(key, recent);
  }
}
