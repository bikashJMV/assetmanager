from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass

from models.schemas import TelemetryEvent
from services.metrics import Metrics
from services.storage import Storage

logger = logging.getLogger("telemetry.queue")


@dataclass
class TelemetryQueue:
    maxsize: int
    worker_count: int
    storage: Storage
    metrics: Metrics

    def __post_init__(self) -> None:
        low_max = max(int(self.maxsize * 0.5), 1)
        med_max = max(int(self.maxsize * 0.3), 1)
        high_max = max(self.maxsize - low_max - med_max, 1)
        self._high: asyncio.Queue[TelemetryEvent] = asyncio.Queue(maxsize=high_max)
        self._med: asyncio.Queue[TelemetryEvent] = asyncio.Queue(maxsize=med_max)
        self._low: asyncio.Queue[TelemetryEvent] = asyncio.Queue(maxsize=low_max)
        self._workers: list[asyncio.Task] = []
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        for i in range(self.worker_count):
            self._workers.append(asyncio.create_task(self._worker_loop(i)))
        logger.info("queue.start workers=%s", self.worker_count)

    async def stop(self) -> None:
        self._running = False
        for w in self._workers:
            w.cancel()
        await asyncio.gather(*self._workers, return_exceptions=True)
        logger.info("queue.stop")

    async def enqueue(self, event: TelemetryEvent) -> bool:
        target = self._select_queue(event.priority)
        if target.full():
            if event.priority == "LOW":
                self.metrics.incr("queue_drop_low")
                logger.warning("queue.drop.low event_id=%s", event.event_id)
                return False
            if event.priority == "MEDIUM":
                try:
                    _ = self._low.get_nowait()
                    self._low.task_done()
                    self.metrics.incr("queue_drop_low_for_medium")
                    logger.warning("queue.drop.low_for_medium event_id=%s", event.event_id)
                except asyncio.QueueEmpty:
                    self.metrics.incr("queue_reject_medium")
                    logger.warning("queue.reject.medium event_id=%s", event.event_id)
                    return False
            else:
                self.metrics.incr("queue_reject_high")
                logger.warning("queue.reject.high event_id=%s", event.event_id)
                return False
        await target.put(event)
        self.metrics.incr("queue_enqueued")
        self.metrics.set_gauge("queue_depth_total", float(self.depth()))
        logger.debug("queue.enqueue event_id=%s depth=%s", event.event_id, self.depth())
        return True

    def depth(self) -> int:
        return self._high.qsize() + self._med.qsize() + self._low.qsize()

    def snapshot(self) -> dict[str, int]:
        return {
            "high": self._high.qsize(),
            "medium": self._med.qsize(),
            "low": self._low.qsize(),
            "total": self.depth(),
        }

    async def _worker_loop(self, _: int) -> None:
        while True:
            event = await self._next_event()
            try:
                ok = await self.storage.insert_event(event)
                if ok:
                    self.metrics.incr("persist_ok")
                    self.metrics.set_gauge("persist_last_ok_ts", asyncio.get_running_loop().time())
                    logger.debug("queue.persist.ok event_id=%s", event.event_id)
            except Exception as exc:  # noqa: BLE001
                self.metrics.incr("persist_fail")
                logger.exception("queue.persist.fail event_id=%s", event.event_id)
                await self.storage.insert_dead_letter(
                    stage="persist",
                    reason=str(exc),
                    payload=json.dumps(event.model_dump(mode="json"), ensure_ascii=True),
                    source=event.source,
                    event_id=event.event_id,
                    schema_version=event.schema_version,
                )
            finally:
                self._task_done(event.priority)

    async def _next_event(self) -> TelemetryEvent:
        while True:
            for q in (self._high, self._med, self._low):
                try:
                    return q.get_nowait()
                except asyncio.QueueEmpty:
                    continue
            await asyncio.sleep(0.01)

    def _task_done(self, priority: str) -> None:
        self._select_queue(priority).task_done()

    def _select_queue(self, priority: str) -> asyncio.Queue[TelemetryEvent]:
        if priority == "HIGH":
            return self._high
        if priority == "MEDIUM":
            return self._med
        return self._low
