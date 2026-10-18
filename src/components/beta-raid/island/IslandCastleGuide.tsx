// Подсказки острова в замке, пока карту в этот заход не открывали: игра могла
// стартовать сразу в замке (запомненный экран), а слой острова живёт на карте —
// без этого кольца в замке пропадали до выхода в мир. Карта смонтировалась —
// ведёт её слой (IslandLayer), этот снимается.
import { useIsland, useIslandAck, useStepToasts } from "./useIsland";
import { IslandSpotlight } from "./IslandSpotlight";
import { useCastleTour } from "./useCastleTour";
import { useGuideSpot } from "./useGuideSpot";

export function IslandCastleGuide() {
  const island = useIsland(true, false).data?.island ?? null;
  useStepToasts(island);
  const step = island?.onIsland && island.mapId ? island.current : null;
  const { onAck } = useIslandAck();
  useCastleTour(step === "x_castle", () => onAck("x_castle"));
  useGuideSpot(step, onAck);
  return <IslandSpotlight />;
}
