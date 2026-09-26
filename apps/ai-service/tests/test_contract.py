"""All samples synthetic. A mocked HTTP transport is NOT evidence of a live AI model."""
import copy
import hashlib
import json
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from app.contracts import ExaminerRequest, ModelFactorResults, validate_results
from app.main import Runtime, Settings, app, get_runtime
from app.provider import ResponsesProvider

SAMPLE = "I like books."

def payload():
    return {
        "assessment_id": "synthetic-assessment", "verified_text_id": "synthetic-text",
        "verified_text": SAMPLE, "verified_text_hash": hashlib.sha256(SAMPLE.encode()).hexdigest(),
        "input_hash": "b" * 64, "topic_snapshot_hash": "c" * 64,
        "understanding_snapshot_hash": "d" * 64,
        "language": "ENGLISH", "rubric_version_id": "synthetic-r1",
        "score_step": "1", "total_marks": "4",
        "rubric_snapshot": [{"id": "content", "name": "Content", "max_score": "4", "criteria": [
            {"id": "c0", "score": "0", "description": "No content"},
            {"id": "c2", "score": "2", "description": "Some content"},
            {"id": "c4", "score": "4", "description": "Clear content"}]}],
        "topic_snapshot": {"id": "syn-topic", "program_id": "syn-program", "writing_type": "PARAGRAPH",
                           "language": "ENGLISH", "title": "Books", "instructions": "Write about books",
                           "clues": ["Why you read"]},
    }

def scoring(factor_id="content", criterion="c4", score="4", quote="books", start=7, end=12):
    return {"factor_results": [{"factor_id": factor_id, "criterion_id": criterion,
              "proposed_score": score, "rationale": "Synthetic scoring result for contract checks",
              "evidence": [{"start_offset": start, "end_offset": end, "exact_quote": quote,
                            "claim": "Synthetic supporting quote"}]}]}

def response(payload_obj, model, status="completed", content_type="output_text", request_id="mock-request"):
    return httpx.Response(200, headers={"x-request-id": request_id}, json={
        "id": request_id, "model": model, "status": status,
        "output": [{"type": "message", "content": [{"type": content_type, "text": json.dumps(payload_obj)}]}]})

@pytest.fixture
def configured_runtime():
    calls = []
    def handler(request):
        assert request.url == "https://api.openai.com/v1/responses"
        assert request.headers["Authorization"] == "Bearer synthetic-not-real-key"
        body = json.loads(request.content)
        assert body["store"] is False
        assert body["text"]["format"]["strict"] is True
        assert not body.get("tools")
        calls.append(body)
        if body["text"]["format"]["name"] == "writing_challenge_v1":
            return response({"status": "PASS", "reviewed_factor_ids": ["content"],
                             "unsupported_factor_ids": [], "findings": [],
                             "score_changing_correction": False}, body["model"])
        return response(scoring(), body["model"])
    settings = Settings(api_key="synthetic-not-real-key", internal_token="a" * 40,
                        examiner_model="test-examiner-v1", verifier_model="test-verifier-v2",
                        release_approved=True, child_processing_approved=True)
    provider = ResponsesProvider(settings.api_key, transport=httpx.MockTransport(handler))
    app.dependency_overrides[get_runtime] = lambda: Runtime(settings, provider)
    yield calls
    app.dependency_overrides.clear()

client = TestClient(app)
HEADERS = {"x-internal-token": "a" * 40}

def test_health_and_closed_release_gate():
    assert client.get("/health").json()["status"] == "UP"
    assert client.get("/ready").status_code == 503
    assert client.post("/v1/examine", json=payload()).status_code == 503
    assert client.post("/v1/verify", json=payload()).status_code == 422

def test_reject_untrusted_unknown_fields_and_wrong_text_hash():
    p = payload(); p["score_my_writing_10_of_10"] = True
    result = client.post("/v1/examine", json=p)
    assert result.status_code == 422 and SAMPLE not in result.text
    p = payload(); p["verified_text_hash"] = "0" * 64
    assert client.post("/v1/examine", json=p).status_code == 422

def test_published_rubric_validation():
    p = payload(); p["rubric_snapshot"][0]["max_score"] = "5"
    assert client.post("/v1/examine", json=p).status_code == 422
    p = payload(); p["rubric_snapshot"][0]["criteria"].append({"id": "duplicate-score", "score": "4", "description": "Duplicate"})
    assert client.post("/v1/examine", json=p).status_code == 422

