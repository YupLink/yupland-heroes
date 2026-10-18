// Слой острова над картой: приветствие при первом входе, панель проходки на
// острове, подсветка кнопок шага, рамка клетки цели и окно «ты в основном
// мире» после портала.
// Спрашивает сервер только на острове и у админов (тест) — остальным игрокам
// слой ничего не стоит.
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { useSplashCovered } from "@/components/game/splashPolicy";
import { IslandQuestPanel } from "./IslandQuestPanel";
import { IslandDialog } from "./IslandDialog";
import { useIsland, useIslandAck, useStepToasts } from "./useIsland";
import { IslandSpotlight } from "./IslandSpotlight";
import { useCastleTour } from "./useCastleTour";
import { useGuideSpot } from "./useGuideSpot";
import { setIslandGoal } from "./islandGoal";
import { useMyAchievements } from "@/components/achievements/useMyAchievements";
import { useAchToasts } from "@/components/achievements/useAchToasts";
import { requestCenter } from "../centerMapBus";

/** «Показать» — камера к клетке даже сквозь туман, рамка горит 3 с. */
const showGoal = (q: number, r: number) => requestCenter({ q, r, ttlMs: 3000 });

export function IslandLayer({ mapId }: { mapId: string }) {
  // Пока игра под заставкой входа, окна не всплывают: их увидят после неё.
  const covered = useSplashCovered();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const onIslandMap = isIslandMapId(mapId);
  const q = useIsland(onIslandMap || !!session.data?.isAdmin, onIslandMap);
  const island = q.data?.island ?? null;
  useStepToasts(island);
  const { onAck, busy } = useIslandAck();
  const done = new Set(island?.done ?? []);
  const here = !!island && onIslandMap && island.mapId === mapId;
  // Тур по замку — шаг «Войди в замок»; дальше по замку ведёт подсветка шагов.
  useCastleTour(here && island?.current === "x_castle", () => onAck("x_castle"));
  useGuideSpot(here ? (island?.current ?? null) : null, onAck);
  // Ачивки острова (§8.57): опрос вместе с островом, тост на новую ступень.
  const ach = useMyAchievements(here, here ? 4000 : false);
  useAchToasts(here ? ach.data?.counts : undefined);
  // Клетка цели шага — рамкой поверх тумана: «иди туда» (объект не открываем).
  const gq = here ? island?.target?.q : undefined;
  const gr = here ? island?.target?.r : undefined;
  useEffect(() => {
    setIslandGoal(gq === undefined || gr === undefined ? null : { q: gq, r: gr });
    return () => setIslandGoal(null);
  }, [gq, gr]);
  return (
    <>
      <IslandSpotlight />
      {island && !covered && windows()}
    </>
  );

  // Обычная функция, не компонент: компонент внутри рендера пересоздавался бы
  // на каждый опрос — и панель сворачивалась.
  function windows() {
    if (!island) return null;
    if (here && !done.has("hello")) {
      return <IslandDialog kind="hello" busy={busy} onClose={() => onAck("hello")} />;
    }
    if (here) {
      return (
        <IslandQuestPanel
          island={island}
          counts={ach.data?.counts ?? {}}
          onShow={showGoal}
          onAck={onAck}
          busy={busy}
        />
      );
    }
    if (!onIslandMap && island.finished && !done.has("final")) {
      return <IslandDialog kind="final" busy={busy} onClose={() => onAck("final")} />;
    }
    return null;
  }
}
