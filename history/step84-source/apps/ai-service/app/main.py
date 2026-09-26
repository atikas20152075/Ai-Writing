"""Strict AI provider boundary. Never return invented marks from an unavailable model."""
from typing import Literal
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

app = FastAPI(title="AI Writing - AI Task Boundary", version="0.1.0")

class Evidence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_offset: int = Field(ge=0)
    end_offset: int = Field(gt=0)
    exact_quote: str = Field(min_length=1)
    claim: str = Field(min_length=1)

    @model_validator(mode="after")
    def valid_span(self):
        if self.end_offset <= self.start_offset:
            raise ValueError("end_offset must be greater than start_offset")
        return self

class Criterion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1)
    score: str = Field(pattern=r"^(?:0|[1-9]\d*)(?:\.\d{1,4})?$")
    description: str = Field(min_length=1)

class Factor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1)
    max_score: str = Field(pattern=r"^(?:0|[1-9]\d*)(?:\.\d{1,4})?$")
    criteria: list[Criterion] = Field(min_length=1)

class ExaminerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assessment_id: str = Field(min_length=1)
    verified_text_id: str = Field(min_length=1)
    verified_text_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    input_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    language: Literal["BANGLA", "ENGLISH"]
    verified_text: str = Field(min_length=1, max_length=30000)
    rubric_version_id: str = Field(min_length=1)
    rubric_snapshot: list[Factor] = Field(min_length=1)

@app.get('/health')
def health():
    return {'status': 'UP', 'component': 'ai-contract-service'}

@app.get('/ready')
def ready():
    raise HTTPException(status_code=503, detail={
        'code': 'AI_PROVIDER_NOT_CONFIGURED',
        'message': 'Real examiner and verifier must pass benchmark and be configured before use.'
    })

@app.post('/v1/examine')
def examine(payload: ExaminerRequest):
    # Strict request validation happens before this controlled error. Do not log student text.
    raise HTTPException(status_code=503, detail={
        'code': 'AI_EXAMINER_NOT_IMPLEMENTED',
        'message': 'No real model configured. Returning fictional marks is forbidden.'
    })

@app.post('/v1/verify')
def verify(payload: ExaminerRequest):
    raise HTTPException(status_code=503, detail={
        'code': 'AI_VERIFIER_NOT_IMPLEMENTED',
        'message': 'Independent model-based verification is not yet implemented.'
    })
