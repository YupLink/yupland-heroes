// Рынок героев: куда едут карманы выставленного героя (владелец, 22.10.2026;
// ПРАВИЛА §8.67 п. 3) — чистая арифметика без базы, общая для превью окна
// «Выставить» и для самого выставления.
//
// «При размещении героя на маркет — его ресы из рюкзака переносятся в рюкзак
// основного героя, но если не помещаются — вываливаются на землю».
//
//  · Место — та же формула, что у забора из мешочка и с выдачи с карты
//    (bagRoom = roomFor + backpackRoomFor: долив в свою ячейку, новые ячейки
//    сверх ёмкости — нет; зелья — только в сумку зелий и строго). Стопки идут
//    по очереди, каждая тратит место следующих (как planLoot).
//  · Порядок: начатые инструменты первыми (не влезут — начатая штука сгорит),
//    потом прочее по ключу стопки, грибы последними (не влезший гриб не
//    пропадает — встаёт на карту сам, и добыча у него идёт только на карте).
//  · Начатый инструмент (износ > 0): влезает целиком — едет с износом; влезает
//    штука или больше — основному часть вместе с начатой штукой, целые — в
//    мешочек; меньше штуки — вся стопка как «Выбросить» (bag-discard-sql):
//    начатая сгорает (порции мешочка износа не хранят), целые — в мешочек.
//  · Гриб — только целиком: сколько влезло — в рюкзак основного; остальные
//    «выпадают» прямо сейчас — как по истечении часа в рюкзаке
//    (dmine-autoplace: встаёт на клетку героя или рядом и работает у игрока).
//
// Числа — до девяти знаков (exactQty), часть стопки — тысячные вниз (floor3),
// как у прочих переносов «сколько влезет».
import { bagRoom, floor3, type BagStack } from "@/server/api/beta-raid/chest/chest-loot-plan";
import { exactQty } from "@/lib/warehouseCells";
import { isDaraiMineKey } from "@/lib/daraiMine";
import { mushroomKindOfStack, type MushroomKind } from "@/lib/mushroomKinds";

/** Стопка в карманах выставляемого героя. */
export type PocketRow = {
  stackKey: string;
  kind: string;
  refId: string | null;
  name: string;
  count: number;
  /** Износ начатой штуки, % (0 — целый или не инструмент). */
  wear: number;
  /** Зелье: место — в сумке зелий основного. */
  potion: boolean;
};

/** Рюкзак основного героя: ёмкости (resolveBackpack) и что в нём лежит. */
export type MainBag = {
  heroId: string;
  capacity: number;
  potionCapacity: number;
  stacks: BagStack[];
};

/** Судьба стопки: основному, в мешочек, сгорит (как «Выбросить»), гриб встанет сам. */
export type PocketLine = PocketRow & { main: number; bag: number; burn: number; plant: number };

/** Ушло основному герою (для окна и итога). */
export type PocketMove = {
  stackKey: string;
  kind: string;
  name: string;
  qty: number;
  /** Начатый инструмент — едет с износом. */
  worn: boolean;
};

/** Не влезло основному: qty = bag + burn + plant. */
export type PocketDrop = PocketMove & {
  /** Ляжет в мешочек на клетке игрока — там, где стоит основной (24 ч на порцию). */
  bag: number;
  /** Сгорит: начатая штука инструмента (как «Выбросить»). */
  burn: number;
  /** Грибы: встанут на карту у героя сами (как через час в рюкзаке). */
  plant: number;
};

/** Стопка — грибы (гриб без основного героя выставлению мешает: dmine_no_main). */
export const isMush = (r: Pick<PocketRow, "stackKey" | "kind">): boolean =>
  r.kind === "dmine" || isDaraiMineKey(r.stackKey);

/** Очередь: начатые инструменты, прочее, грибы. */
const rank = (r: PocketRow): number => (isMush(r) ? 2 : r.wear > 0 ? 0 : 1);

/** Сколько единиц стопки уйдёт основному при room свободного места под неё. */
function fitOf(r: PocketRow, room: number): number {
  if (!(r.count > 0) || !(room > 0)) return 0;
  if (r.count <= room) return r.count;
  if (isMush(r)) return Math.floor(room + 1e-9);
  const part = floor3(room);
  // Начатая штука едет только с частью не меньше штуки (как частичный «Выбросить»).
  return r.wear > 0 && part < 1 ? 0 : part;
}

