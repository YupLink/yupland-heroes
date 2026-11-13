// Предметы с карты — сразу в рюкзак, что не влезло — мешочком на клетке
// (владелец, 29.09.2026; ПРАВИЛА §8.21).
//
// Зовут выдачи объектов карты (сундуки, монетки, кучки — encounter-rewards),
// боссов (encounter-payout: мешочек у босса, даже если игрок далеко) и рубки
// декора (decor-interact). Валюты, ресурсы счёта, паки и артефакты сюда не
// идут — они по-прежнему ждут в «Добыче».
//
// Порядок: товар сводится в стопки рюкзака (groupItems), место считает общая
// арифметика рюкзака (bagRoom), кладёт depositToBackpack — атомарно, со своей
// проверкой места и ключом `bp:<ключ выпадения>:<стопка>`: повтор моста второй
// раз не положит. Остаток — одним мешочком с id от ключа выпадения (dropSql):
// повтор не уронит второй. Любой отказ записи разрешает «забор»
// (bag-deliver-parts): выдача или мешочек либо уже есть, либо не появятся
// никогда, — штуки лежат ровно в одном месте. Мешочек точно не упал — остаток
// в «Добычу» (toQueue): не пропадёт. Нет выбранного героя — всё в мешочек.
//
// Бросает, только если ничего не изменилось: вызывающий тогда откатывает
// (декор, strict) или кладёт всё в «Добычу» (queueAll). Строка «Добычи» — с
// ключом `<ключ выпадения>:q<номер предмета>` (id от ключа, повтор — ничего):
// повтор моста и запасной путь второй строки не положат. После первого
// изменения сбой пишется в лог — откат поверх выданного дал бы дюп.
import { publishRaid } from "@/server/raidLive";
import { exactQty } from "@/lib/warehouseCells";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { loadBag } from "@/server/api/beta-raid/chest/chest-net-read";
import { originSplit, type OriginQty } from "@/server/api/beta-raid/stack-origin";
import type { BagStack, DropPlace } from "@/server/api/beta-raid/loot-bag/bag-sql";
import {
  dropBag,
  groupItems,
  heroless,
  putFit,
  type DropItem,
  type Group,
  type Indexed,
} from "@/server/api/beta-raid/loot-bag/bag-deliver-parts";

export type { DropItem } from "@/server/api/beta-raid/loot-bag/bag-deliver-parts";

/** Остаток меньше тысячной мешочком не роняем — пыль округления. */
const DUST = 0.001;

/** По товару: в рюкзак, мешочком, в «Добычу» (нет в справочнике / мешочек не упал). */
export type DropRow = { itemId: string; toBackpack: number; dropped: number; queued: number };
export type DropResult = { items: DropRow[]; bagId: string | null };

type Pair = { row: DropRow; item: Indexed };

/** Ключ строки «Добычи» для предмета номер i этой выдачи (общий с queueAll). */
export const queueKey = (key: string, i: number): string => `${key}:q${i}`;

/** Легшее в рюкзак — товарам стопки по порядку; остальное — в мешочек. */
function spread(g: Group, fit: number, drop: boolean): Pair[] {
  let left = fit;
  return g.items.map((item) => {
    const toBackpack = exactQty(Math.min(item.amount, left));
    left = exactQty(left - toBackpack);
    const dropped = drop ? exactQty(item.amount - toBackpack) : 0;
    return { item, row: { itemId: item.itemId, toBackpack, dropped, queued: 0 } };
  });
}

/** Стопка мешочка из стопки выдачи: count штук с метками marks. */
const stackOf = (g: Group, count: number, marks: OriginQty): BagStack => ({
  stackKey: g.stackKey,
  kind: g.kind,
  refId: g.refId,
  itemId: g.itemId,
  name: g.name,
  image: g.image,
  count,
  marks,
});

/**
 * Выдать предметы: в рюкзак выбранного героя (owner — кошелёк или аккаунт),
 * остаток — мешочком на клетке `at`. toQueue — «Добыча» (бросает — не встало).
 */
