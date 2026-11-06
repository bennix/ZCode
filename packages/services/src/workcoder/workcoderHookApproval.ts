import type { IHooksService } from "../hooks/hooks.js";
import type { WorkCoderTarget } from "./workcoder.js";

/** 用户显式勾选后，复用 Agent authority 校验当前项目声明，避免自行写信任 store。 */
export async function approveWorkCoderHooks(
  service: IHooksService,
  target: WorkCoderTarget,
): Promise<void> {
  const loaded = await service.loadHooks(target);
  if (loaded.trustStoreCorrupt) throw new Error("Workspace Hook trust store is unavailable");
  const snapshot = loaded.workspaceHookSnapshot;
  if (!snapshot) return;
  const declarations = [
    ...new Set(
      snapshot.hooks
        .filter((hook) => hook.configuredEnabled)
        .map((hook) => hook.hookDeclarationDigest),
    ),
  ];
  for (const hookDeclarationDigest of declarations) {
    if (!service.grantWorkspaceHookTrust) throw new Error("Workspace Hook approval is unavailable");
    const result = await service.grantWorkspaceHookTrust({
      ...target,
      bundleDigest: snapshot.bundleDigest,
      hookDeclarationDigest,
    });
    if (!result.accepted)
      throw new Error(`Workspace Hook approval rejected: ${result.reasonCode ?? "unknown"}`);
  }
}
