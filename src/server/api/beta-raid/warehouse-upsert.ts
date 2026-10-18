// Запись на полку склада: одна функция, зато под локом.
//
// Вынесено из warehouse-store.ts ради лимита в 250 строк. Здесь же живёт
// проверка места: между «посчитал свободное» и «записал» успевает вклиниться
// сосед (урожай нескольких полей оседает разом), и обе записи видят одно и то
// же «свободно» — так на карте появились личные полки на три ячейки при лимите
// в две.
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { CELL_SIZE } from "@/lib/warehouseCells";
import {
  NO_ORIGIN,
  originCols,
  originGrowSql,
  originSetSql,
  originWithin,
  originZeroSetSql,
  type OriginQty,
} from "@/server/api/beta-raid/stack-origin";

/**
 * Положить единицы в ячейку склада (личную или общую). Ячейка уже есть → count
 * += qty, иначе новая. Необязательный op — ключ идемпотентности для АВТО-урожая:
 * мост ретраит запись вслепую, и без ключа `count += qty` лёг бы дважды. Ключ
 * кладётся в raid_field_op первым (claim), и полка трогается ТОЛЬКО если он лёг —
 * повтор потерянного ответа видит ключ занятым и ничего не прибавляет. Ручная
 * сдача (storeToWarehouse) op не передаёт — её поведение не меняем.
 *
 * ⚠️ МЕСТО ПРОВЕРЯЕТСЯ ЗДЕСЬ, под локом по полке. Снаружи его считает
 * splitDeposit, но между «посчитал» и «записал» успевает вклиниться сосед:
 * урожай нескольких полей оседает разом, и оба видят одно и то же «свободно».
 * Так на карте появились личные полки на три ячейки при лимите в две
 * (проверка 11.09.2026). Потолок — GREATEST(лимит, занято): полка бывает уже
 * переполненной, и запирать долив в НЕПОЛНУЮ ячейку из-за этого нельзя.
 *
 * Возвращает `false`, если места не нашлось, — вызывающий вернёт единицы туда,
 * откуда брал.
 *
 * origin — метки кладущихся штук (stack-origin): личная полка хранит их так
 * же, как рюкзак, и прибавляет к своим, не больше qty. Без него — «безымянное».
 * Общая полка меток не хранит (владелец, 29.09.2026: она не «моя» — положенное
 * туда теряет метки): её запись обнуляет их, заодно гася прежние, сложенные
 * там разными игроками до этого правила.
 */
