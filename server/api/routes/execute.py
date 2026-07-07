import os
import json
import logging
import subprocess
import time
import tempfile
import shutil
import httpx
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional

router = APIRouter()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class RunRequest(BaseModel):
    language: str
    sourceCode: str
    stdin: Optional[str] = None

class AnalyzeRequest(BaseModel):
    language: str
    sourceCode: str
    action: str  # "Analyze Code" | "Fix Code" | "Explain Code" | "Optimize Code"

# ---------------------------------------------------------------------------
# Resolve the correct interpreter / compiler for the current OS
# ---------------------------------------------------------------------------

def _which(name: str) -> Optional[str]:
    """Return the absolute path of a command, or None if not found."""
    return shutil.which(name)

def _python_cmd() -> Optional[str]:
    """Return the Python executable available on this system."""
    for cmd in ("python3", "python", "py"):
        p = _which(cmd)
        if p:
            return p
    return None

def _node_cmd() -> Optional[str]:
    for cmd in ("node", "nodejs"):
        p = _which(cmd)
        if p:
            return p
    return None

# ---------------------------------------------------------------------------
# Groq AI prompts (DevPilot AI Analysis)
# ---------------------------------------------------------------------------

def get_action_prompt(action: str, language: str, code: str) -> str:
    block = f"```{language}\n{code}\n```"
    if action == "Analyze Code":
        return f"""You are an expert software engineer. Analyze this {language} code thoroughly.

{block}

Provide a structured analysis:
1. **Overview** — What the code does
2. **Bugs & Errors** — Syntax, logic, and runtime issues
3. **Code Quality** — Readability, naming, structure
4. **Security** — Vulnerabilities (if applicable)
5. **Time & Space Complexity** — Big-O analysis
6. **Best Practices** — Specific improvements"""

    elif action == "Fix Code":
        return f"""You are an expert software engineer. Fix all bugs in this {language} code.

{block}

Respond with:
1. **Issues Found** — Every bug/error
2. **Fixed Code** — Complete corrected code in a fenced code block
3. **Changes Made** — Bullet list of every fix"""

    elif action == "Explain Code":
        return f"""You are an expert software engineer. Explain this {language} code clearly.

{block}

Provide:
1. **Summary** — Plain English description
2. **Line-by-Line Explanation** — Walk through each section
3. **Key Concepts** — Programming concepts used
4. **Execution Flow** — Step-by-step how it runs"""

    elif action == "Optimize Code":
        return f"""You are a performance-focused engineer. Optimize this {language} code.

{block}

Provide:
1. **Current Issues** — Performance bottlenecks
2. **Optimized Code** — Improved version in a fenced code block
3. **Optimizations Applied** — What changed and why
4. **Performance Impact** — Expected improvement"""

    elif action == "Generate Code":
        return f"""You are an expert programmer. Write a clean, complete, and correct program or function in {language} for the following topic/prompt:
"{code}"

Return ONLY the code. Do not wrap it in markdown code blocks. Do not write any explanations, introductory text, or concluding text. Your entire response must be valid, executable {language} code only."""

    return f"Analyze this {language} code and give helpful feedback:\n\n{block}"


# ---------------------------------------------------------------------------
# Local execution — runs code directly using installed compilers
# ---------------------------------------------------------------------------

