// Слой острова над картой: приветствие при первом входе, панель проходки на
// острове, подсветка кнопок шага, рамка клетки цели и окно «ты в основном
// мире» после портала.
// Спрашивает сервер только на острове и у админов (тест) — остальным игрокам
// слой ничего не стоит.
import { useCastleMode } from "../castleMode";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import type { MapStore } from "../mapStore";
import { ISLAND_DECOR, ISLAND_OBJECTS } from "@/lib/raid/island/catalog";
import type { IslandPlaces, IslandStepId } from "@/lib/raid/island/steps";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { myTrainingChips } from "@/server/api/hallway";
import { myChipInventory } from "@/server/api/chips-pack";
import { readRememberedLineup, rememberLineup } from "../useRememberedLineup";
import { getSession } from "@/server/api/user-auth";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { isCreatorMapId } from "@/lib/raid/creator/ids";
import { useSplashCovered } from "@/components/game/splashPolicy";
import { IslandQuestPanel } from "./IslandQuestPanel";
import { IslandDialog } from "./IslandDialog";
import { useHoldLetters } from "@/components/letters/letterHold";
import { IslandHeroPick, useIslandHeroPick } from "./IslandHeroPick";
import { useIsland, useIslandAck, useStepToasts } from "./useIsland";
import { IslandSpotlight } from "./IslandSpotlight";
import { useIslandViewProgress } from "./useIslandViewProgress";
import { useGuideSpot } from "./useGuideSpot";
import { setIslandGoal } from "./islandGoal";
import { useMyAchievements } from "@/components/achievements/useMyAchievements";
import { useAchToasts } from "@/components/achievements/useAchToasts";
import { requestCenter } from "../centerMapBus";

type Point = { q: number; r: number };

/** Show the nearest available lesson cell that the server actually credits.
 * The portal treasure remains a fixed target. */
function nearestLessonTarget(
  step: IslandStepId | null,
  player: Point | null,
  store: MapStore,
  places: IslandPlaces,
  seen: { has(key: string): boolean },
  visible: { has(key: string): boolean },
): Point | null {
  if (step !== "chop" && step !== "crystal" && step !== "slime") return null;
  if (!player) return null;
  let nearest: Point | null = null;
  let distance = Infinity;
  let hiddenNearest: Point | null = null;
  let hiddenDistance = Infinity;
  const lessonCells =
    step === "chop" ? places.trees : step === "crystal" ? places.crystals : places.monsters;
  const credited = new Set(lessonCells.map(({ q, r }) => `${q},${r}`));
  for (let index = 0; index < store.packed.q.length; index += 1) {
    const q = store.packed.q[index];
    const r = store.packed.r[index];
    const key = `${q},${r}`;
    if (!credited.has(key)) continue;
    const available =
      step === "chop"
        ? store.decorationId(index) === ISLAND_DECOR.oak
        : step === "crystal"
          ? store.decorationId(index) === ISLAND_DECOR.stone
          : store.objectId(index) === ISLAND_OBJECTS.slime && !store.dead.has(index);
    if (!available) continue;
    const dq = q - player.q;
    const dr = r - player.r;
    const steps = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
    if (!seen.has(key) && !visible.has(key)) {
      if (steps < hiddenDistance) {
        hiddenDistance = steps;
        hiddenNearest = { q, r };
      }
      continue;
    }
    if (steps < distance) {
      distance = steps;
      nearest = { q, r };
    }
  }
  return nearest ?? hiddenNearest;
}

/** «Показать» — камера к клетке даже сквозь туман, рамка горит 3 с. */
const showGoal = (q: number, r: number) => requestCenter({ q, r, ttlMs: 3000, preservePan: true });

