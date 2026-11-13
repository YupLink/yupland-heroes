// Динамит (владелец, 22–23.10.2026). Общие правила сервера и клиента.
//
//  · Предмет — свой товар из админки «Динамит (1 Lv)» (cst_cpsl1cy0hpd7), в
//    рюкзаке стопка custom:<id>. У стопки кнопка «Бросить» / «Throw».
//  · Бросок — на клетку в радиусе 3 от героя (своя и три круга), 100 энергии.
//    Энергия, минус штука и взрыв — одна транзакция (migrations/dynamite-01);
//    повтор того же нажатия второй раз не взрывает и не платит.
//  · Взрыв — 7 клеток: клетка падения и шесть соседних.
//  · Сносит шахты v2, у которых жизнь кончилась (срок вышел или ничья после
//    поломки; ничья с жизнью — нет), как «Разобрать», без мешочка 30 %; бьёт мобов,
//    боссов, беглецов и охрану шахт и сундуков на 10 % МАКСИМАЛЬНОГО здоровья
//    (10 динамитов — полный), рвёт ДЕРЕВЬЯ — то, что рубят топором (владелец
//    25.10.2026: «красный для деревьев, синий для гор»), — их добыча мешочком на
//    их клетке. Город, купол, грибы и прочее — не трогает.
//  · Синий динамит (владелец, 25.10.2026; cst_hionm0xz40lz «Синий динамит (1 Lv)»):
//    бросок тот же (радиус 3, 100 энергии), взрыв — ОДНА клетка. Шахта: охрана есть —
//    охраны нет (и у алмазной); иначе уровень −1, на первом — разрушена (руины);
//    алмазная — только охрана. Грибы не трогает («ни один динамит не сносит грибы»).
//    Мобы −10 %; рвёт горы, камни, преграды (кирка), деревья — нет («красный для
//    дерева, синий для гор»). Корабли клетки (26.10.2026) — разрушены, экипаж — в
//    свой основной город (dynamite-crew-home); красный корабли не трогает. Свой
//    корабль (владелец — бросивший) синий не взрывает (30.10.2026: «только чужой»), а
//    клетка, где кроме своего корабля задеть нечего, — отказ dynamite.own_ship.
//  · Красный в воду (30.10.2026) — рыбалка: каждая клетка воды взрыва бросает шанс
//    удочки, всплывшая рыба — мешочек-рыба (lib/raid/dynamiteFish). Вода в круге
//    броска — цель красного (значок рыбы), как дерево или моб.
import { PLACE_DIRS } from "@/lib/plainChest";
import { hexDist } from "@/lib/mineBuild";
import { MINE_PLACE_BUILDING } from "@/lib/minePlacement";
import type { DecorLabel } from "@/lib/raid/decorInteract";
import { isAxeTool, isPickTool } from "@/lib/tournament/metricSources";

/** Вид динамита: красный — 7 клеток, синий — одна клетка и свои правила на шахте. */
export type DynamiteKind = "red" | "blue";

/** Свои товары-динамиты (id из админки) и их вид. */
const DYNAMITE_KINDS: Readonly<Record<string, DynamiteKind>> = {
  cst_cpsl1cy0hpd7: "red",
  cst_hionm0xz40lz: "blue",
};
export const DYNAMITE_ITEM_IDS: readonly string[] = Object.keys(DYNAMITE_KINDS);

/** Цена броска в энергии. */
export const DYNAMITE_ENERGY = 100;
/** Дальность броска: своя клетка и три круга вокруг героя. */
export const DYNAMITE_RADIUS = 3;
/** Один взрыв снимает 1/10 максимального здоровья (10 %): 10 динамитов — полный. */
export const DYNAMITE_HP_PARTS = 10;

/**
 * Город (не трогается): само городское здание (у большого — весь блок) и один круг вокруг
 * (владелец, 26.10.2026: «само здание + радиус 1 клетки»; dynamite-04). Ратуша — так же.
 */
export const DYNAMITE_TOWN_RADIUS = 1;
/** Городские постройки — тот же список, что у генератора миров (worldgen/learn-sql). */
export const DYNAMITE_TOWN_EFFECTS: readonly string[] = [
  "tavern",
  "warehouse",
  "chambers",
  "boost",
  "museum",
  "university",
  "market",
  "spellbook",
];

type Hex = { q: number; r: number };

