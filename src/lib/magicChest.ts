// Магический сундук — общий контракт сервера и окна: типы и арифметика сети.
//
// Правила владельца (27–30.09.2026, четвёртая редакция с поправками; ПРАВИЛА §8.15):
//  1. Вид один — «Магический сундук»: предмет, занимает ячейку рюкзака,
//     продаётся как кастомный товар; поставить может любой герой.
//  2. Хранилище (сеть) одно на игрока, 10 ячеек, общее для всех его сундуков;
//     достал из одного — сразу меньше везде (одна таблица).
//  3. Охрана — по желанию: босс из рюкзака. Пока она жива, чужой сначала
//     бьётся; победа ничего не забирает сама.
//  4. Живой охраны нет — чужой «Открывает» сундук за энергию (§8.23), видит
//     сеть хозяина, берёт из неё выбранное (метка «собрано прочее») и кладёт
//     в неё собранное (30.09) — положенное становится сетью хозяина.
//     «Разграбить» и захвата больше нет.
//  5. «Забрать сундук» — хозяин: в рюкзак вместе с целой охраной (раненая
//     исчезает), нет места — отказ. Чужой (без живой охраны): сундук
//     открепляется от сети хозяина; нет места — падает мешочком. Последний
//     сундук хозяина: его содержимое — тому, кто забрал (в рюкзак, сколько
//     влезет, остальное — мешочком на клетке, §8.21); сама сеть никому не
//     переходит — у хозяина она пустеет; не пропадает ничего.
//  6. Закопать (лопатой, только без живой охраны) может любой (30.09);
//     закопанный не открыть, не обокрасть и не забрать; для «последнего» он
//     стоит.
//  7. Класть можно ВСЁ собранное, кроме купленного (§8.18).
import { CELL_SIZE, roundQty, stackCells } from "@/lib/warehouseCells";

/** Ячеек в сети игрока — одна сеть на все его сундуки. */
export const CHEST_NET_CELLS = 10;

export { CELL_SIZE };

/** Стек сети (одна строка raid_chest_slot). */
export type ChestSlot = {
  stackKey: string;
  kind: string;
  name: string;
  image: string | null;
  count: number;
};

/** Сундук на клетке глазами смотрящего: свой или чужой. Ключ словаря — "q,r". */
export type ChestMark = {
  mine: boolean;
  image: string | null;
  name: string;
  /** Обычный сундук (lib/plainChest): хозяина нет, открывается как склад. */
  plain?: boolean;
};
export type ChestMarks = Record<string, ChestMark>;

/** Стек рюкзака глазами сундука: сколько штук вообще и сколько можно положить. */
export type ChestBackpackStack = {
  stackKey: string;
  kind: string;
  name: string;
  image: string | null;
  count: number;
  /** Собранное и не изношенное — только это ляжет в сундук; 0 — стек неактивен. */
  movable: number;
  /** То же, что movable, прежним именем — для вкладок, открытых до v30 (убрать после выката). */
  mob?: number;
};

/** Живой охранник клетки сундука — полный вид для окна (HP, урон, способности). */
export type ChestGuardView = {
  name: string;
  image: string | null;
  background: string | null;
  maxHp: number;
  currentHp: number;
  damage: string | null;
  abilities: Array<{
    kind: string;
    chance: number;
    value: string | number;
    duration: string | number;
  }>;
};

/** Окно владельца: сеть + рюкзак выбранного героя. */
export type ChestNetView = {
  cells: number;
  used: number;
  slots: ChestSlot[];
  backpack: {
    heroName: string | null;
    capacity: number;
    occupied: number;
    stacks: ChestBackpackStack[];
  };
  /** Охранник на клетке этого сундука; null — не стоит. */
  guard?: ChestGuardView | null;
  /**
   * Вход не оплачен (29.09, ПРАВИЛА §8.23): сети и рюкзака в ответе нет, price —
   * цена «Открыть» (энергия = занятые ячейки сети, не меньше 1; lib/openPass).
   */
  locked?: boolean;
  price?: number;
  /** Смотрит чужой (29–30.09): берёт из сети хозяина и кладёт в неё собранное. */
  foreign?: boolean;
};

/**
 * Итог захвата: id добычи в журнале и что ушло победителю в «Добычу» —
 * сундук первым (без срока), за ним товары сети (24 часа).
 */
export type ChestSeized = { plunderId: string; items: ChestSlot[] };

/**
 * «Забрать сундук» глазами окна подтверждения. taken/bagged — товары сети:
 * последний сундук кладёт их в рюкзак после самого сундука и охраны, не
 * влезшее — мешочком на клетке. Не последний — сеть не трогается, списки пусты.
 */
