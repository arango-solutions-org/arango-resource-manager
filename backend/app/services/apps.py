"""What a user-defined (BYOC) app is, read from its Deployment.

The Container Manager installs every app from one chart, so the release name
says nothing. The rest is on the pod spec: the container is named after the
app, `ARCHIVE_FILE` points at the uploaded package in the file manager
(`.../byoc/<package>/<version>/download`), and `ARANGODB_NAME` names the
database it was deployed against. Only those two variables are read, and only
when they are literal values: a `valueFrom` is never followed.
"""

from __future__ import annotations

import re
from typing import Any

from app.models.inventory import AppInfo
from app.services.grouping import NAME_LABEL, labels_of

USER_APP_CHART = "arango-user-defined"

_ARCHIVE = re.compile(r"/byoc/(?P<package>[^/]+)/(?P<version>[^/]+)/download$")
_BASE_IMAGE = re.compile(r"/arango-user-defined/(?P<base>[a-z]+)(?P<ver>\d+)base:")
_RUNTIMES = {"py": "Python", "node": "Node"}


def _literal_env(container: dict[str, Any], name: str) -> str | None:
    for entry in container.get("env") or []:
        if entry.get("name") == name and isinstance(entry.get("value"), str):
            return str(entry["value"])
    return None


def _runtime(image: str) -> str:
    match = _BASE_IMAGE.search(image)
    if not match:
        return "Container image"
    language = _RUNTIMES.get(match["base"], match["base"])
    ver = match["ver"]
    # "py12" is Python 3.12; "node22" is Node 22.
    version = f"3.{ver}" if match["base"] == "py" and len(ver) == 2 else ver
    return f"{language} {version} package"


def user_app_info(workload: dict[str, Any]) -> AppInfo | None:
    if labels_of(workload).get(NAME_LABEL) != USER_APP_CHART:
        return None
    containers = (
        workload.get("spec", {}).get("template", {}).get("spec", {}).get("containers") or []
    )
    if not containers:
        return None
    main = containers[0]
    image = str(main.get("image") or "")
    archive = _literal_env(main, "ARCHIVE_FILE")
    match = _ARCHIVE.search(archive or "")
    return AppInfo(
        app_name=str(main.get("name") or ""),
        package=match["package"] if match else None,
        package_version=match["version"] if match else None,
        runtime=_runtime(image),
        # A package runs on a shared base image, which says nothing about the
        # app; a custom image is the app, so it is worth showing.
        image=None if _BASE_IMAGE.search(image) else image or None,
        database=_literal_env(main, "ARANGODB_NAME"),
    )
