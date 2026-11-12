"""Who is making a request.

On the Arango Platform the gateway authenticates the browser's platform login
and forwards it as `Authorization: Bearer <jwt>`. The integration sidecar the
platform injects into the pod validates that token and names its user, so the
name is never taken from anything the caller could write themselves.

Off the platform (local development) there is no login. Actions are then
attributed to ARM_DEV_USER, or to the OS user, prefixed "local:" so a local
record can never pass for a platform one.
"""

from __future__ import annotations

import getpass
import hashlib
import os
import threading
from dataclasses import dataclass
from typing import Literal

import requests
import structlog
from fastapi import Request

from app.config import Settings

log = structlog.get_logger(__name__)

SIDECAR_ADDRESS_ENVS = ("INTEGRATION_HTTP_ADDRESS_FULL", "INTEGRATION_HTTP_ADDRESS")
_SIDECAR_TIMEOUT_S = 5.0
_MAX_CACHED = 1000

_cache_lock = threading.Lock()
_identities: dict[str, str] = {}


@dataclass(frozen=True)
class Actor:
    user: str
    source: Literal["platform", "local"]
    token: str | None = None
    """The forwarded platform token, used to write the log as this user."""


def sidecar_address() -> str | None:
    for name in SIDECAR_ADDRESS_ENVS:
        value = os.getenv(name, "").strip().rstrip("/")
        if value:
            return value if "://" in value else f"http://{value}"
    return None


def on_platform() -> bool:
    return sidecar_address() is not None


def forwarded_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth[:7].lower() != "bearer ":
        return None
    return auth[7:].strip() or None


def sidecar_identity(token: str) -> str | None:
    """The user the sidecar says `token` belongs to, or None if it does not know it."""
    address = sidecar_address()
    if address is None:
        return None
    key = hashlib.sha256(token.encode()).hexdigest()
    with _cache_lock:
        if key in _identities:
            return _identities[key]
    try:
        response = requests.get(
            f"{address}/_integration/authn/v1/identity",
            headers={"Authorization": f"bearer {token}"},
            timeout=_SIDECAR_TIMEOUT_S,
        )
    except requests.RequestException as exc:
        log.warning("identity.sidecar_unreachable", error=exc.__class__.__name__)
        return None
    if response.status_code != 200:
        log.warning("identity.sidecar_refused", status=response.status_code)
        return None
    try:
        user = response.json().get("user")
    except ValueError:
        return None
    if not isinstance(user, str) or not user:
        return None
    with _cache_lock:
        if len(_identities) >= _MAX_CACHED:
            _identities.clear()
        _identities[key] = user
    return user


def resolve_actor(request: Request, settings: Settings) -> Actor | None:
    """The caller, or None on the platform when the login cannot be verified."""
    if on_platform():
        token = forwarded_token(request)
        if token is None:
            return None
        user = sidecar_identity(token)
        return Actor(user=user, source="platform", token=token) if user else None
    user = settings.dev_user.strip() or getpass.getuser()
    return Actor(user=f"local:{user}", source="local")
