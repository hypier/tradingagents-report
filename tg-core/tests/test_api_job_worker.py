from api.job_worker import AnalysisJobWorker


def test_enqueue_deduplicates_scheduled_job_ids():
    worker = AnalysisJobWorker()
    worker.enqueue("job-1")
    worker.enqueue("job-1")

    assert worker._queue.qsize() == 1
