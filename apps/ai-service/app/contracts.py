"""Strict cross-language academic contracts. Offsets are Unicode code points (end exclusive)."""
from __future__ import annotations

from decimal import Decimal
from hashlib import sha256
from typing import Any, Literal

import regex
from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Criterion(StrictModel):
    id: str = Field(min_length=1)
    score: str = Field(pattern=r"^(?:0|[1-9]\d*)(?:\.\d{1,4})?$")
    description: str = Field(min_length=1)


class Factor(StrictModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    max_score: str = Field(pattern=r"^(?:0|[1-9]\d*)(?:\.\d{1,4})?$")
    criteria: list[Criterion] = Field(min_length=1)


class TopicSnapshot(StrictModel):
    id: str = Field(min_length=1)
    program_id: str = Field(min_length=1)
    writing_type: str = Field(min_length=1)
    language: Literal["BANGLA", "ENGLISH"]
    title: str = Field(min_length=1)
    instructions: str = Field(min_length=1)
    clues: list[str]


class ExaminerRequest(StrictModel):
    assessment_id: str = Field(min_length=1)
    verified_text_id: str = Field(min_length=1)
    verified_text_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    input_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    topic_snapshot_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    understanding_snapshot_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    language: Literal["BANGLA", "ENGLISH"]
    verified_text: str = Field(min_length=1, max_length=30000)
    rubric_version_id: str = Field(min_length=1)
    score_step: str = Field(pattern=r"^(?:0|[1-9]\d*)(?:\.\d{1,4})?$")
    total_marks: str = Field(pattern=r"^(?:0|[1-9]\d*)(?:\.\d{1,4})?$")
    rubric_snapshot: list[Factor] = Field(min_length=1)
    topic_snapshot: TopicSnapshot

    @model_validator(mode="after")
    def verify_locked_inputs(self):
        if sha256(self.verified_text.encode("utf8")).hexdigest() != self.verified_text_hash:
            raise ValueError("verified text does not match its locked SHA256")
        if self.topic_snapshot.language != self.language:
            raise ValueError("topic language differs from verified writing language")
        if len({factor.id for factor in self.rubric_snapshot}) != len(self.rubric_snapshot):
            raise ValueError("rubric contains duplicate factor identifiers")
        step = Decimal(self.score_step)
        if step <= 0:
            raise ValueError("rubric step must be positive")
        total = Decimal(0)
        for factor in self.rubric_snapshot:
            maximum = Decimal(factor.max_score)
            if maximum <= 0 or maximum % step:
                raise ValueError("invalid factor max/step")
            scores = set()
            ids = set()
            for criterion in factor.criteria:
                if criterion.id in ids or Decimal(criterion.score) in scores:
                    raise ValueError("criterion identifier or score duplicated")
                ids.add(criterion.id)
                scores.add(Decimal(criterion.score))
                value = Decimal(criterion.score)
                if value > maximum or value % step:
                    raise ValueError("criterion score incompatible with max/step")
            if maximum not in scores:
                raise ValueError("published maximum criterion is missing")
            total += maximum
        if total != Decimal(self.total_marks):
            raise ValueError("rubric total does not equal factor maxima")
        return self


class Evidence(StrictModel):
    start_offset: int = Field(ge=0)
    end_offset: int = Field(gt=0)
    exact_quote: str = Field(min_length=1)
    claim: str = Field(min_length=1)


class FactorResult(StrictModel):
    factor_id: str = Field(min_length=1)
    criterion_id: str = Field(min_length=1)
    proposed_score: str = Field(pattern=r"^(?:0|[1-9]\d*)(?:\.\d{1,4})?$")
    rationale: str = Field(min_length=1)
    evidence: list[Evidence] = Field(min_length=1)


class ModelFactorResults(StrictModel):
    factor_results: list[FactorResult] = Field(min_length=1)


class ExaminerProposal(StrictModel):
    examiner_run_id: str = Field(min_length=1)
    assessment_id: str = Field(min_length=1)
    verified_text_id: str = Field(min_length=1)
    rubric_version_id: str = Field(min_length=1)
    input_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    factor_results: list[FactorResult] = Field(min_length=1)
    total_score: str
    total_marks: str
    model: str
    prompt_version: str
    provider_request_id: str


class VerificationRequest(ExaminerRequest):
    examiner_proposal: ExaminerProposal


class VerificationChallenge(StrictModel):
    status: Literal["PASS", "MAJOR_REVIEW", "FAILED"]
    reviewed_factor_ids: list[str]
    unsupported_factor_ids: list[str]
    findings: list[str]
    score_changing_correction: bool


class VerificationResult(StrictModel):
    verification_attempt_id: str
    accepted_examiner_run_id: str
    input_hash: str
    status: Literal["PASS", "MAJOR_REVIEW", "FAILED"]
    reviewed_factor_ids: list[str]
    score_changing_correction: bool
    findings: list[str]
    independent_factor_results: list[FactorResult]
    model: str
    prompt_version: str
    independent_provider_request_id: str
    challenge_provider_request_id: str


# Static strict provider schema: model output structure is NOT trusted as valid academic data.
EVIDENCE_JSON: dict[str, Any] = {
    "type": "object", "additionalProperties": False,
    "properties": {"start_offset": {"type": "integer"}, "end_offset": {"type": "integer"},
                   "exact_quote": {"type": "string"}, "claim": {"type": "string"}},
    "required": ["start_offset", "end_offset", "exact_quote", "claim"],
}
FACTORS_JSON: dict[str, Any] = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "factor_id": {"type": "string"}, "criterion_id": {"type": "string"},
        "proposed_score": {"type": "string"}, "rationale": {"type": "string"},
        "evidence": {"type": "array", "items": EVIDENCE_JSON},
    },
    "required": ["factor_id", "criterion_id", "proposed_score", "rationale", "evidence"],
}
SCORING_JSON: dict[str, Any] = {
    "type": "object", "additionalProperties": False,
    "properties": {"factor_results": {"type": "array", "items": FACTORS_JSON}},
    "required": ["factor_results"],
}
CHALLENGE_JSON: dict[str, Any] = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "status": {"type": "string", "enum": ["PASS", "MAJOR_REVIEW", "FAILED"]},
        "reviewed_factor_ids": {"type": "array", "items": {"type": "string"}},
        "unsupported_factor_ids": {"type": "array", "items": {"type": "string"}},
        "findings": {"type": "array", "items": {"type": "string"}},
        "score_changing_correction": {"type": "boolean"},
    },
    "required": ["status", "reviewed_factor_ids", "unsupported_factor_ids", "findings", "score_changing_correction"],
}


