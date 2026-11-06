import { NO_REASONING_OPTION_SPEC } from "@zcode/shared/model-config";
import type {
  IModelSelectionService,
  IProviderSettingsService,
  ModelSelectionView,
} from "../model-provider/providerFacadeServices.js";

/** 通过正式配置服务补齐明确指定的研究模型，保持 Registry 是可执行模型的唯一来源。 */
export async function ensureWorkCoderResearchModel(
  services: {
    providerSettingsService: IProviderSettingsService;
    modelSelectionService: IModelSelectionService;
  },
  providerId: string,
  modelId: string,
): Promise<ModelSelectionView> {
  const read = () => services.modelSelectionService.getView();
  let view = await read();
  const present = (current: ModelSelectionView) =>
    current.providers
      .find((provider) => provider.providerId === providerId)
      ?.models.some((model) => model.modelId === modelId);
  if (present(view)) return view;
  try {
    await services.providerSettingsService.addPersonalModel(
      providerId,
      modelId,
      {
        optionSpecs: { reasoningLevel: NO_REASONING_OPTION_SPEC },
      },
      true,
    );
  } catch (failure) {
    // 另一窗口可能先完成同一模型的原子添加，重读权威目录后才能复用。
    view = await read();
    if (!present(view)) throw failure;
    return view;
  }
  view = await read();
  if (!present(view))
    throw new Error("WorkCoder research model is not available after configuration");
  return view;
}
