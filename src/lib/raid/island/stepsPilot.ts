// Согласованный маршрут обучения (Ангелина и Кай, 26.10.2026) — пока только у
// тестового аккаунта (islandTester.isIslandTutorialPilot), у остальных прежний
// ISLAND_STEP_IDS. Отличия: «Фишки» в Тренировочном лагере сразу после первого
// пака, до топора и боя; после Таверны — уровень героя, комплекты, Ворота на
// свой остров и восемь достижений. Храма, «Героя из фишки», развития и портала
// в маршруте нет: портал по-прежнему ждёт 8/8 ачивок (island-exit).
import type { IslandChapter, IslandStepId } from "./steps";

/** Шаги только этого маршрута — все «Понятно» (ackIsland). */
export const PILOT_ONLY_STEPS = [
  "hero_level",
  "hero_sets",
  "return_island",
  "achievements",
] as const;
export type PilotOnlyStepId = (typeof PILOT_ONLY_STEPS)[number];

export const ISLAND_PILOT_STEP_IDS = [
  "hello",
  "hero_pick",
  "walk",
  "chest",
  "pack_got",
  "x_pack",
  "chips",
  "axe",
  "chop",
  "x_energy",
  "x_warriors",
  "slime",
  "slime_loot",
  "x_satiety",
  "pickaxe",
  "crystal",
  "mine",
  "harvest",
  "shovel",
  "dig",
  "x_castle",
  "hero",
  "hero_level",
  "hero_sets",
  "return_island",
  "achievements",
] as const satisfies readonly IslandStepId[];

/** Глава шага в маршруте теста: i — место шага, at — место опорного шага. */
export function pilotChapter(i: number, at: (id: IslandStepId) => number): IslandChapter {
  if (i < at("chips")) return "map";
  if (i < at("pickaxe")) return "battle";
  if (i < at("x_castle")) return "tools";
  if (i < at("return_island")) return "castle";
  return "exit";
}
