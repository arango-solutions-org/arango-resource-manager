"""Mutating routes.

Every one of them plans first, then executes. A refusal returns a structured
reason plus a remediation, so the UI can explain rather than just fail.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.deps import ActorDep, ClientsDep, SettingsDep
from app.config import Settings
from app.identity import Actor
from app.models.actions import (
    ActionPlan,
    ActionRecord,
    ActionResult,
    ActionType,
    BlockedReason,
    PodDeleteRequest,
    ScaleRequest,
    ServiceKillRequest,
    WorkloadRequest,
)
from app.services import actions as action_service
from app.services import inventory as inventory_service
from app.store.activity import ActivityLog, ActivityLogError
from app.store.factory import activity_log

router = APIRouter(prefix="/actions", tags=["actions"])

_STATUS_FOR_REASON = {
    "read_only": 403,
    "protected": 409,
    "guarded": 409,
    "database_locked": 409,
    "tier_immutable": 409,
    "not_found": 404,
    "invalid": 422,
    "reason_required": 422,
    "unauthenticated": 401,
    "log_unavailable": 503,
}


def _blocked(exc: action_service.ActionBlocked, dry_run: bool) -> JSONResponse:
    result = ActionResult(
        executed=False,
        dry_run=dry_run,
        blocked_reason=exc.reason,
        detail=exc.detail,
        remediation=exc.remediation,
    )
    return JSONResponse(
        status_code=_STATUS_FOR_REASON.get(exc.reason, 409),
        content=result.model_dump(),
    )


def _log(settings: Settings, actor: Actor | None) -> ActivityLog:
    try:
        return activity_log(settings, actor)
    except ActivityLogError as exc:
        raise action_service.ActionBlocked(
            BlockedReason.LOG_UNAVAILABLE,
            f"The activity log is unavailable, so nothing can be changed. {exc}",
        ) from exc


def _run(  # noqa: ANN202
    clients: ClientsDep,
    settings: SettingsDep,
    actor: Actor | None,
    plan: ActionPlan,
    dry_run: bool,
    reason: str | None,
):
    store = _log(settings, actor)
    return action_service.execute(clients, settings, store, plan, dry_run, actor, reason)


class ActorInfo(BaseModel):
    user: str | None
    source: str | None


@router.get("/actor", response_model=ActorInfo)
def whoami(actor: ActorDep) -> ActorInfo:
    """Who actions will be recorded as. Null on the platform when the login cannot be verified."""
    return ActorInfo(user=actor.user if actor else None, source=actor.source if actor else None)


@router.post("/scale", response_model=ActionResult)
def scale(request: ScaleRequest, clients: ClientsDep, settings: SettingsDep, actor: ActorDep):  # noqa: ANN201
    try:
        snapshot = inventory_service.get_snapshot(clients)
        plan = action_service.plan_scale(
            snapshot, settings, request.kind, request.name, request.replicas
        )
        return _run(clients, settings, actor, plan, request.dry_run, request.reason)
    except action_service.ActionBlocked as exc:
        return _blocked(exc, request.dry_run)


@router.post("/stop", response_model=ActionResult)
def stop(request: WorkloadRequest, clients: ClientsDep, settings: SettingsDep, actor: ActorDep):  # noqa: ANN201
    """Scale to zero, remembering the previous count so it can be restored."""
    try:
        snapshot = inventory_service.get_snapshot(clients)
        plan = action_service.plan_scale(
            snapshot, settings, request.kind, request.name, 0, action=ActionType.STOP
        )
        return _run(clients, settings, actor, plan, request.dry_run, request.reason)
    except action_service.ActionBlocked as exc:
        return _blocked(exc, request.dry_run)


@router.post("/restore", response_model=ActionResult)
def restore(request: WorkloadRequest, clients: ClientsDep, settings: SettingsDep, actor: ActorDep):  # noqa: ANN201
    try:
        snapshot = inventory_service.get_snapshot(clients)
        plan = action_service.plan_restore(
            snapshot, settings, _log(settings, actor), request.kind, request.name
        )
        return _run(clients, settings, actor, plan, request.dry_run, request.reason)
    except action_service.ActionBlocked as exc:
        return _blocked(exc, request.dry_run)


@router.post("/restart", response_model=ActionResult)
def restart(request: WorkloadRequest, clients: ClientsDep, settings: SettingsDep, actor: ActorDep):  # noqa: ANN201
    try:
        snapshot = inventory_service.get_snapshot(clients)
        plan = action_service.plan_restart(snapshot, settings, request.kind, request.name)
        return _run(clients, settings, actor, plan, request.dry_run, request.reason)
    except action_service.ActionBlocked as exc:
        return _blocked(exc, request.dry_run)


@router.post("/pods/{name}/delete", response_model=ActionResult)
def delete_pod(  # noqa: ANN201
    name: str,
    request: PodDeleteRequest,
    clients: ClientsDep,
    settings: SettingsDep,
    actor: ActorDep,
):
    try:
        snapshot = inventory_service.get_snapshot(clients)
        plan = action_service.plan_delete_pod(
            snapshot, settings, name, force=request.force, container=request.container
        )
        return _run(clients, settings, actor, plan, request.dry_run, request.reason)
    except action_service.ActionBlocked as exc:
        return _blocked(exc, request.dry_run)


@router.post("/kill", response_model=ActionResult)
def kill(request: WorkloadRequest, clients: ClientsDep, settings: SettingsDep, actor: ActorDep):  # noqa: ANN201
    """Scale to 0 and force-delete current pods, so the service dies immediately."""
    try:
        snapshot = inventory_service.get_snapshot(clients)
        plan = action_service.plan_kill(snapshot, settings, request.kind, request.name)
        return _run(clients, settings, actor, plan, request.dry_run, request.reason)
    except action_service.ActionBlocked as exc:
        return _blocked(exc, request.dry_run)


@router.post("/services/{name}/kill", response_model=ActionResult)
def kill_service(  # noqa: ANN201
    name: str,
    request: ServiceKillRequest,
    clients: ClientsDep,
    settings: SettingsDep,
    actor: ActorDep,
):
    """Kill every actionable workload under a service group."""
    try:
        snapshot = inventory_service.get_snapshot(clients)
        plan = action_service.plan_kill_service(snapshot, settings, name)
        return _run(clients, settings, actor, plan, request.dry_run, request.reason)
    except action_service.ActionBlocked as exc:
        return _blocked(exc, request.dry_run)


def _unavailable(exc: ActivityLogError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@router.get("/stopped", response_model=dict)
def stopped(clients: ClientsDep, settings: SettingsDep, actor: ActorDep):  # noqa: ANN201
    """Workloads stopped through this tool, and what to restore each one to."""
    try:
        points = activity_log(settings, actor).stopped(clients.namespace)
    except ActivityLogError as exc:
        return _unavailable(exc)
    return {
        key: {
            "previous_replicas": p.previous_replicas,
            "stopped_at": p.stopped_at,
            "actor": p.actor,
        }
        for key, p in points.items()
    }


@router.get("/history", response_model=list[ActionRecord])
def history(  # noqa: ANN201
    clients: ClientsDep,
    settings: SettingsDep,
    actor: ActorDep,
    limit: int = Query(100, ge=1, le=500),
):
    try:
        return activity_log(settings, actor).history(clients.namespace, limit)
    except ActivityLogError as exc:
        return _unavailable(exc)
