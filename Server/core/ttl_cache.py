"""Tiny in-process TTL cache with single-flight for read-only aggregate endpoints.

Per-worker (uvicorn runs several), so a 30 s TTL across 4 workers means at most 4 refreshes
per window instead of one set of queries per request. Values are treated as immutable.
"""
from __future__ import annotations

import asyncio
import time
from typing import Awaitable, Callable, Generic, TypeVar

T = TypeVar("T")


class TtlCache(Generic[T]):
    """Caches one value for `ttl_seconds`. Concurrent misses share a single refresh."""

    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._value: T | None = None
        self._expires_at = 0.0
        self._lock = asyncio.Lock()

    async def get(self, loader: Callable[[], Awaitable[T]]) -> T:
        now = time.monotonic()
        if self._value is not None and now < self._expires_at:
            return self._value

        async with self._lock:
            # A concurrent caller may have refreshed while this one waited for the lock.
            now = time.monotonic()
            if self._value is not None and now < self._expires_at:
                return self._value

            value = await loader()
            self._value = value
            self._expires_at = time.monotonic() + self._ttl
            return value

    def invalidate(self) -> None:
        self._value = None
        self._expires_at = 0.0
