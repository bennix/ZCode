import { resolveHttpProxyMode, type HttpProxyMode } from "@zcode/shared";
import { readSystemProxy, type SystemProxy } from "./systemProxy.js";

export async function resolveEffectiveAppProxy(
  input: { mode?: string; httpProxy?: string; noProxy?: string },
  detect: () => Promise<SystemProxy | undefined> = readSystemProxy,
): Promise<{ mode: HttpProxyMode; httpProxy?: string; noProxy?: string }> {
  const mode = resolveHttpProxyMode(input.mode, input.httpProxy);
  if (mode === "direct") return { mode, noProxy: input.noProxy };
  if (mode === "manual") {
    return { mode, httpProxy: input.httpProxy?.trim() || undefined, noProxy: input.noProxy };
  }
  const system = await detect().catch(() => undefined);
  return {
    mode,
    httpProxy: system?.proxyUrl,
    noProxy: input.noProxy?.trim() ? input.noProxy : system?.noProxy,
  };
}
