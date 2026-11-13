// Обучение на острове — ОДНА проходка по порядку (владелец, 15.10.2026: «провести
// игрока полностью — он должен всё видеть и понимать»). Главы: карта, бой,
// инструменты, замок, развитие, выход.
//
// Шаг засчитывается одним из двух способов. «По факту» — сервер видит это на
// карте или в аккаунте (сундук открыт, артефакт забран, надет); засчитанное остаётся
// засчитанным. «Понятно» — шаг-объяснение: прочитал подсказку у подсвеченной
// кнопки (ackIsland). Как вести по интерфейсу — guidePaths на клиенте.
import { SHORT_STEP_IDS, type ShortStepId, type ShortLesson } from "./shortTutorial";
import type { Cell } from "@/lib/raid/worldgen/geo";
import {
  ISLAND_PILOT_STEP_IDS,
  PILOT_ONLY_STEPS,
  pilotChapter,
  type PilotOnlyStepId,
} from "./stepsPilot";

export const ISLAND_STEP_IDS = [
  "hello",
  // Герой в подарок — окно выбора расы сразу после приветствия (20.10); шаг
  // засчитан, когда герой острова выбран (раз на аккаунт). В списке — чтобы
  // порядок шагов шёл за действиями игрока (25.10, пробный выпуск обучения).
  "hero_pick",
  // Карта. Паки из первого сундука — до боёв (владелец, 20.10.2026: «нужно
  // открыть паки — и только потом идти бить боссов, иначе не будет фишек»).
  "walk",
  "chest",
  "pack_got",
  "x_pack",
  "axe",
  "chop",
  // Бой
  "x_energy",
  "x_warriors",
  "slime",
  // Награда за слизня ЭТОГО острова забрана из «Добычи» (26.10, Ангелина):
  // лайки и шансы — в «Добыче», руда — сразу в рюкзаке (island-facts).
  "slime_loot",
  "x_satiety",
  // Инструменты. Лопата и клад — до лесопилки (владелец, 20.10.2026): починка
  // стоит 20 золота — 10 из сундука и 10 за слиток из главного клада.
  "pickaxe",
  "crystal",
  "shovel",
  "dig",
  "mine",
  "harvest",
  // Замок
  "x_castle",
  "chips",
  "hero",
  "x_artifact",
  "art_take",
  "equip",
  "pack_boss",
  "hero_chip",
  // Развитие: Храм — первым, игрок ещё в замке после «Герой из фишки».
  "grow_temple",
  "grow_tree",
  "grow_shop",
  "grow_bosses",
  // Выход
  "portal",
  "leave",
] as const;

/** Плюс шаги маршрута тестового аккаунта, которых нет в общем (stepsPilot.ts). */
export type IslandStepId = (typeof ISLAND_STEP_IDS)[number] | PilotOnlyStepId | ShortStepId | "short_finish";

// Маршрут тестового аккаунта (Ангелина/Кай, 26.10) — stepsPilot.ts.
export { ISLAND_PILOT_STEP_IDS } from "./stepsPilot";

/** Шаги-объяснения: засчитываются кнопкой «Понятно» (остальные — по факту). */
export const ACK_STEPS = [
  "hello",
  "x_energy",
  "x_warriors",
  "x_satiety",
  "harvest",
  "x_castle",
  "chips",
  "hero",
  ...PILOT_ONLY_STEPS,
  "hero_chip",
  "grow_temple",
  "grow_tree",
  "grow_shop",
  "grow_bosses",
  "chest_backpack",
  "short_finish",
] as const satisfies readonly IslandStepId[];

export const isAckStep = (id: string): boolean => (ACK_STEPS as readonly string[]).includes(id);

export type IslandChapter = "map" | "battle" | "tools" | "castle" | "grow" | "exit";

/** Глава шага — подпись на панели. */
export function stepChapter(
  step: IslandStepId,
  order: readonly IslandStepId[] = ISLAND_STEP_IDS,
): IslandChapter {
  const i = order.indexOf(step);
  const at = (id: IslandStepId) => order.indexOf(id);
  if (order === SHORT_STEP_IDS) {
    if (step === "hello" || step === "hero_pick" || step === "hero") return "castle";
    if (i < at("axe")) return "map";
    if (i < at("boat")) return "battle";
    return "exit";
  }
  if (order === ISLAND_PILOT_STEP_IDS) return pilotChapter(i, at);
  if (i < at("x_energy")) return "map";
  if (i < at("pickaxe")) return "battle";
  if (i < at("x_castle")) return "tools";
  if (i < at("grow_temple")) return "castle";
  if (i < at("portal")) return "grow";
  return "exit";
}

