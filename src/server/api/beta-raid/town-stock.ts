// Склад города: чтение, стартовый запас и ДВИЖЕНИЯ по ключу.
//
// Каждое движение — один SQL: строку склада берём под замок, считаем новый
// остаток, проверяем границы (НЗ при продаже игроку, потолок при скупке) и
// пишем строку журнала raid_town_stock_move с ключом ref. Зачем ключ:
//   • запасной канал к базе (мост) повторяет запрос вслепую — повтор с тем же
//     ref не двигает склад второй раз и ОТВЕЧАЕТ тем же before/after, что и
//     первая попытка (контракт ретрая, mcpClient.ts);
//   • суточный тик пишет ref с датой — второй прогон в тот же день ничего не
//     съест и не произведёт повторно.
// Цена сделки считается от before — фактического запаса под замком, поэтому
// две одновременные покупки получают каждая свою честную цену.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { sqlRow } from "./chest/chest-row";
import { cityNorm, type TownGood } from "@/lib/townConfig";

/** Ратуша: склад города живёт на её координатах. */
export type TownKey = { mapId: string; q: number; r: number };

/** fresh — движение сделал ЭТОТ вызов; false — оно уже было (повтор того же ref). */
export type StockMove = { before: number; after: number; fresh: boolean };

export type StockMode =
  /**
   * Игрок покупает: убрать units, но не ниже floor (НЗ). at — запас, от которого
   * посчитана цена: склад сдвинется, только если он ровно такой (иначе — null и
   * пересчёт). Так цена сделки всегда соответствует складу, по которому она прошла.
   */
  | { kind: "take"; units: number; floor: number; at?: number }
  /** Игрок продаёт: добавить units (потолка у города нет; ceil — если задан). at — как у take. */
  | { kind: "put"; units: number; ceil?: number; at?: number }
  /** Жители съели за сутки: до нуля, ниже не бывает. */
  | { kind: "eat"; need: number }
  /** Город произвёл: до потолка; если уже выше — не трогаем. */
  | { kind: "produce"; add: number; ceil: number }
  /** Откат сделки: вернуть как было (не ниже нуля). */
  | { kind: "undo"; delta: number };

const num = (x: number): string => (Number.isFinite(x) ? x : 0).toFixed(8);
const EPS = "0.00000100";
const atCond = (at?: number): string =>
  at == null ? "" : ` AND abs(cur.amount - ${num(at)}) < ${EPS}`;

/** Новый остаток и условие, при котором движение разрешено. */
export function stockExpr(m: StockMode): { expr: string; cond: string } {
  switch (m.kind) {
    case "take":
      return {
        expr: `cur.amount - ${num(m.units)}`,
        cond: `cur.amount - ${num(m.units)} >= ${num(m.floor)} - ${EPS}${atCond(m.at)}`,
      };
    case "put":
      return {
        expr: `cur.amount + ${num(m.units)}`,
        cond: `${m.ceil == null ? "true" : `cur.amount + ${num(m.units)} <= ${num(m.ceil)} + ${EPS}`}${atCond(m.at)}`,
      };
    case "eat":
      return { expr: `GREATEST(0, cur.amount - ${num(m.need)})`, cond: "true" };
    case "produce":
      return {
        expr: `CASE WHEN cur.amount >= ${num(m.ceil)} THEN cur.amount
                    ELSE LEAST(${num(m.ceil)}, cur.amount + ${num(m.add)}) END`,
        cond: "true",
      };
    case "undo":
      return { expr: `GREATEST(0, cur.amount + ${num(m.delta)})`, cond: "true" };
  }
}

/**
 * Сдвинуть склад товара. null — движение не прошло: не хватило запаса выше НЗ,
 * упёрлись в потолок или строки склада нет.
 */
