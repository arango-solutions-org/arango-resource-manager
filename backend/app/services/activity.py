"""When a service was last used, from the namespace's Prometheus.

The platform's own Prometheus scrapes the AutoGraph, retriever, importer and
MCP releases, which export OpenTelemetry HTTP server metrics. For each release
this finds the last hour with any request, and the last hour with a request
that is not a GET. The second is the useful one for AutoGraph: the platform UI
polls every instance with GETs around the clock, so "any request" is always
"just now" there, while a POST, PATCH or DELETE is someone using it.

User-defined apps and anything else are not scraped, so they have no activity.
Prometheus being absent or unreachable is normal off the platform and simply
means no activity is known; it never fails a page.
"""

from __future__ import annotations

from datetime import UTC, datetime

import requests
import structlog
from pydantic import BaseModel

from app.config import Settings
from app.identity import on_platform
from app.services.cache import TTLCache

log = structlog.get_logger(__name__)

WINDOW_DAYS = 15
"""The platform Prometheus keeps 15 days."""

# The service the platform installs in every namespace, under a route prefix.
PLATFORM_PROMETHEUS = "http://platform-monitoring-prometheus-server/prometheus"

_METRIC = "http_server_request_duration_seconds_count"
_TIMEOUT = 15


class Activity(BaseModel):
    last_request_at: str | None = None
    last_change_at: str | None = None
    """Last POST, PATCH, PUT or DELETE."""


def prometheus_url(settings: Settings) -> str | None:
    if settings.prometheus_url:
        return settings.prometheus_url.rstrip("/")
    return PLATFORM_PROMETHEUS if on_platform() else None


def _last_active_query(method_filter: str) -> str:
    # The last hour, within the window, in which the release served a request.
    selector = f'{_METRIC}{{job=~"deployment/.+"{method_filter}}}'
    return (
        f"max by (job) (max_over_time((timestamp(sum by (job) "
        f"(increase({selector}[1h])) > 0.5))[{WINDOW_DAYS}d:1h]))"
    )


def _query(base: str, expression: str) -> dict[str, float]:
    response = requests.get(f"{base}/api/v1/query", params={"query": expression}, timeout=_TIMEOUT)
    response.raise_for_status()
    result = response.json().get("data", {}).get("result", [])
    out: dict[str, float] = {}
    for row in result:
        job = str(row.get("metric", {}).get("job", ""))
        if job.startswith("deployment/"):
            out[job.removeprefix("deployment/")] = float(row["value"][1])
    return out


def _iso(seconds: float | None) -> str | None:
    return None if seconds is None else datetime.fromtimestamp(seconds, UTC).isoformat()


def fetch(base: str) -> dict[str, Activity]:
    # Every release Prometheus scrapes, requests or not. One that served
    # nothing in the window is "not used", which is different from unknown.
    scraped = _query(
        base,
        f'group by (job) (last_over_time(target_info{{job=~"deployment/.+"}}[{WINDOW_DAYS}d]))',
    )
    any_request = _query(base, _last_active_query(""))
    changes = _query(base, _last_active_query(', http_request_method!~"GET|HEAD|OPTIONS"'))
    return {
        name: Activity(
            last_request_at=_iso(any_request.get(name)), last_change_at=_iso(changes.get(name))
        )
        for name in scraped.keys() | any_request.keys() | changes.keys()
    }


_cache: TTLCache[dict[str, Activity]] = TTLCache(300)


def get_activity(settings: Settings) -> dict[str, Activity] | None:
    """Workload name to its activity, or None when Prometheus cannot be read."""
    base = prometheus_url(settings)
    if base is None:
        return None

    def load() -> dict[str, Activity]:
        try:
            return fetch(base)
        except (requests.RequestException, ValueError, KeyError) as exc:
            log.warning("activity.unavailable", error=str(exc))
            return {}

    activity = _cache.get(load)
    return activity or None


def invalidate() -> None:
    _cache.invalidate()
