## Stage 5: Bulk Notification & Queue Management

I must deliver bulk notifications to tens of thousands of students without blocking the system. I accept the request, persist a small batch record, return 202, and process the work asynchronously in a background worker.

My approach:
- Create a batch record: id, totalCount, status, message, timestamps.
- Worker splits targets into chunks (recommended 500–1000) and processes sequentially or with controlled parallelism.
- For each chunk: insert/send, collect success/fail counts, record failures for inspection.
- For transient failures (timeouts, 5xx, rate limits) I retry with exponential backoff up to a limit; permanent failures are recorded and skipped.
- I expose a batch status endpoint so callers can poll progress (total, success, failure, timestamps).

Operational notes:
- Tune chunk size and concurrency empirically; start conservative and increase until throughput or external API limits.
- Log per-chunk results and surface metrics for monitoring and retry decisions.
- Keep batch processing idempotent so retries are safe.

## Stage 6: Priority Inbox

I surface the most important unread notifications first by scoring type and recency and returning the top N (default 10).

Scoring (simple, effective):
- Base by type: Placement > Result > Event (assign numeric weights).
- Small recency bonus for newer items (today > 3 days > 7 days).
- Total score = base + recency; sort by score then date.

Implementation choices:
- For my current setup I read the live notifications API, filter the user's unread items, compute scores on read, and return the top N. This keeps the service stateless and read-only.
- For high traffic I maintain a per-user top-N cache (min-heap) updated by a worker so reads are constant-time and memory-bound.

Edge cases and behavior:
- If a user has no unread items I return an empty array and a friendly message.
- Ties are broken by timestamp (more recent first).
- Scoring parameters are configurable so product can tune placement vs results importance.

Summary

I implement bulk delivery with queued, chunked workers and robust retry/backoff. I implement priority inbox by scoring unread items (type+recency) and returning the top N, falling back to a cached precomputed top-N when scale demands it.
