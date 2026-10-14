import json

import httpx

ANTHROPIC_VERSION = "2023-06-01"
MAX_TOKENS = 4096


def _headers(api_key: str) -> dict:
    return {
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }


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
    """Yield SSE-style event dicts from the Anthropic Messages streaming API."""
    if not api_key:
        yield {"type": "error", "message": "Anthropic API key is not set. Add it in AI settings."}
        return
    payload = {
        "model": model,
        "max_tokens": MAX_TOKENS,
        "system": system,
        "messages": [
            {"role": "user", "content": f"<document context>\n{context}\n</document context>\n\n<instruction>\n{instruction}\n</instruction>"}
        ],
        "stream": True,
    }
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            async with client.stream("POST", f"{base_url}/messages", json=payload, headers=_headers(api_key)) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode("utf-8", "replace")
                    yield {"type": "error", "message": f"Anthropic {resp.status_code}: {body[:400]}"}
                    return
                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if not raw:
                        continue
                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    etype = data.get("type")
                    if etype == "content_block_delta":
                        text = data.get("delta", {}).get("text", "")
                        if text:
                            yield {"type": "token", "text": text}
                    elif etype == "message_stop":
                        yield {"type": "done"}
                        return
                    elif etype == "error":
                        yield {"type": "error", "message": data.get("error", {}).get("message", "unknown error")}
                        return
    except httpx.HTTPError as e:
        yield {"type": "error", "message": f"Anthropic request failed: {e}"}
    except Exception as e:
        yield {"type": "error", "message": str(e)}
