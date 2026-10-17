import assert from "node:assert/strict";
import { test } from "node:test";
import { IMAGE_CATALOG } from "../src/studio-media-catalog.js";
import { buildStudioImageRequest } from "../src/studio-image.js";

function parameters(model: string, ratio?: string): Record<string, unknown> {
  const request = buildStudioImageRequest(model, "a red mug", [], ratio);
  return (request.body as { parameters?: Record<string, unknown> }).parameters ?? {};
}

test("each image model sends the frame field its ZenMux protocol accepts", () => {
  assert.equal(parameters("qwen/qwen-image-3.0", "1536x1024").size, "1536x1024");
  assert.equal("imageSize" in parameters("qwen/qwen-image-3.0", "1536x1024"), false);

  assert.equal(parameters("openai/gpt-image-2", "1920x1080").imageSize, "1920x1080");
  assert.equal(parameters("openai/gpt-image-1.5", "1024x1536").imageSize, "1024x1536");
  assert.equal(parameters("openai/gpt-image-2.5-flare").imageSize, "auto");

  assert.equal(parameters("tencent/hy-image-v3.0", "16:9").aspectRatio, "16:9");
  assert.equal("imageSize" in parameters("tencent/hy-image-v3.0", "16:9"), false);
  assert.equal(parameters("z-ai/glm-image").aspectRatio, "1:1");
  assert.equal(parameters("sapiens-ai/agnes-image-2.1-flash", "21:9").aspectRatio, "21:9");

  const lite = buildStudioImageRequest("google/gemini-3.1-flash-lite-image", "a red mug", [], "4:5");
  const imageConfig = (
    lite.body as { generationConfig: { imageConfig?: { aspectRatio?: string } } }
  ).generationConfig.imageConfig;
  assert.equal(imageConfig?.aspectRatio, "4:5");

  const ming = buildStudioImageRequest("inclusionai/ming-image-0.1-design", "a red mug");
  assert.equal(
    (ming.body as { generationConfig: { imageConfig?: unknown } }).generationConfig.imageConfig,
    undefined,
  );
});

test("catalog ratios stay inside the documented frame for that model", () => {
  const ratios = (id: string) => IMAGE_CATALOG.find((entry) => entry.id === id)?.ratios ?? [];
  assert.equal(ratios("google/gemini-2.5-flash-image").length, 8);
  assert.equal(ratios("google/gemini-3.1-flash-lite-image").length, 14);
  assert.deepEqual(ratios("openai/gpt-image-2.5-sunburst"), [
    "auto",
    "1024x1024",
    "1536x1024",
    "1024x1536",
  ]);
  assert.equal(ratios("openai/gpt-image-2").includes("3840x2160"), true);
  assert.equal(ratios("openai/gpt-image-2.5-flare").includes("3840x2160"), false);
  assert.deepEqual(ratios("x-ai/grok-imagine-image-2.0"), ratios("meta/muse-image-1.0"));
  assert.equal(ratios("inclusionai/ming-image-0.1-design-layer").includes("1024x1024"), false);
});
