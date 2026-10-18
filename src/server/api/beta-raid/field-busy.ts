// Кто из героев аккаунта сейчас батрачит на грядке.
//
// Отдельный модуль, потому что спрашивают двое: список героев в замке (чтобы
// пометить занятого и не отдавать его в основные) и окно поля. Ответ —
// «id героя → q,r грядки».
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

export async function fieldBusyByHero(account: string | null): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!account) return out;
  const rows = (await mcpExec(
    `SELECT hero_id, q, r FROM yuplink.raid_field_worker
      WHERE account_id = ${sqlStr(account)} AND hero_id IS NOT NULL;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ hero_id: string; q: number; r: number }>;
  for (const row of rows ?? []) out.set(String(row.hero_id), `${Number(row.q)},${Number(row.r)}`);
  return out;
}
