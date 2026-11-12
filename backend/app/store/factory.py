"""Which activity log a request writes to."""

from __future__ import annotations

from pathlib import Path

from app.config import Settings
from app.identity import Actor
from app.store.activity import ActivityLog
from app.store.arango_log import ArangoActivityLog, endpoint
from app.store.state import FileActivityLog

_file_log = FileActivityLog(Path(__file__).resolve().parent.parent.parent / ".arm-state.json")


def activity_log(settings: Settings, actor: Actor | None) -> ActivityLog:
    """ArangoDB when an endpoint is configured or injected, else the local file.
    Raises ActivityLogError when ArangoDB is configured but cannot be used."""
    if endpoint(settings) is not None:
        return ArangoActivityLog.connect(settings, actor)
    return _file_log
