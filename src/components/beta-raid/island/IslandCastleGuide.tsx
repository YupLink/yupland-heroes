// Подсказки острова в замке, пока карту в этот заход не открывали: игра могла
// стартовать сразу в замке (запомненный экран), а слой острова живёт на карте —
// без этого кольца в замке пропадали до выхода в мир. Карта смонтировалась —
// ведёт её слой (IslandLayer), этот снимается.
import { useIsland, useIslandAck, useStepToasts } from "./useIsland";
import { IslandSpotlight } from "./IslandSpotlight";
import { useIslandViewProgress } from "./useIslandViewProgress";
import { useCastleTour } from "./useCastleTour";
import { useGuideSpot } from "./useGuideSpot";
import { IslandShortSkip } from "./IslandShortReward";
import { IslandSkipControl } from "./IslandSkipControl";
import { useHoldLetters } from "@/components/letters/letterHold";

export function IslandCastleGuide() {
  const island = useIsland(true, false).data?.island ?? null;
  const tutorialPilot = !!island?.pilot;
  useStepToasts(island);
  const step = island?.onIsland && island.mapId ? island.current : null;
  // Письма (турнир и пр.) ждут, пока игрок на острове, — и в его замке тоже: в замке
  // письмо всплывало поверх подсказки, а «Пропустить шаг» ложился на его «Понятно»
  // (проходка 11.11). На карте острова их держит IslandLayer.
  useHoldLetters("island-castle", !!island?.onIsland && !!island.mapId);
  const { onAck, onViewAck } = useIslandAck();
  useIslandViewProgress(island, onViewAck);
  useCastleTour(step === "x_castle", () => onAck("x_castle"));
  useGuideSpot(step, onAck, undefined, !!island?.places.lesson);
  return <>
    <IslandSpotlight />
    {tutorialPilot && island?.onIsland && island.mapId && (step || island.skipped) && (
      <div className="island-skip__castle">{island.places.lesson && step ? <IslandShortSkip /> : <IslandSkipControl skipped={island.skipped} />}</div>
    )}
  </>;
}

