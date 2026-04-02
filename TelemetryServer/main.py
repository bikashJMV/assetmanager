from __future__ import annotations

from contextlib import asynccontextmanager
import logging

import asyncpg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.queue import TelemetryQueue
from core.settings import settings
from routers import ingest, query
from services.metrics import metrics
from services.storage import storage

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
logger = logging.getLogger("telemetry.main")


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("startup.begin env=%s", settings.ENV)
    ssl = "require" if settings.DB_SSL else None
    pool = await asyncpg.create_pool(
        dsn=settings.DATABASE_URL,
        min_size=settings.DB_POOL_MIN_SIZE,
        max_size=settings.DB_POOL_MAX_SIZE,
        ssl=ssl,
    )
    queue: TelemetryQueue | None = None
    try:
        await storage.attach_pool(pool)
        await storage.init()
        logger.info("storage.initialized")
        queue = TelemetryQueue(
            maxsize=settings.QUEUE_MAX_SIZE,
            worker_count=settings.QUEUE_WORKERS,
            storage=storage,
            metrics=metrics,
        )
        await queue.start()
        logger.info("queue.started maxsize=%s workers=%s", settings.QUEUE_MAX_SIZE, settings.QUEUE_WORKERS)
        ingest.set_queue(queue)
        query.set_queue(queue)
        logger.info("routers.queue_wired")
        yield
    finally:
        logger.info("shutdown.begin")
        if queue is not None:
            await queue.stop()
        await storage.detach_pool()
        await pool.close()
        logger.info("shutdown.complete")


app = FastAPI(
    title="Telemetry Server",
    version="0.1.0",
    description="Independent telemetry ingestion/query backend (Supabase Postgres).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router, prefix="/telemetry", tags=["ingest"])
app.include_router(query.router, prefix="/telemetry", tags=["query"])


@app.get("/", tags=["system"])
async def root():
    return {"service": "telemetry-server", "env": settings.ENV}
