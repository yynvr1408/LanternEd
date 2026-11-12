"""Sandboxed coding exercise runner & automated test-case evaluator.

Executes student code inside an isolated temporary workspace with a scrubbed
environment (no application secrets, API keys, or DB URLs inherited), strict
wall-clock timeout, bounded stdout/stderr capture, and deterministic test-case
comparison.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

MAX_CODE_BYTES = 64 * 1024
MAX_OUTPUT_CHARS = 16 * 1024
DEFAULT_TIMEOUT_SECONDS = 2.5

SUPPORTED_LANGUAGES = ("python", "javascript", "c", "cpp")


@dataclass
class TestCaseOutcome:
    name: str
    passed: bool
    stdin: str
    expected_stdout: str
    actual_stdout: str
    stderr: str
    timed_out: bool
    runtime_ms: int
    hidden: bool = False


def _clean_env(tmpdir: str) -> dict[str, str]:
    """Build a minimal subprocess environment without leaking backend secrets."""
    env: dict[str, str] = {
        "PATH": os.environ.get("PATH", ""),
        "HOME": tmpdir,
        "TMPDIR": tmpdir,
        "TEMP": tmpdir,
        "TMP": tmpdir,
        "PYTHONIOENCODING": "utf-8",
        "PYTHONDONTWRITEBYTECODE": "1",
    }
    if os.name == "nt":
        for win_key in ("SYSTEMROOT", "COMSPEC", "WINDIR"):
            if os.environ.get(win_key):
                env[win_key] = os.environ[win_key]
    return env


def resolve_runtime_command(language: str) -> list[str] | None:
    lang = language.lower().strip()
    if lang in ("py", "python", "python3"):
        return [sys.executable]
    if lang in ("js", "javascript", "node"):
        node = shutil.which("node")
        return [node] if node else None
    if lang == "c":
        cc = shutil.which("gcc") or shutil.which("clang")
        return [cc] if cc else None
    if lang in ("cpp", "c++"):
        cxx = shutil.which("g++") or shutil.which("clang++")
        return [cxx] if cxx else None
    return None


def _normalize_language(language: str | None) -> str:
    lang = (language or "python").lower().strip()
    if lang in ("py", "python3"):
        return "python"
    if lang in ("js", "node"):
        return "javascript"
    if lang == "c++":
        return "cpp"
    return lang if lang in SUPPORTED_LANGUAGES else "python"


def _normalize_output(text: str) -> str:
    lines = [line.rstrip() for line in (text or "").replace("\r\n", "\n").splitlines()]
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def execute_source(
    source_code: str,
    *,
    language: str = "python",
    stdin_data: str = "",
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Execute source code once against `stdin_data` inside a clean temp directory."""
    lang = _normalize_language(language)
    code_bytes = (source_code or "").encode("utf-8", errors="replace")
    if len(code_bytes) > MAX_CODE_BYTES:
        return {
            "language": lang,
            "compiler_available": True,
            "compiled": False,
            "timed_out": False,
            "exit_code": 1,
            "stdout": "",
            "stderr": f"Source exceeds {MAX_CODE_BYTES} byte limit.",
            "runtime_ms": 0,
        }

    runtime = resolve_runtime_command(lang)
    if runtime is None:
        return {
            "language": lang,
            "compiler_available": False,
            "compiled": False,
            "timed_out": False,
            "exit_code": None,
            "stdout": "",
            "stderr": f"Runtime for '{lang}' is not installed on this server.",
            "runtime_ms": 0,
        }

    timeout = max(0.5, min(float(timeout_seconds), 5.0))
    with tempfile.TemporaryDirectory(prefix="lantern_run_") as tmpdir:
        tmp_path = Path(tmpdir)
        env = _clean_env(tmpdir)

        if lang == "python":
            src_file = tmp_path / "solution.py"
            src_file.write_text(source_code or "", encoding="utf-8")
            run_cmd = [*runtime, "-I", "-B", str(src_file)]
        elif lang == "javascript":
            src_file = tmp_path / "solution.js"
            src_file.write_text(source_code or "", encoding="utf-8")
            run_cmd = [*runtime, str(src_file)]
        else:
            ext = ".c" if lang == "c" else ".cpp"
            src_file = tmp_path / f"solution{ext}"
            bin_name = "solution.exe" if os.name == "nt" else "solution"
            bin_file = tmp_path / bin_name
            src_file.write_text(source_code or "", encoding="utf-8")
            try:
                compile_res = subprocess.run(
                    [*runtime, str(src_file), "-O2", "-o", str(bin_file)],
                    cwd=tmpdir,
                    env=env,
                    capture_output=True,
                    text=True,
                    timeout=5.0,
                )
            except subprocess.TimeoutExpired:
                return {
                    "language": lang,
                    "compiler_available": True,
                    "compiled": False,
                    "timed_out": True,
                    "exit_code": None,
                    "stdout": "",
                    "stderr": "Compilation timed out.",
                    "runtime_ms": 5000,
                }
            if compile_res.returncode != 0:
                return {
                    "language": lang,
                    "compiler_available": True,
                    "compiled": False,
                    "timed_out": False,
                    "exit_code": compile_res.returncode,
                    "stdout": "",
                    "stderr": (compile_res.stderr or compile_res.stdout)[:MAX_OUTPUT_CHARS],
                    "runtime_ms": 0,
                }
            run_cmd = [str(bin_file)]

        started = time.perf_counter()
        try:
            proc = subprocess.run(
                run_cmd,
                input=stdin_data or "",
                cwd=tmpdir,
                env=env,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            return {
                "language": lang,
                "compiler_available": True,
                "compiled": True,
                "timed_out": False,
                "exit_code": proc.returncode,
                "stdout": (proc.stdout or "")[:MAX_OUTPUT_CHARS],
                "stderr": (proc.stderr or "")[:MAX_OUTPUT_CHARS],
                "runtime_ms": elapsed_ms,
            }
        except subprocess.TimeoutExpired as exc:
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            out = exc.stdout.decode("utf-8", errors="replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
            return {
                "language": lang,
                "compiler_available": True,
                "compiled": True,
                "timed_out": True,
                "exit_code": None,
                "stdout": out[:MAX_OUTPUT_CHARS],
                "stderr": f"Execution exceeded {timeout:.1f}s time limit.",
                "runtime_ms": elapsed_ms,
            }


def extract_student_code(student_answer: Any, default_language: str = "python") -> tuple[str, str]:
    if isinstance(student_answer, dict):
        lang = _normalize_language(student_answer.get("language") or default_language)
        code = str(student_answer.get("code") or student_answer.get("source") or "")
        return lang, code
    return _normalize_language(default_language), str(student_answer or "")


def extract_test_cases(code_harness: dict[str, Any] | None, correct_answer: Any) -> list[dict[str, Any]]:
    harness = code_harness if isinstance(code_harness, dict) else {}
    cases: list[dict[str, Any]] = []
    raw_cases = harness.get("test_cases")
    if isinstance(raw_cases, list):
        for idx, tc in enumerate(raw_cases):
            if not isinstance(tc, dict):
                continue
            expected = tc.get("expected_stdout")
            if expected is None:
                expected = tc.get("expected_output", tc.get("output", ""))
            cases.append(
                {
                    "name": str(tc.get("name") or f"Test Case {idx + 1}"),
                    "stdin": str(tc.get("stdin", tc.get("input", ""))),
                    "expected_stdout": str(expected or ""),
                    "hidden": bool(tc.get("hidden", False)),
                }
            )
    if not cases and isinstance(correct_answer, dict) and "expected_output" in correct_answer:
        cases.append(
            {
                "name": "Output Verification",
                "stdin": str(correct_answer.get("stdin", "")),
                "expected_stdout": str(correct_answer.get("expected_output") or ""),
                "hidden": False,
            }
        )
    return cases


def evaluate_coding_question(
    *,
    code_harness: dict[str, Any] | None,
    correct_answer: Any,
    student_answer: Any,
    max_marks: float,
) -> tuple[float, bool, list[TestCaseOutcome]]:
    """Run all configured test cases and compute proportional marks.

    Returns `(score, can_auto_grade, outcomes)`. When no test cases are defined,
    `can_auto_grade` is False so manual rubric evaluation stays intact.
    """
    cases = extract_test_cases(code_harness, correct_answer)
    if not cases:
        return 0.0, False, []

    harness_lang = _normalize_language((code_harness or {}).get("language") if isinstance(code_harness, dict) else "python")
    lang, source = extract_student_code(student_answer, default_language=harness_lang)
    if not source.strip():
        return 0.0, True, [
            TestCaseOutcome(
                name=tc["name"],
                passed=False,
                stdin="" if tc["hidden"] else tc["stdin"],
                expected_stdout="" if tc["hidden"] else tc["expected_stdout"],
                actual_stdout="",
                stderr="No source code submitted.",
                timed_out=False,
                runtime_ms=0,
                hidden=tc["hidden"],
            )
            for tc in cases
        ]

    outcomes: list[TestCaseOutcome] = []
    passed_count = 0
    for tc in cases:
        res = execute_source(source, language=lang, stdin_data=tc["stdin"])
        if not res["compiler_available"]:
            # Runtime unavailable on host: defer to manual grading instead of failing student.
            return 0.0, False, []
        actual_norm = _normalize_output(res["stdout"])
        expected_norm = _normalize_output(tc["expected_stdout"])
        passed = bool(res["compiled"] and not res["timed_out"] and res["exit_code"] == 0 and actual_norm == expected_norm)
        if passed:
            passed_count += 1
        outcomes.append(
            TestCaseOutcome(
                name=tc["name"],
                passed=passed,
                stdin="" if tc["hidden"] else tc["stdin"],
                expected_stdout="" if tc["hidden"] else tc["expected_stdout"],
                actual_stdout="" if tc["hidden"] else res["stdout"],
                stderr=res["stderr"],
                timed_out=res["timed_out"],
                runtime_ms=res["runtime_ms"],
                hidden=tc["hidden"],
            )
        )

    score = round((passed_count / len(cases)) * float(max_marks), 2)
    return score, True, outcomes
