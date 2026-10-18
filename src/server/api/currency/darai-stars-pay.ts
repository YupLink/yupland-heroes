// Цены в DARAI на карте для звездочника (владелец, 07.10.2026): «звездочнику —
// альтернатива в звёздах, если DARAI на счёте не хватает; полноценному
// игроку — всегда DARAI, звёзд не показываем».
//
// Звездочник — вход только через Telegram (адрес tg<id>, lib/walletLinked.ts).
// Звёзды считаются от суммы DARAI по курсу в соотношениях подписки
// (darai-stars.ts). Пул карты пополняет только DARAI: за звёзды он не растёт.
// Возврат (услуга сорвалась) — тем же, чем заплатили: по ключу списания.
import { isWalletLinked } from "@/lib/walletLinked";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { accAccountId, accBalance } from "./move";

/** Сколько звёзд взять вместо `amount` DARAI; null — платить DARAI. */
export async function starsInsteadOfDarai(wallet: string, amount: number): Promise<number | null> {
  if (!(amount > 0) || isWalletLinked(wallet)) return null;
  if ((await accBalance(wallet, "Darai")) >= amount) return null;
  const { daraiRate, starsFromDarai } = await import("../darai-stars");
  return starsFromDarai(amount, await daraiRate());
}

/** Сколько звёзд списано по ключу `ref` (подменённая оплата DARAI); null — не звёздами. */
export async function starsPaidFor(wallet: string, ref: string): Promise<number | null> {
  const account = await accAccountId(wallet);
  if (!account) return null;
  const rows = (await mcpExec(
    `SELECT -delta AS paid FROM yuplink.acc_ledger
      WHERE account_id = ${sqlStr(account)} AND ref = ${sqlStr(ref)}
        AND token = 'STARS' AND kind = 'acc_spend' LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ paid: number }>;
  const paid = Number(rows?.[0]?.paid);
  return paid > 0 ? paid : null;
}
