// Белый список вывода — правка владельцем (11.11.2026: «дать — только мне, и также
// возможность как добавлять, так и убирать такую привилегию»). Только кошельки
// PAYOUTS_ADMIN_WALLETS (requirePayoutsAdmin); каждое нажатие — строка журнала.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePayoutsAdmin } from "../../auth";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { forgetWithdrawListed } from "./withdrawList";

const ACCOUNT_RE = /^acc_[A-Za-z0-9_-]{4,40}$/;

/** Одна команда записи: под wrapJsonCte вложенный WITH с записью не проходит. */
export function setListedSql(account: string, on: boolean, by: string): string {
  const a = sqlStr(account);
  return on
    ? `INSERT INTO yuplink.withdraw_whitelist (account_id, added_by, note)
       SELECT id, ${sqlStr(by)}, 'владелец' FROM yuplink.accounts WHERE id = ${a}
       ON CONFLICT (account_id) DO NOTHING
       RETURNING account_id`
    : `DELETE FROM yuplink.withdraw_whitelist WHERE account_id = ${a} RETURNING account_id`;
}

export function logSql(account: string, on: boolean, by: string): string {
  return `INSERT INTO yuplink.withdraw_whitelist_log (account_id, action, by_wallet)
          VALUES (${sqlStr(account)}, ${on ? "'add'" : "'remove'"}, ${sqlStr(by)});`;
}

export const adminSetWithdrawListed = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ account: z.string().regex(ACCOUNT_RE), on: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    const by = requirePayoutsAdmin();
    const rows = (await mcpExec(setListedSql(data.account, data.on, by), {
      wrapJsonCte: true,
    })) as Array<{ account_id: string }>;
    const changed = (rows ?? []).length > 0;
    if (changed) await mcpExec(logSql(data.account, data.on, by));
    forgetWithdrawListed(data.account);
    return { ok: true as const, on: data.on, changed };
  });
