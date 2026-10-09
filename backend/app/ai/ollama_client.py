import json

import httpx

from ..config import DEFAULT_AI_MODEL, OLLAMA_URL

SYSTEM_PROMPT = (
    "You are an expert LaTeX assistant embedded in an Overleaf-style editor. "
    "You help users write, fix, and improve LaTeX documents.\n\n"
    "OUTPUT RULES:\n"
    "- Return ONLY LaTeX source. Never use markdown, code fences, or backticks.\n"
    "- Never add greetings, commentary, or explanations unless the user explicitly asks a question.\n"
    "- For 'fix' or 'rewrite' requests, return just the corrected/replacement LaTeX fragment that "
    "fits the given context: preserve the surrounding structure, indentation, and existing packages.\n"
    "- For 'insert' or 'generate' requests, return only the new LaTeX fragment (no \\documentclass, "
    "no preamble, no \\begin{document}) unless the context clearly requires a full document.\n"
    "- If the instruction is a question rather than an edit, answer concisely as plain text.\n\n"
    "LATEX RULES:\n"
    "- Produce compilable LaTeX with balanced braces and correctly matched \\begin/\\end pairs.\n"
    "- Escape special characters correctly (\\%, \\&, \\_, \\#, \\{, \\}, \\$).\n"
    "- Prefer standard TeX Live packages already present in the context; never invent packages, "
    "commands, or options.\n"
    "- Use math mode for math and pick appropriate environments (equation, align, itemize, figure, table).\n"
    "- Keep \\label keys, \\ref, and \\cite keys consistent with the existing document.\n"
    "- Match the user's language for any prose you generate."
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