def validate_results(request: ExaminerRequest, proposed: ModelFactorResults) -> str:
    """Reject invalid marks, criterion IDs, invented factors and broken Unicode/grapheme evidence."""
    expected = {factor.id: factor for factor in request.rubric_snapshot}
    actual = proposed.factor_results
    if len(actual) != len(expected) or {item.factor_id for item in actual} != set(expected):
        raise ValueError("model did not return exactly one result per published factor")
    # `regex` implements Unicode extended grapheme boundaries; offsets are Python code points.
    boundaries = {0}
    pos = 0
    for cluster in regex.findall(r"\X", request.verified_text):
        pos += len(cluster)
        boundaries.add(pos)
    total = Decimal(0)
    for item in actual:
        factor = expected[item.factor_id]
        criteria = {c.id: c for c in factor.criteria}
        criterion = criteria.get(item.criterion_id)
        if not criterion or Decimal(item.proposed_score) != Decimal(criterion.score):
            raise ValueError("model proposed a score outside the published criterion")
        for span in item.evidence:
            if span.start_offset not in boundaries or span.end_offset not in boundaries:
                raise ValueError("evidence splits a grapheme or uses invalid offsets")
            if request.verified_text[span.start_offset:span.end_offset] != span.exact_quote:
                raise ValueError("evidence quote does not match locked original")
        total += Decimal(item.proposed_score)
    if total > Decimal(request.total_marks):
        raise ValueError("model total exceeds the published rubric")
    return format(total.normalize(), "f")
