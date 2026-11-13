// История фишек: крафт за золото (ПРАВИЛА §8.60). С 20.10.2026 крафт пишется не в
// chip_craft_ticket_spend, а в res_ledger видом craft; сорвавшийся крафт (есть
// craft_undo с тем же ключом) в историю не попадает.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";

export async function craftGoldEvents(account: string): Promise<Array<{ at: string; gold: number }>> {
  const rows = (await mcpExec(
    `SELECT l.created_at AS at, -l.delta AS gold FROM yuplink.res_ledger l
      WHERE l.account_id = ${sqlStr(account)} AND l.resource = 'gold' AND l.kind = 'craft'
        AND NOT EXISTS (SELECT 1 FROM yuplink.res_ledger u
                         WHERE u.kind = 'craft_undo' AND u.ref = l.ref)
      ORDER BY l.created_at DESC LIMIT 60;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ at: string; gold: number | string }> | null;
  return (rows ?? []).map((r) => ({ at: String(r.at), gold: Number(r.gold) || 0 }));
}
