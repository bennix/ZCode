import { useEffect, useRef, useState } from "react";
import {
  prepareWorkCoderTask,
  sendWorkCoderTask,
  type WorkCoderLaunch,
  type WorkCoderModels,
  type WorkCoderRunOptions,
  type WorkCoderTarget,
} from "@zcode/services";
import { useTabStoreApi } from "@/store/TabStoreProvider.js";
import { useWorkspaceServices } from "./useWorkspaceServices.js";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import { startProbe } from "@/store/researchProbeStore.js";

export function useWorkCoder(target: WorkCoderTarget, onStarted?: () => void) {
  const services = useWorkspaceServices(
    target.workspacePath,
    target.remoteSessionId,
    target.workspaceIdentity,
  );
  const tabs = useTabStoreApi();
  const key = target.workspaceIdentity?.trim() || target.workspacePath;
  const admission = useRef(false);
  const mounted = useRef(true);
  const prepared = useRef<WorkCoderLaunch | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const start = async (
    models: WorkCoderModels | null,
    task: string,
    options: WorkCoderRunOptions = {},
  ) => {
    if (admission.current || (!models && !prepared.current)) return;
    admission.current = true;
    setBusy(true);
    setError("");
    const finish = startProbe(
      key,
      "guided-task",
      "workcoder.admission",
      prepared.current?.modelSelection.modelId ?? models?.main.modelId ?? null,
    );
    try {
      if (!prepared.current) {
        if (!models) throw new Error("WorkCoder model selection is required");
        prepared.current = await prepareWorkCoderTask(services, target, models, task, options);
      }
      await sendWorkCoderTask(services.zcodeTaskService, prepared.current, target.remoteSessionId);
      finish("success");
      const { taskId, target: actualTarget } = prepared.current;
      prepared.current = null;
      if (mounted.current) setRetry(false);
      if (mounted.current) {
        onStarted?.();
        tabs.getState().addTab(actualTarget.workspacePath, {
          workspaceIdentity: actualTarget.workspaceIdentity,
          remoteSessionId: actualTarget.remoteSessionId,
        });
        useZCodeSessionStore
          .getState()
          .setActiveTaskId(actualTarget.workspacePath, taskId, actualTarget.workspaceIdentity);
      }
    } catch (failure) {
      finish("failed");
      if (mounted.current) {
        setRetry(prepared.current !== null);
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    } finally {
      admission.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return { start, busy, retry, error };
}