/** Ключ стопки рюкзака динамита. */
export const dynamiteStackKey = (id: string): string => `custom:${id}`;

/** Вид динамита стопки рюкзака; не динамит — null. */
export function dynamiteKindOf(stackKey: string | null | undefined): DynamiteKind | null {
  if (typeof stackKey !== "string" || !stackKey.startsWith("custom:")) return null;
  return DYNAMITE_KINDS[stackKey.slice("custom:".length)] ?? null;
}

/** Стопка рюкзака — динамит. */
export const isDynamiteKey = (stackKey: string | null | undefined): boolean =>
  dynamiteKindOf(stackKey) !== null;

/** Клетка в радиусе броска от героя. */
export const inThrowRange = (hero: Hex, at: Hex): boolean => hexDist(hero, at) <= DYNAMITE_RADIUS;

/** Клетки взрыва: красный — клетка падения и шесть соседних, синий — одна клетка. */
export const blastCells = (at: Hex, kind: DynamiteKind = "red"): Hex[] =>
  kind === "blue"
    ? [{ q: at.q, r: at.r }]
    : PLACE_DIRS.map((d) => ({ q: at.q + d.dq, r: at.r + d.dr }));

/** Сколько здоровья снимает взрыв: 10 % максимума вверх, не меньше 1 (SQL — так же). */
export const dynamiteDamage = (maxHp: number): number =>
  Math.max(1, Math.ceil(Math.max(0, Number(maxHp) || 0) / DYNAMITE_HP_PARTS));

/**
 * Смещения окна броска рядами сверху вниз (гексы «остриём вверх»): ряд dr от −3
 * до 3, в ряду dq слева направо — 4·5·6·7·6·5·4 = 37 клеток.
 */
export function throwRows(radius = DYNAMITE_RADIUS): Array<Array<{ dq: number; dr: number }>> {
  const rows: Array<Array<{ dq: number; dr: number }>> = [];
  for (let dr = -radius; dr <= radius; dr++) {
    const row: Array<{ dq: number; dr: number }> = [];
    for (let dq = Math.max(-radius, -dr - radius); dq <= Math.min(radius, -dr + radius); dq++)
      row.push({ dq, dr });
    rows.push(row);
  }
  return rows;
}

/** Декор под взрывом: дерево (рубят топором) или гора, камень, преграда (добывают киркой). */
export type BlastDecorClass = "tree" | "rock";

/**
 * Класс декора: действие «Срубить» / Chop или без надписи (окно рубки пишет «Срубить»),
 * «Добыть» / «Добывать» / «Разрушить» / Mine; иное («Выжать») — null, не рвётся. Дерево
 * или гора — по инструментам шаблона (кирка — гора, топор — дерево), без них — по надписи.
 */
export function blastDecorClass(
  label: DecorLabel | null | undefined,
  tools: readonly (string | null | undefined)[] = [],
): BlastDecorClass | null {
  const ru = (label?.ru ?? "").trim().toLowerCase();
  const en = (label?.en ?? "").trim().toLowerCase();
  const chop = (!ru && !en) || ru.startsWith("сруб") || en === "chop";
  const rock = ru.startsWith("добы") || ru.startsWith("разруш") || en === "mine";
  if (!chop && !rock) return null;
  if (tools.some(isPickTool)) return "rock";
  if (tools.some(isAxeTool)) return "tree";
  return chop ? "tree" : "rock";
}

/** Рвёт ли взрыв этот декор: красный — деревья, синий — горы и камни (владелец 25.10.2026). */
export const dynamiteBreaksDecor = (kind: DynamiteKind, cls: BlastDecorClass | null): boolean =>
  cls !== null && cls === (kind === "blue" ? "rock" : "tree");

/** Вид шахты для анимации взрыва (её рисует проигрыватель шахт). */
export type MineBlastKind = "stone" | "gold" | "diamonds" | "sawmill" | "other";

/** Шаблон постройки Архитектора → вид взрыва (те же шаблоны, что у набора mine-art). */
const BLAST_BY_BUILDING = new Map<string, MineBlastKind>([
  [MINE_PLACE_BUILDING.wood, "sawmill"],
  [MINE_PLACE_BUILDING.stone, "stone"],
  [MINE_PLACE_BUILDING.gold, "gold"],
  [MINE_PLACE_BUILDING.diamonds, "diamonds"],
]);

