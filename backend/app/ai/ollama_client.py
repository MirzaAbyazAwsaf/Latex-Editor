import json

import httpx

from ..config import OLLAMA_URL


async def list_models(base_url: str = OLLAMA_URL) -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{base_url}/api/tags")
            r.raise_for_status()
            return [m["name"] for m in r.json().get("models", [])]
    except Exception:
        return []


async def stream_chat(base_url: str, model: str, system: str, instruction: str, context: str):
    """Yield SSE-formatted event dicts from Ollama streaming."""
    payload = {
        "model": model,
        "stream": True,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": f"<document context>\n{context}\n</document context>\n\n<instruction>\n{instruction}\n</instruction>"},
        ],
        "options": {"temperature": 0.2},
    }
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", f"{base_url}/api/chat", json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield {"type": "token", "text": content}
                    if data.get("done"):
                        yield {"type": "done"}
                        return
    except httpx.HTTPError as e:
        yield {"type": "error", "message": f"Ollama request failed: {e}"}
    except Exception as e:
        yield {"type": "error", "message": str(e)}
