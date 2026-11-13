// Жизни мобов после дуэли (migrations/duel-04-mob-hp.sql): чтение для расклада и запись
// итога боя. Ключ копии — «<шаблон>:<номер>», как id бойца без стороны.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

export type MobHpRow = { template: string; copy: number; hp: number };

/** «шаблон:копия» → жизни (только раненые: полных строк нет). */
export async function mobHpOf(account: string): Promise<Record<string, number>> {
  const rows = ((await mcpExec(
    `SELECT template_id, copy, hp FROM yuplink.duel_mob_hp WHERE account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  ).catch(() => [])) ?? []) as Array<{ template_id: string; copy: number; hp: number | string }>;
  const out: Record<string, number> = {};
  for (const r of rows) out[`${r.template_id}:${Number(r.copy)}`] = Number(r.hp);
  return out;
}

/**
 * Итог боя: живой и раненый — его жизни (не больше шаблона), полный или павший — строки
 * нет. Шаблон — только моб, что продают казармы (как в раскладе).
 */
export async function saveMobHp(account: string, rows: MobHpRow[]): Promise<void> {
  if (rows.length === 0) return;
  await mcpExec(saveMobHpSql(account, rows));
}

/** Текст записи итога (отдельно — для проверки на базе в откате). */
export function saveMobHpSql(account: string, rows: MobHpRow[]): string {
  const values = rows
    .map((r) => `(${sqlStr(r.template)}, ${Math.trunc(r.copy)}, ${Math.max(0, Number(r.hp) || 0)})`)
    .join(", ");
  return `WITH v(template_id, copy, hp) AS (VALUES ${values}),
          m AS (SELECT v.template_id, v.copy, LEAST(v.hp, bt.max_hp) AS hp, bt.max_hp
                  FROM v JOIN yuplink.raid_boss_template bt ON bt.id = v.template_id
                 WHERE EXISTS (SELECT 1 FROM yuplink.raid_market_item mi
                                WHERE mi.kind = 'boss' AND mi.ref_id = v.template_id)),
          del AS (DELETE FROM yuplink.duel_mob_hp d USING m
                   WHERE d.account_id = ${sqlStr(account)} AND d.template_id = m.template_id
                     AND d.copy = m.copy AND (m.hp <= 0 OR m.hp >= m.max_hp)
                  RETURNING 1)
     INSERT INTO yuplink.duel_mob_hp AS d (account_id, template_id, copy, hp, updated_at)
     SELECT ${sqlStr(account)}, m.template_id, m.copy, m.hp, now() FROM m
      WHERE m.hp > 0 AND m.hp < m.max_hp
     ON CONFLICT (account_id, template_id, copy) DO UPDATE SET hp = EXCLUDED.hp, updated_at = now();`;
}