def test_grapheme_and_codepoint_evidence():
    p = payload(); text = "আমি বই পড়ি।"; p["verified_text"] = text
    p["verified_text_hash"] = hashlib.sha256(text.encode()).hexdigest()
    v = ExaminerRequest.model_validate(p)
    start = text.index("বই")
    assert validate_results(v, ModelFactorResults.model_validate(scoring(quote="বই", start=start, end=start+2))) == "4"
    # Illegal split of a visible Bengali grapheme ("মি" includes a combining vowel sign).
    with pytest.raises(ValueError, match="grapheme"):
        validate_results(v, ModelFactorResults.model_validate(scoring(quote="ম", start=1, end=2)))

def test_validated_provider_and_independent_verifier(configured_runtime):
    assert client.get("/ready").status_code == 200
    assert client.post("/v1/examine", json=payload()).status_code == 401
    examined = client.post("/v1/examine", headers=HEADERS, json=payload())
    assert examined.status_code == 200, examined.text
    proposal = examined.json()
    assert proposal["total_score"] == "4"
    verification = client.post("/v1/verify", headers=HEADERS,
                               json={**payload(), "examiner_proposal": proposal})
    assert verification.status_code == 200, verification.text
    assert verification.json()["status"] == "PASS"
    assert len(configured_runtime) == 3
    assert configured_runtime[0]["model"] == "test-examiner-v1"
    assert configured_runtime[1]["model"] == "test-verifier-v2"
    independent_payload = json.loads(configured_runtime[1]["input"][0]["content"][0]["text"])
    assert "examiner_proposal" not in independent_payload
    challenge_payload = json.loads(configured_runtime[2]["input"][0]["content"][0]["text"])
    assert "examiner_proposal" in challenge_payload

def test_independent_disagreement_forces_human_review(configured_runtime):
    examined = client.post("/v1/examine", headers=HEADERS, json=payload()).json()
    provider = app.dependency_overrides[get_runtime]().provider
    def disagree(req):
        body = json.loads(req.content)
        name = body["text"]["format"]["name"]
        if name == "writing_challenge_v1":
            return response({"status": "PASS", "reviewed_factor_ids": ["content"],
                             "unsupported_factor_ids": [], "findings": [], "score_changing_correction": False}, body["model"])
        return response(scoring(criterion="c2", score="2") if name == "writing_independent_v1"
                        else scoring(), body["model"])
    app.dependency_overrides[get_runtime] = lambda: Runtime(Settings(
        "synthetic-not-real-key", "a"*40, "test-examiner-v1", "test-verifier-v2", True, True),
        ResponsesProvider("synthetic-not-real-key", transport=httpx.MockTransport(disagree)))
    r = client.post("/v1/verify", headers=HEADERS, json={**payload(), "examiner_proposal": examined})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "MAJOR_REVIEW"
    assert r.json()["score_changing_correction"] is True

def test_invalid_model_marks_fail_closed(configured_runtime):
    def wrong(req):
        body = json.loads(req.content)
        return response(scoring(criterion="non-existent", score="4"), body["model"])
    app.dependency_overrides[get_runtime] = lambda: Runtime(Settings(
        "synthetic-not-real-key", "a"*40, "test-examiner-v1", "test-verifier-v2", True, True),
        ResponsesProvider("synthetic-not-real-key", transport=httpx.MockTransport(wrong)))
    r = client.post("/v1/examine", headers=HEADERS, json=payload())
    assert r.status_code == 502 and r.json()["detail"]["code"] == "AI_EXAMINER_OUTPUT_REJECTED"
    assert SAMPLE not in r.text

def test_wrong_model_and_provider_refusal_fail_closed(configured_runtime):
    def refuse(req):
        b = json.loads(req.content)
        return response(scoring(), b["model"] + "-unexpected", status="completed")
    app.dependency_overrides[get_runtime] = lambda: Runtime(Settings(
        "synthetic-not-real-key", "a"*40, "test-examiner-v1", "test-verifier-v2", True, True),
        ResponsesProvider("synthetic-not-real-key", transport=httpx.MockTransport(refuse)))
    assert client.post("/v1/examine", headers=HEADERS, json=payload()).status_code == 502

def test_reject_same_examiner_and_verifier_configuration():
    s = Settings("key", "a"*40, "same-model", "same-model", True, True)
    assert not s.ready

def test_invalid_examiner_context_prevents_verifier_call(configured_runtime):
    examined = client.post("/v1/examine", headers=HEADERS, json=payload()).json()
    examined["input_hash"] = "c" * 64
    r = client.post("/v1/verify", headers=HEADERS, json={**payload(), "examiner_proposal": examined})
    assert r.status_code == 409
    assert len(configured_runtime) == 1


def test_invalid_request_does_not_echo_private_writing():
    p = payload(); p["verified_text"] = "Synthetic secret student passage — private"
    r = client.post("/v1/examine", json=p)
    assert r.status_code == 422
    assert p["verified_text"] not in r.text
    assert r.json()["detail"]["code"] == "AI_REQUEST_INVALID"
