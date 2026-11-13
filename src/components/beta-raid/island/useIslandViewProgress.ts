import { useEffect } from "react";
import type { IslandView } from "@/server/api/beta-raid/island/island-api";
import { watchIslandViews, type IslandViewedStep } from "./islandViewProgress";

export function useIslandViewProgress(island: IslandView | null, record: (step: IslandViewedStep, mapId: string) => Promise<{ recorded: boolean }>) {
  const mapId = island?.mapId;
  const enabled = !!(island?.pilot && island.onIsland && island.places.lesson && !island.skipped);
  const heroDone = !!island?.done.some(s => s === "hero" || s === "skip:hero");
  const backpackDone = !!island?.done.some(s => s === "chest_backpack" || s === "skip:chest_backpack");
  useEffect(() => {
    if (!enabled || !mapId) return;
    const done = new Set<string>();
    if (heroDone) done.add("hero");
    if (backpackDone) done.add("chest_backpack");
    return watchIslandViews(mapId, done, record);
  }, [enabled, mapId, heroDone, backpackDone, record]);
}
