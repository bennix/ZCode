import assert from "node:assert/strict";
import test from "node:test";
import { parseZenMuxModelTiers } from "./zenmuxModelTiers.js";
const price = (value: number) => [{ value, unit: "perMTokens", currency: "USD" }];
const model = (id: string, input: number, output: number) => ({
  id,
  output_modalities: ["text"],
  context_length: 128000,
  capabilities: { reasoning: true },
  pricings: { prompt: price(input), completion: price(output) },
});
test("tiers use catalog metadata without vendor-name heuristics", () => {
  const result = parseZenMuxModelTiers({
    data: [model("unknown/a", 0.1, 0.2), model("unknown/b", 1, 4), model("unknown/c", 5, 25)],
  });
  assert.deepEqual(
    result.map((item) => item.tier),
    ["light", "balanced", "deep"],
  );
  assert.equal(result[2]?.reasoning, true);
});
test("non-text, missing prices, ambiguous price bands and wrong units remain unclassified", () => {
  const base = model("example", 1, 2);
  assert.deepEqual(
    parseZenMuxModelTiers({
      data: [
        null,
        { ...base, output_modalities: ["video"] },
        { ...base, pricings: {} },
        { ...base, pricings: { prompt: [...price(1), ...price(2)], completion: price(3) } },
        {
          ...base,
          pricings: {
            prompt: [{ value: 1, unit: "perCount", currency: "USD" }],
            completion: price(2),
          },
        },
      ],
    }),
    [],
  );
  assert.deepEqual(parseZenMuxModelTiers(null), []);
});
