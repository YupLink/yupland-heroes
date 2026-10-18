// Товар из рюкзака ПО КЛЮЧУ операции: списание и возврат один раз на ключ
// (зачем — pay-once.ts). Метки происхождения — как у takeFromBackpackStack и
// returnToBackpackStack (stack-origin, ПРАВИЛА §8.18).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import {
  NO_ORIGIN,
  originCols,
  originGrowSql,
  originLit,
  originOfTaken,
  originSetSql,
  originTakeSql,
  originTakenSql,
  originWithin,
  takenOf,
  type TakenMarks,
} from "@/server/api/beta-raid/stack-origin";
import type { BackpackTakeSnapshot } from "@/server/api/beta-raid/market-backpack-take";
import { lockOp, payOp, priorOp, qtyNum, rowOf } from "@/server/api/beta-raid/pay-once";

/**
 * Забрать n штук стека под ключом. Строку стека запираем (FOR UPDATE) и ключ
 * ставим только при достатке — ключ лёг ⇔ штуки ушли. Метки ушедшего — как в
 * takeFromBackpackStack (правило траты stack-origin).
 */
export function itemTakeSql(heroId: string, stackKey: string, n: number, key: string): string {
  const where = `hero_id = ${sqlStr(heroId)} AND stack_key = ${sqlStr(stackKey)}`;
  const left = `b.count - ${n}`;
  const was = {
    count: "o.old_count",
    mob: "o.old_mob",
    mine: "o.old_mine",
    field: "o.old_field",
    loot: "o.old_loot",
  };
  const taken = originTakenSql(was, originCols("b."));
  return `WITH prior AS (${priorOp(payOp(key))}),
o AS (
  SELECT id, count AS old_count, mob_count AS old_mob, mine_count AS old_mine,
         field_count AS old_field, loot_count AS old_loot
    FROM yuplink.raid_hero_backpack
   WHERE ${where} AND count >= ${n}
   FOR UPDATE
),
claim AS (
  ${lockOp(payOp(key), " FROM o")}
),
u AS (
  UPDATE yuplink.raid_hero_backpack b
     SET count = ${left}, ${originSetSql(originTakeSql(originCols("b."), left))}, updated_at = now()
    FROM o
   WHERE b.id = o.id AND EXISTS (SELECT 1 FROM claim)
  RETURNING b.kind, b.ref_id AS "refId", b.name, b.image, b.count,
            ${taken.mob} AS "mobTaken", ${taken.mine} AS "mineTaken",
            ${taken.field} AS "fieldTaken", ${taken.loot} AS "lootTaken"
),
cur AS (
  SELECT kind, ref_id AS "refId", name, image FROM yuplink.raid_hero_backpack WHERE ${where} LIMIT 1
)
SELECT row_to_json(_t.*) AS _row FROM (
  SELECT (SELECT was FROM prior) AS was,
         (SELECT row_to_json(u.*) FROM u) AS took,
         (SELECT row_to_json(c.*) FROM cur c) AS cur
) _t;`;
}

type Look = Pick<BackpackTakeSnapshot, "kind" | "refId" | "name" | "image">;
type Took = Look & TakenMarks & { count: number | string };
const img = (v: unknown): string | null => (v && String(v).trim() !== "" ? String(v) : null);

/**
 * Забрать товар под ключом. null — столько нет (ключ не лёг). Ключ уже стоял —
 * штуки ушли прошлой попыткой, чей ответ потерялся: снимок без меток. Ошибка
 * базы летит наверх — «столько нет» на сбой отвечать нельзя.
 */
export async function takeItemOnce(
  heroId: string,
  stackKey: string,
  qty: number,
  key: string,
): Promise<BackpackTakeSnapshot | null> {
  const n = qtyNum(qty);
  if (n <= 0) return null;
  const rows = await mcpExec(itemTakeSql(heroId, stackKey, n, key)).catch((e: unknown) => {
    if (/raid_hero_backpack_worn_stays/.test(String(e))) throw new Error("braid.tool_worn_stays");
    throw e;
  });
  const r = rowOf<{ was: boolean; took: Took | null; cur: Look | null }>(rows);
  if (!r) throw new Error("рюкзак: база не ответила на списание");
  const look = r.took ?? r.cur;
  const base = { kind: String(look?.kind ?? stackKey.split(":")[0]), refId: look?.refId ?? null };
  const snap = { ...base, name: String(look?.name ?? stackKey), image: img(look?.image) };
  if (r.was) return { ...snap, ...takenOf(NO_ORIGIN) };
  if (!r.took) return null;
  if (Number(r.took.count) <= 0) {
    await mcpExec(
      `DELETE FROM yuplink.raid_hero_backpack
        WHERE hero_id = ${sqlStr(heroId)} AND stack_key = ${sqlStr(stackKey)} AND count <= 0;`,
    ).catch(() => undefined);
  }
  return { ...snap, ...takenOf(originWithin(n, originOfTaken(r.took), qtyNum)) };
}

