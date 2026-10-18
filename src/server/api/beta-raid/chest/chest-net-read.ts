// Чтение для окон сундука: сеть игрока и рюкзак героя глазами сундука.
//
// Сеть одна на аккаунт и без карты (правило владельца: «достал из одного —
// сразу меньше везде»), поэтому здесь нет ни map_id, ни клетки.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { ChestBackpackStack, ChestSlot } from "@/lib/magicChest";
import { stackCells } from "@/lib/hero/backpackCells";
import { bagsOccupancy } from "@/lib/hero/potionBag";
import { IS_POTION_SQL, POTION_JOIN } from "@/server/api/beta-raid/potion-bag";
import { num } from "@/server/api/beta-raid/chest/chest-row";
import { collectedSql, originCols } from "@/server/api/beta-raid/stack-origin";

/** Стек рюкзака для сундука: сколько лежит, сколько можно положить и зелье ли. */
export type BagRow = ChestBackpackStack & { potion: boolean };

/** Сеть аккаунта: стеки по свежести, пустые хвосты не показываем. */
export async function loadNet(account: string): Promise<ChestSlot[]> {
  const rows = (await mcpExec(
    `SELECT stack_key AS "stackKey", kind, name, image, count
       FROM yuplink.raid_chest_slot
      WHERE account_id = ${sqlStr(account)} AND count > 0
      ORDER BY updated_at DESC, stack_key;`,
    { wrapJson: true },
  )) as Array<Omit<ChestSlot, "count"> & { count: number | string }>;
  return (rows ?? []).map((s) => ({
    stackKey: s.stackKey,
    kind: s.kind,
    name: s.name,
    image: s.image ?? null,
    count: num(s.count),
  }));
}

/**
 * Сколько штук стека можно положить в сеть: собранное (любая метка, stack-origin
 * collectedSql — всё, кроме купленного; владелец 29.09.2026) и не изношенное:
 * изношенная штука инструмента (wear > 0, ПРАВИЛА §8.19) из рюкзака не уходит.
 * Без вычета вклад всей стопки с износом упирался бы в отказ worn_all
 * (storeSql), и целые штуки было не положить.
 */
export const COLLECTED_MOVABLE_SQL = `GREATEST(0, LEAST(${collectedSql(originCols("b."))}, b.count - CASE WHEN b.wear > 0 THEN 1 ELSE 0 END))`;

/**
 * Рюкзак героя глазами сундука: count — сколько лежит (место), movable —
 * сколько из них можно положить в сеть (COLLECTED_MOVABLE_SQL). Ошибку базы не
 * глотаем: «не смогли спросить» и «рюкзак пуст» — разные вещи, второе пустило
 * бы на лишнюю ячейку.
 */
export async function loadBag(heroId: string): Promise<BagRow[]> {
  const rows = (await mcpExec(
    `SELECT b.stack_key AS "stackKey", b.kind, b.name, b.image, b.count,
            ${COLLECTED_MOVABLE_SQL} AS movable, ${IS_POTION_SQL} AS potion
       FROM yuplink.raid_hero_backpack b
       ${POTION_JOIN}
      WHERE b.hero_id = ${sqlStr(heroId)} AND b.count > 0
      ORDER BY b.updated_at DESC, b.stack_key;`,
    { wrapJson: true },
  )) as Array<{
    stackKey: string;
    kind: string;
    name: string;
    image: string | null;
    count: number | string;
    movable: number | string | null;
    potion: boolean | null;
  }>;
  return (rows ?? []).map((b) => ({
    stackKey: b.stackKey,
    kind: b.kind,
    name: b.name,
    image: b.image ?? null,
    count: num(b.count),
    movable: Math.max(0, num(b.movable)),
    potion: b.potion === true,
  }));
}

/** Занято ячеек рюкзака: только обычные товары — зелья живут в сумке. */
export function bagOccupied(rows: readonly BagRow[], potionCapacity: number): number {
  let itemCells = 0;
  let potionCells = 0;
  for (const b of rows) {
    if (b.potion) potionCells += stackCells(b.count);
    else itemCells += stackCells(b.count);
  }
  return bagsOccupancy({ itemCells, potionCells, potionCapacity }).occupied;
}
