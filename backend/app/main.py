"""Arango Resource Manager API."""

from __future__ import annotations

import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.api.v1.routes import api_router
from app.config import get_settings
from app.k8s.errors import K8sAccessDenied, K8sConflict, K8sError, K8sNotFound


def _configure_logging() -> None:
    logging.basicConfig(format="%(message)s", level=logging.INFO)
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        cache_logger_on_first_use=True,
    )


_configure_logging()
log = structlog.get_logger(__name__)
settings = get_settings()


def _sample_usage(stop: threading.Event, interval: float) -> None:
    """Refresh the snapshot on a timer, which records usage into the history."""
    from app.services import inventory

    while not stop.wait(interval):
        try:
            inventory.get_snapshot()
        except Exception as exc:  # noqa: BLE001 - a failed sample must not kill the loop
            log.warning("usage.sample_failed", error=str(exc))


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    stop = threading.Event()
    if settings.usage_sample_seconds > 0:
        threading.Thread(
            target=_sample_usage,
            args=(stop, settings.usage_sample_seconds),
            name="usage-sampler",
            daemon=True,
        ).start()
    yield
    stop.set()


app = FastAPI(
    lifespan=lifespan,
    title="Arango Resource Manager",
    version=__version__,
    description=(
        "See and safely manage what is running in an ArangoDB Platform Kubernetes namespace."
    ),
    # The stock /docs page fetches /openapi.json from the site root, which misses
    # the app when the platform mounts it under /_service/uds/.../. The route
    # below serves the same page with a relative spec URL instead.
    docs_url=None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.exception_handler(K8sError)
def handle_k8s_error(_request: Request, exc: K8sError) -> JSONResponse:
    """Map cluster access failures onto honest HTTP statuses."""
    status = 502
    if isinstance(exc, K8sAccessDenied):
        status = 403
    elif isinstance(exc, K8sNotFound):
        status = 404
    elif isinstance(exc, K8sConflict):
        status = 409
    log.warning("k8s.error", error=str(exc), status=status)
    return JSONResponse(status_code=status, content={"detail": str(exc)})


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    """Liveness only. It deliberately does not touch the cluster."""
    return {"status": "ok", "version": __version__}


@app.get("/docs", include_in_schema=False)
def docs() -> HTMLResponse:
    """Swagger UI with a relative spec URL, so it works under a path prefix."""
    return get_swagger_ui_html(openapi_url="openapi.json", title=f"{app.title} - API docs")


def mount_ui(target: FastAPI, directory: str) -> None:
    """Serve the built frontend at "/". Call it last: the mount shadows later routes."""
    static_path = Path(directory)
    if not (static_path / "index.html").is_file():
        raise RuntimeError(f"ARM_STATIC_DIR={static_path} has no index.html; build the frontend")
    target.mount("/", StaticFiles(directory=static_path, html=True), name="ui")


if settings.static_dir:
    mount_ui(app, settings.static_dir)
