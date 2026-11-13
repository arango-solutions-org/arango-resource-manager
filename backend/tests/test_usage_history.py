"""Peak usage between samples, and reclaimable measured against it."""

from __future__ import annotations

import pytest

from app.config import Settings
from app.models.inventory import InventorySnapshot
from app.services import rollup
from app.services.inventory import assemble
from app.services.usage_history import HOUR, UsageHistory
from tests.conftest import fixture_items
from tests.test_rollup import _usage

PDF = "arangodb-graphrag-retriever-icnn5"  # a per-project instance, so actionable


@pytest.fixture
def snapshot() -> InventorySnapshot:
    names = [
        "pods",
        "deployments",
        "statefulsets",
        "replicasets",
        "arangodeployments",
        "events",
        "resourcequotas",
    ]
    raw = {name: fixture_items(name) for name in names}
    raw["arango_deployments"] = raw.pop("arangodeployments")
    raw["platform_services"] = fixture_items("arangoplatformservices")
    raw["charts"] = fixture_items("arangoplatformcharts")
    raw["routes"] = fixture_items("arangoroutes")
    return assemble(raw, "example-platform", Settings(), usage=_usage())


class Clock:
    def __init__(self) -> None:
        self.now = 1_800_000_000.0

    def __call__(self) -> float:
        return self.now


def _with_usage(base: InventorySnapshot, name: str, cpu: float, memory: int) -> InventorySnapshot:
    """The same snapshot, with one workload's usage replaced and a new capture time."""
    workloads = []
    for workload in base.workloads:
        if workload.name == name:
            resources = workload.resources.model_copy(
                update={
                    "usage": workload.resources.usage.model_copy(
                        update={"cpu_cores": cpu, "memory_bytes": memory}
                    )
                }
            )
            workload = workload.model_copy(update={"resources": resources})
        workloads.append(workload)
    return base.model_copy(
        update={"workloads": workloads, "captured_at": f"{base.captured_at}+{cpu}+{memory}"}
    )


def test_peak_survives_the_quiet_samples_after_it(snapshot: InventorySnapshot) -> None:
    clock = Clock()
    history = UsageHistory(clock=clock)
    workload = next(w for w in snapshot.workloads if w.name == PDF)

    history.record(_with_usage(snapshot, PDF, 0.003, 60 * 2**20))
    clock.now += 600
    history.record(_with_usage(snapshot, PDF, 2.5, 3 * 2**30))  # a parse burst
    clock.now += 600
    history.record(_with_usage(snapshot, PDF, 0.003, 60 * 2**20))

    peak = history.peak(workload.kind, PDF)
    assert peak.cpu_cores == 2.5
    assert peak.memory_bytes == 3 * 2**30
    assert peak.observed_seconds == 1200


def test_peaks_older_than_the_window_are_forgotten(snapshot: InventorySnapshot) -> None:
    clock = Clock()
    history = UsageHistory(window_seconds=24 * HOUR, clock=clock)
    workload = next(w for w in snapshot.workloads if w.name == PDF)

    history.record(_with_usage(snapshot, PDF, 2.5, 3 * 2**30))
    clock.now += 30 * HOUR
    history.record(_with_usage(snapshot, PDF, 0.003, 60 * 2**20))

    assert history.peak(workload.kind, PDF).cpu_cores == 0.003
    assert history.watched_seconds() == 24 * HOUR


def test_the_same_snapshot_counts_once(snapshot: InventorySnapshot) -> None:
    clock = Clock()
    history = UsageHistory(clock=clock)
    history.record(snapshot)
    first = history.watched_seconds()
    clock.now += 100
    history.record(snapshot)
    assert history.watched_seconds() == first + 100
    assert history._last_snapshot == snapshot.captured_at


def test_reclaimable_is_measured_against_the_peak(snapshot: InventorySnapshot) -> None:
    """A burst worker looks idle in almost every sample. Its peak says otherwise."""
    quiet = rollup.waste(snapshot, Settings(), limit=None)
    pdf_quiet = next(item for item in quiet if item.name == PDF)
    assert pdf_quiet.idle is True

    history = UsageHistory(clock=Clock())
    reserved = pdf_quiet.resources.requests.cpu_cores
    assert reserved is not None
    history.record(_with_usage(snapshot, PDF, reserved * 0.5, 2**30))

    busy = rollup.waste(snapshot, Settings(), limit=None, history=history)
    pdf_busy = next(item for item in busy if item.name == PDF)
    assert pdf_busy.peak_cpu_cores == reserved * 0.5
    assert pdf_busy.reclaimable_cpu_cores < pdf_quiet.reclaimable_cpu_cores
    assert pdf_busy.idle is False


def test_a_workload_busy_at_its_peak_is_not_listed(snapshot: InventorySnapshot) -> None:
    pdf = next(item for item in rollup.waste(snapshot, Settings(), limit=None) if item.name == PDF)
    reserved = pdf.resources.requests.cpu_cores
    assert reserved is not None
    history = UsageHistory(clock=Clock())
    history.record(_with_usage(snapshot, PDF, reserved * 0.9, 2**30))

    names = {item.name for item in rollup.waste(snapshot, Settings(), limit=None, history=history)}
    assert PDF not in names


def test_overview_headline_matches_the_list(snapshot: InventorySnapshot) -> None:
    """The headline used to count protected workloads the list leaves out."""
    settings = Settings()
    overview = rollup.overview(snapshot, settings)
    items = rollup.waste(snapshot, settings, limit=None)
    assert overview.totals.reclaimable_cpu_cores == sum(i.reclaimable_cpu_cores for i in items)
    assert overview.totals.reclaimable_memory_bytes == sum(
        i.reclaimable_memory_bytes for i in items
    )
