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


def parse_log(log_text: str, main_file: str = "main.tex") -> ParseResult:
    """Extract {file, line, message} entries from a LaTeX log."""
    result = ParseResult()
    lines = log_text.splitlines()
    i = 0
    while i < len(lines):
        m = ERR_START.match(lines[i])
        if not m:
            i += 1
            continue
        message = m.group(1).strip()
        file = main_file
        line = None

        for j in range(i + 1, min(i + 12, len(lines))):
            fl = FILE_LINE.match(lines[j])
            if fl:
                file, line = fl.group(1), int(fl.group(2))
                break
            le = LATEX_ERR.match(lines[j])
            if le:
                line = int(le.group(1))
                break

        if result.error_line is None:
            result.error_line = line
            result.error_file = file
        result.errors.append(CompileError(file=file, line=line, message=message))
        i += 1
    return result
