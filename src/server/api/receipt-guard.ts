// Одна квитанция — один товар.
//
// Приёмник у билетов, энергии, паков и пополнения счёта ОДИН
// (darai_gdrop.near). Каждая точка покупки проверяла только свою таблицу, и
// один перевод оплачивал сразу несколько вещей: 15 GP вместо 30, потом ещё
// билеты сверху. Проверка живёт здесь одним запросом, а зовётся из
// verifyFtTransfer — то есть со ВСЕХ путей сразу, включая будущие.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

/** Что покупают этой квитанцией. Своя таблица из проверки исключается: у неё
 *  есть собственная идемпотентность, и повтор там — штатный, а не кража. */
export type ReceiptPurpose = "tickets" | "energy" | "darai" | "account";

/** Экспортируется: тот же список «квитанция уже стала товаром» нужен сверке
 *  пула карты — пополнение с кошелька коллекции не засчитывается, если этим
 *  переводом игрок что-то купил. Новый способ покупки закроет оба места разом. */
export const CHECKS: Record<ReceiptPurpose, (tx: string) => string> = {
  tickets: (tx) =>
    `SELECT 1 FROM yuplink.ticket_purchases
      WHERE lower(near_tx_hash) = ${tx} OR lower(idempotency_key) = 'ft:' || ${tx} LIMIT 1`,
  energy: (tx) =>
    `SELECT 1 FROM yuplink.energy_pack_purchases
      WHERE lower(tx_hash) = ${tx} OR lower(idempotency_key) LIKE 'ft:' || ${tx} || '%' LIMIT 1`,
  darai: (tx) => `SELECT 1 FROM yuplink.darai_deposits WHERE lower(tx_hash) = ${tx} LIMIT 1`,
  account: (tx) => `SELECT 1 FROM yuplink.acc_deposit_tx WHERE lower(tx_hash) = ${tx} LIMIT 1`,
};

const HUMAN: Record<ReceiptPurpose, string> = {
  tickets: "по ней уже выдана покупка",
  energy: "по ней уже начислена энергия",
  darai: "она уже зачтена в DARAI-баланс",
  account: "она уже зачтена на ресурсный счёт",
};

/**
 * Бросает, если эта квитанция уже превращена в товар где-то ещё.
 * `mine` — свой вид покупки, его не проверяем.
 */
export async function assertReceiptFree(txHash: string, mine: ReceiptPurpose): Promise<void> {
  const tx = sqlStr(txHash.trim().toLowerCase());
  const others = (Object.keys(CHECKS) as ReceiptPurpose[]).filter((k) => k !== mine);
  const sql = others
    .map((k) => `SELECT ${sqlStr(k)} AS src WHERE EXISTS (${CHECKS[k](tx)})`)
    .join(" UNION ALL ");
  const rows = (await mcpExec(`${sql};`, { wrapJson: true })) as Array<{ src: string }> | null;
  const hit = rows?.[0]?.src as ReceiptPurpose | undefined;
  if (hit) throw new Error(`Эта квитанция уже использована: ${HUMAN[hit]}`);
}