export async function deliverOrDrop(o: {
  owner: string;
  account: string;
  items: readonly DropItem[];
  at: Omit<DropPlace, "account">;
  /** «Добыча» с ключом строки (queueKey); бросает — не встало. */
  toQueue: (item: DropItem, key: string) => Promise<void>;
  /** Ничего не выдано и мешочек не упал — бросить (декор откатится), а не в «Добычу». */
  strict?: boolean;
  /** Мимо рюкзака — всё мешочком (находка лопатой: «открывать самому», §8.24 п. 6б). */
  bagOnly?: boolean;
}): Promise<DropResult> {
  const result: DropResult = { items: [], bagId: null };
  const { groups, bad } = await groupItems(o.items);
  const bp = groups.length > 0 && !o.bagOnly ? await resolveBackpack(o.owner) : null;
  // «Героя нет» — только проверенное: сбой чтения бросает, пока ничего не выдано.
  if (groups.length > 0 && !bp && !o.bagOnly && !(await heroless(o.account))) {
    throw new Error("loot-bag: hero unreadable");
  }
  // Снимок рюкзака для расчёта места; не прочитался — кладём целиком, место
  // проверит сама выдача (отказ — в мешочек).
  const bag = bp ? await loadBag(bp.heroId).catch(() => null) : null;
  let changed = false;
  const fail = (e: unknown, what: string) => {
    if (!changed) throw e;
    console.error(`[loot-bag] ${what} после выданного:`, o.at.key, e);
  };
  const pairs: Pair[] = [];
  const stacks: BagStack[] = [];
  for (const g of groups) {
    let fit = 0;
    try {
      const nonce = `${o.at.key}:${g.stackKey}`;
      fit = bp ? await putFit({ bp, account: o.account, bag, g, nonce }) : 0;
    } catch (e) {
      // Исход этой стопки неизвестен (база не ответила и на «забор»): её не
      // роняем (могла лечь), остальные стопки — своим чередом.
      fail(e, "выдача в рюкзак: исход неизвестен");
      continue;
    }
    changed ||= fit > 0;
    const left = exactQty(g.count - fit);
    pairs.push(...spread(g, fit, left >= DUST));
    if (left >= DUST) stacks.push(stackOf(g, left, originSplit(g.marks, fit, exactQty)[1]));
  }

  // В «Добычу»: товара нет в справочнике, и остаток, если мешочек точно не упал.
  const badPairs: Pair[] = bad.map((item) => ({
    item,
    row: { itemId: item.itemId, toBackpack: 0, dropped: 0, queued: 0 },
  }));
  const queue = [...badPairs];
  if (stacks.length > 0) {
    let id: string | null | undefined;
    try {
      id = await dropBag({ ...o.at, account: o.account }, stacks);
    } catch (e) {
      fail(e, "мешочек: исход неизвестен");
    }
    if (id) {
      result.bagId = id;
      changed = true;
      publishRaid({
        mapId: o.at.mapId,
        type: "bags",
        cells: [`${Math.floor(o.at.q)},${Math.floor(o.at.r)}`],
      });
      const { startLootBagSweeper } = await import("@/server/api/beta-raid/loot-bag/bag-sweep");
      startLootBagSweeper();
    } else {
      if (id === null && o.strict && !changed) throw new Error("bag.drop_failed");
      for (const p of pairs) {
        if (id === null && p.row.dropped > 0) {
          queue.push({ row: p.row, item: { ...p.item, amount: p.row.dropped } });
        }
        p.row.dropped = 0;
      }
    }
  }
  for (const q of queue) {
    try {
      const { i, ...item } = q.item;
      await o.toQueue(item, queueKey(o.at.key, i));
      q.row.queued = exactQty(q.row.queued + q.item.amount);
      changed = true;
    } catch (e) {
      fail(e, "«Добыча» не приняла");
    }
  }
  result.items = [...pairs, ...badPairs].map((p) => p.row);
  return result;
}
