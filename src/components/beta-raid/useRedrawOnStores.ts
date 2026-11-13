// Сторы мимо React, по которым кадр карты перерисовывается (один кадр на
// событие): точки игроков, цель острова, полосы шахт, стройка шахты, рука,
// посадка деревьев, взрывы шахт, точки спавна режима бога. Вынесено из
// useMapRenderer (лимит строк).
import { useEffect } from "react";
import { subscribePlayerDots } from "./playerDots";
import { subscribeIslandGoal } from "./island/islandGoal";
import { subscribeMineBars } from "./mine-life/mineLifeStore";
import { subscribeMineBuild } from "./mine-build/mineBuildStore";
import { treePlacement } from "./tree-map/treePlacement";
import { subscribeHand } from "./hand/handStore";
import { subscribeMineBlasts } from "./mine-blast/mineBlastStore";
import { subscribeSpawnMarks } from "./spawn-point/spawnMarks";
import { subscribeLadder } from "./sight/ladderMode";

const STORES: Array<(fn: () => void) => () => void> = [
  subscribePlayerDots, // чужой шаг — без React
  subscribeIslandGoal, // цель шага острова сменилась
  subscribeMineBars, // полосы шахт пришли или подтаяли
  subscribeMineBuild, // призрак стройки сдвинулся, круг пришёл
  subscribeHand,
  (fn) => treePlacement.subscribe(fn),
  subscribeMineBlasts, // взрыв пришёл или пора сменить кадр анимации
  subscribeSpawnMarks, // точки спавна режима бога
  subscribeLadder, // лестница: подсветка целей
];

export function useRedrawOnStores(requestRedraw: () => void): void {
  useEffect(() => {
    const offs = STORES.map((subscribe) => subscribe(requestRedraw));
    return () => {
      for (const off of offs) off();
    };
  }, [requestRedraw]);
}
