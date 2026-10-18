// Сколько добычи ляжет в рюкзак — чистая арифметика без базы.
//
// Правило владельца (27.09.2026): грабитель выбирает, что взять; не взятое и
// не влезшее пропадает. Сервер кладёт по очереди выбора и каждой позиции даёт
// ровно столько, сколько ещё помещается, — та же формула места, что у забора
// со склада (backpackRoomFor + roomFor: долив в свою ячейку, зелья только в
// сумку). Её же зовёт забор из своей сети (chest-take.ts).
import type { ChestSlot, LootPick } from "@/lib/magicChest";
import { backpackRoomFor, stackCells } from "@/lib/hero/backpackCells";
import { roomFor } from "@/lib/hero/potionBag";
import { roundQty } from "@/lib/warehouseCells";

/** Стек рюкзака для расчёта места. */
export type BagStack = { stackKey: string; count: number; potion: boolean };
export type BagCaps = { capacity: number; potionCapacity: number };

/**
 * Вниз до тысячных. Округление вверх обещало бы долю, которой нет: 19,9765
 * места → 19,977 штук, и лишняя тысячная открывала бы новую ячейку. Эпсилон —
 * против 0,57 × 1000 = 569,999…
 */
export const floor3 = (x: number): number => (x > 0 ? Math.floor(x * 1000 + 1e-6) / 1000 : 0);

/** Сколько единиц вида stackKey ещё влезет к уже лежащему. */
export function bagRoom(
  stacks: readonly BagStack[],
  stackKey: string,
  potion: boolean,
  caps: BagCaps,
): number {
  const cells = { itemCells: 0, potionCells: 0 };
  let cur = 0;
  for (const s of stacks) {
    if (s.potion) cells.potionCells += stackCells(s.count);
    else cells.itemCells += stackCells(s.count);
    if (s.stackKey === stackKey) cur = s.count;
  }
  const { capacity, potionCapacity } = caps;
  return backpackRoomFor({ ...roomFor({ ...cells, potion, capacity, potionCapacity }), cur });
}

/**
 * Что из выбора реально уедет: по очереди, каждой позиции — сколько влезет
 * после предыдущих. potionKeys — какие из НОВЫХ для рюкзака видов зелья.
 */
export function planLoot(
  picks: readonly LootPick[],
  bag: readonly BagStack[],
  caps: BagCaps,
  potionKeys: ReadonlySet<string>,
): LootPick[] {
  const stacks = bag.map((s) => ({ ...s }));
  const out: LootPick[] = [];
  for (const p of picks) {
    const cur = stacks.find((s) => s.stackKey === p.stackKey);
    const potion = cur?.potion ?? potionKeys.has(p.stackKey);
    const qty = floor3(Math.min(p.qty, bagRoom(stacks, p.stackKey, potion, caps)));
    if (qty <= 0) continue;
    if (cur) cur.count += qty;
    else stacks.push({ stackKey: p.stackKey, count: qty, potion });
    out.push({ stackKey: p.stackKey, qty });
  }
  return out;
}

/**
 * Сундук — первым и целиком, что бы ни прислал клиент: правило владельца
 * «сундук подбирается в инвентарь победителя». Остальной выбор — следом.
 */
export function chestFirst(picks: readonly LootPick[], chest: LootPick | null): LootPick[] {
  if (!chest) return [...picks];
  return [chest, ...picks.filter((p) => p.stackKey !== chest.stackKey)];
}

/** Лёг ли сундук в план целиком (в плане он первый). */
export const chestFits = (plan: readonly LootPick[], chest: LootPick | null): boolean =>
  !chest || (plan[0]?.stackKey === chest.stackKey && plan[0].qty >= chest.qty);

/** Что пропало: всё из сети за вычетом уехавшего в рюкзак. */
export function lostOf(
  items: readonly Pick<ChestSlot, "stackKey" | "count">[],
  taken: readonly LootPick[],
): LootPick[] {
  const got = new Map<string, number>();
  for (const t of taken) got.set(t.stackKey, (got.get(t.stackKey) ?? 0) + t.qty);
  const out: LootPick[] = [];
  for (const it of items) {
    const qty = roundQty(it.count - (got.get(it.stackKey) ?? 0));
    if (qty > 0) out.push({ stackKey: it.stackKey, qty });
  }
  return out;
}