function lineOf(r: PocketRow, main: number): PocketLine {
  if (isMush(r)) return { ...r, main, bag: 0, burn: 0, plant: exactQty(r.count - main) };
  if (main > 0 || !(r.wear > 0))
    return { ...r, main, bag: exactQty(r.count - main), burn: 0, plant: 0 };
  // «Выбросить» целиком: начатая штука сгорает, целые — в мешочек.
  const bag = exactQty(Math.max(0, r.count - 1));
  return { ...r, main: 0, bag, burn: exactQty(r.count - bag), plant: 0 };
}

/**
 * Разложить карманы: каждой стопке — сколько основному (по месту после
 * предыдущих), остальное — мешочком / сгорит / гриб встанет сам. Основного нет —
 * всё «не влезло»: мешочком на клетку игрока (грибам без основного пути нет —
 * выставление откажет dmine_no_main).
 */
export function planPockets(rows: readonly PocketRow[], main: MainBag | null): PocketLine[] {
  const stacks = (main?.stacks ?? []).map((s) => ({ ...s }));
  const order = [...rows].sort(
    (a, b) => rank(a) - rank(b) || (a.stackKey < b.stackKey ? -1 : a.stackKey > b.stackKey ? 1 : 0),
  );
  return order.map((r) => {
    const room = main ? bagRoom(stacks, r.stackKey, r.potion, main) : 0;
    const k = fitOf(r, room);
    if (k > 0) {
      const cur = stacks.find((s) => s.stackKey === r.stackKey);
      if (cur) cur.count = exactQty(cur.count + k);
      else stacks.push({ stackKey: r.stackKey, count: k, potion: r.potion });
    }
    return lineOf(r, k);
  });
}

const moveOf = (l: PocketLine, qty: number): PocketMove => ({
  stackKey: l.stackKey,
  kind: l.kind,
  name: l.name,
  qty,
  worn: l.wear > 0,
});

/** Что уйдёт основному. */
export const movesOf = (lines: readonly PocketLine[]): PocketMove[] =>
  lines.filter((l) => l.main > 0).map((l) => moveOf(l, l.main));

/** Что не влезет: не пусто — нужно согласие игрока (окно «выпадет в мешочек»). */
export const dropsOf = (lines: readonly PocketLine[]): PocketDrop[] =>
  lines
    .filter((l) => l.bag > 0 || l.burn > 0 || l.plant > 0)
    .map((l) => ({
      ...moveOf(l, exactQty(l.bag + l.burn + l.plant)),
      bag: l.bag,
      burn: l.burn,
      plant: l.plant,
    }));

/** 53-битный хэш строки (cyrb53) — короткий и одинаковый на любом процессе. */
function hash53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Ключ согласия на окно «выпадет»: хэш того, что именно не влезает (стопка,
 * мешочек, сгорит, встанет сам — по ключу стопки). Игрок соглашается на
 * показанный список: выпадает уже другое — ключ другой, согласия нет.
 * Выпадать нечему — пустая строка (согласие не нужно).
 */
export function dropsKey(drops: readonly PocketDrop[]): string {
  if (drops.length === 0) return "";
  const parts = drops
    .map((d) => `${d.stackKey}|${exactQty(d.bag)}|${exactQty(d.burn)}|${exactQty(d.plant)}`)
    .sort();
  return `dk_${hash53(parts.join(";"))}`;
}

/** Строка плана для базы: основному, сгорит, гриб встанет сам; мешочек база считает остатком. */
type PlanLine = { main: number; bag: number; burn: number; plant: number; mushroom?: MushroomKind };

/** План для hero_market_list (p_plan): строки по ключу стопки и час «выпадения» грибов. */
export function planJson(
  lines: readonly PocketLine[],
  carrySec: number,
): { carry: number; lines: Record<string, PlanLine> } {
  const out: Record<string, PlanLine> = {};
  for (const l of lines) {
    const mushroom = isMush(l) ? (mushroomKindOfStack(l.stackKey) ?? "darai") : undefined;
    out[l.stackKey] = {
      main: l.main,
      bag: l.bag,
      burn: l.burn,
      plant: l.plant,
      ...(mushroom ? { mushroom } : {}),
    };
  }
  return { carry: Math.round(carrySec), lines: out };
}
