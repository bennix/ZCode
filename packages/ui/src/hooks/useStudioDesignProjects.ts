import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteStudioDesign,
  listStudioDesigns,
  saveStudioDesign,
  type StudioDesignProject,
} from "@/store/studioDesignHistory.js";
export type { StudioDesignProject } from "@/store/studioDesignHistory.js";
export function useStudioDesignProjects() {
  const [records, setRecords] = useState<StudioDesignProject[]>([]);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const next = await listStudioDesigns();
      if (mounted.current) {
        setRecords(next);
        setError(false);
      }
    } catch {
      if (mounted.current) setError(true);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  const mutate = async (action: () => Promise<void>) => {
    if (lock.current) return false;
    lock.current = true;
    setSaving(true);
    setError(false);
    try {
      await action();
      await refresh();
      return true;
    } catch {
      if (mounted.current) setError(true);
      return false;
    } finally {
      lock.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  return {
    records,
    error,
    saving,
    refresh,
    save: (project: StudioDesignProject) => mutate(() => saveStudioDesign(project)),
    remove: (id: string) => mutate(() => deleteStudioDesign(id)),
  };
}
