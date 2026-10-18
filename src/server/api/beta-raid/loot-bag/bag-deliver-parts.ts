// Части выдачи с карты (bag-deliver.ts): товар — в стопки рюкзака, «положить
// сколько влезет» и «уронить мешочек» — у каждой свой «забор» на сбой базы,
// чтобы штуки оказались ровно в одном месте. Вынесено ради лимита ≤250 строк.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { exactQty } from "@/lib/warehouseCells";
import {
  depositToBackpack,
  stackKeyFor,
  type BagCaps,
} from "@/server/api/beta-raid/market-backpack";
import { canonCustomMeta } from "@/server/api/beta-raid/item-alias";
import { potionKeysOf } from "@/server/api/beta-raid/potion-bag";
import { bagRoom, floor3 } from "@/server/api/beta-raid/chest/chest-loot-plan";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import {
  NO_ORIGIN,
  originAdds,
  originPlus,
  originSplit,
  type StackOrigin,
} from "@/server/api/beta-raid/stack-origin";
import {
  dropFenceSql,
  dropSql,
  type BagStack,
  type DropPlace,
} from "@/server/api/beta-raid/loot-bag/bag-sql";
import { fenceSql } from "@/server/api/beta-raid/loot-bag/bag-back-sql";

/** Предмет награды: свой товар (cst_…), сколько и с какой меткой. */
export type DropItem = { itemId: string; amount: number; origin: StackOrigin | null };

/** Предмет с номером в списке награды — из номера ключ его строки «Добычи». */
export type Indexed = DropItem & { i: number };

/** Стопка выдачи: вид по канону, сколько и метки (сумма по наградам этого вида). */
export type Group = BagStack & { itemId: string; items: Indexed[] };

type RoomStack = { stackKey: string; count: number; potion: boolean };

/**
 * Товар награды → стопки рюкзака. Два id, сведённые связкой в один вид, — одна
 * стопка (иначе у них был бы один ключ выдачи и вторая «прошла» бы впустую).
 * Нет в справочнике — в `bad`: выдать нечего.
 */
export async function groupItems(
  items: readonly DropItem[],
): Promise<{ groups: Group[]; bad: Indexed[] }> {
  const groups = new Map<string, Group>();
  const bad: Indexed[] = [];
  for (const [i, raw] of items.entries()) {
    const amount = exactQty(Number(raw.amount) || 0);
    const it = { ...raw, amount, i };
    if (!it.itemId || !(amount > 0)) continue;
    const meta = await canonCustomMeta(it.itemId);
    if (!meta) {
      bad.push(it);
      continue;
    }
    const name = meta.name || it.itemId;
    const kind = "custom";
    const stackKey = await stackKeyFor({ id: it.itemId, kind, refId: it.itemId, name });
    const add = it.origin ? originAdds(amount, it.origin) : { ...NO_ORIGIN };
    const cur = groups.get(stackKey);
    if (cur) {
      cur.count = exactQty(cur.count + amount);
      cur.marks = originPlus(cur.marks, add, exactQty);
      cur.items.push(it);
      continue;
    }
    const one = { itemId: it.itemId, refId: it.itemId, name, image: meta.image, count: amount };
    groups.set(stackKey, { ...one, stackKey, kind, marks: add, items: [it] });
  }
  return { groups: [...groups.values()], bad };
}

/**
 * Положить в рюкзак сколько влезет; снимок рюкзака (bag) правится, чтобы
 * следующая стопка считала место честно. Отказ выдачи любой (место заняли,
 * сбой базы) — «забор»: выдача либо прошла (ответ потерялся), либо уже не
 * пройдёт никогда — и опоздавшая попытка моста ничего не положит. Бросает, только
 * если исход неизвестен (упал и «забор»).
 */
export async function putFit(o: {
  bp: BagCaps;
  account: string;
  bag: RoomStack[] | null;
  g: Group;
  nonce: string;
}): Promise<number> {
  const { bp, bag, g } = o;
  const mine = bag?.find((s) => s.stackKey === g.stackKey);
  let fit = g.count;
  // Зелье ли — не прочиталось: место не считаем, решит сама выдача (атомарно).
  const potion = mine?.potion ?? (await potionKeysOf([g.stackKey]).catch(() => null))?.has(g.stackKey);
  if (bag && potion !== undefined) {
    const room = bagRoom(bag, g.stackKey, potion, bp);
    fit = g.count <= room ? g.count : floor3(room);
  }
  if (!(fit > 0)) return 0;
  try {
    await depositToBackpack({
      heroId: bp.heroId,
      account: o.account,
      item: { id: g.itemId, kind: "custom", refId: g.refId, name: g.name, image: g.image },
      qty: fit,
      nonce: o.nonce,
      capacity: bp.capacity,
      potionCapacity: bp.potionCapacity,
      // Помеченное — первым в рюкзак (originSplit), остаток меток — мешочку.
      origin: originSplit(g.marks, fit, exactQty)[0],
    });
  } catch (e) {
    const row = sqlRow<{ blocked: boolean }>(
      (await mcpExec(fenceSql(bp.heroId, o.nonce))) as unknown[],
    );
    if (row?.blocked === true) return 0;
    if (row?.blocked !== false) throw e;
  }
  if (mine) mine.count += fit;
  else bag?.push({ stackKey: g.stackKey, count: fit, potion: potion === true });
  return fit;
}

/**
 * Героя у аккаунта правда нет — а не база не ответила (resolveBackpack сбой
 * чтения глотает и отвечает «нет героя»). Сбой — бросок: добыча не должна
 * упасть мешочком на общую клетку из-за мигнувшего моста.
 */
export async function heroless(account: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT EXISTS (SELECT 1 FROM yuplink.hero_instance h
                     WHERE h.account_id = ${sqlStr(account)} AND h.selected_at IS NOT NULL) AS has;`,
    { wrapJson: true },
  )) as Array<{ has: boolean }>;
  if (typeof rows?.[0]?.has !== "boolean") throw new Error("loot-bag: hero check unreadable");
  return !rows[0].has;
}

/**
 * Уронить мешочек. id — лежит (этим вызовом или прошлым, чей ответ
 * потерялся), null — точно нет и уже не будет (надгробие dropFenceSql).
 * Уронили не сейчас (повтор, ответ не разобрался, сбой) — решает «забор».
 * Бросает, только если исход неизвестен.
 */
export async function dropBag(at: DropPlace, stacks: BagStack[]): Promise<string | null> {
  try {
    const row = sqlRow<{ id: string; fresh: boolean }>(
      (await mcpExec(dropSql(at, stacks))) as unknown[],
    );
    if (row?.fresh === true) return row.id;
  } catch (e) {
    console.warn("[loot-bag] мешочек без ответа — решит забор:", at.key, e);
  }
  const row = sqlRow<{ id: string; real: boolean }>(
    (await mcpExec(dropFenceSql(at))) as unknown[],
  );
  if (typeof row?.real !== "boolean") throw new Error("loot-bag: drop fence unreadable");
  return row.real ? row.id : null;
}