export async function upsertSlot(
  mapId: string,
  at: { q: number; r: number },
  scope: "own" | "shared",
  account: string | null,
  stackKey: string,
  snap: { kind: string; refId: string | null; name: string; image: string | null },
  qty: number,
  op?: string,
  /** Сколько ячеек даёт эта полка: личная — две, общая — восемь. */
  capCells?: number,
  /** Метки кладущихся штук (только личной полке): мобы, шахты, грядки, прочее. */
  origin?: Partial<OriginQty>,
): Promise<boolean> {
  const o = scope === "own" ? originWithin(qty, origin) : NO_ORIGIN;
  const conflict =
    scope === "own"
      ? "(map_id, q, r, owner_account, stack_key) WHERE scope = 'own'"
      : "(map_id, q, r, stack_key) WHERE scope = 'shared'";
  const cols = `(id, map_id, q, r, scope, owner_account, stack_key, kind, ref_id, item_id, name,
       image, count, mob_count, mine_count, field_count, loot_count)`;
  const vals = `${sqlStr(`whs_${nanoid(10)}`)}, ${sqlStr(mapId)}, ${at.q}, ${at.r}, ${sqlStr(scope)},
       ${account ? sqlStr(account) : "NULL"}, ${sqlStr(stackKey)}, ${sqlStr(snap.kind)},
       ${snap.refId ? sqlStr(snap.refId) : "NULL"}, NULL, ${sqlStr(snap.name)},
       ${snap.image ? sqlStr(snap.image) : "NULL"}, ${qty}, ${o.mob}, ${o.mine}, ${o.field}, ${o.loot}`;
  const old = originCols("yuplink.raid_warehouse_slot.");
  const marks =
    scope === "own"
      ? originSetSql(originGrowSql(old, originCols("EXCLUDED.")))
      : originZeroSetSql();
  const onConflict = `ON CONFLICT ${conflict} DO UPDATE
       SET count = yuplink.raid_warehouse_slot.count + EXCLUDED.count,
           ${marks}, updated_at = now()`;

  // Без лимита — прежнее поведение: откаты и служебные пути кладут вещь назад,
  // и запрещать им нельзя (иначе вещь просто исчезнет).
  if (!capCells || capCells <= 0) {
    await mcpExec(
      `INSERT INTO yuplink.raid_warehouse_slot ${cols}
       ${op
         ? `SELECT ${vals} FROM (INSERT INTO yuplink.raid_field_op (op) VALUES (${sqlStr(op)})
              ON CONFLICT (op) DO NOTHING RETURNING 1) claim`
         : `VALUES (${vals})`}
       ${onConflict};`,
    ).catch(async (e) => {
      // Старый Postgres не пускает INSERT в подзапрос FROM — тогда идёт CTE.
      if (!op) throw e;
      await mcpExec(
        `WITH claim AS (
           INSERT INTO yuplink.raid_field_op (op) VALUES (${sqlStr(op)})
           ON CONFLICT (op) DO NOTHING RETURNING 1
         )
         INSERT INTO yuplink.raid_warehouse_slot ${cols}
         SELECT ${vals} FROM claim
         ${onConflict};`,
      );
    });
    return true;
  }

  const scopeWhere =
    scope === "own"
      ? `scope = 'own' AND owner_account = ${account ? sqlStr(account) : "NULL"}`
      : `scope = 'shared'`;
  const lockKey = sqlStr(`wh:${mapId}:${at.q},${at.r}:${scope}:${account ?? ""}`);
  const src = op ? "room CROSS JOIN claim" : "room";
  const claimCte = op
    ? `claim AS (
         INSERT INTO yuplink.raid_field_op (op) VALUES (${sqlStr(op)})
         ON CONFLICT (op) DO NOTHING RETURNING 1
       ),`
    : "";

  const rows = (await mcpExec(
    `WITH _lock AS (SELECT pg_advisory_xact_lock(hashtext(${lockKey})) AS l),
     occ AS (
       SELECT COALESCE(sum(ceil(w.count / ${CELL_SIZE}.0)), 0)::int AS used,
              COALESCE(sum(w.count) FILTER (WHERE w.stack_key = ${sqlStr(stackKey)}), 0)::numeric
                AS same
         FROM yuplink.raid_warehouse_slot w, _lock
        WHERE w.map_id = ${sqlStr(mapId)} AND w.q = ${at.q} AND w.r = ${at.r}
          AND w.${scopeWhere} AND w.count > 0
     ),
     room AS (
       SELECT (ceil((same + ${qty}) / ${CELL_SIZE}.0) - ceil(same / ${CELL_SIZE}.0))::int AS need,
              (GREATEST(${Math.floor(capCells)}, used) - used)::int AS free
         FROM occ
     ),
     ${claimCte}
     ins AS (
       INSERT INTO yuplink.raid_warehouse_slot ${cols}
       SELECT ${vals} FROM ${src} WHERE room.need <= room.free
       ${onConflict}
       RETURNING 1
     )
     SELECT (SELECT count(*) FROM ins)::int AS wrote,
            (SELECT (need <= free) FROM room) AS fits;`,
    { wrapJson: false },
  )) as Array<{ wrote: number; fits: boolean | null }>;
  const row = rows?.[0];
  // Не влезло — честный отказ. Влезло, но строк ноль — это наш же повтор по
  // ключу идемпотентности: единицы уже лежат на полке.
  return row?.fits !== false;
}

