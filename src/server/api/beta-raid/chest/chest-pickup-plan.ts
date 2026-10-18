// «Забрать сундук» (магический): что ляжет в рюкзак и что — мешочком. Чистая
// арифметика без базы.
//
// Правила владельца (29.09.2026, четвёртая редакция, ПРАВИЛА §8.15):
//  • хозяин — сундук в рюкзак выбранного героя (одна ячейка), охрана тоже, но
//    только целая, на полном HP: раненая исчезает, ячейку под неё не держим.
//    Нет места под сундук (и охрану) — отказ;
//  • чужой (живой охраны нет) — сундук открепляется от сети хозяина; нет места
//    под сундук — сундук падает мешочком на клетке (снят всё равно);
//  • последний сундук хозяина уносит всю его сеть: товары — в то, что осталось
//    после сундука и охраны («собрано прочее»), не влезшее — мешочком на
//    клетке (§8.21, метка едет с ним). Не пропадает ничего — ни у хозяина, ни
//    у чужого (дополнение №3 владельца: асимметрии больше нет).
//
// Влез вид целиком — берём его точно (девять знаков), не влез — тысячные вниз,
// остаток до крошки — в мешочек. План считается по снимку одного запроса
// (chest-pickup-snap-sql), запись одним оператором сверяет отпечатки
// (chest-pickup-sql): снимок устарел — план заново. Формула места — та же, что
// у склада и выдачи (bagRoom).
import type { ChestSlot, LootPick } from "@/lib/magicChest";
import { stackCells } from "@/lib/hero/backpackCells";
import { bagsOccupancy } from "@/lib/hero/potionBag";
import { exactQty } from "@/lib/warehouseCells";
import {
  bagRoom,
  floor3,
  planLoot,
  type BagCaps,
  type BagStack,
} from "@/server/api/beta-raid/chest/chest-loot-plan";
import type { BaggedRow } from "@/server/api/beta-raid/loot-bag/bag-leftover-sql";

/** Товар сети в снимке: всё, что нужно, чтобы положить его в рюкзак или мешочек. */
export type NetRow = ChestSlot & { refId: string | null; itemId: string | null; potion: boolean };

/** Снимок одним запросом: сундук, охрана, рюкзак снимающего, сеть хозяина, отпечатки. */
export type PickupSnap = {
  chest: { itemId: string; name: string; image: string | null; potion: boolean } | null;
  /** Живая охрана хозяина на клетке; whole — на полном HP (вернётся хозяину). */
  guard: { tpl: string; name: string; image: string | null; whole: boolean } | null;
  /** Других сундуков хозяина нет ни на одной карте (закопанные — стоят). */
  last: boolean;
  bag: BagStack[];
  net: NetRow[];
  bagFp: string;
  netFp: string;
};

/** Строка рюкзака, которую запишет «Забрать сундук»; loot — сколько из них собрано. */
export type PickupRow = {
  k: string;
  kind: string;
  ref: string | null;
  item: string | null;
  name: string;
  image: string | null;
  qty: number;
  loot: number;
};

export type PickupPlan = {
  /** Хозяину: сундук (и охрана) влезают; нет — need/free для отказа. Чужому — всегда. */
  fits: boolean;
  need: number;
  free: number;
  /** Что ляжет в рюкзак одной записью: сундук, охрана, товары сети. */
  rows: PickupRow[];
  /** Товары сети, что легли в рюкзак (только у последнего сундука). */
  taken: LootPick[];
  /** Товары сети, что легли мешочком (для окна и итога). */
  left: LootPick[];
  /** Порции мешочка на клетке: остаток сети и — у чужого без места — сам сундук. */
  bagged: BaggedRow[];
  /** Сундук не влез к чужому и лёг в мешочек. */
  chestBagged: boolean;
};

export const chestKeyOf = (itemId: string): string => `custom:${itemId}`;
export const guardKeyOf = (tpl: string): string => `boss:${tpl}`;

/** Отпечаток подтверждения: цифры годятся ровно к этому рюкзаку, сети и «последнему». */
export const sigOf = (snap: Pick<PickupSnap, "bagFp" | "netFp" | "last">): string =>
  `${snap.bagFp}.${snap.netFp}.${snap.last ? 1 : 0}`;

/** Рюкзак после того, как в него легли picks (и «Забрать» обычного сундука). */
export function withAdded(bag: readonly BagStack[], picks: readonly LootPick[], potions: Set<string>) {
  const out = bag.map((s) => ({ ...s }));
  for (const p of picks) {
    const cur = out.find((s) => s.stackKey === p.stackKey);
    if (cur) cur.count += p.qty;
    else out.push({ stackKey: p.stackKey, count: p.qty, potion: potions.has(p.stackKey) });
  }
  return out;
}

