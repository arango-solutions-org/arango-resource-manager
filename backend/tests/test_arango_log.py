"""The PROV activity log against a real ArangoDB.

Skipped unless ARM_TEST_ARANGO_URL names a server whose root password is
ARM_TEST_ARANGO_PASSWORD. Locally:

    docker run -d -p 18529:8529 -e ARANGO_ROOT_PASSWORD=testpw arangodb/arangodb:3.12.4
    export ARM_TEST_ARANGO_URL=http://localhost:18529 ARM_TEST_ARANGO_PASSWORD=testpw
    uv run pytest -m arango

Each test gets its own throwaway database.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Iterator

import pytest
from arango import ArangoClient

from app.config import Settings
from app.identity import Actor
from app.store.activity import ActivityStart, Change
from app.store.arango_log import ArangoActivityLog, workload_key

URL = os.getenv("ARM_TEST_ARANGO_URL", "")
PASSWORD = os.getenv("ARM_TEST_ARANGO_PASSWORD", "")

pytestmark = [
    pytest.mark.arango,
    pytest.mark.skipif(not URL, reason="ARM_TEST_ARANGO_URL is not set"),
]

NS = "test-ns"
PAUL = Actor(user="paul@arangodb.com", source="platform")
EMMET = Actor(user="emmet@arangodb.com", source="platform")


@pytest.fixture
def store() -> Iterator[ArangoActivityLog]:
    name = f"arm_test_{uuid.uuid4().hex[:10]}"
    system = ArangoClient(hosts=URL).db("_system", username="root", password=PASSWORD)
    system.create_database(name)
    settings = Settings(
        arango_url=URL, arango_database=name, arango_username="root", arango_password=PASSWORD
    )
    try:
        yield ArangoActivityLog.connect(settings, actor=None)
    finally:
        system.delete_database(name)


def _act(
    store: ArangoActivityLog,
    action: str,
    actor: Actor,
    name: str,
    before: int,
    after: int,
    ok: bool = True,
    finish: bool = True,
) -> str:
    activity = store.begin(
        ActivityStart(
            action,
            NS,
            "Deployment",
            name,
            actor,
            f"{action} for a test",
            [Change("Deployment", name, before, after)],
        )
    )
    if finish:
        store.finish(activity, ok=ok, detail=None if ok else "rejected")
    return activity


def _lineage(store: ArangoActivityLog, name: str) -> list[int]:
    """Replica counts from the latest state back to the first, along wasDerivedFrom."""
    rows = store._db.aql.execute(  # noqa: SLF001
        """
        LET latest = FIRST(FOR s IN workloadStates FILTER s.workload == @w
                           SORT s.at DESC LIMIT 1 RETURN s)
        FOR v IN 0..20 OUTBOUND latest wasDerivedFrom RETURN v.replicas
        """,
        bind_vars={"w": f"workloads/{workload_key(NS, 'Deployment', name)}"},
    )
    return list(rows)  # type: ignore[arg-type]


def test_a_stop_can_be_restored_and_says_who_and_when(store: ArangoActivityLog) -> None:
    _act(store, "stop", PAUL, "worker", 5, 0)

    point = store.restore_point(NS, "Deployment", "worker")
    assert point is not None
    assert point.previous_replicas == 5
    assert point.actor == "paul@arangodb.com"
    assert set(store.stopped(NS)) == {"Deployment/worker"}


def test_restore_walks_the_lineage_and_closes_the_restore_point(
    store: ArangoActivityLog,
) -> None:
    _act(store, "stop", PAUL, "worker", 5, 0)
    _act(store, "restore", EMMET, "worker", 0, 5)

    assert store.restore_point(NS, "Deployment", "worker") is None
    assert _lineage(store, "worker") == [5, 0, 5]


def test_a_count_changed_outside_the_tool_is_recorded_as_drift(store: ArangoActivityLog) -> None:
    _act(store, "scale", PAUL, "worker", 5, 3)
    # Someone ran kubectl: the cluster now shows 8, not the 3 the log produced.
    _act(store, "stop", EMMET, "worker", 8, 0)

    assert _lineage(store, "worker") == [0, 8, 3, 5]
    drift = list(
        store._db.aql.execute("FOR e IN wasDerivedFrom FILTER e.drift == true RETURN e")  # noqa: SLF001  # type: ignore[union-attr]
    )
    assert len(drift) == 1
    point = store.restore_point(NS, "Deployment", "worker")
    assert point is not None and point.previous_replicas == 8


def test_a_stop_that_never_finished_still_leaves_a_way_back(store: ArangoActivityLog) -> None:
    """The process died after the patch but before finish."""
    _act(store, "stop", PAUL, "worker", 5, 0, finish=False)

    point = store.restore_point(NS, "Deployment", "worker")
    assert point is not None and point.previous_replicas == 5
    assert store.history(NS)[0].result == "pending"


def test_a_rejected_stop_leaves_no_restore_point(store: ArangoActivityLog) -> None:
    _act(store, "stop", PAUL, "worker", 5, 0, ok=False)

    assert store.restore_point(NS, "Deployment", "worker") is None
    assert store.history(NS)[0].result == "error"


def test_history_carries_actor_reason_and_counts_newest_first(store: ArangoActivityLog) -> None:
    _act(store, "scale", PAUL, "worker", 5, 3)
    _act(store, "stop", EMMET, "api", 2, 0)

    history = store.history(NS)
    assert [(h.action, h.name, h.actor) for h in history] == [
        ("stop", "api", "emmet@arangodb.com"),
        ("scale", "worker", "paul@arangodb.com"),
    ]
    assert history[0].reason == "stop for a test"
    assert (history[1].from_replicas, history[1].to_replicas) == (5, 3)


def test_a_kill_of_several_workloads_is_one_activity(store: ArangoActivityLog) -> None:
    activity = store.begin(
        ActivityStart(
            "kill_service",
            NS,
            "Service",
            "file-parser",
            PAUL,
            "demo tomorrow",
            [Change("Deployment", "api", 2, 0), Change("Deployment", "worker", 5, 0)],
        )
    )
    store.finish(activity, ok=True)

    assert set(store.stopped(NS)) == {"Deployment/api", "Deployment/worker"}
    used = list(
        store._db.aql.execute(  # noqa: SLF001
            "FOR s IN 1 OUTBOUND @a used RETURN s.replicas",
            bind_vars={"a": f"activities/{activity}"},
        )  # type: ignore[arg-type]
    )
    assert sorted(used) == [2, 5]


def test_the_log_database_is_created_on_first_use() -> None:
    name = f"arm_test_{uuid.uuid4().hex[:10]}"
    system = ArangoClient(hosts=URL).db("_system", username="root", password=PASSWORD)
    settings = Settings(
        arango_url=URL, arango_database=name, arango_username="root", arango_password=PASSWORD
    )
    try:
        store = ArangoActivityLog.connect(settings, actor=None)
        assert name in system.databases()
        assert store.history(NS) == []
    finally:
        if name in system.databases():
            system.delete_database(name)
