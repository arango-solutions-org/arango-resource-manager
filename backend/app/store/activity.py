"""The activity log: what was done, by whom, why, and how to undo it.

Every executed action is recorded in two steps. `begin` runs before the change
is made and must succeed, or the action is refused: no record, no change.
`finish` runs after, with the outcome. A process that dies in between leaves a
started activity behind, and that still counts as a way back.

Two implementations: `FileActivityLog` (a JSON file, for local work and tests)
and `ArangoActivityLog` (a W3C PROV graph in ArangoDB, for the platform).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.identity import Actor
from app.models.actions import ActionRecord


@dataclass(frozen=True)
class Change:
    """One object an activity touches. Replicas are None when they do not apply."""

    kind: str
    name: str
    from_replicas: int | None = None
    to_replicas: int | None = None

    @property
    def scales_to_zero(self) -> bool:
        return self.to_replicas == 0 and (self.from_replicas or 0) > 0

    @property
    def changes_replicas(self) -> bool:
        return self.from_replicas != self.to_replicas


@dataclass(frozen=True)
class ActivityStart:
    action: str
    namespace: str
    kind: str
    name: str
    actor: Actor
    reason: str
    changes: list[Change] = field(default_factory=list)


@dataclass(frozen=True)
class RestorePoint:
    previous_replicas: int
    stopped_at: str
    actor: str


class ActivityLogError(Exception):
    """The log could not be written or read. The action must not proceed."""


class ActivityLog(Protocol):
    def begin(self, start: ActivityStart) -> str: ...

    def finish(self, activity_id: str, ok: bool, detail: str | None = None) -> None: ...

    def restore_point(self, namespace: str, kind: str, name: str) -> RestorePoint | None: ...

    def stopped(self, namespace: str) -> dict[str, RestorePoint]:
        """Workloads with a restore point, keyed "Kind/name"."""
        ...

    def history(self, namespace: str, limit: int = 100) -> list[ActionRecord]: ...
