"""Events and pod logs — the two things that explain a failure."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse
from kubernetes.client.exceptions import ApiException

from app.api.deps import ClientsDep
from app.k8s.client import KubeClients
from app.models.inventory import EventSummary, LogLine, LogSourceError, ServiceLogs
from app.services import inventory as inventory_service

router = APIRouter(tags=["events"])

_LOG_TIMEOUT = 30

# One request reads at most this many containers at once. A service with more
# is narrowed by workload or container first.
MAX_LOG_SOURCES = 24
MAX_MERGED_LINES = 5000


@router.get("/events", response_model=list[EventSummary])
def list_events(
    clients: ClientsDep,
    involved: str | None = None,
    service: str | None = None,
    limit: int = Query(50, ge=1, le=500),
) -> list[EventSummary]:
    """Warning events, newest first, deduplicated with their counts summed."""
    snapshot = inventory_service.get_snapshot(clients)

    if service:
        events = list(snapshot.service_warnings.get(service, []))
    else:
        events = [event for group in snapshot.service_warnings.values() for event in group]

    if involved:
        events = [event for event in events if event.involved_name == involved]

    events.sort(key=lambda event: event.last_seen or "", reverse=True)
    return events[:limit]


@router.get("/pods/{name}/logs", response_class=PlainTextResponse)
def pod_logs(
    name: str,
    clients: ClientsDep,
    container: str | None = None,
    tail_lines: int = Query(200, ge=1, le=5000),
    previous: bool = False,
) -> PlainTextResponse:
    """Tail one container's log.

    `previous=true` reads the log of the *last terminated* instance, which is
    the only place the reason for a CrashLoopBackOff is written down.
    """
    try:
        # _preload_content=False returns the raw HTTP response. With the
        # default, the client runs the log body through its JSON deserialiser,
        # which hands back str(bytes) - the whole log rendered as a Python
        # repr on a single line, escapes and all.
        response = clients.core.read_namespaced_pod_log(
            name=name,
            namespace=clients.namespace,
            container=container,
            tail_lines=tail_lines,
            previous=previous,
            timestamps=False,
            _preload_content=False,
            _request_timeout=_LOG_TIMEOUT,
        )
        text = response.data
    except ApiException as exc:
        if exc.status == 404:
            raise HTTPException(404, f"No pod named {name!r}.") from exc
        if exc.status == 400:
            # Raised when the container never restarted and `previous` was
            # asked for, or when a multi-container pod needs `container`.
            raise HTTPException(400, _bad_request_detail(exc)) from exc
        raise

    return PlainTextResponse(_decode(text) or "(this container has produced no output)")


@router.get("/services/{name}/logs", response_model=ServiceLogs)
def service_logs(
    name: str,
    clients: ClientsDep,
    workload: str | None = None,
    container: str | None = None,
    tail_lines: int = Query(200, ge=1, le=2000),
    since_seconds: int | None = Query(None, ge=1, le=7 * 24 * 3600),
) -> ServiceLogs:
    """Tail every container of a service and merge them by timestamp.

    What `kubectl logs -l` and k9s do across pods: one timeline, each line
    tagged with the pod and container it came from. `since_seconds` with a
    small value is how the UI follows the log.
    """
    snapshot = inventory_service.get_snapshot(clients)
    pods = [p for p in snapshot.pods if p.service == name]
    if not pods and not any(s.name == name for s in snapshot.services):
        raise HTTPException(404, f"No service named {name!r}.")
    if workload:
        pods = [p for p in pods if p.workload and p.workload.name == workload]

    sources = [
        (pod.name, each)
        for pod in sorted(pods, key=lambda p: p.name)
        for each in pod.containers
        if container is None or each == container
    ]
    truncated = len(sources) > MAX_LOG_SOURCES
    sources = sources[:MAX_LOG_SOURCES]

    def read(source: tuple[str, str]) -> list[LogLine] | LogSourceError:
        pod_name, container_name = source
        try:
            return _read_lines(clients, pod_name, container_name, tail_lines, since_seconds)
        except ApiException as exc:
            detail = "Pod is gone." if exc.status == 404 else _bad_request_detail(exc)
            return LogSourceError(pod=pod_name, container=container_name, detail=detail)

    result = ServiceLogs(sources=len(sources), truncated=truncated)
    if sources:
        with ThreadPoolExecutor(max_workers=min(8, len(sources))) as pool:
            for outcome in pool.map(read, sources):
                if isinstance(outcome, LogSourceError):
                    result.errors.append(outcome)
                else:
                    result.lines.extend(outcome)

    # ISO timestamps from one kubelet clock sort as strings. Lines with none
    # go first rather than vanish; the sort is stable within a container.
    result.lines.sort(key=lambda line: line.ts or "")
    result.lines = result.lines[-MAX_MERGED_LINES:]
    return result


def _read_lines(
    clients: KubeClients,
    pod: str,
    container: str,
    tail_lines: int,
    since_seconds: int | None,
) -> list[LogLine]:
    response = clients.core.read_namespaced_pod_log(
        name=pod,
        namespace=clients.namespace,
        container=container,
        tail_lines=tail_lines,
        since_seconds=since_seconds,
        timestamps=True,
        _preload_content=False,
        _request_timeout=_LOG_TIMEOUT,
    )
    return [
        LogLine(ts=ts, pod=pod, container=container, text=text)
        for ts, text in map(split_timestamp, _decode(response.data).splitlines())
    ]


def split_timestamp(line: str) -> tuple[str | None, str]:
    """Split the kubelet's "<RFC 3339> <text>" prefix off one line."""
    head, sep, rest = line.partition(" ")
    if sep and len(head) >= 20 and head[4] == "-" and head[10] == "T":
        return head, rest
    return None, line


def _decode(text: object) -> str:
    """The client hands back bytes for some log responses and str for others.

    Left alone, the bytes case renders as a Python repr - b'...\\n...' on one
    line - which is unreadable. Decoding leniently keeps a log with odd bytes
    in it readable rather than failing the whole request.
    """
    if isinstance(text, bytes):
        return text.decode("utf-8", errors="replace")
    return str(text or "")


def _bad_request_detail(exc: ApiException) -> str:
    body = str(exc.body or "")
    if "previous terminated container" in body:
        return "This container has not terminated before, so there is no previous log."
    if "choose one of" in body or "container name must be specified" in body:
        return "This pod has several containers. Pick one."
    return "The API server rejected the log request."
