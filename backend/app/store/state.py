"""The activity log as a JSON file, for local work and tests.

Writes go to a temp file and are renamed into place, so a crash mid-write
leaves the previous good file rather than a truncated one. On the platform the
log lives in ArangoDB instead (see `arango_log`), because a file inside the pod
is lost on every redeploy.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
import uuid
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog

from app.models.actions import ActionRecord
from app.store.activity import ActivityLogError, ActivityStart, Change, RestorePoint

log = structlog.get_logger(__name__)

_MAX_ACTIVITIES = 1000


def now() -> str:
    return datetime.now(UTC).isoformat()


class FileActivityLog:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.Lock()

    # -- file ------------------------------------------------------------

    def _read(self) -> list[dict[str, Any]]:
        if not self._path.exists():
            return []
        try:
            data = json.loads(self._path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            # A corrupt file must not take the app down. The cost is a
            # forgotten replica count, which the UI reports honestly.
            log.warning("activity_log.unreadable", path=str(self._path), error=str(exc))
            return []
        activities = data.get("activities") if isinstance(data, dict) else None
        return activities if isinstance(activities, list) else []

    def _write(self, activities: list[dict[str, Any]]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        handle, temp_path = tempfile.mkstemp(dir=str(self._path.parent), suffix=".tmp")
        try:
            with os.fdopen(handle, "w") as file:
                json.dump({"activities": activities[-_MAX_ACTIVITIES:]}, file, indent=2)
            os.replace(temp_path, self._path)
        except OSError as exc:
            Path(temp_path).unlink(missing_ok=True)
            raise ActivityLogError(f"Could not write the activity log: {exc}") from exc

    # -- writing ---------------------------------------------------------

    def begin(self, start: ActivityStart) -> str:
        activity_id = uuid.uuid4().hex
        record = {
            "id": activity_id,
            "action": start.action,
            "namespace": start.namespace,
            "kind": start.kind,
            "name": start.name,
            "actor": start.actor.user,
            "reason": start.reason,
            "changes": [asdict(change) for change in start.changes],
            "status": "started",
            "started_at": now(),
            "ended_at": None,
            "detail": None,
        }
        with self._lock:
            activities = self._read()
            activities.append(record)
            self._write(activities)
        return activity_id

    def finish(self, activity_id: str, ok: bool, detail: str | None = None) -> None:
        with self._lock:
            activities = self._read()
            for record in activities:
                if record["id"] == activity_id:
                    record["status"] = "succeeded" if ok else "failed"
                    record["ended_at"] = now()
                    record["detail"] = detail
                    break
            self._write(activities)

    # -- reading ---------------------------------------------------------

    def restore_point(self, namespace: str, kind: str, name: str) -> RestorePoint | None:
        # The latest activity that changed this workload's replicas decides.
        # A started one counts: the process may have died after the patch.
        for record in reversed(self._read()):
            if record["namespace"] != namespace or record["status"] == "failed":
                continue
            for raw in record["changes"]:
                change = Change(**raw)
                if change.kind != kind or change.name != name:
                    continue
                if not change.changes_replicas and record["action"] != "restore":
                    continue
                if not change.scales_to_zero:
                    return None
                return RestorePoint(
                    previous_replicas=change.from_replicas or 0,
                    stopped_at=record["started_at"],
                    actor=record["actor"],
                )
        return None

    def stopped(self, namespace: str) -> dict[str, RestorePoint]:
        seen: set[tuple[str, str]] = set()
        result: dict[str, RestorePoint] = {}
        for record in self._read():
            if record["namespace"] != namespace:
                continue
            for raw in record["changes"]:
                seen.add((raw["kind"], raw["name"]))
        for kind, name in sorted(seen):
            point = self.restore_point(namespace, kind, name)
            if point is not None:
                result[f"{kind}/{name}"] = point
        return result

    def history(self, namespace: str, limit: int = 100) -> list[ActionRecord]:
        records = [r for r in self._read() if r["namespace"] == namespace]
        return [to_action_record(r) for r in reversed(records)][:limit]


def to_action_record(record: dict[str, Any]) -> ActionRecord:
    """One stored activity, in the shape the Activity page reads."""
    primary = next(
        (
            c
            for c in record.get("changes", [])
            if c["kind"] == record["kind"] and c["name"] == record["name"]
        ),
        (record.get("changes") or [None])[0],
    )
    result = {"succeeded": "ok", "failed": "error"}.get(record["status"], "pending")
    return ActionRecord(
        ts=record["started_at"],
        action=record["action"],
        kind=record["kind"],
        name=record["name"],
        from_replicas=primary["from_replicas"] if primary else None,
        to_replicas=primary["to_replicas"] if primary else None,
        dry_run=False,
        result=result,
        detail=record.get("detail"),
        actor=record.get("actor"),
        reason=record.get("reason"),
    )
