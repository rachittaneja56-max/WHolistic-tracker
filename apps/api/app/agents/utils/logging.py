from __future__ import annotations

import logging
from typing import Any


def get_agent_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"app.agents.{name}")


def log_agent_event(logger: logging.Logger, level: int, event: str, **fields: Any) -> None:
    if not logger.isEnabledFor(level):
        return

    details = " ".join(f"{key}={value!r}" for key, value in fields.items())
    message = event if not details else f"{event} {details}"
    logger.log(level, message)
