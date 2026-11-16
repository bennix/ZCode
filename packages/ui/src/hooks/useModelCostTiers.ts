import { useEffect, useState } from "react";
import { loadZenMuxModelTiers, type ZenMuxTierModel } from "@zcode/services";

export function useModelCostTiers() {
  const [models, setModels] = useState<ZenMuxTierModel[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    void loadZenMuxModelTiers()
      .then((data) => {
        if (active) setModels(data);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return { models, unavailable };
}
