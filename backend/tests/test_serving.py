"""Serving UI and API from one process, under the platform's path prefix.

On BYOC the platform mounts the app at /_service/uds/<scope>/<name>/ and strips
that prefix before forwarding, so the app sees "/". The browser does not: every
URL the page builds must be relative, or it escapes the mount and 404s at the
gateway. These tests pin the server half of that contract.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import app, mount_ui


def test_docs_page_fetches_the_spec_relatively() -> None:
    with TestClient(app) as client:
        page = client.get("/docs")
        spec = client.get("/openapi.json")
    assert page.status_code == 200
    # Relative: resolves to <prefix>/openapi.json in the browser, not /openapi.json.
    assert "url: 'openapi.json'" in page.text
    assert spec.status_code == 200


def test_ui_mount_serves_index_and_leaves_api_routes_alone(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<!doctype html><title>ui</title>")
    (tmp_path / "avocado.svg").write_text("<svg/>")

    target = FastAPI()

    @target.get("/api/v1/ping")
    def ping() -> dict[str, str]:
        return {"pong": "yes"}

    mount_ui(target, str(tmp_path))

    with TestClient(target) as client:
        assert "<title>ui</title>" in client.get("/").text
        assert client.get("/avocado.svg").status_code == 200
        assert client.get("/api/v1/ping").json() == {"pong": "yes"}
        assert client.get("/no-such-file.js").status_code == 404


def test_ui_mount_refuses_a_directory_without_a_build(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="no index.html"):
        mount_ui(FastAPI(), str(tmp_path))
