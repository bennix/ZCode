/** Public catalog metadata only; never sends credentials or task content. */
export type ModelCostTier = "light" | "balanced" | "deep";
export interface ZenMuxTierModel {
  id: string;
  tier: ModelCostTier;
  reasoning: boolean;
  context: number;
  inputPrice: number;
  outputPrice: number;
}
export function parseZenMuxModelTiers(value: unknown): ZenMuxTierModel[] {
  const data = (value as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const price = (value: unknown): number | null => {
    if (!Array.isArray(value) || value.length !== 1) return null;
    const item = value[0];
    return item?.unit === "perMTokens" &&
      item?.currency === "USD" &&
      typeof item.value === "number" &&
      Number.isFinite(item.value) &&
      item.value >= 0
      ? item.value
      : null;
  };
  return data.slice(0, 2000).flatMap((model): ZenMuxTierModel[] => {
    if (
      !model ||
      typeof model.id !== "string" ||
      !Array.isArray(model.output_modalities) ||
      !model.output_modalities.includes("text")
    )
      return [];
    const inputPrice = price(model.pricings?.prompt);
    const outputPrice = price(model.pricings?.completion);
    if (inputPrice === null || outputPrice === null || !Number.isFinite(model.context_length))
      return [];
    const total = inputPrice + outputPrice;
    return [
      {
        id: model.id,
        inputPrice,
        outputPrice,
        tier: total <= 2 ? "light" : total <= 12 ? "balanced" : "deep",
        reasoning: model.capabilities?.reasoning === true,
        context: model.context_length,
      },
    ];
  });
}
let cached: { expires: number; models: ZenMuxTierModel[] } | undefined;
let pending: Promise<ZenMuxTierModel[]> | undefined;
export async function loadZenMuxModelTiers(): Promise<ZenMuxTierModel[]> {
  if (cached && cached.expires > Date.now()) return cached.models;
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch("https://zenmux.ai/api/v1/models", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`ZenMux catalog HTTP ${response.status}`);
    const models = parseZenMuxModelTiers(await response.json());
    cached = { models, expires: Date.now() + 600_000 };
    return models;
  })();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
