import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStudioVideoRequest,
  parseStudioVideoResult,
  studioVideoHttpError,
  normalizeStudioVideoSelection,
} from "../src/studio-video.js";
import { VIDEO_CATALOG } from "../src/studio-media-catalog.js";

test("model protocols use their own endpoint and duration fields", () => {
  const vertex = buildStudioVideoRequest("google/veo-3.1-generate-001", "mug", null, {
    seconds: 6,
    ratio: "9:16",
  });
  assert.match(vertex.url, /:predictLongRunning$/);
  assert.equal((vertex.body as any).parameters.durationSeconds, 6);
  const native = buildStudioVideoRequest(
    "minimax/minimax-h3-max",
    "mug",
    { base64: "AQ==", mimeType: "image/png" },
    { seconds: 5, ratio: "16:9" },
  );
  assert.equal(native.url, "https://zenmux.ai/api/v1/videos");
  assert.equal((native.body as any).duration, 5);
  assert.equal((native.body as any).content[1].role, "first_frame");
  const omni = buildStudioVideoRequest(
    "google/gemini-omni-1.1-flash-preview",
    "mug",
    { base64: "AQ==", mimeType: "image/png" },
    { seconds: 3, ratio: "9:16" },
  );
  assert.equal(omni.url, "https://zenmux.ai/api/v1/interactions");
  assert.deepEqual((omni.body as any).response_format, {
    type: "video",
    aspect_ratio: "9:16",
    duration: "3s",
  });
  assert.equal((omni.body as any).input[0].content[1].mime_type, "image/png");
  assert.throws(
    () => buildStudioVideoRequest("google/veo-3.1-generate-001", "mug", null, { seconds: 5 }),
    /时长/,
  );
});
test("results accept only actual video outputs", () => {
  assert.deepEqual(parseStudioVideoResult("vertex", { done: false }), { kind: "pending" });
  assert.deepEqual(
    parseStudioVideoResult("vertex", {
      done: true,
      response: { videos: [{ gcsUri: "https://example.com/video.mp4" }] },
    }),
    { kind: "complete", url: "https://example.com/video.mp4" },
  );
  assert.equal(
    parseStudioVideoResult("vertex", {
      done: true,
      response: { raiMediaFilteredCount: 1, raiMediaFilteredReasons: ["rate limit exceeded"] },
    }).kind,
    "failed",
  );
  assert.deepEqual(
    parseStudioVideoResult("native", {
      status: "succeeded",
      content: {
        video_url: "https://example.com/v.mp4",
        last_frame_url: "https://example.com/image.jpg",
      },
    }),
    { kind: "complete", url: "https://example.com/v.mp4" },
  );
  assert.equal(
    parseStudioVideoResult("native", {
      status: "succeeded",
      content: { last_frame_url: "https://example.com/image.jpg" },
    }).kind,
    "failed",
  );
  assert.equal(
    parseStudioVideoResult("native", { status: "failed", error: { message: "balance not enough" } })
      .kind,
    "failed",
  );
  assert.deepEqual(
    parseStudioVideoResult("interactions", {
      status: "completed",
      steps: [
        { type: "user_input", content: [{ type: "image", uri: "https://example.com/image.png" }] },
        {
          type: "model_output",
          content: [{ type: "video", data: "AQ==", mime_type: "video/mp4" }],
        },
      ],
    }),
    { kind: "complete", url: "data:video/mp4;base64,AQ==" },
  );
  assert.equal(
    parseStudioVideoResult("interactions", {
      status: "completed",
      steps: [
        { type: "user_input", content: [{ type: "video", uri: "https://example.com/input.mp4" }] },
      ],
    }).kind,
    "failed",
  );
});
test("HTTP failures retain diagnostics without media URLs", () => {
  const error = studioVideoHttpError(
    404,
    {
      error: {
        type: "model_not_supported",
        message: "Not available at https://example.com/?secret=1",
      },
    },
    "test/model",
    "request-1",
  );
  assert.match(error, /404.*test\/model/);
  assert.match(error, /model_not_supported/);
  assert.match(error, /request-1/);
  assert.doesNotMatch(error, /secret=1/);
});
test("selection cleanup is idempotent and preserves custom choices", () => {
  const old = {
    videoIds: ["google/gemini-omni-1.1-flash-preview", "custom/video"],
    defaultVideoId: "custom/video",
  };
  assert.deepEqual(normalizeStudioVideoSelection(old), old);
  const invalid = {
    videoIds: ["bytedance/doubao-seedance-1.5-pro"],
    defaultVideoId: "bytedance/doubao-seedance-1.5-pro",
  };
  const next = normalizeStudioVideoSelection(invalid);
  assert.ok(next.videoIds.includes(next.defaultVideoId));
  assert.deepEqual(normalizeStudioVideoSelection(next), next);
  assert.ok(
    VIDEO_CATALOG.every((m) => m.durations.length > 0 && m.ratios.length > 0 && m.protocol),
  );
});

test("official ZenMux error types distinguish subscription entitlement from account credit", () => {
  for (const [type, expected] of [
    ["model_not_available", "订阅套餐未包含"],
    ["invalid_model", "模型标识不存在"],
    ["model_not_supported", "不支持当前接口"],
    ["quote_exceeded", "订阅配额已用尽"],
    ["insufficient_credit", "账户欠费"],
    ["reject_no_credit", "账户余额不足"],
    ["safety_check_failed", "内容安全规范"],
  ]) {
    const text = studioVideoHttpError(
      404,
      { error: { type, message: "provider detail" } },
      "test/model",
    );
    assert.ok(text.includes(expected!), `${type}: ${text}`);
    assert.ok(text.includes("provider detail"));
  }
  assert.doesNotMatch(
    studioVideoHttpError(402, { error: { type: "quote_exceeded" } }, "test/model"),
    /充值|余额不足/,
  );
  assert.doesNotMatch(
    studioVideoHttpError(404, { error: { type: "model_not_available" } }, "test/model"),
    /模型标识不存在/,
  );
});

test("verified MiniMax H3 Fast exposes its own native duration range", () => {
  const fast = VIDEO_CATALOG.find((m) => m.id === "minimax/minimax-h3-fast");
  assert.ok(fast);
  assert.deepEqual(
    fast.durations,
    Array.from({ length: 12 }, (_, i) => i + 4),
  );
  const request = buildStudioVideoRequest(fast.id, "rotating cube", null, {
    seconds: 4,
    ratio: "16:9",
  });
  assert.equal(request.protocol, "native");
  assert.equal(request.body.duration, 4);
  assert.equal(request.body.resolution, "480p");
  assert.throws(() => buildStudioVideoRequest(fast.id, "cube", null, { seconds: 3 }), /时长/);
});

test("Kling models that passed this subscription audit use native video requests", () => {
  for (const id of ["klingai/kling-3.0", "klingai/kling-3.0-omni", "klingai/kling-3.0-turbo"]) {
    const model = VIDEO_CATALOG.find((m) => m.id === id);
    assert.ok(model);
    assert.deepEqual(
      model.durations,
      Array.from({ length: 13 }, (_, i) => i + 3),
    );
    const request = buildStudioVideoRequest(id, "cube", null, { seconds: 3, ratio: "16:9" });
    assert.equal(request.protocol, "native");
    assert.equal(request.body.resolution, "720p");
    assert.ok(
      normalizeStudioVideoSelection({ videoIds: [id], defaultVideoId: id }).videoIds.includes(id),
    );
  }
});
