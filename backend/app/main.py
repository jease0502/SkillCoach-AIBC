"""FastAPI application entry point: `uvicorn app.main:app`."""
from __future__ import annotations

import asyncio
import contextlib
import importlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("skillcoach")

# Feature routers. Each is imported defensively so the API still boots while a
# workstream is incomplete; a missing module is logged instead of crashing.
ROUTER_MODULES = ("app.kb.routes", "app.builder.routes", "app.session.routes", "app.voice.routes")


async def seed_if_empty() -> None:
    """Load demo data on first boot. Failures are logged and never stop the API."""
    try:
        from app.store import get_store

        if await get_store().list("personas"):
            log.info("Seed skipped: personas already present")
            return
        seed = importlib.import_module("app.seed")
        result = await seed.load()
        log.info("Seeded demo data: %s", result)
    except Exception:  # noqa: BLE001
        log.exception("Seeding failed; continuing without demo data")


async def startup_tasks() -> None:
    await seed_if_empty()
    try:
        from app.kb.search import warm

        await warm()
    except Exception:  # noqa: BLE001
        log.exception("KB index warm-up failed; it will load on first search")


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Seed in the background so the container answers health checks right away.
    task = asyncio.create_task(startup_tasks())
    app.state.seed_task = task
    yield
    if not task.done():
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="SkillCoach API", version="0.1.0", lifespan=lifespan)

    origins = settings.cors_origin_list
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        # Browsers reject credentials with a wildcard origin.
        allow_credentials="*" not in origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Cloud Run's Google Front End reserves /healthz, so /health is the public probe.
    @app.get("/health")
    @app.get("/healthz")
    async def health() -> dict:
        return {"ok": True}

    for name in ROUTER_MODULES:
        try:
            module = importlib.import_module(name)
            app.include_router(module.router)
            log.info("Mounted router %s", name)
        except Exception:  # noqa: BLE001 - keep booting if a module is broken or missing
            log.exception("Skipping router %s", name)

    log.info("Store backend=%s, LLM fake=%s, location=%s",
             settings.store_backend, settings.llm_fake, settings.google_cloud_location)
    return app


app = create_app()
