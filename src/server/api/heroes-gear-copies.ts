// Надеть свободную копию вещи, а не снимать её с другого героя.
//
// Правило владельца (29.09.2026): «если есть копия предмета — одевается копия».
// Все три пути надевания основному — одна вещь в замке (equipArtifact), «Надеть
// лучшее» (equipBestGear) и комплект (applyGearPreset) — берут конкретный
// экземпляр: первый по id из списка, лучший по счёту или записанный в комплекте.
// Если он надет на другого героя (батрачит, отдыхает или просто не основной),
// его снимали с того героя, даже когда у игрока лежала свободная такая же.
// Теперь такой экземпляр меняется на свободную копию того же шаблона; снимать
// с другого героя — только если свободных копий нет.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";

/** Что база знает про экземпляр набора: занят ли другим героем и чем заменить. */
export type CopyInfo = { key: string; item: string; taken: boolean; free: string[] };

/**
 * Чистая часть: занятые другими героями экземпляры меняем на свободные копии
 * того же шаблона, по одной на место. Свободных нет — оставляем как есть
 * (снимут с другого героя, как раньше).
 */
export function assignFreeCopies(
  equipped: Record<string, string>,
  info: CopyInfo[],
): Record<string, string> {
  const out = { ...equipped };
  const used = new Set(Object.values(out));
  for (const r of info) {
    if (!r.taken || out[r.key] !== r.item) continue;
    const copy = r.free.find((id) => !used.has(id));
    if (!copy) continue;
    out[r.key] = copy;
    used.add(copy);
  }
  return out;
}

/** Надетое героем — парами «место → id»; не объект (битая запись) — пусто. */
const eachEquipped = (alias: string) =>
  `jsonb_each_text(CASE WHEN jsonb_typeof(${alias}.equipped::jsonb) = 'object'
                        THEN ${alias}.equipped::jsonb ELSE '{}'::jsonb END)`;

/** SQL разбора набора — текстом: так его видно в тестах и на живой базе. */
export function freeCopiesSql(
  account: string,
  heroId: string,
  equipped: Record<string, string>,
): string | null {
  const pairs = Object.entries(equipped).filter(([, id]) => !!id);
  if (pairs.length === 0) return null;
  const want = pairs.map(([k, id]) => `(${sqlStr(k)}, ${sqlStr(id)})`).join(",");
  const acc = sqlStr(account);
  return `WITH want(key, item) AS (VALUES ${want}),
     others AS (
       SELECT x.value AS item FROM yuplink.hero_instance h, ${eachEquipped("h")} x
        WHERE h.account_id = ${acc} AND h.id <> ${sqlStr(heroId)} AND x.value IS NOT NULL
     )
     SELECT w.key, w.item,
            EXISTS (SELECT 1 FROM others o WHERE o.item = w.item) AS taken,
            COALESCE((SELECT json_agg(f.id ORDER BY f.id) FROM yuplink.user_game_item f
                       WHERE f.account_id = ${acc} AND f.kind = 'artifact'
                         AND f.template_id = u.template_id
                         AND f.id NOT IN (SELECT item FROM others)
                         AND f.id NOT IN (SELECT item FROM want)), '[]'::json) AS free
       FROM want w JOIN yuplink.user_game_item u ON u.id = w.item;`;
}

/** Набор для героя: занятые другими героями экземпляры — на свободные копии. */
export async function preferFreeCopies(
  account: string,
  heroId: string,
  equipped: Record<string, string>,
): Promise<Record<string, string>> {
  const sql = freeCopiesSql(account, heroId, equipped);
  if (!sql) return equipped;
  const rows = (await mcpExec(sql, { wrapJson: true })) as Array<{
    key: string;
    item: string;
    taken: boolean;
    free: unknown;
  }>;
  const info: CopyInfo[] = (rows ?? []).map((r) => {
    const free = typeof r.free === "string" ? JSON.parse(r.free) : r.free;
    return {
      key: String(r.key),
      item: String(r.item),
      taken: !!r.taken,
      free: Array.isArray(free) ? free.map(String) : [],
    };
  });
  return assignFreeCopies(equipped, info);
}
