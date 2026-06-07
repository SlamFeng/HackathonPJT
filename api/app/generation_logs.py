from __future__ import annotations

import asyncio
import json
import time
import uuid
from pathlib import Path
from typing import Any

from .settings import settings


class GenerationLogStore:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()

    def _dir(self) -> Path:
        base_dir = Path(__file__).resolve().parents[1]
        log_dir = base_dir / settings.data_dir / "generation_logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        return log_dir

    def _path(self, log_id: str) -> Path:
        safe_id = "".join(ch for ch in log_id if ch.isalnum() or ch in ("-", "_"))
        return self._dir() / f"{safe_id}.json"

    async def start(
        self,
        *,
        job_id: str | None,
        task: str,
        inputs: dict[str, Any],
        constraints: dict[str, Any] | None,
    ) -> str:
        log_id = job_id or str(uuid.uuid4())
        now = int(time.time() * 1000)
        record: dict[str, Any] = {
            "id": log_id,
            "jobId": job_id,
            "task": task,
            "status": "running",
            "createdAtMs": now,
            "updatedAtMs": now,
            "inputs": inputs,
            "constraints": constraints,
            "rounds": [],
            "finalImageUrl": None,
            "summary": {
                "remoteCallCount": 0,
                "successfulCallCount": 0,
                "failedCallCount": 0,
                "roundCount": 0,
                "selfCorrectionUsed": False,
                "totalTokenCount": None,
            },
        }
        async with self._lock:
            self._write(log_id, record)
        return log_id

    async def append_round(self, log_id: str, round_record: dict[str, Any]) -> None:
        async with self._lock:
            record = self._read(log_id)
            if record is None:
                return
            record.setdefault("rounds", []).append(round_record)
            self._refresh_summary(record)
            record["updatedAtMs"] = int(time.time() * 1000)
            self._write(log_id, record)

    async def finish(
        self,
        log_id: str,
        *,
        status: str,
        final_image_url: str | None = None,
        error: str | None = None,
        meta: dict[str, Any] | None = None,
    ) -> None:
        async with self._lock:
            record = self._read(log_id)
            if record is None:
                return
            record["status"] = status
            record["finalImageUrl"] = final_image_url
            record["error"] = error
            if meta is not None:
                record["meta"] = meta
            record["updatedAtMs"] = int(time.time() * 1000)
            self._refresh_summary(record)
            self._write(log_id, record)

    async def list(self, *, limit: int = 50) -> list[dict[str, Any]]:
        async with self._lock:
            paths = sorted(self._dir().glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
            records: list[dict[str, Any]] = []
            for path in paths[: max(1, min(limit, 200))]:
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    continue
                records.append(self._compact(data))
            return records

    async def get(self, log_id: str) -> dict[str, Any] | None:
        async with self._lock:
            return self._read(log_id)

    def _read(self, log_id: str) -> dict[str, Any] | None:
        path = self._path(log_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def _write(self, log_id: str, record: dict[str, Any]) -> None:
        self._path(log_id).write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

    def _compact(self, record: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": record.get("id"),
            "jobId": record.get("jobId"),
            "task": record.get("task"),
            "status": record.get("status"),
            "createdAtMs": record.get("createdAtMs"),
            "updatedAtMs": record.get("updatedAtMs"),
            "finalImageUrl": record.get("finalImageUrl"),
            "summary": record.get("summary"),
        }

    def _refresh_summary(self, record: dict[str, Any]) -> None:
        rounds = record.get("rounds") or []
        attempts = [
            attempt
            for round_record in rounds
            for attempt in (round_record.get("attempts") or [])
            if isinstance(attempt, dict)
        ]
        total_tokens = 0
        has_tokens = False
        for attempt in attempts:
            usage = attempt.get("usageMetadata") or {}
            count = usage.get("totalTokenCount")
            if isinstance(count, int):
                total_tokens += count
                has_tokens = True
        record["summary"] = {
            "remoteCallCount": len(attempts),
            "successfulCallCount": sum(1 for attempt in attempts if attempt.get("status") == "succeeded"),
            "failedCallCount": sum(1 for attempt in attempts if attempt.get("status") == "failed"),
            "roundCount": len(rounds),
            "selfCorrectionUsed": any(round_record.get("kind") == "self_correction" for round_record in rounds),
            "totalTokenCount": total_tokens if has_tokens else None,
        }


generation_log_store = GenerationLogStore()
