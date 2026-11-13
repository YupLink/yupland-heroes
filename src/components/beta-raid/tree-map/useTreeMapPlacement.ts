import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { TREE_PLANT_ENERGY } from "@/lib/treePlant";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { getMyEnergy } from "@/server/api/chips-stake-energy";
import { getMyBackpack } from "@/server/api/beta-raid/market-backpack-read";
import { getTreePlantCells } from "@/server/api/beta-raid/tree/tree-plant-cells";
import { plantTree } from "@/server/api/beta-raid/tree/tree-plant";
import { invalidateBackpack } from "@/lib/query";
import { invalidateBags } from "../loot-bag/lootBagLive";
import { dropHand, onHandStart } from "../hand/handStore";
import { exitMineBuild, onMineBuildStart } from "../mine-build/mineBuildStore";
import { onTreeMapStart } from "./treeMapEvents";
import { treePlacement, type Hex } from "./treePlacement";

export function useTreeMapPlacement(props: {
  mapId?: string; playerPos: Hex | null; walking: boolean;
  clearPath: () => void; stopWalk: () => void;
}) {
  const qc = useQueryClient(), lang = useLang();
  const ref = useRef({ ...props, lang });
  ref.current = { ...props, lang };
  useEffect(() => {
    if (treePlacement.get()) {
      dropHand(); exitMineBuild(); ref.current.stopWalk(); ref.current.clearPath();
    }
    return treePlacement.attach({
    context: () => {
      const { mapId, playerPos, walking } = ref.current;
      return mapId && playerPos ? { ...playerPos, mapId, walking } : null;
    },
    cost: TREE_PLANT_ENERGY,
    op: newOpId,
    read: async key => {
      const [bp, energy, cells] = await Promise.all([
        qc.fetchQuery({ queryKey: ["my-hero-backpack"], queryFn: () => getMyBackpack(), staleTime: 0 }),
        qc.fetchQuery({ queryKey: ENERGY_KEY, queryFn: () => getMyEnergy(), staleTime: 0 }),
        getTreePlantCells(),
      ]);
      if (!bp) throw new Error("market.backpack_no_hero");
      return { count: bp.stacks.find(s => s.stackKey === key)?.count ?? 0, energy: energy.energy, cells };
    },
    plant: data => { ref.current.stopWalk(); ref.current.clearPath(); return plantTree({ data }); },
    sync: async () => {
      invalidateBackpack(qc);
      invalidateBags(qc);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["my-hero-backpack"], refetchType: "all" }, { throwOnError: true }),
        qc.invalidateQueries({ queryKey: ENERGY_KEY, refetchType: "all" }, { throwOnError: true }),
        qc.invalidateQueries({ queryKey: ["beta-raid-state"], refetchType: "all" }, { throwOnError: true }),
        qc.invalidateQueries({ queryKey: ["beta-raid-tree-cells"] }, { throwOnError: true }),
      ]);
    },
    ended: () => toast.success(ref.current.lang === "ru" ? "Все деревья этой стопки посажены" : "All trees in this stack have been planted"),
    });
  }, [qc]);
  useEffect(() => {
    treePlacement.contextChanged();
  }, [props.mapId, props.playerPos?.q, props.playerPos?.r, props.walking]);
  useEffect(() => onTreeMapStart(() => {
    dropHand(); exitMineBuild(); ref.current.stopWalk(); ref.current.clearPath();
  }), []);
  useEffect(() => onHandStart(() => { if (!treePlacement.stop()) dropHand(); }), []);
  useEffect(() => onMineBuildStart(() => { if (!treePlacement.stop()) exitMineBuild(); }), []);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") treePlacement.refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return treePlacement;
}
