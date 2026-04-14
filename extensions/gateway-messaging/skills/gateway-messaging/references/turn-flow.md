# gateway turn flow

Primary visible flow:

`queued -> acknowledged -> thinking -> tool_stream -> synthesizing -> final`

Side states:

- `retrying_transport`
- `fallback_plaintext`

Rules:

- keep one primary message owner per turn
- drop stale queued patches when superseded
- retries reuse idempotency keys
