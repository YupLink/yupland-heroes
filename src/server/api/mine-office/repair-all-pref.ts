// Порог ползунка «Починить всё», выбранный игроком в последний раз (владелец,
// 05.11.2026) — на аккаунте (account_view.mine_repair_below, миграция
// mine-repair-all-02), чтобы ехал с телефона на ПК. Пишется при починке:
// «по которым последний раз выбирал чинить». Сбой записи деньги не трогает.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { MINE_REPAIR_ALL_BELOW, mineRepairAllBelow } from "@/lib/mineV2";

/** Сохранённый порог (доля 0..1); нет — по умолчанию. */
export async function savedRepairBelow(account: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT mine_repair_below AS below FROM yuplink.account_view
      WHERE account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  ).catch(() => null)) as Array<{ below: number | string | null }> | null;
  const raw = rows?.[0]?.below;
  return raw == null ? MINE_REPAIR_ALL_BELOW : mineRepairAllBelow(Number(raw));
}

/** Запомнить порог; новая строка вида — остальные поля по умолчанию («всё видно»). */
export async function saveRepairBelow(account: string, below: number): Promise<void> {
  const v = mineRepairAllBelow(below);
  await mcpExec(
    `INSERT INTO yuplink.account_view (account_id, mine_repair_below)
     VALUES (${sqlStr(account)}, ${v})
     ON CONFLICT (account_id) DO UPDATE SET
       mine_repair_below = EXCLUDED.mine_repair_below, updated_at = now();`,
  ).catch(() => {});
}
