"""Vendor-isolated, intentionally non-streaming OpenAI Responses adapter. Secrets never enter logs."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
import httpx


class ProviderUnavailable(Exception):
    """Safe public failure; never embed submitted writing or provider response body."""


@dataclass(frozen=True)
class Generated:
    value: dict[str, Any]
    provider_request_id: str


class ResponsesProvider:
    URL = "https://api.openai.com/v1/responses"  # fixed to prevent request-origin injection

    def __init__(self, api_key: str, transport: httpx.AsyncBaseTransport | None = None):
        self._api_key = api_key
        self._transport = transport

    async def generate(self, *, model: str, instructions: str, payload: dict[str, Any],
                       schema: dict[str, Any], schema_name: str) -> Generated:
        # One prompt, no tools, no remote file URLs or background mode; application state disabled.
        req = {"model": model, "store": False,
               "instructions": instructions,
               "input": [{"role": "user", "content": [{"type": "input_text", "text": json.dumps(payload, ensure_ascii=False)}]}],
               "text": {"format": {"type": "json_schema", "name": schema_name,
                                   "strict": True, "schema": schema}},
               "max_output_tokens": 2600}
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(32.0, connect=5.0),
                                         transport=self._transport, follow_redirects=False) as client:
                response = await client.post(self.URL, json=req, headers={
                    "Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"})
            if response.status_code != 200:
                raise ProviderUnavailable("AI provider did not return a successful completion")
            data = response.json()
            if data.get("status") != "completed":
                raise ProviderUnavailable("AI provider returned incomplete or refused output")
            texts = [part.get("text") for output in data.get("output", [])
                     if output.get("type") == "message"
                     for part in output.get("content", []) if part.get("type") == "output_text"]
            if len(texts) != 1 or not isinstance(texts[0], str):
                raise ProviderUnavailable("AI provider did not return one structured response")
            obj = json.loads(texts[0])
            if not isinstance(obj, dict):
                raise ProviderUnavailable("AI provider response was not an object")
            if data.get("model") and data["model"] != model:
                raise ProviderUnavailable("Provider model identity did not match approved route")
            return Generated(value=obj, provider_request_id=str(response.headers.get("x-request-id") or data.get("id") or "unreported"))
        except (httpx.HTTPError, json.JSONDecodeError, ValueError, TypeError, KeyError) as exc:
            # A sanitize-only exception boundary: *never* echo exception text/body; may contain child text.
            raise ProviderUnavailable("AI provider response unavailable or invalid") from None
