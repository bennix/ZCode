# Three-image batches
When an Agent model request contains more than three visible image blocks, analyze all
images sequentially in batches of at most three using the selected model. Preserve
image order and labels (message/block index). Each batch receives nearby text and
the current task text, has no tools, and produces factual observations with uncertainty.
Replace image blocks only in the outgoing projection with labeled batch summaries.
Keep original persisted messages and files unchanged. Final synthesis sees summaries,
not a repeated full image collection. At three or fewer images leave the request intact.
Core runtime owns this projection before the existing aggregate byte-budget pass.
No new session state. Cancel/failure stops subsequent batches and final synthesis;
do not silently skip images or automatically switch models. Progress is emitted through
existing model-stream events. CUA image reference credentials must be invalidated with
their summarized raster, so the model cannot click using a raster it no longer sees.
Record batch model usage separately. Native PDF page counts are outside this image-block
policy; explicit rendered PDF images are included.
Acceptance: 3 images => unchanged; 4 images => 3/1; 8 images => 3/3/2; 51 images => seventeen batches of 3; source remains unchanged; text/tool metadata
preserved; cancellation and batch failure stop dispatch; <=3 fast path.

The batch-size constant is the single source for splitting and progress text.
Changing the limit does not change persistence or recovery: summaries are reused only
when the existing content fingerprint matches the newly formed batch.
