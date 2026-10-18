// Износ едет вместе с инструментом (владелец, 14.10.2026: «дать возможность
// переносить всё»). Раньше изношенная штука из рюкзака не уходила вовсе:
// склад износа не хранил, и перенос «чинил» бы её. Теперь у полки склада свой
// износ (raid_warehouse_slot.wear, миграция wear-01), и правило одно:
//
//   • уходит вся стопка (или остаток меньше штуки) — износ уходит с ней;
//   • уходит часть — уходят целые штуки, износ остаётся на месте;
//   • износ приходит туда, где уже есть своя изношенная штука, — проценты
//     складываются: дошло до 100 — одна штука доломана (две кирки с 40 % и
//     40 % прочности = одна с 80 %). Прочность не рождается и не пропадает.
//
// Списание с износом — в самом UPDATE списания (market-backpack-take,
// warehouse-slot-sql), иначе CHECK «износ — не ниже одной штуки» отказал бы.
// Прибавка — отдельным оператором сразу после прибавки штук: строка к этому
// моменту уже есть и в ней не меньше одной штуки.
import { sqlStr } from "../raid-shared";
import { originCols, originSetSql, originTakeSql } from "./stack-origin";

/** Таблицы, где живёт износ стопки. */
export type WearTable = "raid_hero_backpack" | "raid_warehouse_slot";

/** Износ из ответа базы: 0…99,99 %, мусор — ноль. */
export const wearOf = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(99.9999, n) : 0;
};

/**
 * Прибавить износ `add` % к стопке (where — одна строка). Сумма дошла до 100 —
 * одна штука доломана: count − 1, метки не больше нового count.
 */
export function addWearSql(table: WearTable, where: string, add: number): string {
  const a = wearOf(add);
  const raw = `(wear + ${a})`;
  const over = `${raw} >= 100`;
  const left = `count - CASE WHEN ${over} THEN 1 ELSE 0 END`;
  return `UPDATE yuplink.${table}
      SET wear = CASE WHEN ${over} THEN ${raw} - 100 ELSE ${raw} END,
          count = ${left},
          ${originSetSql(originTakeSql(originCols(), left))},
          updated_at = now()
    WHERE ${where} AND count >= 1;`;
}

/** Строка рюкзака героя по виду. */
export const backpackWhere = (heroId: string, stackKey: string): string =>
  `hero_id = ${sqlStr(heroId)} AND stack_key = ${sqlStr(stackKey)}`;

/** Строка полки склада: клетка, личная (с хозяином) или общая, вид. */
export const shelfWhere = (o: {
  mapId: string;
  q: number;
  r: number;
  scope: "own" | "shared";
  account: string | null;
  stackKey: string;
}): string =>
  `map_id = ${sqlStr(o.mapId)} AND q = ${o.q} AND r = ${o.r} AND scope = ${sqlStr(o.scope)}
        AND stack_key = ${sqlStr(o.stackKey)}${
          o.scope === "own" ? ` AND owner_account = ${sqlStr(o.account ?? "")}` : ""
        }`;
