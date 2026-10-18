// SQL забвения у столба: строка книги своего героя уходит вместе с ключом
// нажатия — одним оператором (spell-forget-pillar.ts). Отдельным модулем, как
// SQL сети сундука и эффекта «Забвение»: строку проверяли на живом Postgres.
//
// ⚠️ Лок по ключу нажатия — ОТДЕЛЬНЫМ оператором перед WITH (как §8.15): мост
// шлёт повтор, пока первая попытка ещё не закоммичена. Без лока повтор брал
// снимок ДО её коммита («ключа нет»), его DELETE дожидался строки и пропускал
// её — «не сделано», и деньги возвращались за уже забытое. С локом повтор ждёт
// первую попытку и видит её ключ.
import { sqlStr } from "@/server/api/raid-shared";

/** Убрать строку книги своего героя и в том же операторе положить ключ нажатия. */
export function pillarForgetSql(
  account: string,
  heroId: string,
  spellId: string,
  mark: string,
): string {
  const op = sqlStr(mark);
  return `SELECT pg_advisory_xact_lock(hashtext(${op})) AS l;
     WITH own AS (
       SELECT h.id FROM yuplink.hero_instance h
        WHERE h.id = ${sqlStr(heroId)} AND h.account_id = ${sqlStr(account)}
     ),
     prior AS (
       SELECT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${op}) AS was
     ),
     gone AS (
       DELETE FROM yuplink.hero_spellbook b USING own, prior
        WHERE NOT prior.was AND b.hero_id = own.id AND b.spell_id = ${sqlStr(spellId)}
       RETURNING b.spell_id
     ),
     mark AS (
       INSERT INTO yuplink.raid_backpack_op (op) SELECT ${op} FROM gone
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT was FROM prior) AS was, (SELECT count(*) FROM gone)::int AS gone
     ) _t;`;
}