export async function moveStock(
  town: TownKey,
  goodId: string,
  ref: string,
  mode: StockMode,
): Promise<StockMove | null> {
  const { expr, cond } = stockExpr(mode);
  const at = (a: string) =>
    `${a}.map_id = ${sqlStr(town.mapId)} AND ${a}.q = ${Math.trunc(town.q)}
     AND ${a}.r = ${Math.trunc(town.r)} AND ${a}.good_id = ${sqlStr(goodId)}`;
  const sql = `WITH prev AS (
       SELECT before, after FROM yuplink.raid_town_stock_move WHERE ref = ${sqlStr(ref)}
     ), cur AS (
       SELECT s.amount FROM yuplink.raid_town_stock s
        WHERE ${at("s")} AND NOT EXISTS (SELECT 1 FROM prev)
        FOR UPDATE
     ), upd AS (
       UPDATE yuplink.raid_town_stock s SET amount = ${expr}, updated_at = now()
         FROM cur
        WHERE ${at("s")} AND ${cond}
       RETURNING cur.amount AS before, s.amount AS after
     ), ins AS (
       INSERT INTO yuplink.raid_town_stock_move (ref, map_id, q, r, good_id, delta, before, after)
       SELECT ${sqlStr(ref)}, ${sqlStr(town.mapId)}, ${Math.trunc(town.q)}, ${Math.trunc(town.r)},
              ${sqlStr(goodId)}, upd.after - upd.before, upd.before, upd.after
         FROM upd
       RETURNING before, after
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT before, after, true AS fresh FROM ins
       UNION ALL SELECT before, after, false AS fresh FROM prev
     ) _t;`;
  let rows: unknown[];
  try {
    rows = (await mcpExec(sql)) as unknown[];
  } catch (e) {
    // Мост повторил запрос, пока первая попытка ещё шла: повтор упёрся в ключ
    // ref, а первая при этом легла. Строка журнала есть — движение наше.
    const own = await stockMoveByRef(ref).catch(() => null);
    if (own) return { ...own, fresh: false };
    throw e;
  }
  const row = sqlRow<{ before: number | string; after: number | string; fresh: boolean }>(rows);
  if (!row) return null;
  return { before: Number(row.before), after: Number(row.after), fresh: row.fresh === true };
}

/** Движение по ключу, если оно уже было. */
async function stockMoveByRef(ref: string): Promise<{ before: number; after: number } | null> {
  const rows = (await mcpExec(
    `SELECT before, after FROM yuplink.raid_town_stock_move WHERE ref = ${sqlStr(ref)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ before: number | string; after: number | string }>;
  const r = rows?.[0];
  return r ? { before: Number(r.before), after: Number(r.after) } : null;
}

/** Склад города по всем товарам: good_id → остаток. Сбой базы — бросок, а не «пусто». */
export async function readTownStock(town: TownKey): Promise<Record<string, number>> {
  const rows = (await mcpExec(
    `SELECT good_id, amount FROM yuplink.raid_town_stock
      WHERE map_id = ${sqlStr(town.mapId)} AND q = ${town.q} AND r = ${town.r};`,
    { wrapJson: true },
  )) as Array<{ good_id: string; amount: number | string }>;
  const out: Record<string, number> = {};
  for (const row of rows ?? []) out[String(row.good_id)] = Number(row.amount) || 0;
  return out;
}

/**
 * Стартовый запас — только для НОВЫХ товаров: ровно норма города. Уже
 * существующие строки не трогаем, иначе правка конфига обнуляла бы склад.
 */
export async function seedTownStock(
  town: TownKey,
  goods: TownGood[],
  residents: number,
): Promise<void> {
  if (goods.length === 0) return;
  const values = goods
    .map(
      (g) =>
        `(${sqlStr(town.mapId)}, ${town.q}, ${town.r}, ${sqlStr(g.id)}, ${num(cityNorm(g, residents))}, now())`,
    )
    .join(", ");
  await mcpExec(
    `INSERT INTO yuplink.raid_town_stock(map_id, q, r, good_id, amount, updated_at)
     VALUES ${values}
     ON CONFLICT (map_id, q, r, good_id) DO NOTHING;`,
    { wrapJson: false },
  );
}
