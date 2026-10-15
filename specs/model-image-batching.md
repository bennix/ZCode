# Two-image batches with truncation recovery

When a request contains more than two visible image blocks, core runtime analyzes them in source order, normally two per batch. At two or fewer images the request is unchanged. Each batch carries the current task and nearby text. Runtime projects factual summaries into the outgoing request without changing persisted messages or source files. CUA references to replaced rasters are invalidated.

Core runtime owns dispatch and result projection. Existing session batch memory owns completed summary persistence, keyed by model, options, and exact content. A completed normal batch is reused on resume. If a two-image attempt ends at its output-token limit, discard incomplete text and analyze each image alone, in order. Cache each successful single-image result under its own content fingerprint; cache the combined result under the original pair fingerprint. Never mark a truncated attempt completed. If a single image still truncates, fail explicitly. Cancellation or any other error stops subsequent work.

```text
messages -> core batch projector -> batch memory -> model (2 images)
                                              success -> persist pair
                                              truncation -> image 1 -> persist
                                                         -> image 2 -> persist
                                                         -> combine -> persist pair
                                              cancel/error -> stop
```

The fingerprint, rather than batch number, determines replay identity. No second queue or state owner is introduced. Desktop continuous and mobile replayable delivery both use existing model events; this change does not alter Host ownership or stream delivery.

Acceptance: 2 images unchanged; 3 split 2/1; 8 split 2/2/2/2; a truncated pair retries as 1/1; successful singles are reused after interruption; single-image truncation and cancellation stop the turn; source stays intact.
