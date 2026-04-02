from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class TokenBucket:
    rate_per_minute: int
    burst: int
    tokens: float = 0
    last_ts: float = 0.0

    def allow(self, now: float) -> bool:
        if self.last_ts == 0.0:
            self.last_ts = now
            self.tokens = float(self.burst)
        elapsed = max(now - self.last_ts, 0.0)
        refill_per_sec = self.rate_per_minute / 60.0
        self.tokens = min(float(self.burst), self.tokens + elapsed * refill_per_sec)
        self.last_ts = now
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False


@dataclass
class InMemoryRateLimiter:
    rate_per_minute: int
    burst: int
    buckets: dict[str, TokenBucket] = field(default_factory=dict)

    def allow(self, key: str) -> bool:
        now = time.time()
        bucket = self.buckets.get(key)
        if bucket is None:
            bucket = TokenBucket(self.rate_per_minute, self.burst)
            self.buckets[key] = bucket
        return bucket.allow(now)