export function IslandLayer({
  mapId,
  playerPos,
  store,
  seen,
  visible,
}: {
  mapId: string;
  playerPos: Point | null;
  store: MapStore;
  seen: { has(key: string): boolean };
  visible: { has(key: string): boolean };
}) {
  // Пока игра под заставкой входа, окна не всплывают: их увидят после неё.
  const covered = useSplashCovered();
  const castle = useCastleMode();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  // Мир креатора (isle_cw_…) — не остров новичка: проходки нет (панель мира —
  // студия режима бога, AdminPanels → creator/CreatorStudio).
  const creatorWorld = isCreatorMapId(mapId);
  const onIslandMap = isIslandMapId(mapId) && !creatorWorld;
  const q = useIsland(onIslandMap || !!session.data?.isIslandTester, onIslandMap);
  const island = q.data?.island ?? null;
  const tutorialPilot = !!island?.pilot;
  const qc = useQueryClient();
  useEffect(() => {
    const starter = island?.starterLineup;
    if (!island?.places.lesson || !starter?.length || readRememberedLineup().length) return;
    let cancelled = false;
    // Обновить источник пикера ДО запоминания состава: старый пустой кэш не
    // должен тут же вырезать только что выданные тренировочные фишки.
    void Promise.all([
      qc.fetchQuery({
        queryKey: ["my-training-chips"],
        queryFn: () => myTrainingChips(),
        staleTime: 0,
      }),
      qc.fetchQuery({
        queryKey: ["my-chip-inventory"],
        queryFn: () => myChipInventory(),
        staleTime: 0,
      }),
    ])
      .then(() => {
        if (!cancelled && !readRememberedLineup().length) rememberLineup(starter);
      })
      .catch(() => {
        /* следующий опрос повторит подготовку, состав не подделываем */
      });
    return () => {
      cancelled = true;
    };
  }, [island?.mapId, island?.starterLineup, qc]);
  useStepToasts(island);
  const { onAck, onViewAck, busy } = useIslandAck();
  useIslandViewProgress(island, onViewAck);
  const done = new Set(island?.done ?? []);
  const here = !!island && onIslandMap && island.mapId === mapId;
  useHoldLetters("island", here);
  // This small lesson is tied to the island replay, without changing server
  // rewards or the order of recorded gameplay steps.
  const backpackKey = island?.mapId ? `beta-raid:island-backpack-intro:${island.mapId}` : null;
  const [backpackSeen, setBackpackSeen] = useState<string | null>(null);
  let storedBackpackSeen = false;
  try {
    storedBackpackSeen = !!backpackKey && window.localStorage.getItem(backpackKey) === "1";
  } catch {
    // The session still works without persistent browser storage.
  }
  const woodKey = island?.mapId ? `beta-raid:island-wood-intro-v2:${island.mapId}` : null;
  const [woodSeen, setWoodSeen] = useState<string | null>(null);
  let storedWoodSeen = false;
  try {
    storedWoodSeen = !!woodKey && window.localStorage.getItem(woodKey) === "1";
  } catch {
    // The session still works without persistent browser storage.
  }
  const woodIntro = !!(
    here &&
    !island?.places.lesson &&
    !island?.skipped &&
    done.has("chop") &&
    (island?.current === "x_energy" ||
      island?.current === "x_warriors" ||
      island?.current === "slime") &&
    woodSeen !== island?.mapId &&
    !storedWoodSeen
  );
  const backpackIntro = !!(
    here &&
    !island?.places.lesson &&
    tutorialPilot &&
    island?.current === "x_pack" &&
    backpackSeen !== island?.mapId &&
    !storedBackpackSeen &&
    !storedWoodSeen
  );
  useEffect(() => {
    if ((!backpackIntro && !woodIntro) || !island?.mapId) return;
    const markOpened = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".raid-quick-access--backpack")
      )
        return;
      try {
        if (backpackKey) window.localStorage.setItem(backpackKey, "1");
      } catch {
        /* session only */
      }
      setBackpackSeen(island.mapId);
    };
    document.addEventListener("pointerdown", markOpened);
    return () => document.removeEventListener("pointerdown", markOpened);
  }, [backpackIntro, woodIntro, backpackKey, island?.mapId]);
  const markWoodViewed = () => {
    if (!island?.mapId) return;
    try {
      if (woodKey) window.localStorage.setItem(woodKey, "1");
    } catch {
      /* session only */
    }
    setWoodSeen(island.mapId);
  };
  useGuideSpot(
    here
      ? island?.current === "chest_backpack" && island.chestPending
        ? "chest_collect"
        : woodIntro
          ? "wood_backpack"
          : backpackIntro
            ? "backpack"
            : (island?.current ?? null)
      : null,
    onAck,
    markWoodViewed,
    !!island?.places.lesson,
  );
  // Герой-подарок острова: выбор расы — после приветствия.
  const heroPick = useIslandHeroPick(here && (done.has("hello") || !!island?.skipped));
  // Ачивки острова (§8.57): опрос вместе с островом, тост на новую ступень.
  const ach = useMyAchievements(here, here ? 4000 : false);
  useAchToasts(here ? ach.data?.counts : undefined);
  // Use a nearby credited lesson resource or slime. The portal treasure stays fixed.
  const target =
    here &&
    island &&
    (island.current === "chop" || island.current === "crystal" || island.current === "slime")
      ? nearestLessonTarget(island.current, playerPos, store, island.places, seen, visible)
      : (island?.target ?? null);
  const gq = here ? target?.q : undefined;
  const gr = here ? target?.r : undefined;
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
    if (here && !island.skipped && !done.has("hello")) {
      const leadToTavern = !!island.places.lesson && done.has("hero_pick");
      return (
        <IslandDialog
          kind="hello"
          busy={busy}
          tutorialPilot={tutorialPilot}
          leadToTavern={leadToTavern}
          onClose={() => {
            onAck("hello");
            const hall = island.places.hall;
            if (leadToTavern && hall) showGoal(hall.q, hall.r);
          }}
        />
      );
    }
    const options = heroPick.data?.need ? heroPick.data.options : [];
    if (here && options.length > 0)
      return (
        <IslandHeroPick
          options={options}
          skipped={island.skipped}
          tutorialPilot={tutorialPilot}
          onContinue={
            island.places.lesson && island.places.hall && castle?.enterAt
              ? () => {
                  const h = island.places.hall!;
                  void castle.enterAt!(h.q, h.r).catch(() =>
                    toast.error("Не удалось открыть замок. Нажми на ратушу и попробуй ещё раз."),
                  );
                }
              : undefined
          }
        />
      );
    if (here) {
      return (
        <IslandQuestPanel
          island={island}
          targetOverride={target}
          backpackIntro={backpackIntro}
          woodIntro={woodIntro}
          counts={ach.data?.counts ?? {}}
          onShow={showGoal}
          onAck={onAck}
          busy={busy}
          tutorialPilot={tutorialPilot}
        />
      );
    }
    if (!isIslandMapId(mapId) && island.finished && !done.has("final")) {
      return <IslandDialog kind="final" busy={busy} onClose={() => onAck("final")} />;
    }
    return null;
  }
}