/** Вернуть n штук в стек под ключом `${key}:back` (стек есть — прибавка). */
export function itemBackSql(
  heroId: string,
  stackKey: string,
  n: number,
  snap: BackpackTakeSnapshot | undefined,
  key: string,
): string {
  const op = payOp(`${key}:back`);
  const add = originLit(originWithin(n, originOfTaken(snap), qtyNum));
  const grow = originSetSql(originGrowSql(originCols("b."), add, `b.count + ${n}`));
  return `WITH prior AS (${priorOp(op)}),
t AS (
  SELECT id FROM yuplink.raid_hero_backpack
   WHERE hero_id = ${sqlStr(heroId)} AND stack_key = ${sqlStr(stackKey)}
   FOR UPDATE
),
claim AS (
  ${lockOp(op, " FROM t")}
),
u AS (
  UPDATE yuplink.raid_hero_backpack b SET count = b.count + ${n}, ${grow}, updated_at = now()
    FROM t
   WHERE b.id = t.id AND EXISTS (SELECT 1 FROM claim)
  RETURNING b.id
)
SELECT row_to_json(_t.*) AS _row FROM (
  SELECT (SELECT was FROM prior) AS was, EXISTS (SELECT 1 FROM u) AS added
) _t;`;
}

/** Ячейки нет (списание её опустошило и удалило) — заводим по снимку, тем же ключом. */
export function itemCellSql(
  heroId: string,
  account: string,
  stackKey: string,
  n: number,
  snap: BackpackTakeSnapshot,
  key: string,
): string {
  const add = originLit(originWithin(n, originOfTaken(snap), qtyNum));
  const old = originCols("yuplink.raid_hero_backpack.");
  const grow = originGrowSql(old, originCols("EXCLUDED."), `${old.count} + EXCLUDED.count`);
  const id = `bp_back_${Math.random().toString(36).slice(2, 10)}`;
  const ref = snap.refId ? sqlStr(snap.refId) : "NULL";
  return `WITH claim AS (
  ${lockOp(payOp(`${key}:back`), "")}
),
ins AS (
  INSERT INTO yuplink.raid_hero_backpack
    (id, hero_id, account_id, kind, ref_id, item_id, stack_key, name, image, count,
     mob_count, mine_count, field_count, loot_count)
  SELECT ${sqlStr(id)}, ${sqlStr(heroId)}, ${sqlStr(account)}, ${sqlStr(snap.kind)}, ${ref},
         ${sqlStr(stackKey)}, ${sqlStr(stackKey)}, ${sqlStr(snap.name)},
         ${snap.image ? sqlStr(snap.image) : "NULL"}, ${n}, ${add.mob}, ${add.mine}, ${add.field}, ${add.loot}
    FROM claim
  ON CONFLICT (hero_id, stack_key) DO UPDATE
    SET count = yuplink.raid_hero_backpack.count + EXCLUDED.count,
        ${originSetSql(grow)}, updated_at = now()
  RETURNING 1
)
SELECT row_to_json(_t.*) AS _row FROM (SELECT EXISTS (SELECT 1 FROM ins) AS added) _t;`;
}

/**
 * Вернуть товар под ключом: один раз, сколько бы раз ни звали. Вернуть
 * некуда (нет снимка или хозяина ячейки) — ошибка: вызывающий кричит в лог.
 */
export async function returnItemOnce(
  heroId: string,
  stackKey: string,
  qty: number,
  snap: BackpackTakeSnapshot | undefined,
  account: string | null,
  key: string,
): Promise<void> {
  const n = qtyNum(qty);
  if (n <= 0) return;
  const r = rowOf<{ was: boolean; added: boolean }>(
    await mcpExec(itemBackSql(heroId, stackKey, n, snap, key)),
  );
  if (!r) throw new Error("рюкзак: база не ответила на возврат");
  if (r.was || r.added) return;
  if (!snap) throw new Error("ячейки нет, а снимка списания нет — вернуть некуда");
  const own =
    account ??
    rowOf<{ id: string | null }>(
      await mcpExec(
        `SELECT row_to_json(_t.*) AS _row FROM (
           SELECT h.account_id AS id FROM yuplink.hero_instance h
            WHERE h.id = ${sqlStr(heroId)} AND h.account_id IS NOT NULL LIMIT 1
         ) _t;`,
      ),
    )?.id;
  if (!own) throw new Error("у героя нет счёта — ячейку не завести");
  await mcpExec(itemCellSql(heroId, own, stackKey, n, snap, key));
}
