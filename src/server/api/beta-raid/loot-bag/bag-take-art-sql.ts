// SQL «забрать артефакт» из мешочка (ПРАВИЛА §8.73 п. 4): порция «art:<id>» (одна штука) гаснет,
// снимок предмета уходит, строка user_game_item встаёт в инвентарь забравшего — тот же id и
// износ — одним оператором под локом мешочка. Ключ нажатия ложится сразу 'done'; повтор второй
// раз ничего не делает. Без ON CONFLICT: строка не встала — откатывается всё, артефакт не пропадает.
// Общие правила SQL мешочков — шапка bag-sql.ts.
import { sqlStr } from "@/server/api/raid-shared";
import { bagLockSql, livePortion } from "@/server/api/beta-raid/loot-bag/bag-sql";

export type TakeArtRow = { prior: string | null; qty: number | string | null };

export function takeArtSql(o: {
  bagId: string;
  stackKey: string;
  itemId: string;
  op: string;
  account: string;
  wallet: string;
}): string {
  const [id, key, op, acc] = [sqlStr(o.bagId), sqlStr(o.stackKey), sqlStr(o.op), sqlStr(o.account)];
  return `${bagLockSql(o.bagId)}
     WITH prior AS (
       SELECT state, qty FROM yuplink.raid_loot_bag_op WHERE op = ${op}
     ),
     live AS (
       SELECT i.expires_at FROM yuplink.raid_loot_bag_item i
         JOIN yuplink.raid_loot_bag b ON b.id = i.bag_id
        WHERE i.bag_id = ${id} AND i.stack_key = ${key} AND ${livePortion("i")}
          AND b.buried_at IS NULL AND NOT EXISTS (SELECT 1 FROM prior)
        ORDER BY i.expires_at LIMIT 1
     ),
     snap AS (
       DELETE FROM yuplink.raid_loot_bag_art a
        WHERE a.item_id = ${sqlStr(o.itemId)} AND EXISTS (SELECT 1 FROM live)
       RETURNING a.item
     ),
     upd AS (
       UPDATE yuplink.raid_loot_bag_item i SET count = 0
         FROM live l
        WHERE i.bag_id = ${id} AND i.stack_key = ${key} AND i.expires_at = l.expires_at
          AND EXISTS (SELECT 1 FROM snap)
       RETURNING 1
     ),
     ins AS (
       INSERT INTO yuplink.user_game_item (id, wallet, template_id, kind, source, obtained_at, account_id, wear)
       SELECT r.id, ${sqlStr(o.wallet)}, r.template_id, r.kind, 'loot_bag', now(), ${acc}, r.wear
         FROM snap s, jsonb_populate_record(NULL::yuplink.user_game_item, s.item) r
        WHERE EXISTS (SELECT 1 FROM upd)
       RETURNING id
     ),
     mark AS (
       INSERT INTO yuplink.raid_loot_bag_op (op, bag_id, account_id, kind, stack_key, qty, state)
       SELECT ${op}, ${id}, ${acc}, 'take', ${key}, 1, 'done' FROM ins
       RETURNING qty
     ),
     touch AS (
       UPDATE yuplink.raid_loot_bag SET updated_at = now()
        WHERE id = ${id} AND EXISTS (SELECT 1 FROM ins)
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT state FROM prior) AS prior,
              COALESCE((SELECT qty FROM mark), (SELECT qty FROM prior)) AS qty
     ) _t;`;
}

/** Исход ключа нажатия свежим чтением (ответ потерялся). */
export const takeArtOpSql = (op: string): string =>
  `SELECT state, qty FROM yuplink.raid_loot_bag_op WHERE op = ${sqlStr(op)};`;

/**
 * Артефакты, чья порция сгорела (24 часа с попадания в мешочек; закапывание сроков не
 * меняет), сгорают и сами: снимок без живой порции убираем. Забранные ушли с забором.
 */
export const burnArtSql = (): string =>
  `DELETE FROM yuplink.raid_loot_bag_art a
    WHERE a.created_at < now() - interval '5 minutes'
      AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item i
                       WHERE i.stack_key = 'art:' || a.item_id AND ${livePortion("i")})
   RETURNING a.item_id;`;
