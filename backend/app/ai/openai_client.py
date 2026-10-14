import json

import httpx


def _headers(api_key: str) -> dict:
    headers = {"content-type": "application/json"}
    if api_key:
        headers["authorization"] = f"Bearer {api_key}"
    return headers


async def list_models(base_url: str, api_key: str) -> list[str]:
    if not api_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{base_url}/models", headers=_headers(api_key))
            r.raise_for_status()
            return [m["id"] for m in r.json().get("data", [])]
    except Exception:
        return []


async def stream_chat(base_url: str, api_key: str, model: str, system: str, instruction: str, context: str):
    """Yield SSE-style event dicts from an OpenAI-compatible /chat/completions API."""
    payload = {
        "model": model,
        "stream": True,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": f"<document context>\n{context}\n</document context>\n\n<instruction>\n{instruction}\n</instruction>"},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            async with client.stream("POST", f"{base_url}/chat/completions", json=payload, headers=_headers(api_key)) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode("utf-8", "replace")
                    yield {"type": "error", "message": f"Provider {resp.status_code}: {body[:400]}"}
                    return
                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if not raw:
                        continue
                    if raw == "[DONE]":
                        yield {"type": "done"}
                        return
                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    choices = data.get("choices") or []
                    if choices:
                        text = choices[0].get("delta", {}).get("content") or ""
                        if text:
                            yield {"type": "token", "text": text}
    except httpx.HTTPError as e:
        yield {"type": "error", "message": f"Provider request failed: {e}"}
    except Exception as e:
        yield {"type": "error", "message": str(e)}
