import { useSyncExternalStore } from "react";
const initial = {
  imageIds: ["openai/gpt-image-2"],
  defaultImageId: "openai/gpt-image-2",
  videoIds: [
    "google/veo-3.1-generate-001",
    "google/gemini-omni-1.1-flash-preview",
    "alibaba/wan3.0-video",
    "minimax/minimax-h3-fast",
    "klingai/kling-3.0",
  ],
  defaultVideoId: "google/veo-3.1-generate-001",
};
// Settings 有多个消费者，测试也要共享一个快照，避免全局切换只更新最后挂载的组件。
let currentSettings = { studioMediaLibrary: initial };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => currentSettings;
export function useSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot);
  (window as unknown as { setVideoModel: (id: string) => void }).setVideoModel = (id) => {
    currentSettings = {
      ...currentSettings,
      studioMediaLibrary: { ...currentSettings.studioMediaLibrary, defaultVideoId: id },
    };
    for (const listener of listeners) listener();
  };
  return { settings, loading: false, error: null, update: async () => {} };
}