/** Роли клеток острова: куда ведёт кнопка «Показать» у шага. */
export type IslandPlaces = {
  /** Новый короткий маршрут; старые острова сохраняют прежнюю проходку. */
  lesson?: ShortLesson;
  spawn: Cell;
  chest: Cell;
  workshop: Cell;
  trees: Cell[];
  /** Все боссы; первый — слизень задания (руда на кирку и лопату). */
  monsters: Cell[];
  /**
   * Босс с артефактом и босс с паком — у островов до 20.10; у новых null:
   * артефакт и пак падают с любого босса с шансом (drops.ts).
   */
  artifact: Cell | null;
  pack: Cell | null;
  crystals: Cell[];
  /** Лесопилка — цель шага «Шахта». */
  mine: Cell;
  /** Шахты камня, золота и алмазов (ISLAND_EXTRA_MINES); у старых островов — []. */
  mines: Cell[];
  treasure: Cell;
  /** Прочие клады (сверх главного со слитком); у старых островов — []. */
  digs: Cell[];
  /** Стартовая лодка на мелководье у берега; у старых островов — null. */
  /** Верфь у берега: корабль игрок строит сам (17.10.2026). */
  shipyard: Cell | null;
  /**
   * В первом сундуке лежит подарок острова с паками (20.10). Нет — аккаунт его
   * уже получал (или остров старше): шаги «забери добычу / открой паки» — по
   * паку с босса, если он есть.
   */
  gift: boolean;
  portal: Cell;
  hall: Cell | null;
};

/** Куда смотреть на шаге; null — шаг не про клетку. */
export function stepTarget(step: IslandStepId, p: IslandPlaces): Cell | null {
  switch (step) {
    case "walk":
    case "chest":
      return p.chest;
    case "boat":
      return p.shipyard;
    case "sail":
      return p.lesson?.shore ?? null;
    case "spell":
      return p.lesson?.pillar ?? p.lesson?.shore ?? null;
    case "sell":
    case "axe":
    case "pickaxe":
    case "shovel":
      return p.workshop;
    case "chop":
      return p.trees[0] ?? null;
    case "x_warriors":
    case "slime":
      return p.monsters[0] ?? null;
    case "crystal":
      return p.crystals[0] ?? null;
    case "mine":
    case "harvest":
      return p.mine;
    case "dig":
      return p.treasure;
    case "portal":
    case "leave":
      return p.portal;
    // Обучалка ведёт до конца (владелец, 15.10.2026): «Показать» — к боссу с
    // артефактом и к боссу с паком (клетка рамкой в тумане), а не «найди сам».
    case "x_artifact":
      return p.artifact;
    case "pack_boss":
      return p.pack;
    // Шаги в замке: замок открывается у ратуши острова.
    case "x_castle":
    case "hero_level":
    case "hero_sets":
    case "return_island":
    case "chips":
    case "hero":
    case "equip":
    case "x_pack":
    case "hero_chip":
    case "grow_temple":
    case "grow_shop":
      return p.hall;
    default:
      return null;
  }
}

/**
 * Шаг есть на этом острове. Артефакт и «найди пак» — только у островов с
 * призами на боссах (до 20.10); паки из первого сундука — у всех.
 */
export function stepAvailable(step: IslandStepId, p: IslandPlaces): boolean {
  if (step === "x_artifact" || step === "art_take" || step === "equip") return p.artifact !== null;
  if (step === "pack_boss") return p.pack !== null;
  if (step === "pack_got" || step === "x_pack") return p.gift || p.pack !== null;
  return true;
}

/**
 * Шаг ждёт своей очереди: без подарка в сундуке пак даёт только босс с паком —
 * «забери / открой пак» тогда после победы над ним, как было до 20.10.
 */
const waits = (s: IslandStepId, done: ReadonlySet<string>, p: IslandPlaces) =>
  !p.gift && (s === "pack_got" || s === "x_pack") && !done.has("pack_boss");

/** Текущий шаг — первый незасчитанный из доступных; всё засчитано — null. */
export function currentStep(
  done: ReadonlySet<string>,
  p?: IslandPlaces,
  order: readonly IslandStepId[] = ISLAND_STEP_IDS,
): IslandStepId | null {
  return (
    order.find((s) => !done.has(s) && !(order === SHORT_STEP_IDS && done.has(`skip:${s}`)) && (!p || (stepAvailable(s, p) && !waits(s, done, p)))) ?? null
  );
}

// Разбор ролей из базы — parsePlaces.ts (вынесен, чтобы файл не рос за 250 строк).
export { parsePlaces } from "./parsePlaces";


/**
 * Порядок определяет сервер; существующий остров сам по себе не сбрасывается.
 * Короткое — у острова с уроком (places.lesson): с 11.11 такие создаются всем
 * (island_short); прежние острова без урока идут прежним маршрутом.
 */
export const islandTutorialOrder = (pilot: boolean, p: IslandPlaces) =>
  p.lesson ? SHORT_STEP_IDS : pilot ? ISLAND_PILOT_STEP_IDS : ISLAND_STEP_IDS;
