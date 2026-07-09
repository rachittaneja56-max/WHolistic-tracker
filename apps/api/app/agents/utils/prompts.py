from __future__ import annotations

from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"


def read_prompt_file(filename: str) -> str:
    prompt_path = PROMPTS_DIR / filename
    return prompt_path.read_text(encoding="utf-8").strip()


def build_system_prompt(filename: str) -> str:
    system_rules = read_prompt_file("system_rules.md")
    task_prompt = read_prompt_file(filename)
    return f"{system_rules}\n\nTask-specific guidance:\n{task_prompt}"
