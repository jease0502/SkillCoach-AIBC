"""HTTP routes: /api/personas/* and /api/scenarios/* (see docs/API_CONTRACT.md)."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.builder import persona as personas
from app.builder import scenario as scenarios
from app.schemas import Persona, Scenario

router = APIRouter(prefix="/api", tags=["builder"])


class GeneratePersonaRequest(BaseModel):
    brief: str
    document_ids: list[str] | None = None
    locale: str | None = None


class GenerateFromDocsRequest(BaseModel):
    document_ids: list[str] | None = None
    count: int = Field(3, ge=1, le=6)
    locale: str | None = None


class GenerateScenarioRequest(BaseModel):
    persona_id: str
    trainee_goal: str
    document_ids: list[str] | None = None


# ---------- personas ----------

@router.post("/personas/generate", response_model=Persona)
async def generate_persona(req: GeneratePersonaRequest) -> Persona:
    return await personas.generate_from_brief(req.brief, req.document_ids, req.locale)


@router.post("/personas/generate-from-docs", response_model=list[Persona])
async def generate_personas_from_docs(req: GenerateFromDocsRequest) -> list[Persona]:
    return await personas.generate_from_docs(req.document_ids, req.count, req.locale)


@router.get("/personas", response_model=list[Persona])
async def list_personas() -> list[Persona]:
    return await personas.list_personas()


@router.post("/personas", response_model=Persona)
async def create_persona(body: Persona) -> Persona:
    return await personas.create_persona(body)


@router.get("/personas/{persona_id}", response_model=Persona)
async def get_persona(persona_id: str) -> Persona:
    return await personas.get_persona(persona_id)


@router.put("/personas/{persona_id}", response_model=Persona)
async def update_persona(persona_id: str, body: Persona) -> Persona:
    return await personas.update_persona(persona_id, body)


@router.post("/personas/{persona_id}/approve", response_model=Persona)
async def approve_persona(persona_id: str) -> Persona:
    return await personas.approve_persona(persona_id)


@router.delete("/personas/{persona_id}")
async def delete_persona(persona_id: str) -> dict:
    await personas.delete_persona(persona_id)
    return {"ok": True}


# ---------- scenarios ----------

@router.post("/scenarios/generate", response_model=Scenario)
async def generate_scenario(req: GenerateScenarioRequest) -> Scenario:
    return await scenarios.generate_scenario(req.persona_id, req.trainee_goal, req.document_ids)


@router.get("/scenarios", response_model=list[Scenario])
async def list_scenarios() -> list[Scenario]:
    return await scenarios.list_scenarios()


@router.post("/scenarios", response_model=Scenario)
async def create_scenario(body: Scenario) -> Scenario:
    return await scenarios.create_scenario(body)


@router.get("/scenarios/{scenario_id}", response_model=Scenario)
async def get_scenario(scenario_id: str) -> Scenario:
    return await scenarios.get_scenario(scenario_id)


@router.put("/scenarios/{scenario_id}", response_model=Scenario)
async def update_scenario(scenario_id: str, body: Scenario) -> Scenario:
    return await scenarios.update_scenario(scenario_id, body)


@router.delete("/scenarios/{scenario_id}")
async def delete_scenario(scenario_id: str) -> dict:
    await scenarios.delete_scenario(scenario_id)
    return {"ok": True}