def execute_code(language: str, code: str, stdin: Optional[str] = None) -> Dict[str, Any]:
    lang = language.lower().strip()

    # HTML/CSS → browser preview only
    if lang in ["html", "css"]:
        return {
            "stdout": f"[{language.upper()} — rendered in Preview panel]",
            "stderr": "",
            "exitCode": 0,
            "time": 0.0,
            "memory": 0,
            "isPreview": True,
        }

    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        stdout = stderr = ""
        exit_code = 0
        exec_time = 0.0

        try:
            # ── Python ──────────────────────────────────────────────────────
            if lang == "python":
                py = _python_cmd()
                if not py:
                    return _err("Python interpreter not found on the server.")
                f = d / "main.py"
                f.write_text(code, encoding="utf-8")
                start = time.time()
                r = subprocess.run([py, str(f)], capture_output=True, text=True,
                                   timeout=15, input=stdin)
                exec_time = time.time() - start
                stdout, stderr, exit_code = r.stdout, r.stderr, r.returncode

            # ── JavaScript ──────────────────────────────────────────────────
            elif lang == "javascript":
                node = _node_cmd()
                if not node:
                    return _err("Node.js not found on the server.")
                f = d / "main.js"
                f.write_text(code, encoding="utf-8")
                start = time.time()
                r = subprocess.run([node, "--max-old-space-size=256", str(f)], capture_output=True, text=True,
                                   timeout=15, input=stdin)
                exec_time = time.time() - start
                stdout, stderr, exit_code = r.stdout, r.stderr, r.returncode

            # ── C ───────────────────────────────────────────────────────────
            elif lang == "c":
                gcc = _which("gcc")
                if not gcc:
                    return _err("GCC not found on the server.")
                src = d / "main.c"
                out = d / "main_c.exe"
                src.write_text(code, encoding="utf-8")
                cr = subprocess.run([gcc, str(src), "-o", str(out)],
                                    capture_output=True, text=True)
                if cr.returncode != 0:
                    return {"stdout": "", "stderr": cr.stderr, "exitCode": cr.returncode,
                            "time": 0.0, "memory": 0}
                start = time.time()
                r = subprocess.run([str(out)], capture_output=True, text=True,
                                   timeout=15, input=stdin)
                exec_time = time.time() - start
                stdout, stderr, exit_code = r.stdout, r.stderr, r.returncode

            # ── C++ ─────────────────────────────────────────────────────────
            elif lang == "cpp":
                gpp = _which("g++")
                if not gpp:
                    return _err("G++ not found on the server.")
                src = d / "main.cpp"
                out = d / "main_cpp.exe"
                src.write_text(code, encoding="utf-8")
                cr = subprocess.run([gpp, str(src), "-o", str(out)],
                                    capture_output=True, text=True)
                if cr.returncode != 0:
                    return {"stdout": "", "stderr": cr.stderr, "exitCode": cr.returncode,
                            "time": 0.0, "memory": 0}
                start = time.time()
                r = subprocess.run([str(out)], capture_output=True, text=True,
                                   timeout=15, input=stdin)
                exec_time = time.time() - start
                stdout, stderr, exit_code = r.stdout, r.stderr, r.returncode

            # ── Java ────────────────────────────────────────────────────────
            elif lang == "java":
                javac = _which("javac")
                java  = _which("java")
                if not javac or not java:
                    return _err("Java (javac/java) not found on the server.")
                src = d / "Main.java"
                src.write_text(code, encoding="utf-8")
                cr = subprocess.run([javac, str(src)], capture_output=True, text=True)
                if cr.returncode != 0:
                    return {"stdout": "", "stderr": cr.stderr, "exitCode": cr.returncode,
                            "time": 0.0, "memory": 0}
                start = time.time()
                r = subprocess.run([java, "-Xmx256m", "-cp", str(d), "Main"],
                                   capture_output=True, text=True, timeout=15, input=stdin)
                exec_time = time.time() - start
                stdout, stderr, exit_code = r.stdout, r.stderr, r.returncode

            else:
                return _err(f"Language '{language}' is not supported for local execution.")

        except subprocess.TimeoutExpired:
            return _err("Execution timed out (15 s limit).", exit_code=124, time=15.0)
        except Exception as e:
            return _err(f"Execution error: {e}")

        # Limit standard output length to prevent memory inflation / crash on frontend
        MAX_OUTPUT_LEN = 100 * 1024 # 100KB
        if len(stdout) > MAX_OUTPUT_LEN:
            stdout = stdout[:MAX_OUTPUT_LEN] + "\n... [Standard Output Truncated]"

        return {
            "stdout": stdout,
            "stderr": stderr,
            "exitCode": exit_code,
            "time": round(exec_time, 3),
            "memory": 0,
        }


def _err(msg: str, exit_code: int = 1, time: float = 0.0) -> Dict[str, Any]:
    return {"stdout": "", "stderr": msg, "exitCode": exit_code, "time": time, "memory": 0}


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@router.post("/run")
async def run_code(req: RunRequest):
    """Execute code using self-hosted backend compilers/runtimes."""
    if not req.sourceCode.strip():
        raise HTTPException(status_code=400, detail="Source code cannot be empty.")
    
    # 512KB input size limit
    if len(req.sourceCode) > 512 * 1024:
        raise HTTPException(status_code=400, detail="Source code size exceeds 512 KB limit.")

    try:
        result = execute_code(req.language, req.sourceCode, req.stdin)
        return result
    except Exception as e:
        logger.error(f"Run error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-stream")
async def analyze_stream(req: AnalyzeRequest):
    """Stream DevPilot AI analysis as Server-Sent Events."""
    if not req.sourceCode.strip():
        raise HTTPException(status_code=400, detail="Source code cannot be empty.")

    # 512KB input size limit
    if len(req.sourceCode) > 512 * 1024:
        raise HTTPException(status_code=400, detail="Source code size exceeds 512 KB limit.")

    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500,
                            detail="GROQ_API_KEY is not configured on the server.")

    model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
    prompt = get_action_prompt(req.action, req.language, req.sourceCode)

    async def generator():
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system",
                             "content": "You are an expert programmer. Your output must be raw, executable code only. Absolutely no markdown blocks, no formatting wrapper, no commentary, no introduction or concluding text. Just raw code." if req.action == "Generate Code" else "You are an expert software engineer. Give clear, structured, and actionable code analysis."},
                            {"role": "user", "content": prompt},
                        ],
                        "stream": True,
                        "temperature": 0.1,
                        "max_tokens": 2048,
                    },
                ) as response:
                    if response.status_code != 200:
                        body = await response.aread()
                        yield f"data: {json.dumps({'error': f'Groq API error {response.status_code}: {body.decode()[:200]}'})}\n\n"
                        yield "data: [DONE]\n\n"
                        return

                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        raw = line[6:]
                        if raw == "[DONE]":
                            yield "data: [DONE]\n\n"
                            return
                        try:
                            chunk = json.loads(raw)
                            delta = chunk["choices"][0]["delta"].get("content", "")
                            if delta:
                                yield f"data: {json.dumps({'text': delta})}\n\n"
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue

        except httpx.TimeoutException:
            yield f"data: {json.dumps({'error': 'DevPilot AI request timed out.'})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Groq stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(generator(), media_type="text/event-stream")
