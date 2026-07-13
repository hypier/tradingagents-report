from __future__ import annotations

import logging
import queue
import threading
from uuid import UUID

from application.jobs import run_job

logger = logging.getLogger(__name__)
_STOP = object()


class AnalysisJobWorker:
    def __init__(self) -> None:
        self._queue: queue.Queue[UUID | str | object] = queue.Queue()
        self._scheduled: set[str] = set()
        self._mutex = threading.Lock()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(
            target=self._work,
            name="analysis-job-worker",
            daemon=True,
        )
        self._thread.start()

    def enqueue(self, job_id: UUID | str) -> None:
        key = str(job_id)
        with self._mutex:
            if key in self._scheduled:
                return
            self._scheduled.add(key)
        self._queue.put(job_id)

    def stop(self) -> None:
        if not self._thread:
            return
        self._queue.put(_STOP)
        self._thread.join(timeout=1)
        self._thread = None

    def _work(self) -> None:
        while True:
            job_id = self._queue.get()
            try:
                if job_id is _STOP:
                    return
                run_job(job_id)
            except Exception:
                logger.exception("Analysis job worker failed for %s", job_id)
            finally:
                if job_id is not _STOP:
                    with self._mutex:
                        self._scheduled.discard(str(job_id))
                self._queue.task_done()


job_worker = AnalysisJobWorker()
