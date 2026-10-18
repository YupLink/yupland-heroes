// Откат забора из сети магического сундука: рюкзак не принял — штуки назад
// в сеть владельца. Вынесено из chest-net-sql.ts (лимит строк) без изменения
// логики.
import { sqlStr } from "@/server/api/raid-shared";

const lockSql = (account: string) =>
  `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`chest:${account}`)})) AS l`;

/**
 * Вернуть снятое в сеть владельца — откат, когда рюкзак не принял. Место не
 * проверяем: эти штуки только что там лежали, отказ значил бы «пропали».
 * Только account_id = владелец: у склада откат без владельца прибавлял всем.
 */
export function returnSql(o: {
  account: string;
  stackKey: string;
  snap: {
    kind: string;
    refId: string | null;
    itemId: string | null;
    name: string;
    image: string | null;
  };
  qty: number;
  op: string;
}): string {
  const s = o.snap;
  const str = (v: string | null) => (v ? sqlStr(v) : "NULL");
  return `WITH _lock AS (${lockSql(o.account)}),
     claim AS (
       INSERT INTO yuplink.raid_backpack_op (op) SELECT ${sqlStr(o.op)} FROM _lock
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     )
     INSERT INTO yuplink.raid_chest_slot
        (account_id, stack_key, kind, ref_id, item_id, name, image, count)
     SELECT ${sqlStr(o.account)}, ${sqlStr(o.stackKey)}, ${sqlStr(s.kind)}, ${str(s.refId)},
            ${str(s.itemId)}, ${sqlStr(s.name)}, ${str(s.image)}, ${o.qty}
       FROM claim
     ON CONFLICT (account_id, stack_key) DO UPDATE
       SET count = yuplink.raid_chest_slot.count + EXCLUDED.count, updated_at = now();`;
}
