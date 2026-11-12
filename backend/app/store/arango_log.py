"""The activity log as a W3C PROV graph in ArangoDB.

    agents            prov:Agent    a person who acted
    activities        prov:Activity one scale, stop, restore, restart, kill, delete
    workloads         the thing that changes (a Deployment, a StatefulSet, ...)
    workloadStates    prov:Entity   a workload's replica count at one moment

    wasAssociatedWith  activity  -> agent        who did it
    used               activity  -> state        the state it started from
    wasGeneratedBy     state     -> activity     the state it produced
    wasDerivedFrom     state     -> state        each state to the one before
    specializationOf   state     -> workload     which workload a state is of

A workload's lineage is its chain of states along wasDerivedFrom. Restoring a
stopped workload walks one step back along it. When the cluster shows a count
the log did not produce (someone scaled outside this tool), `begin` records an
observed state first, so the chain stays continuous and says where it drifted.
"""

from __future__ import annotations

import hashlib
import os
import re
import tempfile
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict
from typing import Any, cast

import structlog
from arango import ArangoClient
from arango.database import StandardDatabase
from arango.exceptions import ArangoError

from app.config import Settings
from app.identity import Actor
from app.models.actions import ActionRecord
from app.store.activity import ActivityLogError, ActivityStart, RestorePoint
from app.store.state import now, to_action_record

log = structlog.get_logger(__name__)

GRAPH = "provenance"
VERTICES = ("agents", "activities", "workloads", "workloadStates")
EDGES: dict[str, tuple[list[str], list[str]]] = {
    "wasAssociatedWith": (["activities"], ["agents"]),
    "used": (["activities"], ["workloadStates"]),
    "wasGeneratedBy": (["workloadStates"], ["activities"]),
    "wasDerivedFrom": (["workloadStates"], ["workloadStates"]),
    "specializationOf": (["workloadStates"], ["workloads"]),
}
WRITE_COLLECTIONS = [*VERTICES, *EDGES]

Doc = dict[str, Any]


def _query(db: StandardDatabase, aql: str, bind_vars: dict[str, Any]) -> list[Doc]:
    """Run AQL and return every row. The driver's return type also covers async
    and batch jobs, which this module never uses."""
    return list(cast(Any, db.aql.execute(aql, bind_vars=bind_vars)))


def _insert(db: StandardDatabase, collection: str, doc: Doc, **kwargs: Any) -> Doc:
    return cast(Doc, db.collection(collection).insert(doc, **kwargs))


_KEY_UNSAFE = re.compile(r"[^A-Za-z0-9_\-:.@()+,=;$!*'%]")


def doc_key(value: str) -> str:
    """A valid, stable ArangoDB _key for `value`. Rewritten values get a hash
    suffix, so two names that sanitize alike still get distinct keys."""
    safe = _KEY_UNSAFE.sub("_", value)
    if safe == value and len(value) <= 200:
        return value
    return f"{safe[:180]}-{hashlib.sha256(value.encode()).hexdigest()[:12]}"


def workload_key(namespace: str, kind: str, name: str) -> str:
    return doc_key(f"{namespace}:{kind}:{name}")


# -- connection -------------------------------------------------------------


def endpoint(settings: Settings) -> str | None:
    """ArangoDB for the log: ARM_ARANGO_URL, else the platform-injected endpoint."""
    for value in (settings.arango_url, os.getenv("ARANGO_DEPLOYMENT_ENDPOINT", "")):
        if value.strip():
            return value.strip().rstrip("/")
    return None


_ca_lock = threading.Lock()
_ca_path: str | None = None


def _deployment_ca() -> str | None:
    """The CA the platform injects for its endpoint, as a file path."""
    global _ca_path
    value = os.getenv("ARANGO_DEPLOYMENT_CA", "").strip()
    if not value:
        return None
    if "-----BEGIN" not in value:
        return value if os.path.isfile(value) else None
    with _ca_lock:
        if _ca_path is None or not os.path.isfile(_ca_path):
            handle, path = tempfile.mkstemp(prefix="arango-ca-", suffix=".pem")
            with os.fdopen(handle, "w") as file:
                file.write(value if value.endswith("\n") else value + "\n")
            _ca_path = path
        return _ca_path


