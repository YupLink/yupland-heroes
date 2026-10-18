// «Забрать сундук» (обычный): что ляжет в рюкзак и что — мешочком. Чистая
// арифметика без базы.
//
// Решение за владельца (29.09, ПРАВИЛА §8.22): сундук — первым, одна ячейка;
// нет под него места — отказ «освободи место». Содержимое — в то, что осталось
// после сундука, сколько влезет (та же формула места, что у склада и выдачи:
// bagRoom — долив в свою неполную ячейку, зелья только в сумку). Влез вид
// целиком — берём его точно (девять знаков), не влез — тысячные вниз.
// Остальное — мешочком на этой клетке по правилам мешочков (§8.21), до
// последней крошки: из сундука не пропадает ничего.
import type { LootPick } from "@/lib/magicChest";
import type { PlainChestSlot } from "@/lib/plainChest";
import { exactQty } from "@/lib/warehouseCells";
import {
  bagRoom,
  floor3,
  planLoot,
  type BagCaps,
  type BagStack,
} from "@/server/api/beta-raid/chest/chest-loot-plan";
import {
  cellsFor,
  withAdded,
  type PickupRow,
} from "@/server/api/beta-raid/chest/chest-pickup-plan";
import type { BaggedRow } from "@/server/api/beta-raid/loot-bag/bag-leftover-sql";

export type { BaggedRow };

/** Ячейка сундука в снимке: всё, чтобы положить её в рюкзак или в мешочек. */
export type SnapSlot = PlainChestSlot & { itemId: string | null; potion: boolean };

/** Снимок одним запросом: сундук, рюкзак, ячейки и их отпечатки. */
export type PlainSnap = {
  chest: {
    id: string;
    itemId: string;
    name: string;
    image: string | null;
    potion: boolean;
    buried: boolean;
  } | null;
  bag: BagStack[];
  slots: SnapSlot[];
  bagFp: string;
  slotFp: string;
};

export type PlainPlan = {
  /** Сундук влезает; нет — need/free для отказа. */
  fits: boolean;
  need: number;
  free: number;
  /** Строки рюкзака одной записью: сундук и то, что влезло. */
  rows: PickupRow[];
  taken: LootPick[];
  bagged: BaggedRow[];
};

/** Отпечаток подтверждения: цифры годятся ровно к этому рюкзаку и сундуку. */
export const sigOf = (snap: Pick<PlainSnap, "bagFp" | "slotFp">): string =>
  `${snap.bagFp}.${snap.slotFp}`;

export const chestKeyOf = (itemId: string): string => `custom:${itemId}`;

/** План по снимку. Сундука нет — пустой и не влезающий (вызывающий ответит раньше). */
export function plainPlan(snap: PlainSnap, caps: BagCaps): PlainPlan {
  const { chest } = snap;
  const empty = { rows: [], taken: [], bagged: [] };
  if (!chest) return { fits: false, need: 0, free: 0, ...empty };
  const chestKey = chestKeyOf(chest.itemId);
  const potions = new Set(snap.slots.filter((s) => s.potion).map((s) => s.stackKey));
  if (chest.potion) potions.add(chestKey);

  const reserve: LootPick[] = [{ stackKey: chestKey, qty: 1 }];
  const held = planLoot(reserve, snap.bag, caps, potions);
  if (!held.some((h) => h.stackKey === chestKey && h.qty >= 1)) {
    return { fits: false, ...cellsFor(snap.bag, reserve, potions, caps), ...empty };
  }

  // Содержимое — по ячейкам сундука, каждой — сколько влезет после прежних.
  const stacks = withAdded(snap.bag, reserve, potions);
  const taken: LootPick[] = [];
  for (const s of snap.slots) {
    const cur = stacks.find((x) => x.stackKey === s.stackKey);
    const potion = cur?.potion ?? potions.has(s.stackKey);
    const room = bagRoom(stacks, s.stackKey, potion, caps);
    const qty = s.count <= room ? exactQty(s.count) : floor3(room);
    if (!(qty > 0)) continue;
    taken.push({ stackKey: s.stackKey, qty });
    if (cur) cur.count = exactQty(cur.count + qty);
    else stacks.push({ stackKey: s.stackKey, count: qty, potion });
  }

  const rows: PickupRow[] = [
    {
      k: chestKey,
      kind: "custom",
      ref: chest.itemId,
      item: chest.itemId,
      name: chest.name,
      image: chest.image,
      qty: 1,
      loot: 0,
    },
  ];
  const got = new Map(taken.map((t) => [t.stackKey, t.qty]));
  const bagged: BaggedRow[] = [];
  for (const s of snap.slots) {
    const qty = got.get(s.stackKey) ?? 0;
    const row = { kind: s.kind, ref: s.refId, item: s.itemId, name: s.name, image: s.image };
    // Один ключ — одна строка: вставка с ON CONFLICT не тронет строку дважды.
    const same = rows.find((x) => x.k === s.stackKey);
    if (qty > 0 && same) same.qty = exactQty(same.qty + qty);
    else if (qty > 0) rows.push({ k: s.stackKey, ...row, qty, loot: 0 });
    // Сундук общий и меток не хранит — в мешочек безымянным (loot 0).
    const left = exactQty(s.count - qty);
    if (left > 0) bagged.push({ k: s.stackKey, ...row, n: left, loot: 0 });
  }
  return { fits: true, need: 0, free: 0, rows, taken, bagged };
}