/**
 * Вид взрыва — по шаблону постройки, не по ресурсу: анимация есть только у
 * четырёх шаблонов Архитектора (лесопилка, каменная, золотая, алмазная). Шахта
 * с обликом и все прочие (энерго-шахта, «Банк» и т. п.) — «other», без анимации.
 */
export function mineBlastKind(
  buildingId: string | null | undefined,
  skinId?: string | null,
): MineBlastKind {
  if (skinId || !buildingId) return "other";
  return BLAST_BY_BUILDING.get(buildingId) ?? "other";
}

/** Что взрыв заденет на клетке (значки в окне броска). */
export type DynamiteHit = "mine" | "ship" | "mob" | "tree" | "fish" | null;

/** Клетка окна броска: смещение от героя, можно ли и почему нет, что там. */
export type DynamiteCell = {
  dq: number;
  dr: number;
  ok: boolean;
  /** Ключ словаря отказа (dynamite.*), если нельзя. */
  reason: string | null;
  hit: DynamiteHit;
  /** Синий: здесь мой корабль — живой список причалов не делает его целью. */
  ownShip?: true;
};

/** Признаки клетки из базы (dynamite-cells). null — клетки нет на карте. */
export type DynamiteCellFlags = {
  dome: boolean;
  town: boolean;
  mine: boolean;
  mob: boolean;
  tree: boolean;
  /** Синий: на клетке чужой или ничей корабль — его взорвёт. */
  ship?: boolean;
  /** Синий: на клетке мой корабль (владелец — я) — его не тронет. */
  ownShip?: boolean;
  /** Красный: клетка — вода, взрыв ловит рыбу (30.10.2026). */
  water?: boolean;
};

/** Признаки → можно ли бросить и почему нет (то же отвечает бросок). */
export function dynamiteVerdict(f: DynamiteCellFlags | null): string | null {
  if (!f) return "dynamite.no_cell";
  if (f.dome) return "dynamite.void";
  if (f.town) return "dynamite.town";
  // Синий: кроме своего корабля задеть нечего — не бросаем (сто энергии впустую).
  if (f.ownShip && !f.ship && !f.mine && !f.mob && !f.tree) return "dynamite.own_ship";
  return null;
}

/** Главное, что заденет на клетке: шахта, корабль, цель, дерево, потом вода (рыба). */
export function hitOf(f: DynamiteCellFlags | null): DynamiteHit {
  if (!f || f.town || f.dome) return null;
  if (f.mine) return "mine";
  if (f.ship) return "ship";
  return f.mob ? "mob" : f.tree ? "tree" : f.water ? "fish" : null;
}

/** Итог взрыва для окна и тоста; у синего — что стало с шахтами и грибами. */
export type DynamiteSummary = {
  mines: number;
  hits: number;
  kills: number;
  decor: number;
  guardsOff?: number;
  levelsDown?: number;
  broken?: number;
  /** Синий: взорвано кораблей. */
  ships?: number;
  /** Красный в воду: всплыло рыб (башмак тоже всплывает рыбой). */
  fish?: number;
};

/** Строка тоста по итогу: что снесено и задето; ничего — «ничего не задело». */
export function summaryParts(
  s: DynamiteSummary,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const parts = [
    s.guardsOff ? t("dynamite.part_guards_off", { n: s.guardsOff }) : "",
    s.levelsDown ? t("dynamite.part_levels", { n: s.levelsDown }) : "",
    s.broken ? t("dynamite.part_broken", { n: s.broken }) : "",
    s.ships === 1 ? t("dynamite.part_ship") : "",
    (s.ships ?? 0) > 1 ? t("dynamite.part_ships", { n: s.ships ?? 0 }) : "",
    s.mines > 0 ? t("dynamite.part_mines", { n: s.mines }) : "",
    s.hits > 0 ? t("dynamite.part_hits", { n: s.hits }) : "",
    s.kills > 0 ? t("dynamite.part_kills", { n: s.kills }) : "",
    s.decor > 0 ? t("dynamite.part_decor", { n: s.decor }) : "",
    s.fish ? t("dynamite.part_fish", { n: s.fish }) : "",
  ].filter(Boolean);
  return parts.length ? `${t("dynamite.done")}: ${parts.join(" · ")}` : t("dynamite.done_empty");
}
