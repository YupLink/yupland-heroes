// База входа по кошельку (migrations/wallet-login-01.sql): номер кошелька и журнал
// входов. Новых аккаунтов по кошельку нет (владелец, 06.11.2026). Только сервер.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { isWalletTg } from "@/lib/auth/googleTg";

const toTg = (v: unknown): number => {
  const n = Number(v);
  if (!isWalletTg(n)) throw new Error(`walletLogin: номер вне диапазона (${String(v)})`);
  return n;
};

/**
 * Номер кошельку (функция базы wallet_login_claim, под замком): уже есть — тот же;
 * legacy — пишется в его аккаунт.
 */
export async function claimWalletTg(
  wallet: string,
  kind: "new" | "legacy",
  limit: number,
): Promise<number | null> {
  const rows = (await mcpExec(
    `SELECT yuplink.wallet_login_claim(${sqlStr(wallet)}, ${sqlStr(kind)}, ${Math.max(0, Math.trunc(limit))})::text AS tg`,
    { wrapJson: true },
  )) as Array<{ tg: string | null }>;
  const tg = rows?.[0]?.tg;
  return tg == null ? null : toTg(tg);
}

export type WalletLoginLogRow = {
  wallet: string;
  tgId: number;
  accountId: string | null;
  kind: "tg" | "legacy" | "new";
  created: boolean;
  device: string | null;
  fp: string | null;
  ip: string | null;
  ua: string | null;
};

const optStr = (v: string | null) => (v ? sqlStr(v) : "NULL");

/** Каждый вход по кошельку — строка журнала (статистика владельца). */
export async function logWalletLogin(r: WalletLoginLogRow): Promise<void> {
  await mcpExec(
    `INSERT INTO yuplink.wallet_login_log
       (wallet, tg_id, account_id, kind, created, device, fp, ip, ua)
     VALUES (${sqlStr(r.wallet)}, ${Math.trunc(r.tgId)}, ${optStr(r.accountId)}, ${sqlStr(r.kind)},
             ${r.created ? "true" : "false"}, ${optStr(r.device)}, ${optStr(r.fp)},
             ${optStr(r.ip)}, ${optStr(r.ua)});`,
  );
}

/**
 * Кошелёк со своим номером входа привязали подписью к настоящему Telegram:
 * номер уступает место Telegram — кошельки аккаунта переезжают на него, аккаунт
 * отпускает номер (adoptTelegramAccount дальше поставит Telegram), место — свободно.
 * Иначе после одного входа по кошельку аккаунт навсегда остался бы без вывода.
 */
export async function releaseWalletTg(walletTg: number, realTg: number): Promise<void> {
  const syn = toTg(walletTg);
  const tg = Math.trunc(realTg);
  if (!Number.isSafeInteger(tg) || tg <= 0 || isWalletTg(tg)) throw new Error("walletLogin: не Telegram");
  await mcpExec(
    `UPDATE yuplink.users SET telegram_id = ${tg} WHERE telegram_id = ${syn};
     UPDATE yuplink.accounts SET telegram_id = NULL WHERE telegram_id = ${syn};
     DELETE FROM yuplink.account_wallet_login WHERE tg_id = ${syn};`,
    { wrapJson: false },
  );
}
