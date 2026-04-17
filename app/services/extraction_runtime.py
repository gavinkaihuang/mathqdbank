from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import TypedDict


class RuntimeState(TypedDict):
    paper_id: int
    run_id: str
    status: str
    stop_requested: bool
    step: str
    progress: int
    message: str
    pages_total: int
    pages_processed: int
    questions_detected: int
    images_cropped: int
    llm_page_failures: int
    updated_at: str
    started_at: str
    finished_at: str | None


_lock = Lock()
_states: dict[int, RuntimeState] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def start(paper_id: int, run_id: str, *, step: str, message: str) -> RuntimeState:
    now = _now_iso()
    state: RuntimeState = {
        "paper_id": paper_id,
        "run_id": run_id,
        "status": "processing",
        "stop_requested": False,
        "step": step,
        "progress": 0,
        "message": message,
        "pages_total": 0,
        "pages_processed": 0,
        "questions_detected": 0,
        "images_cropped": 0,
        "llm_page_failures": 0,
        "updated_at": now,
        "started_at": now,
        "finished_at": None,
    }
    with _lock:
        _states[paper_id] = state
    return state


def request_stop(paper_id: int, *, message: str = "收到停止请求，等待当前步骤安全退出") -> RuntimeState | None:
    with _lock:
        state = _states.get(paper_id)
        if state is None:
            return None

        state["stop_requested"] = True
        state["status"] = "stopping"
        state["step"] = "stop_requested"
        state["message"] = message
        state["updated_at"] = _now_iso()

        _states[paper_id] = state
        return dict(state)


def is_stop_requested(paper_id: int) -> bool:
    with _lock:
        state = _states.get(paper_id)
        if state is None:
            return False
        return bool(state.get("stop_requested"))


def update(
    paper_id: int,
    *,
    status: str | None = None,
    step: str | None = None,
    progress: int | None = None,
    message: str | None = None,
    pages_total: int | None = None,
    pages_processed_delta: int | None = None,
    questions_detected_delta: int | None = None,
    images_cropped_delta: int | None = None,
    llm_page_failures_delta: int | None = None,
) -> RuntimeState | None:
    with _lock:
        state = _states.get(paper_id)
        if state is None:
            return None

        if status is not None:
            state["status"] = status
        if step is not None:
            state["step"] = step
        if progress is not None:
            state["progress"] = max(0, min(100, progress))
        if message is not None:
            state["message"] = message
        if pages_total is not None:
            state["pages_total"] = max(0, pages_total)
        if pages_processed_delta is not None:
            state["pages_processed"] = max(0, state["pages_processed"] + pages_processed_delta)
        if questions_detected_delta is not None:
            state["questions_detected"] = max(0, state["questions_detected"] + questions_detected_delta)
        if images_cropped_delta is not None:
            state["images_cropped"] = max(0, state["images_cropped"] + images_cropped_delta)
        if llm_page_failures_delta is not None:
            state["llm_page_failures"] = max(0, state["llm_page_failures"] + llm_page_failures_delta)

        state["updated_at"] = _now_iso()
        if state["status"] in {"completed", "failed"}:
            state["finished_at"] = state["updated_at"]
            state["stop_requested"] = False

        _states[paper_id] = state
        return dict(state)


def get(paper_id: int) -> RuntimeState | None:
    with _lock:
        state = _states.get(paper_id)
        return dict(state) if state else None
