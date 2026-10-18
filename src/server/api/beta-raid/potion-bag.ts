// Сумка зелий на сервере: какой стек героя — зелье.
//
// Физически зелья лежат в той же таблице raid_hero_backpack, что и рюкзак; сумку
// от рюкзака отличает галочка is_potion у своего товара (raid_custom_item).
// Поэтому снятая или поставленная админом галочка сразу переносит вид между
// рюкзаком и сумкой — переносить строки не нужно.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

/** JOIN строки рюкзака `b` к её товару: даёт `ci.is_potion` для custom-стеков. */
export const POTION_JOIN = `LEFT JOIN yuplink.raid_custom_item ci
  ON b.kind = 'custom' AND ci.id = split_part(b.stack_key, ':', 2)`;

/** SQL-выражение «строка рюкзака — зелье» (после POTION_JOIN). */
export const IS_POTION_SQL = "COALESCE(ci.is_potion, false)";

/** Id своего товара из ключа стека «custom:cst_…». У прочих видов — null. */
function customIdOf(stackKey: string): string | null {
  const i = stackKey.indexOf(":");
  if (i < 0 || stackKey.slice(0, i) !== "custom") return null;
  const id = stackKey.slice(i + 1);
  return id.startsWith("cst_") ? id : null;
}

/** Какие из ключей стеков — зелья (товар с галочкой is_potion). */
export async function potionKeysOf(keys: readonly string[]): Promise<Set<string>> {
  const byId = new Map<string, string[]>();
  for (const k of keys) {
    const id = customIdOf(k);
    if (id) byId.set(id, [...(byId.get(id) ?? []), k]);
  }
  const out = new Set<string>();
  if (byId.size === 0) return out;
  const rows = (await mcpExec(
    `SELECT id FROM yuplink.raid_custom_item
      WHERE is_potion AND id IN (${[...byId.keys()].map(sqlStr).join(",")});`,
    { wrapJson: true },
  )) as Array<{ id: string }>;
  for (const r of rows ?? []) for (const k of byId.get(String(r.id)) ?? []) out.add(k);
  return out;
}
