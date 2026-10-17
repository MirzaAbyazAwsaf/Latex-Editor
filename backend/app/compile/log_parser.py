import re
from dataclasses import dataclass, field


@dataclass
class CompileError:
    file: str
    line: int | None
    message: str


@dataclass
class ParseResult:
    errors: list[CompileError] = field(default_factory=list)
    error_line: int | None = None
    error_file: str | None = None


ERR_START = re.compile(r"^!\s*(.+)$")
FILE_LINE = re.compile(r"^([^\s:()]+\.\w+):(\d+):")
LATEX_ERR = re.compile(r"^l\.(\d+)\s*(.*)$")

_TRACKED = (".tex", ".sty", ".cls", ".cfg", ".def", ".fd", ".clo")


def _normalize(path: str) -> str:
    path = path.strip().strip('"')
    path = path.replace("\\", "/")
    while path.startswith("./"):
        path = path[2:]
    return path


def _file_context(lines: list[str]) -> list[str | None]:
    """Track the currently open .tex file for each log line."""
    stack: list[str] = []
    contexts: list[str | None] = []
    for line in lines:
        k = 0
        n = len(line)
        while k < n:
            c = line[k]
            if c == "(":
                j = k + 1
                if j < n and line[j] == '"':
                    close = line.find('"', j + 1)
                    close = n if close == -1 else close
                    token = line[j + 1 : close]
                    k = close
                else:
                    start = j
                    while j < n and line[j] not in " )":
                        j += 1
                    token = line[start:j]
                    k = j - 1
                if token.endswith(_TRACKED):
                    stack.append(_normalize(token))
                else:
                    stack.append("")
                k += 1
            elif c == ")":
                if stack:
                    stack.pop()
                k += 1
            else:
                k += 1
        cur = None
        for f in reversed(stack):
            if f.endswith(".tex"):
                cur = f
                break
        contexts.append(cur)
    return contexts


def parse_log(log_text: str, main_file: str = "main.tex") -> ParseResult:
    """Extract {file, line, message} entries from a LaTeX log."""
    result = ParseResult()
    lines = log_text.splitlines()
    contexts = _file_context(lines)
    i = 0
    while i < len(lines):
        m = ERR_START.match(lines[i])
        if not m:
            i += 1
            continue
        message = m.group(1).strip()
        file = None
        line = None

        for j in range(i + 1, min(i + 15, len(lines))):
            fl = FILE_LINE.match(lines[j])
            if fl:
                file, line = _normalize(fl.group(1)), int(fl.group(2))
                break
            le = LATEX_ERR.match(lines[j])
            if le:
                line = int(le.group(1))
                file = contexts[j] or contexts[i] or main_file
                break

        if file is None:
            file = contexts[i] or main_file

        if result.error_line is None:
            result.error_line = line
            result.error_file = file
        result.errors.append(CompileError(file=file, line=line, message=message))
        i += 1
    return result
