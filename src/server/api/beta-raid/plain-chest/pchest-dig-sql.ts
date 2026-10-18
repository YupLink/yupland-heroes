// SQL «закопать / выкопать» сундука — обычного и магического: переворот одним
// оператором под локом, тем же, что держат остальные дела с этим сундуком.
//
//  • Обычный — лок сундука 'pchest:'||id (положить, забрать, «Забрать сундук»):
//    из пары «закопать / забрать товар» проходит одно, закопанный ни отдать,
//    ни принять не может.
//  • Магический — лок сети владельца 'chest:'||владелец («Забрать сундук»,
//    охрана к сундуку, забор из сети): закопать можно только без живой охраны;
//    закопанный не открыть, не забрать и охрану на него не поставить.
//
// Ключ нажатия пишется в raid_plain_chest_op в ОБОИХ исходах: 'done' —
// перевернули, 'failed' — нет. Повтор того же нажатия отвечает прежним
// исходом и второй раз ничего не делает — в том числе не перевернёт «даром»
// позже, когда износ лопаты за это нажатие уже откатили (как у мешочка).
//
// Без обёртки wrapJson: изменяющие CTE — верхний уровень. Комментарии внутри
// SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { deadGuardSql, locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { plainAtSql } from "@/server/api/beta-raid/plain-chest/pchest-row";

/** Ответ переворота: исход ключа, был ли сундук, закопан ли он был, держит ли охрана. */
export type FlipRow = {
  state: "done" | "failed" | null;
  here: boolean | null;
  buried: boolean | null;
  held: boolean | null;
  /** Исход записан этим оператором (не повтор того же нажатия). */
  mine?: boolean | null;
};

/** Какой сундук переворачиваем: обычный по id или магический по клетке и владельцу. */
export type FlipTarget =
  | { kind: "plain"; chestId: string }
  | { kind: "magic"; mapId: string; q: number; r: number; owner: string };

type Flip = { target: FlipTarget; op: string; account: string; bury: boolean };

/** Лок сундука: обычного — свой, магического — сеть владельца. */
export const flipLockKey = (t: FlipTarget): string =>
  t.kind === "plain" ? `pchest:${t.chestId}` : `chest:${t.owner}`;

/** Ссылка на сундук в ключе нажатия: id обычного, «mc:карта:q:r» магического. */
export const flipRef = (t: FlipTarget): string =>
  t.kind === "plain" ? t.chestId : `mc:${t.mapId}:${t.q}:${t.r}`;

/** Строка сундука: таблица и условие «тот самый». */
function rowOf(t: FlipTarget): { table: string; where: string } {
  if (t.kind === "plain") {
    return { table: "yuplink.raid_plain_chest c", where: `c.id = ${sqlStr(t.chestId)}` };
  }
  return {
    table: "yuplink.raid_magic_chest c",
    where: `${plainAtSql("c", t.mapId, t.q, t.r)} AND c.owner_account = ${sqlStr(t.owner)}`,
  };
}

/** Магический сундук держит живая охрана (поверженная — нет: захвата больше нет). */
const heldSql = (t: FlipTarget): string =>
  t.kind === "plain"
    ? "SELECT 1 WHERE false"
    : `SELECT 1 FROM yuplink.raid_mine_guard g
        WHERE ${plainAtSql("g", t.mapId, t.q, t.r)} AND NOT ${deadGuardSql("g")}`;

/** Закопать (bury) или выкопать сундук. */
export function flipSql(o: Flip & { nonce: string }): string {
  const [op, acc, nonce] = [sqlStr(o.op), sqlStr(o.account), sqlStr(o.nonce)];
  const { table, where } = rowOf(o.target);
  const set = o.bury ? `buried_at = now(), buried_by = ${acc}` : "buried_at = NULL, buried_by = NULL";
  // Закапывают только без охраны; выкопать можно всегда (охраны на бугорке не бывает).
  const free = o.bury ? "AND NOT EXISTS (SELECT 1 FROM held)" : "";
  return `${locksSql(flipLockKey(o.target))}
     WITH prior AS (
       SELECT state, result->>'nonce' AS nonce FROM yuplink.raid_plain_chest_op WHERE op = ${op}
     ),
     cur AS (
       SELECT (c.buried_at IS NOT NULL) AS buried FROM ${table} WHERE ${where}
     ),
     held AS (${heldSql(o.target)}),
     ok AS (
       SELECT 1 FROM cur
        WHERE NOT EXISTS (SELECT 1 FROM prior) AND cur.buried = ${o.bury ? "false" : "true"} ${free}
     ),
     upd AS (
       UPDATE ${table} SET ${set}
        WHERE ${where} AND EXISTS (SELECT 1 FROM ok)
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_plain_chest_op (op, chest_id, account_id, kind, state, result)
       SELECT ${op}, ${sqlStr(flipRef(o.target))}, ${acc}, ${sqlStr(o.bury ? "bury" : "dig")},
              CASE WHEN EXISTS (SELECT 1 FROM upd) THEN 'done' ELSE 'failed' END,
              jsonb_build_object('nonce', ${nonce})
        WHERE NOT EXISTS (SELECT 1 FROM prior)
       RETURNING state
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT COALESCE((SELECT state FROM prior), (SELECT state FROM mark)) AS state,
              EXISTS (SELECT 1 FROM cur) AS here, (SELECT buried FROM cur) AS buried,
              EXISTS (SELECT 1 FROM held) AS held,
              (EXISTS (SELECT 1 FROM mark)
               OR COALESCE((SELECT nonce FROM prior) = ${nonce}, false)) AS mine
     ) _t;`;
}

/**
 * «Забор» переворота, когда ответ flipSql не пришёл: под тем же локом — ключ
 * нажатия с исходом 'failed', если его ещё нет. Опоздавшая попытка flipSql
 * увидит ключ и ничего не перевернёт — износ лопаты можно вернуть. Ответ —
 * исход ключа: 'done' — переворот всё-таки прошёл.
 */
export function flipFenceSql(o: Flip): string {
  const op = sqlStr(o.op);
  return `${locksSql(flipLockKey(o.target))}
     INSERT INTO yuplink.raid_plain_chest_op (op, chest_id, account_id, kind, state)
     VALUES (${op}, ${sqlStr(flipRef(o.target))}, ${sqlStr(o.account)},
             ${sqlStr(o.bury ? "bury" : "dig")}, 'failed')
     ON CONFLICT (op) DO NOTHING;
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT state FROM yuplink.raid_plain_chest_op WHERE op = ${op}
     ) _t;`;
}
