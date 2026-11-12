"""The ArangoDeployment tier editor - the correct way to resize the database."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import ActorDep, ClientsDep, SettingsDep
from app.api.v1.actions import _blocked, _log
from app.models.actions import ActionResult, DatabaseScaleRequest
from app.services import actions as action_service
from app.services import arangodeployment
from app.services import inventory as inventory_service
from app.services.actions import ActionBlocked

router = APIRouter(prefix="/database", tags=["database"])


@router.get("", response_model=arangodeployment.DatabaseStatus)
def database_status(clients: ClientsDep, settings: SettingsDep):  # noqa: ANN201
    try:
        return arangodeployment.status(clients, settings)
    except ActionBlocked as exc:
        return _blocked(exc, dry_run=True)


@router.post("/scale", response_model=ActionResult)
def database_scale(  # noqa: ANN201
    request: DatabaseScaleRequest, clients: ClientsDep, settings: SettingsDep, actor: ActorDep
):
    activity_id: str | None = None
    store = None
    try:
        plan = arangodeployment.plan_scale(clients, settings, request.tier, request.count)
        if not request.dry_run:
            action_service.check_read_only(settings)
            reason = action_service.check_attribution(actor, request.reason)
            assert actor is not None
            store = _log(settings, actor)
            activity_id = action_service.begin_activity(
                store, plan, actor, reason, action_service.changes_for(plan)
            )
        plan = arangodeployment.execute(clients, settings, plan, request.tier, request.dry_run)
    except ActionBlocked as exc:
        if store is not None and activity_id is not None:
            action_service.finish_activity(store, activity_id, ok=False, detail=exc.detail)
        return _blocked(exc, request.dry_run)

    if request.dry_run:
        return ActionResult(executed=False, dry_run=True, plan=plan)

    assert store is not None and activity_id is not None
    action_service.finish_activity(store, activity_id, ok=True, detail=None)
    inventory_service.invalidate()
    return ActionResult(executed=True, dry_run=False, plan=plan)
