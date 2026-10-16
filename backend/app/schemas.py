"""Shared API models. Owned by the lead; see docs/API_CONTRACT.md."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


def now() -> datetime:
    return datetime.now(timezone.utc)


# ---------- Knowledge base ----------

class Document(BaseModel):
    id: str
    title: str
    filename: str | None = None
    mime: str | None = None
    chunk_count: int = 0
    created_at: datetime = Field(default_factory=now)


class Chunk(BaseModel):
    id: str
    document_id: str
    index: int
    text: str


class SearchHit(BaseModel):
    chunk: Chunk
    document_title: str
    score: float


class Citation(BaseModel):
    chunk_id: str
    document_title: str
    quote: str
    supports: str | None = Field(None, description="Which attribute this backs, e.g. 'objection:obj-2' or 'hidden_need:0'")


# ---------- Persona ----------

class Objection(BaseModel):
    id: str
    text: str
    trigger: str = Field(description="When the customer raises it, e.g. 'when price is mentioned'")


class Persona(BaseModel):
    id: str = ""
    name: str
    title: str = Field(description="Job title / life role, e.g. 'Owner of a 12-person bakery'")
    age: int | None = None
    industry: str | None = None
    locale: str = "en-US"
    summary: str
    personality: list[str] = Field(default_factory=list, description="3-5 trait adjectives")
    communication_style: str = ""
    goals: list[str] = Field(default_factory=list)
    hidden_needs: list[str] = Field(default_factory=list, description="Not stated unless trainee earns trust")
    objections: list[Objection] = Field(default_factory=list)
    knowledge_level: Literal["novice", "intermediate", "expert"] = "intermediate"
    difficulty: int = Field(3, ge=1, le=5)
    initial_trust: int = Field(40, ge=0, le=100)
    initial_patience: int = Field(70, ge=0, le=100)
    opening_line: str = Field("", description="Served verbatim as the customer's first turn; no model call")
    voice: str | None = None
    avatar: str | None = Field(None, description="Preset id or image URL")
    source: Literal["brief", "documents", "manual", "seed"] = "manual"
    source_document_ids: list[str] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list, description="KB passages the generated attributes are derived from")
    status: Literal["draft", "approved"] = "draft"
    created_at: datetime = Field(default_factory=now)


# ---------- Scenario ----------

class ComplianceRule(BaseModel):
    id: str
    rule: str
    severity: Literal["low", "medium", "high"] = "medium"
    citations: list[Citation] = Field(default_factory=list)


class RubricItem(BaseModel):
    id: str
    name: str
    description: str
    weight: float = 1.0
    citations: list[Citation] = Field(default_factory=list)


class BranchEvent(BaseModel):
    id: str
    trigger: str = Field(description="e.g. 'turn >= 4' or 'trust < 30'")
    event: str = Field(description="What the customer does, e.g. 'mentions a cheaper competitor'")


class Scenario(BaseModel):
    id: str = ""
    title: str
    description: str
    persona_id: str
    trainee_goal: str
    context: str = ""
    success_criteria: list[str] = Field(default_factory=list)
    compliance_rules: list[ComplianceRule] = Field(default_factory=list)
    rubric: list[RubricItem] = Field(default_factory=list)
    branch_events: list[BranchEvent] = Field(default_factory=list)
    document_ids: list[str] = Field(default_factory=list)
    difficulty: int = Field(3, ge=1, le=5)
    max_turns: int = 12
    opening_line: str | None = Field(None, description="Overrides persona.opening_line when set")
    created_at: datetime = Field(default_factory=now)


# ---------- Session ----------

class ComplianceFlag(BaseModel):
    rule_id: str
    severity: Literal["low", "medium", "high"]
    message: str
    quote: str = Field(description="Exact words from the message that triggered the flag")


class CoachHint(BaseModel):
    hint: str
    technique: str | None = None
    citations: list[Citation] = Field(default_factory=list)


class Turn(BaseModel):
    index: int
    role: Literal["trainee", "customer"]
    text: str
    at: datetime = Field(default_factory=now)
    citations: list[Citation] = Field(default_factory=list)
    compliance: list[ComplianceFlag] = Field(default_factory=list)
    coach: CoachHint | None = None
    trust: int | None = None
    patience: int | None = None


class Session(BaseModel):
    id: str
    scenario_id: str
    persona_id: str
    status: Literal["active", "ended"] = "active"
    turns: list[Turn] = Field(default_factory=list)
    trust: int = 40
    patience: int = 70
    started_at: datetime = Field(default_factory=now)
    ended_at: datetime | None = None


# ---------- Report ----------

class Evidence(BaseModel):
    turn_index: int
    quote: str
    verified: bool = True


class DimensionScore(BaseModel):
    rubric_id: str
    name: str
    score: int = Field(ge=0, le=100)
    feedback: str
    evidence: list[Evidence] = Field(default_factory=list)


class Report(BaseModel):
    session_id: str
    overall_score: int = Field(ge=0, le=100)
    compliance_passed: bool = Field(True, description="False if any high-severity violation; gates certification")
    summary: str
    dimensions: list[DimensionScore] = Field(default_factory=list)
    compliance_violations: list[ComplianceFlag] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    knowledge_citations: list[Citation] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=now)


# ---------- Dashboard ----------

class DimensionAverage(BaseModel):
    name: str
    average: float


class ViolationCount(BaseModel):
    rule_id: str
    message: str
    count: int


class SessionSummary(BaseModel):
    id: str
    scenario_title: str
    persona_name: str
    overall_score: int | None
    compliance_passed: bool | None = None
    started_at: datetime


class Dashboard(BaseModel):
    sessions_count: int
    average_score: float | None
    ready_count: int = Field(0, description="Ended sessions with compliance_passed and overall_score >= 80")
    sample_sessions_count: int = Field(0, description="How many of the counted sessions are labeled sample team data")
    by_dimension: list[DimensionAverage] = Field(default_factory=list)
    top_violations: list[ViolationCount] = Field(default_factory=list)
    recent_sessions: list[SessionSummary] = Field(default_factory=list)