def verify_tls(settings: Settings) -> bool | str:
    mode = settings.arango_verify_tls.strip().lower()
    if mode in {"on", "true", "1"}:
        return True
    if mode in {"off", "false", "0"}:
        return False
    if settings.arango_url.strip():
        return True
    # The injected endpoint's certificate comes from the cluster's own CA.
    return _deployment_ca() or False


_clients: dict[tuple[str, str], ArangoClient] = {}
_clients_lock = threading.Lock()
_schema_ready: set[tuple[str, str]] = set()


def open_database(settings: Settings, actor: Actor | None) -> StandardDatabase:
    """The log database, authenticated as the actor on the platform, or with
    ARM_ARANGO_USERNAME / ARM_ARANGO_PASSWORD elsewhere."""
    url = endpoint(settings)
    if url is None:
        raise ActivityLogError("No ArangoDB endpoint is configured for the activity log.")
    verify = verify_tls(settings)
    with _clients_lock:
        client = _clients.get((url, str(verify)))
        if client is None:
            client = ArangoClient(hosts=url, verify_override=verify, request_timeout=15)
            _clients[(url, str(verify))] = client
    name = settings.arango_database
    try:
        return _db_handle(client, name, settings, actor)
    except Exception as exc:  # noqa: BLE001 - the driver raises JWT errors of several types
        raise ActivityLogError(f"Could not open the activity log database: {exc}") from exc


def _db_handle(
    client: ArangoClient, name: str, settings: Settings, actor: Actor | None
) -> StandardDatabase:
    if actor is not None and actor.token:
        return client.db(name, auth_method="jwt", user_token=actor.token)
    return client.db(name, username=settings.arango_username, password=settings.arango_password)


def ensure_database(settings: Settings, actor: Actor | None) -> None:
    """Create the log database when it does not exist yet. Needs a caller who
    may create databases; anyone else gets the error, unchanged."""
    url = endpoint(settings)
    assert url is not None
    client = _clients[(url, str(verify_tls(settings)))]
    system = _db_handle(client, "_system", settings, actor)
    if settings.arango_database not in cast(list[str], system.databases()):
        system.create_database(settings.arango_database)
        log.info("activity_log.database_created", database=settings.arango_database)


def ensure_schema(db: StandardDatabase) -> None:
    """Create the collections, graph and indexes if they are missing. Idempotent."""
    for name in VERTICES:
        if not db.has_collection(name):
            db.create_collection(name)
    if not db.has_graph(GRAPH):
        db.create_graph(
            GRAPH,
            edge_definitions=[
                {
                    "edge_collection": edge,
                    "from_vertex_collections": sources,
                    "to_vertex_collections": targets,
                }
                for edge, (sources, targets) in EDGES.items()
            ],
        )
    else:
        graph = db.graph(GRAPH)
        for edge, (sources, targets) in EDGES.items():
            if not graph.has_edge_definition(edge):
                graph.create_edge_definition(edge, sources, targets)
    for collection, fields in (
        ("activities", ["namespace", "started_at"]),
        ("workloads", ["namespace"]),
        ("workloadStates", ["workload", "at"]),
    ):
        db.collection(collection).add_index({"type": "persistent", "fields": fields})


def _database_exists(db: StandardDatabase) -> bool:
    try:
        db.properties()
    except ArangoError as exc:
        if getattr(exc, "error_code", None) == 1228:  # ERROR_ARANGO_DATABASE_NOT_FOUND
            return False
        raise
    return True


# -- the log ----------------------------------------------------------------


