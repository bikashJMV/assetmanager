from __future__ import annotations

from dataclasses import dataclass, field
from threading import Lock


@dataclass
class Metrics:
    _counts: dict[str, int] = field(default_factory=dict)
    _gauges: dict[str, float] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def incr(self, key: str, delta: int = 1) -> None:
        with self._lock:
            self._counts[key] = self._counts.get(key, 0) + delta

    def snapshot(self) -> dict[str, int]:
        with self._lock:
            data: dict[str, float | int] = dict(self._counts)
            data.update(self._gauges)
            return data

    def set_gauge(self, key: str, value: float) -> None:
        with self._lock:
            self._gauges[key] = value


metrics = Metrics()
