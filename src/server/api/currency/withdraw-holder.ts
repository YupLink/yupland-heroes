// Вывод DARAI со счёта, на котором есть DARAI из NFT-холдеров (ПРАВИЛА §8.51):
// обычные — заявкой сразу и без комиссии, холдерские — последними, списываются
// сейчас и ждут 7 или 30 дней, комиссия 5 % (holder_withdraw_request, bank-06).
// Метки нет — null, и вывод идёт прежним путём (acc_withdraw_request).
import { sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { accBalance, humanizeAccError } from "./move";

type Row = { days: number; id: string | null; payout: number | null; release_at: string | null };

export async function holderWithdraw(opts: {
  account: string;
  wallet: string;
  amount: number;
  recipient: string;
  idk: string;
}): Promise<{ requestId: string; balance: number } | null> {
  const tag = (await mcpExec(
    `SELECT (d7 + d30)::text AS t FROM yuplink.holder_darai WHERE account_id = ${sqlStr(opts.account)};`,
    { wrapJson: true },
  )) as Array<{ t: string }>;
  if (!(Number(tag?.[0]?.t) > 0)) return null;
  const { data, error } = await sb.rpc("holder_withdraw_request", {
    p_account: opts.account,
    p_wallet: opts.wallet,
    p_amount: opts.amount,
    p_recipient: opts.recipient,
    p_idk: opts.idk,
  });
  if (error) throw new Error(humanizeAccError(String(error.message ?? "")));
  const rows = (data as Row[] | null) ?? [];
  const now = rows.find((r) => Number(r.days) === 0) ?? rows[0];
  return { requestId: String(now?.id ?? ""), balance: await accBalance(opts.wallet, "Darai") };
}