class ArangoActivityLog:
    def __init__(self, db: StandardDatabase) -> None:
        self._db = db

    @classmethod
    def connect(cls, settings: Settings, actor: Actor | None) -> ArangoActivityLog:
        db = open_database(settings, actor)
        key = (endpoint(settings) or "", settings.arango_database)
        if key not in _schema_ready:
            try:
                if not _database_exists(db):
                    ensure_database(settings, actor)
                ensure_schema(db)
            except ArangoError as exc:
                raise ActivityLogError(
                    f"The activity log database '{settings.arango_database}' is not ready: {exc}"
                ) from exc
            _schema_ready.add(key)
        return cls(db)

    @contextmanager
    def _transaction(self) -> Iterator[StandardDatabase]:
        try:
            txn = cast(
                Any, self._db.begin_transaction(write=WRITE_COLLECTIONS, read=WRITE_COLLECTIONS)
            )
        except ArangoError as exc:
            raise ActivityLogError(f"Could not write the activity log: {exc}") from exc
        try:
            yield txn
            txn.commit_transaction()
        except ArangoError as exc:
            txn.abort_transaction()
            raise ActivityLogError(f"Could not write the activity log: {exc}") from exc
        except BaseException:
            txn.abort_transaction()
            raise

    @staticmethod
    def _latest_state(txn: StandardDatabase, workload_id: str) -> dict[str, Any] | None:
        rows = _query(
            txn,
            "FOR s IN workloadStates FILTER s.workload == @w SORT s.at DESC LIMIT 1 RETURN s",
            {"w": workload_id},
        )
        return rows[0] if rows else None

    def begin(self, start: ActivityStart) -> str:
        ts = now()
        with self._transaction() as txn:
            agent_key = doc_key(start.actor.user)
            _insert(
                txn,
                "agents",
                {
                    "_key": agent_key,
                    "name": start.actor.user,
                    "type": "prov:Person",
                    "source": start.actor.source,
                },
                overwrite_mode="ignore",
            )
            activity = _insert(
                txn,
                "activities",
                {
                    "type": "prov:Activity",
                    "action": start.action,
                    "namespace": start.namespace,
                    "kind": start.kind,
                    "name": start.name,
                    "reason": start.reason,
                    "changes": [asdict(change) for change in start.changes],
                    "status": "started",
                    "started_at": ts,
                    "ended_at": None,
                    "detail": None,
                },
            )
            _insert(
                txn,
                "wasAssociatedWith",
                {"_from": activity["_id"], "_to": f"agents/{agent_key}", "role": "operator"},
            )

            before: dict[str, str] = {}
            for change in start.changes:
                if change.from_replicas is None:
                    continue
                wkey = workload_key(start.namespace, change.kind, change.name)
                workload_id = f"workloads/{wkey}"
                _insert(
                    txn,
                    "workloads",
                    {
                        "_key": wkey,
                        "namespace": start.namespace,
                        "kind": change.kind,
                        "name": change.name,
                    },
                    overwrite_mode="ignore",
                )
                latest = self._latest_state(txn, workload_id)
                if latest is not None and latest["replicas"] == change.from_replicas:
                    state_id = latest["_id"]
                else:
                    # The cluster shows a count this log did not produce.
                    state = _insert(
                        txn,
                        "workloadStates",
                        {
                            "type": "prov:Entity",
                            "workload": workload_id,
                            "replicas": change.from_replicas,
                            "at": ts,
                            "observed": True,
                        },
                    )
                    state_id = state["_id"]
                    _insert(txn, "specializationOf", {"_from": state_id, "_to": workload_id})
                    if latest is not None:
                        _insert(
                            txn,
                            "wasDerivedFrom",
                            {"_from": state_id, "_to": latest["_id"], "drift": True},
                        )
                _insert(txn, "used", {"_from": activity["_id"], "_to": state_id})
                before[f"{change.kind}/{change.name}"] = state_id

            txn.collection("activities").update({"_id": activity["_id"], "before": before})
        return str(activity["_key"])

    def finish(self, activity_id: str, ok: bool, detail: str | None = None) -> None:
        ts = now()
        with self._transaction() as txn:
            activity = cast(Doc | None, txn.collection("activities").get(activity_id))
            if activity is None:
                raise ActivityLogError(f"No activity {activity_id} to finish.")
            txn.collection("activities").update(
                {
                    "_key": activity_id,
                    "status": "succeeded" if ok else "failed",
                    "ended_at": ts,
                    "detail": detail,
                }
            )
            if not ok:
                return
            for raw in activity["changes"]:
                before_id = (activity.get("before") or {}).get(f"{raw['kind']}/{raw['name']}")
                if before_id is None:
                    continue
                workload_id = (
                    f"workloads/{workload_key(activity['namespace'], raw['kind'], raw['name'])}"
                )
                state = _insert(
                    txn,
                    "workloadStates",
                    {
                        "type": "prov:Entity",
                        "workload": workload_id,
                        "replicas": raw["to_replicas"],
                        "at": ts,
                        "observed": False,
                    },
                )
                _insert(txn, "specializationOf", {"_from": state["_id"], "_to": workload_id})
                _insert(txn, "wasGeneratedBy", {"_from": state["_id"], "_to": activity["_id"]})
                _insert(txn, "wasDerivedFrom", {"_from": state["_id"], "_to": before_id})

    # -- reading -----------------------------------------------------------

    _RESTORE_QUERY = """
        LET latest = FIRST(
          FOR s IN workloadStates FILTER s.workload == @w SORT s.at DESC LIMIT 1 RETURN s)
        FILTER latest != null
        LET prior = FIRST(FOR p IN 1 OUTBOUND latest wasDerivedFrom RETURN p)
        LET made = FIRST(FOR a IN 1 OUTBOUND latest wasGeneratedBy RETURN a)
        LET pending = FIRST(
          FOR a IN 1 INBOUND latest used
            FILTER a.status == "started"
            SORT a.started_at DESC LIMIT 1 RETURN a)
        LET act = latest.replicas == 0 ? made : pending
        LET agent = act == null ? null
          : FIRST(FOR g IN 1 OUTBOUND act wasAssociatedWith RETURN g.name)
        RETURN {latest, prior, act, agent}
    """

    def restore_point(self, namespace: str, kind: str, name: str) -> RestorePoint | None:
        workload_id = f"workloads/{workload_key(namespace, kind, name)}"
        try:
            rows = _query(self._db, self._RESTORE_QUERY, {"w": workload_id})
            row = rows[0] if rows else None
        except ArangoError as exc:
            raise ActivityLogError(f"Could not read the activity log: {exc}") from exc
        if not row or row["act"] is None:
            return None
        latest, prior, act = row["latest"], row["prior"], row["act"]
        if latest["replicas"] == 0:
            # Stopped by an activity here: the way back is one step up the lineage.
            if prior is None or prior["replicas"] <= 0:
                return None
            previous = prior["replicas"]
        else:
            # A stop that started but never finished (the process died mid-action).
            change = next(
                (c for c in act["changes"] if c["kind"] == kind and c["name"] == name), None
            )
            if change is None or change["to_replicas"] != 0 or latest["replicas"] <= 0:
                return None
            previous = latest["replicas"]
        return RestorePoint(
            previous_replicas=previous,
            stopped_at=act["started_at"],
            actor=row["agent"] or "unknown",
        )

    def stopped(self, namespace: str) -> dict[str, RestorePoint]:
        try:
            workloads = _query(
                self._db,
                "FOR w IN workloads FILTER w.namespace == @ns RETURN w",
                {"ns": namespace},
            )
        except ArangoError as exc:
            raise ActivityLogError(f"Could not read the activity log: {exc}") from exc
        result: dict[str, RestorePoint] = {}
        for w in workloads:
            point = self.restore_point(namespace, w["kind"], w["name"])
            if point is not None:
                result[f"{w['kind']}/{w['name']}"] = point
        return result

    def history(self, namespace: str, limit: int = 100) -> list[ActionRecord]:
        try:
            rows = _query(
                self._db,
                """
                FOR a IN activities
                  FILTER a.namespace == @ns
                  SORT a.started_at DESC
                  LIMIT @limit
                  LET actor = FIRST(FOR g IN 1 OUTBOUND a wasAssociatedWith RETURN g.name)
                  RETURN MERGE(a, {id: a._key, actor})
                """,
                {"ns": namespace, "limit": limit},
            )
            return [to_action_record(row) for row in rows]
        except ArangoError as exc:
            raise ActivityLogError(f"Could not read the activity log: {exc}") from exc
