"""What a workload is, in the terms of the person deciding whether to stop it.

Pulls together what other modules already know: the GenAI project and
database a release serves, what a user-defined app is and which package it
runs, when it was installed, and when it was last used.
"""

from __future__ import annotations

from app.models.genai import GenAiComponent, GenAiRole
from app.models.inventory import InventorySnapshot, WorkloadSummary
from app.models.resources import WorkloadAbout
from app.services.activity import Activity

_ROLE_LABEL = {
    GenAiRole.PROJECT: "AutoGraph project",
    GenAiRole.RETRIEVER: "GraphRAG retriever",
    GenAiRole.IMPORTER: "GraphRAG importer",
}


def genai_index(
    snapshot: InventorySnapshot,
) -> dict[str, tuple[GenAiComponent, str | None, str | None]]:
    """Workload name to its GenAI component, project name and database."""
    index: dict[str, tuple[GenAiComponent, str | None, str | None]] = {}
    for project in snapshot.genai_projects:
        members = (
            ([project.project] if project.project else []) + project.retrievers + project.others
        )
        for component in members:
            index[component.name] = (component, project.project_name, project.db_name)
    return index


def describe(
    workload: WorkloadSummary,
    genai: dict[str, tuple[GenAiComponent, str | None, str | None]],
    activity: dict[str, Activity] | None,
) -> WorkloadAbout:
    about = WorkloadAbout(
        created_at=workload.created_at,
        activity_known=activity is not None and workload.name in activity,
    )
    if activity and workload.name in activity:
        about.last_request_at = activity[workload.name].last_request_at
        about.last_change_at = activity[workload.name].last_change_at

    if workload.name in genai:
        component, project_name, db_name = genai[workload.name]
        about.category = "genai"
        about.label = _ROLE_LABEL.get(component.role, str(component.role))
        about.project_name = project_name
        about.database = db_name
        about.chat_model = component.chat_model
        about.embedding_model = component.embedding_model
    elif workload.app is not None:
        about.category = "user_app"
        about.label = "User app"
        about.app = workload.app
        about.database = workload.app.database
    return about
