"""What a workload is: user apps from their pod spec, last use from Prometheus."""

from __future__ import annotations

from typing import Any

import pytest

from app.models.inventory import WorkloadSummary
from app.services import activity
from app.services.about import describe
from app.services.apps import user_app_info


def _user_app(
    env: list[dict[str, Any]], image: str, chart: str = "arango-user-defined"
) -> dict[str, Any]:
    return {
        "metadata": {
            "name": "arango-user-defined-chronograph-621920c",
            "labels": {"app.kubernetes.io/name": chart},
        },
        "spec": {
            "template": {
                "spec": {"containers": [{"name": "chronograph", "image": image, "env": env}]}
            }
        },
    }


ARCHIVE = "http://file-manager.ns.svc/global/byoc/chronograph/0.3.0-1/download"
BASE = "registry.example/arango-user-defined/py12base:v0.0.8"


def test_a_packaged_app_is_named_with_its_package_and_database() -> None:
    info = user_app_info(
        _user_app(
            [
                {"name": "ARCHIVE_FILE", "value": ARCHIVE},
                {"name": "ARANGODB_NAME", "value": "temporal"},
            ],
            BASE,
        )
    )
    assert info is not None
    assert info.app_name == "chronograph"
    assert (info.package, info.package_version) == ("chronograph", "0.3.0-1")
    assert info.runtime == "Python 3.12 package"
    assert info.image is None  # the shared base image says nothing about the app
    assert info.database == "temporal"


def test_a_custom_image_app_shows_its_image() -> None:
    info = user_app_info(_user_app([], "ghcr.io/example/arango-resource-manager:latest"))
    assert info is not None
    assert info.runtime == "Container image"
    assert info.image == "ghcr.io/example/arango-resource-manager:latest"
    assert info.package is None


def test_env_references_are_never_followed() -> None:
    info = user_app_info(
        _user_app([{"name": "ARANGODB_NAME", "valueFrom": {"secretKeyRef": {"name": "x"}}}], BASE)
    )
    assert info is not None
    assert info.database is None


def test_other_charts_are_not_user_apps() -> None:
    assert user_app_info(_user_app([], BASE, chart="arangodb-autograph")) is None


def test_activity_reads_last_request_and_last_change(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_query(_base: str, expression: str) -> dict[str, float]:
        if "target_info" in expression:
            return {"arangodb-graphrag-retriever-quiet": 1.0}
        if "http_request_method" in expression:
            return {"arangodb-autograph-abc": 1_762_000_000.0}
        return {
            "arangodb-autograph-abc": 1_763_000_000.0,
            "arangodb-graphrag-retriever-x": 1_762_500_000.0,
        }

    monkeypatch.setattr(activity, "_query", fake_query)
    seen = activity.fetch("http://prometheus")
    assert seen["arangodb-autograph-abc"].last_change_at is not None
    assert (
        seen["arangodb-autograph-abc"].last_request_at
        > seen["arangodb-autograph-abc"].last_change_at
    )  # type: ignore[operator]
    assert seen["arangodb-graphrag-retriever-x"].last_change_at is None
    # Scraped but never asked anything: known, and unused.
    assert seen["arangodb-graphrag-retriever-quiet"].last_request_at is None


def test_unknown_activity_is_not_reported_as_never_used() -> None:
    workload = WorkloadSummary(kind="Deployment", name="arango-user-defined-x")
    about = describe(workload, {}, activity=None)
    assert about.activity_known is False
    assert about.last_request_at is None


def test_prometheus_is_only_assumed_on_the_platform(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import Settings

    monkeypatch.setattr(activity, "on_platform", lambda: False)
    assert activity.prometheus_url(Settings()) is None
    assert activity.prometheus_url(Settings(prometheus_url="http://p/")) == "http://p"
    monkeypatch.setattr(activity, "on_platform", lambda: True)
    assert activity.prometheus_url(Settings()) == activity.PLATFORM_PROMETHEUS
