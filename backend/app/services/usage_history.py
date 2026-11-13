"""The highest usage seen per workload, kept between metrics-server samples.

metrics-server reports one sample: what each pod uses this second. A queue
worker that parses files for half an hour a week looks idle in nearly every
sample, so "reserved minus used now" makes it look reclaimable when its
reservation is sized for the work it does when a job arrives. This keeps the
peak per workload in hourly buckets over a rolling window, so reclaimable is
measured against the peak, and records how long it has been watching so the
UI can say when the history is too short to trust.

It lives in memory and starts over when the process restarts. The sampler in
`app.main` keeps it filling while nobody has the app open.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field

from app.models.inventory import InventorySnapshot

HOUR = 3600


@dataclass(frozen=True)
class Peak:
    cpu_cores: float | None
    memory_bytes: int | None
    observed_seconds: float
    """How long this workload has been sampled. Zero when it never was."""


@dataclass
class _Series:
    first_seen: float
    buckets: dict[int, tuple[float | None, int | None]] = field(default_factory=dict)


def _max_opt[T: (float, int)](a: T | None, b: T | None) -> T | None:
    if a is None:
        return b
    if b is None:
        return a
    return max(a, b)


class UsageHistory:
    def __init__(
        self,
        window_seconds: float = 7 * 24 * HOUR,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._window = window_seconds
        self._clock = clock
        self._lock = threading.Lock()
        self._series: dict[str, _Series] = {}
        self._started: float | None = None
        self._last_snapshot: str | None = None

    @staticmethod
    def key(kind: str, name: str) -> str:
        return f"{kind}/{name}"

    def record(self, snapshot: InventorySnapshot) -> None:
        """Fold one snapshot in. The same snapshot twice counts once."""
        now = self._clock()
        bucket = int(now // HOUR)
        with self._lock:
            if snapshot.captured_at and snapshot.captured_at == self._last_snapshot:
                return
            self._last_snapshot = snapshot.captured_at
            if self._started is None:
                self._started = now

            for workload in snapshot.workloads:
                usage = workload.resources.usage
                # Nothing running, or no metrics for it: there is nothing to
                # learn, and a zero here would read as "idle".
                if workload.pod_count == 0 or (
                    usage.cpu_cores is None and usage.memory_bytes is None
                ):
                    continue
                series = self._series.setdefault(
                    self.key(workload.kind, workload.name), _Series(first_seen=now)
                )
                cpu, memory = series.buckets.get(bucket, (None, None))
                series.buckets[bucket] = (
                    _max_opt(cpu, usage.cpu_cores),
                    _max_opt(memory, usage.memory_bytes),
                )

            self._prune(now)

    def _prune(self, now: float) -> None:
        oldest = int((now - self._window) // HOUR)
        for series in self._series.values():
            for old in [b for b in series.buckets if b < oldest]:
                del series.buckets[old]
            series.first_seen = max(series.first_seen, now - self._window)

    def peak(self, kind: str, name: str) -> Peak:
        with self._lock:
            series = self._series.get(self.key(kind, name))
            if series is None or not series.buckets:
                return Peak(None, None, 0.0)
            cpu: float | None = None
            memory: int | None = None
            for bucket_cpu, bucket_memory in series.buckets.values():
                cpu = _max_opt(cpu, bucket_cpu)
                memory = _max_opt(memory, bucket_memory)
            return Peak(cpu, memory, max(0.0, self._clock() - series.first_seen))

    def watched_seconds(self) -> float:
        """How long the history has been filling, capped at the window."""
        with self._lock:
            if self._started is None:
                return 0.0
            return min(self._window, max(0.0, self._clock() - self._started))

    def reset(self) -> None:
        with self._lock:
            self._series.clear()
            self._started = None
            self._last_snapshot = None


history = UsageHistory()