export type ChestPickupView = {
  last: boolean;
  /** Сам сундук: имя и картинка для строки «в рюкзак» (или «в мешочек»). */
  chest: { name: string; image: string | null };
  /** Целая охрана (полное HP) — вернётся в рюкзак вместе с сундуком. */
  guard: { name: string; image: string | null } | null;
  /** Охрана ранена — не вернётся, исчезнет вместе с сундуком. */
  guardWounded?: boolean;
  /** Забирает чужой: сундук уходит из сети хозяина. */
  foreign?: boolean;
  /** Сундук не влез к чужому — ляжет мешочком на клетке. */
  chestBagged?: boolean;
  /** Под сундук (и охрану) в рюкзаке есть место; нет — need/free для отказа. */
  fits: boolean;
  need: number;
  free: number;
  /** Сеть целиком: имена и картинки для списков. */
  slots: ChestSlot[];
  taken: LootPick[];
  /** Не влезло в рюкзак — мешочком на этой клетке (§8.21). */
  bagged?: LootPick[];
  /** Прежнее «пропадёт» (до 29.09) — теперь всегда пусто: окно, открытое до выката. */
  lost: LootPick[];
  /** Отпечаток цифр: подтверждение годится ровно к ним. */
  sig?: string;
};

/**
 * Итог «Забрать сундук»: вернулась ли (целая) охрана, что из сети легло в
 * рюкзак и что — мешочком; chestBagged — сам сундук лёг мешочком (чужой без
 * места). lost — прежнее поле, всегда пусто.
 */
export type ChestPickupResult = {
  guard: boolean;
  taken: LootPick[];
  bagged?: LootPick[];
  chestBagged?: boolean;
  lost: LootPick[];
};

/**
 * Совместимость со второй редакцией (выбор добычи из журнала грабежа): новые
 * захваты сюда не пишут — добыча сразу в «Добыче». Держим для старых записей.
 */
export type ChestLootView = {
  plunderId: string;
  ownerName: string | null;
  slots: ChestSlot[];
  backpack: {
    capacity: number;
    occupied: number;
    /** Сколько того же вида уже лежит у меня: долив в неполную ячейку бесплатен. */
    have: Record<string, number>;
  };
};

/** Невыбранная добыча второй редакции (совместимость, см. ChestLootView). */
export type PendingLoot = {
  plunderId: string;
  ownerName: string | null;
  at: string;
  /** Сколько видов лежит в добыче (вместе с сундуком). */
  kinds: number;
};

/** Выбор грабителя: сколько какого стека забрать. Остальное пропадёт. */
export type LootPick = { stackKey: string; qty: number };

/** Итог грабежа: что уехало в рюкзак и что пропало. */
export type PlunderResult = {
  taken: LootPick[];
  lost: LootPick[];
};

/** Собранных штук в стеке: не больше, чем лежит (купленное тратится первым). */
export const collectedUnits = (count: number, collected: number): number =>
  roundQty(Math.max(0, Math.min(count, collected)));

/** Занято ячеек сети. */
export const netUsed = (slots: readonly Pick<ChestSlot, "count">[]): number =>
  slots.reduce((s, x) => s + stackCells(x.count), 0);

/**
 * Сколько единиц вида ещё влезет в сеть: остаток своей ячейки + свободные
 * ячейки целиком. same — сколько этого вида уже лежит.
 */
export function netRoomFor(
  slots: readonly Pick<ChestSlot, "stackKey" | "count">[],
  stackKey: string,
  cells = CHEST_NET_CELLS,
): number {
  const same = slots.find((s) => s.stackKey === stackKey)?.count ?? 0;
  const free = Math.max(0, cells - netUsed(slots));
  const tail = stackCells(same) * CELL_SIZE - same;
  return roundQty(tail + free * CELL_SIZE);
}

/** Выбор, урезанный до того, что реально лежит в сети (гонка с владельцем). */
export function clampPicks(picks: readonly LootPick[], slots: readonly ChestSlot[]): LootPick[] {
  const left = new Map(slots.map((s) => [s.stackKey, s.count]));
  const out: LootPick[] = [];
  for (const p of picks) {
    const avail = left.get(p.stackKey) ?? 0;
    const qty = roundQty(Math.min(Math.max(0, p.qty), avail));
    if (qty <= 0) continue;
    left.set(p.stackKey, roundQty(avail - qty));
    out.push({ stackKey: p.stackKey, qty });
  }
  return out;
}
