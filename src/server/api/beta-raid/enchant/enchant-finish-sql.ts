// Итог попытки зачарования — одним утверждением каждый (migrations/enchant-01.sql).
//
//  • ok   — пометка экземпляра (item_enchant, первичный ключ item_id: второе
//           зачарование не встанет) и итог в журнал;
//  • gone — экземпляр удаляется, как в игре удаляют артефакт (art-stock), и
//           снимается со всех героев аккаунта, на ком надет; итог в журнал;
//  • none — только итог, если предмет ещё свой и не зачарован.
// Предмет за время оплаты ушёл (продан, отдан, уже зачарован) — строк 0, итог
// не пишется: вызывающий возвращает цену (enchant-flow).
import { sqlStr } from "@/server/api/raid-shared";

export type FinishInput = {
  account: string;
  op: string;
  itemId: string;
  result: Record<string, unknown>;
  /** Только у ok. */
  pct?: number;
  spellId?: string;
  spellName?: string;
};

const json = (v: unknown): string => `${sqlStr(JSON.stringify(v))}::jsonb`;

/** Свой незачарованный артефакт аккаунта — общее условие всех трёх исходов. */
const ownFree = (f: FinishInput, u = "u"): string =>
  `${u}.id = ${sqlStr(f.itemId)} AND ${u}.account_id = ${sqlStr(f.account)} AND ${u}.kind = 'artifact'
     AND NOT EXISTS (SELECT 1 FROM yuplink.item_enchant e WHERE e.item_id = ${u}.id)`;

/** Запись итога в журнал — только если предмет-часть утверждения сработала. */
const finishCte = (f: FinishInput, outcome: string, gate: string): string => `fin AS (
       UPDATE yuplink.enchant_attempt a
          SET status = 'done', outcome = '${outcome}', pct = ${f.pct == null ? "NULL" : Math.floor(f.pct)},
              result = ${json(f.result)}, finished_at = now()
        WHERE a.account_id = ${sqlStr(f.account)} AND a.op_id = ${sqlStr(f.op)}
          AND a.status = 'pending' AND EXISTS (SELECT 1 FROM ${gate})
        RETURNING 1
     )`;

/** Успех: пометка экземпляра и итог. n = 1 — записано. */
export function finishOkSql(f: FinishInput): string {
  return `WITH it AS (
       SELECT u.id FROM yuplink.user_game_item u WHERE ${ownFree(f)} FOR UPDATE
     ),
     ins AS (
       INSERT INTO yuplink.item_enchant (item_id, account_id, pct, spell_id, spell_name, op_ref)
       SELECT it.id, ${sqlStr(f.account)}, ${Math.floor(f.pct ?? 0)}, ${sqlStr(f.spellId ?? "")},
              ${sqlStr(f.spellName ?? "")}, ${sqlStr(`${f.account}:${f.op}`)}
         FROM it
       ON CONFLICT (item_id) DO NOTHING
       RETURNING item_id
     ),
     ${finishCte(f, "ok", "ins")}
     SELECT (SELECT count(*) FROM ins)::int AS n, (SELECT count(*) FROM fin)::int AS f;`;
}

/** Разрушение: удалить экземпляр, снять с героев, итог. n = 1 — разрушен. */
export function finishGoneSql(f: FinishInput): string {
  const id = sqlStr(f.itemId);
  return `WITH del AS (
       DELETE FROM yuplink.user_game_item u WHERE ${ownFree(f)}
       RETURNING u.id
     ),
     strip AS (
       UPDATE yuplink.hero_instance h
          SET equipped = COALESCE((
                SELECT jsonb_object_agg(x.key, x.value)
                  FROM jsonb_each_text(h.equipped) x
                 WHERE x.value <> ${id}
              ), '{}'::jsonb),
              updated_at = now()
        WHERE h.account_id = ${sqlStr(f.account)} AND EXISTS (SELECT 1 FROM del)
          AND jsonb_typeof(h.equipped) = 'object'
          AND EXISTS (SELECT 1 FROM jsonb_each_text(h.equipped) y WHERE y.value = ${id})
        RETURNING h.id
     ),
     ${finishCte(f, "gone", "del")}
     SELECT (SELECT count(*) FROM del)::int AS n, (SELECT count(*) FROM strip)::int AS stripped,
            (SELECT count(*) FROM fin)::int AS f;`;
}

/** Без изменений: только итог, если предмет на месте. n = 1 — записано. */
export function finishNoneSql(f: FinishInput): string {
  return `WITH it AS (
       SELECT u.id FROM yuplink.user_game_item u WHERE ${ownFree(f)}
     ),
     ${finishCte(f, "none", "it")}
     SELECT (SELECT count(*) FROM fin)::int AS n;`;
}
