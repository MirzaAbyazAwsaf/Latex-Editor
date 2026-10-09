import json

import httpx

from ..config import DEFAULT_AI_MODEL, OLLAMA_URL

SYSTEM_PROMPT = (
    "You are a LaTeX editor assistant. Output ONLY valid LaTeX that replaces or "
    "inserts into the user's document. No explanations, no markdown fences, no "
    "prose outside LaTeX. If asked to fix an error, output the corrected LaTeX only."
)


async def list_models() -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            r.raise_for_status()
            return [m["name"] for m in r.json().get("models", [])]
    except Exception:
        return []


async def stream_chat(model: str, instruction: str, context: str):
    """Yield SSE-formatted event dicts from Ollama streaming."""
    payload = {
        "model": model or DEFAULT_AI_MODEL,
        "stream": True,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"<document context>\n{context}\n</document context>\n\n<instruction>\n{instruction}\n</instruction>"},
        ],
        "options": {"temperature": 0.2},
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream("POST", f"{OLLAMA_URL}/api/chat", json=payload) as resp:
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
