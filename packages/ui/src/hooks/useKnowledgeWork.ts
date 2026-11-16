import { useEffect, useRef, useState } from "react";
import { ZCODE_AGENT_PROVIDER } from "@zcode/shared";
import { useWorkspaceServices } from "./useWorkspaceServices.js";
import { buildSkillMentionMarkdown } from "@/mentions/mentionMarkdown.js";

export function useKnowledgeWork(
  workspacePath: string,
  workspaceIdentity?: string,
  remoteSessionId?: string,
) {
  const services = useWorkspaceServices(workspacePath, remoteSessionId, workspaceIdentity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const prepare = async (
    domain: string,
    skillName: string,
    details: string,
    onReady: (text: string) => void,
  ) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const pluginId = `knowledge-${domain}@zcode-plugins-official`;
      const result = await services.pluginManagementService.setPluginEnabled({
        workspacePath,
        workspaceIdentity,
        pluginId,
        enabled: true,
        scope: "workspace",
      });
      if (!result.enabled) throw new Error("Plugin could not be enabled");
      if (!active.current) return;
      const { skills } = await services.skillsService.list({
        workspacePath,
        workspaceIdentity,
        provider: ZCODE_AGENT_PROVIDER,
      });
      const skill = skills.find(
        (item) =>
          item.pluginId === pluginId && item.name === skillName && item.enabled && item.path,
      );
      if (!skill)
        throw new Error(
          "Selected professional skill is unavailable. Restore the builtin plugin in the plugin marketplace.",
        );
      if (active.current)
        onReady(`${buildSkillMentionMarkdown(skill.name, skill.path)}\n\n${details}`);
    } catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  };
  return { prepare, busy, error };
}