/** Сколько ячеек просит резерв и сколько свободно — для отказа «освободи место». */
export function cellsFor(
  bag: readonly BagStack[],
  picks: readonly LootPick[],
  potions: Set<string>,
  caps: BagCaps,
) {
  const cells = (list: readonly BagStack[]) => ({
    itemCells: list.filter((s) => !s.potion).reduce((n, s) => n + stackCells(s.count), 0),
    potionCells: list.filter((s) => s.potion).reduce((n, s) => n + stackCells(s.count), 0),
  });
  const pc = caps.potionCapacity;
  const now = bagsOccupancy({ ...cells(bag), potionCapacity: pc }).occupied;
  const next = bagsOccupancy({ ...cells(withAdded(bag, picks, potions)), potionCapacity: pc });
  return { need: Math.max(1, next.occupied - now), free: Math.max(0, caps.capacity - now) };
}

type Item = Omit<PickupRow, "qty" | "loot">;

/** Один ключ — одна строка: вставка с ON CONFLICT не тронет строку дважды. */
function addRow(rows: PickupRow[], it: Item, qty: number, loot: number) {
  const same = rows.find((x) => x.k === it.k);
  if (!same) rows.push({ ...it, qty, loot });
  else {
    same.qty = exactQty(same.qty + qty);
    same.loot = exactQty(same.loot + loot);
  }
}

/** Порция мешочка — тоже одна на ключ (ключ порции: мешочек, вид, срок). */
function addBagged(list: BaggedRow[], it: Item, n: number, loot: number) {
  const same = list.find((x) => x.k === it.k);
  if (!same) list.push({ ...it, n, loot });
  else {
    same.n = exactQty(same.n + n);
    same.loot = exactQty(same.loot + loot);
  }
}

/**
 * План «Забрать сундук» по снимку. foreign — снимает чужой: охрана ему не
 * достаётся, а сундук без места падает мешочком. Сундука в снимке нет — план
 * пустой и не влезающий: вызывающий отвечает «сундука нет» раньше.
 */
export function pickupPlan(snap: PickupSnap, caps: BagCaps, foreign = false): PickupPlan {
  const { chest } = snap;
  const none = { rows: [], taken: [], left: [], bagged: [], chestBagged: false };
  if (!chest) return { fits: false, need: 0, free: 0, ...none };
  // Раненая охрана исчезает вместе с сундуком: ни строки, ни ячейки под неё.
  const guard = !foreign && snap.guard?.whole ? snap.guard : null;
  const chestKey = chestKeyOf(chest.itemId);
  const reserve: LootPick[] = [{ stackKey: chestKey, qty: 1 }];
  if (guard) reserve.push({ stackKey: guardKeyOf(guard.tpl), qty: 1 });
  const potions = new Set(snap.net.filter((n) => n.potion).map((n) => n.stackKey));
  if (chest.potion) potions.add(chestKey);

  const held = planLoot(reserve, snap.bag, caps, potions);
  const fits = reserve.every((r) => held.some((h) => h.stackKey === r.stackKey && h.qty >= r.qty));
  if (!fits && !foreign) return { fits, ...cellsFor(snap.bag, reserve, potions, caps), ...none };

  const rows: PickupRow[] = [];
  const bagged: BaggedRow[] = [];
  const chestItem = { k: chestKey, kind: "custom", ref: chest.itemId, item: chest.itemId };
  const chestRow = { ...chestItem, name: chest.name, image: chest.image };
  if (fits) addRow(rows, chestRow, 1, 0);
  else addBagged(bagged, chestRow, 1, 0);
  if (guard) {
    const k = guardKeyOf(guard.tpl);
    addRow(rows, { k, kind: "boss", ref: guard.tpl, item: k, name: guard.name, image: guard.image }, 1, 0);
  }

  // Товары сети — только у последнего сундука и только в то, что осталось
  // после сундука и охраны; не влезшее — мешочком с меткой «собрано прочее».
  const stacks = withAdded(snap.bag, fits ? reserve : [], potions);
  const taken: LootPick[] = [];
  const left: LootPick[] = [];
  for (const n of snap.last ? snap.net : []) {
    const cur = stacks.find((x) => x.stackKey === n.stackKey);
    const potion = cur?.potion ?? n.potion;
    const room = bagRoom(stacks, n.stackKey, potion, caps);
    const qty = n.count <= room ? exactQty(n.count) : floor3(room);
    const it = { k: n.stackKey, kind: n.kind, ref: n.refId, item: n.itemId, name: n.name, image: n.image };
    if (qty > 0) {
      taken.push({ stackKey: n.stackKey, qty });
      if (cur) cur.count = exactQty(cur.count + qty);
      else stacks.push({ stackKey: n.stackKey, count: qty, potion });
      addRow(rows, it, qty, qty);
    }
    const rest = exactQty(n.count - Math.max(0, qty));
    if (rest <= 0) continue;
    left.push({ stackKey: n.stackKey, qty: rest });
    addBagged(bagged, it, rest, rest);
  }
  return { fits: true, need: 0, free: 0, rows, taken, left, bagged, chestBagged: !fits };
}
