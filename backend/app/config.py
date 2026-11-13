"""Application settings, loaded from the environment and an optional .env file."""

from functools import lru_cache
from typing import Annotated

from pydantic import BeforeValidator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _blank_to_none(value: object) -> object:
    """Treat an unset env var (VAR=) as absent rather than as a parse error."""
    if isinstance(value, str) and not value.strip():
        return None
    return value


OptionalFloat = Annotated[float | None, BeforeValidator(_blank_to_none)]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_prefix="ARM_", extra="ignore", case_sensitive=False
    )

    # Cluster connection. Empty values fall back to kubeconfig / in-cluster defaults.
    kube_context: str = ""
    kubeconfig: str = ""
    namespace: str = ""

    # Safety gates. read_only is the master kill switch for every mutating route.
    read_only: bool = True
    allow_guarded_actions: bool = False
    allow_database_scaling: bool = False

    protected_owner_kinds: str = "ArangoDeployment,ArangoMLExtension,ArangoMLBatchJob"
    guarded_names: str = (
        "arango-operator-operator,arango-control-plane,arangodb-platform-ui,"
        "arangodb-platform-ui-server,arangodb-core-ui,platform-monitoring-grafana,"
        "platform-monitoring-prometheus-server"
    )

    # Capacity budget: auto (derive from requests), manual (explicit), quota (ResourceQuota).
    budget_mode: str = "auto"
    budget_cpu_cores: OptionalFloat = None
    budget_memory_gi: OptionalFloat = None
    budget_headroom_factor: float = 1.25

    inventory_ttl_seconds: float = 5.0
    metrics_ttl_seconds: float = 15.0
    # How often to sample usage while nobody has the app open, so peaks are
    # seen. 0 turns the sampler off; requests still sample.
    usage_sample_seconds: float = 60.0

    prometheus_url: str = ""
    cost_per_core_hour: float = 0.0
    cost_per_gi_hour: float = 0.0

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Activity log. Every executed action is recorded, with who did it and why,
    # before the change is made. With an ArangoDB endpoint the log is a PROV
    # graph in `arango_database`; without one it falls back to a local file.
    # On the platform the endpoint is ARANGO_DEPLOYMENT_ENDPOINT and each write
    # authenticates as the signed-in user with their forwarded token.
    arango_url: str = ""
    arango_database: str = "resource_manager"
    arango_username: str = ""
    arango_password: str = ""
    # auto: trust ARANGO_DEPLOYMENT_CA for the injected endpoint, else the system store.
    arango_verify_tls: str = "auto"
    # Who local actions are attributed to when there is no platform login.
    dev_user: str = ""

    # Directory holding the built frontend. Set in the container image so one
    # process serves UI and API on one origin; empty in dev, where Vite serves it.
    static_dir: str = ""

    @property
    def protected_owner_kind_list(self) -> list[str]:
        return _csv(self.protected_owner_kinds)

    @property
    def guarded_name_list(self) -> list[str]:
        return _csv(self.guarded_names)

    @property
    def cors_origin_list(self) -> list[str]:
        return _csv(self.cors_origins)


@lru_cache
def get_settings() -> Settings:
    return Settings()
