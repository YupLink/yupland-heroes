// Обучение на острове — ОДНА проходка по порядку (владелец, 15.10.2026: «провести
// игрока полностью — он должен всё видеть и понимать»). Главы: карта, бой,
// инструменты, замок, развитие, выход.
//
// Шаг засчитывается одним из двух способов. «По факту» — сервер видит это на
// карте или в аккаунте (сундук открыт, артефакт забран, надет); засчитанное остаётся
// засчитанным. «Понятно» — шаг-объяснение: прочитал подсказку у подсвеченной
// кнопки (ackIsland). Как вести по интерфейсу — guidePaths на клиенте.
import type { Cell } from "@/lib/raid/worldgen/geo";

export const ISLAND_STEP_IDS = [
  "hello",
  // Карта
  "walk",
  "chest",
  "axe",
  "chop",
  // Бой
  "x_energy",
  "x_warriors",
  "slime",
  "x_satiety",
  // Инструменты
  "pickaxe",
  "crystal",
  "mine",
  "harvest",
  "shovel",
  "dig",
  // Замок
  "x_castle",
  "chips",
  "hero",
  "x_artifact",
  "art_take",
  "equip",
  "pack_boss",
  "pack_got",
  "x_pack",
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

export type IslandStepId = (typeof ISLAND_STEP_IDS)[number];

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
  "hero_chip",
  "grow_temple",
  "grow_tree",
  "grow_shop",
  "grow_bosses",
] as const satisfies readonly IslandStepId[];

export const isAckStep = (id: string): boolean => (ACK_STEPS as readonly string[]).includes(id);

export type IslandChapter = "map" | "battle" | "tools" | "castle" | "grow" | "exit";

/** Глава шага — подпись на панели. */
export function stepChapter(step: IslandStepId): IslandChapter {
  const i = ISLAND_STEP_IDS.indexOf(step);
  const at = (id: IslandStepId) => ISLAND_STEP_IDS.indexOf(id);
  if (i < at("x_energy")) return "map";
  if (i < at("pickaxe")) return "battle";
  if (i < at("x_castle")) return "tools";
  if (i < at("grow_temple")) return "castle";
  if (i < at("portal")) return "grow";
  return "exit";
}

/** Роли клеток острова: куда ведёт кнопка «Показать» у шага. */
export type IslandPlaces = {
  spawn: Cell;
  chest: Cell;
  workshop: Cell;
  trees: Cell[];
  /** Все боссы; первый — слизень задания (руда на кирку и лопату). */
  monsters: Cell[];
  /** Босс с артефактом и босс с тренировочным паком — случайные, не первый. */
  artifact: Cell | null;
  pack: Cell | null;
  crystals: Cell[];
  mine: Cell;
  treasure: Cell;
  /** Прочие клады (сверх главного со слитком); у старых островов — []. */
  digs: Cell[];
  /** Стартовая лодка на мелководье у берега; у старых островов — null. */
  /** Верфь у берега: корабль игрок строит сам (17.10.2026). */
  shipyard: Cell | null;
  portal: Cell;
  hall: Cell | null;
};

/** Куда смотреть на шаге; null — шаг не про клетку. */
export function stepTarget(step: IslandStepId, p: IslandPlaces): Cell | null {
  switch (step) {
    case "walk":
    case "chest":
      return p.chest;
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

/** Шаг есть на этом острове: у старых островов может не быть пака или артефакта. */
export function stepAvailable(step: IslandStepId, p: IslandPlaces): boolean {
  if (step === "x_artifact" || step === "art_take" || step === "equip") return p.artifact !== null;
  if (step === "pack_boss" || step === "pack_got" || step === "x_pack") return p.pack !== null;
  return true;
}

/** Текущий шаг — первый незасчитанный из доступных; всё засчитано — null. */
export function currentStep(done: ReadonlySet<string>, p?: IslandPlaces): IslandStepId | null {
  return ISLAND_STEP_IDS.find((s) => !done.has(s) && (!p || stepAvailable(s, p))) ?? null;
}

const isCell = (v: unknown): v is Cell => {
  const c = v as Cell | null;
  return !!c && Number.isInteger(c.q) && Number.isInteger(c.r);
};
const cells = (v: unknown): Cell[] => (Array.isArray(v) ? v.filter(isCell) : []);

/** Разбор ролей из базы (jsonb): мусор — пустые списки, без падения окна. */
export function parsePlaces(raw: unknown): IslandPlaces | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const one = ["spawn", "chest", "workshop", "mine", "treasure", "portal"] as const;
  if (!one.every((k) => isCell(o[k]))) return null;
  return {
    spawn: o.spawn as Cell,
    chest: o.chest as Cell,
    workshop: o.workshop as Cell,
    trees: cells(o.trees),
    monsters: cells(o.monsters),
    // Острова до 15.10: артефакт — у второго слизня, пак — у хомяка (или нет).
    artifact: isCell(o.artifact) ? o.artifact : (cells(o.monsters)[1] ?? null),
    pack: isCell(o.pack) ? o.pack : isCell(o.hamster) ? o.hamster : null,
    crystals: cells(o.crystals),
    mine: o.mine as Cell,
    treasure: o.treasure as Cell,
    digs: cells(o.digs),
    shipyard: isCell(o.shipyard) ? o.shipyard : null,
    portal: o.portal as Cell,
    hall: isCell(o.hall) ? o.hall : null,
  };
}
