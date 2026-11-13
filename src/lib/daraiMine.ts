// Грибы — DARAI (бывшая DARAI-шахта), золотой и алмазный (владелец, 22.10.2026;
// ПРАВИЛА §8.62 п. 5, §8.65): общие правила клиента и сервера. Числа и
// узнавание видов — lib/mushroomKinds; ниже правила у всех видов одни, примеры
// — на грибе DARAI.
//
//  · Добыча — MUSHROOM_YIELD в час на гриб, каждый час отдельно, от минуты
//    размещения, только пока он стоит на карте и у него есть хозяин (из пула
//    карты, как у шахт). Ускорений нет: режимы — только у шахт v2, ярус у
//    грибов один.
//  · Жизнь — 7 суток от появления (building_config.diesAt), идёт всегда: на
//    карте с хозяином и без, в рюкзаке. Истекла — гриб исчезает отовсюду,
//    целые часы до конца — хозяину (maxHours клетки). Без хозяина из пула
//    ничего не списывается.
//  · Захвата нет: «Забрать в рюкзак» — любой, кроме хозяина, за
//    MUSHROOM_ENERGY энергии; раскиданные без хозяина — любой. Охраны нет.
//    Одно поднятие до размещения: поднявший снова поднять этот гриб не может,
//    пока его не поднимет и не разместит другой. Гриб — одна клетка.
//  · В рюкзаке грибы лежат стопкой своего вида (dmine:darai / dmine:gold /
//    dmine:diamonds; count = штук), как другие предметы; на сервере каждый
//    гриб — строка raid_dmine (mushroom — вид). Каждый
//    лежит не дольше DMINE_CARRY_MS: «выпадение» — автопостановка у героя
//    (dmine-autoplace) или конец жизни, что раньше; таймер ячейки — до
//    ближайшего. «Разместить» (MUSHROOM_ENERGY энергии) ставит гриб с
//    ближайшим выпадением. Выбросить, в мешочек/склад/сундук, продать — нельзя.

import type { Lang } from "@/lib/store";
import { dict as dmineDict } from "@/lib/translations/braid-dmine";
import { mushroomKindOf, mushroomKindOfStack, type MushroomKind } from "@/lib/mushroomKinds";

/** Префикс стопки рюкзака грибов. */
export const DMINE_PREFIX = "dmine:";

/** Стопка грибов DARAI в рюкзаке героя — одна на героя (count = штук). */
export const DMINE_STACK = "dmine:darai";

/** Вид строки рюкзака (raid_hero_backpack.kind) грибов. */
export const DMINE_KIND = "dmine";

/** Подпись стопки DARAI в базе; в интерфейсе — словарь (dmine.item). */
export const DMINE_ITEM_NAME = "Гриб DARAI";

/** Подписи стопок в базе по виду (облик на карте — то же имя). */
export const MUSHROOM_ITEM_NAMES: Record<MushroomKind, string> = {
  darai: DMINE_ITEM_NAME,
  gold: "Золотой гриб",
  diamonds: "Алмазный гриб",
};

/** Ключ словаря имени вида: dmine.item, dmine.item.gold, dmine.item.diamonds. */
export const mushroomNameKey = (kind: MushroomKind): string =>
  kind === "darai" ? "dmine.item" : `dmine.item.${kind}`;

/** Сколько гриб лежит в рюкзаке, пока не встанет сам (dmine-autoplace). */
export const DMINE_CARRY_MS = 60 * 60_000;

/** Добыча гриба в час, DARAI. */
export const MUSHROOM_YIELD = 10_000;

/** Энергия за «Забрать» и за «Разместить». */
export const MUSHROOM_ENERGY = 5;

/** Жизнь гриба от появления. */
export const MUSHROOM_LIFE_MS = 7 * 24 * 60 * 60_000;

/** Стопка — грибы любого вида (dmine:<вид>; прежние dmine:<id> — тоже). */
export const isDaraiMineKey = (stackKey: string | null | undefined): boolean =>
  typeof stackKey === "string" &&
  stackKey.startsWith(DMINE_PREFIX) &&
  stackKey.length > DMINE_PREFIX.length;

/**
 * Имя стопки в списках: гриб — по виду стопки (dmine:<вид>) на языке игрока,
 * а не русской подписью из базы; прочее — как есть.
 */
export const dmineNameOr = (
  stackKey: string | null | undefined,
  name: string,
  lang: Lang,
): string => {
  const kind = mushroomKindOfStack(stackKey);
  return kind ? (dmineDict[mushroomNameKey(kind)]?.[lang] ?? name) : name;
};

/**
 * Выпадение гриба из рюкзака (мс): час с минуты, когда он лёг в рюкзак, или
 * конец жизни — что раньше. diesAtMs null — жизни нет (строка до грибов).
 */
export const dmineDropAt = (takenAtMs: number, diesAtMs: number | null): number =>
  diesAtMs === null ? takenAtMs + DMINE_CARRY_MS : Math.min(takenAtMs + DMINE_CARRY_MS, diesAtMs);

/**
 * Ближайшее выпадение сменилось уже после своего срока (prevAt — прошлый срок,
 * at — нынешний, null — грибов нет): гриб встал у героя или исчез, возможно
 * позже перечитывания по таймеру — рюкзак, «Добыча» и флажки — сразу.
 */
export const dminePlacedLate = (
  prevAt: number | null,
  at: number | null,
  now = Date.now(),
): boolean => prevAt !== null && prevAt <= now && at !== prevAt;

/**
 * Таймер ячейки грибов: герой, вид (стопка), ближайшее выпадение, штук.
 * selected — герой выбран сейчас (рюкзак «по умолчанию»: склад, сундук, мешочек).
 */
export type DmineTimer = {
  heroId: string | null;
  selected: boolean;
  stackKey: string;
  expiresAt: number;
  count: number;
};

/**
 * Таймер ячейки: рюкзак этого героя (в замке смотрят любого своего), без
 * героя — выбранного; нет такого — null.
 */
export const pickDmineTimer = (
  timers: readonly DmineTimer[] | null | undefined,
  stackKey: string,
  heroId?: string | null,
): DmineTimer | null =>
  (timers ?? []).find(
    (x) => x.stackKey === stackKey && (heroId ? x.heroId === heroId : x.selected),
  ) ?? null;

/** Сколько осталось лежать в рюкзаке, мс (не меньше нуля). */
export const dmineLeftMs = (expiresAt: number, now = Date.now()): number =>
  Math.max(0, expiresAt - now);

/** «мм:сс» до выпадения (час и меньше — минуты помещаются в два знака). */
export function dmineClock(leftMs: number): string {
  const total = Math.max(0, Math.ceil(leftMs / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Настройка клетки — гриб DARAI (бывшая DARAI-шахта): метка mushroom или ресурс
 * token и токен Darai (регистр — как придётся). Грибы любого вида —
 * isMushroomConfig (lib/mushroomKinds).
 */
export const isDaraiMineConfig = (cfg: unknown): boolean => mushroomKindOf(cfg) === "darai";
