// chips-pack-darai — settleDaraiPackByTx (reconcile helper).
import { nanoid } from "nanoid";
import { pg, sb } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { DARAI_FT_CONTRACT } from "./chips-mint-helpers";
import { DARAI_DECIMALS, DARAI_DEPOSIT_RECEIVER } from "./chips-utils";

/**
 * Досчёт ОДНОЙ оплаты пака за DARAI по txHash: RPC-верификация +
 * INSERT darai_deposits (идемпотентно) + N× buy_chip_pack_atomic.
 * Не бросает — при любой проблеме возвращает null.
 */
export async function settleDaraiPackByTx(
  txHash: string,
  allowedSenders: string[],
): Promise<{ txHash: string; packId: string; count: number } | null> {
  try {
    const dep = await pg.daraiDeposits.findFirst({ tx_hash: txHash });
    if (dep) return null;

    // Квитанция могла уже стать билетами, энергией или деньгами на счёте:
    // приёмник у всех платежей один. Без этой сверки один перевод оплачивал
    // и билеты, и паки — этот путь ходил мимо общего гарда, потому что
    // проверяет транзакцию сам, а не через verifyFtTransfer.
    const { assertReceiptFree } = await import("./receipt-guard");
    await assertReceiptFree(txHash, "darai");

    const { nearRpc } = await import("../rpc");
    const j = await nearRpc<{
      transaction?: {
        signer_id?: string;
        receiver_id?: string;
        actions?: Array<{
          FunctionCall?: { method_name?: string; args?: string };
        }>;
      };
      status?: { SuccessValue?: string };
    }>("tx", [txHash, allowedSenders[0]]);
    const tx = j.result?.transaction;
    if (!tx) return null;
    if (!tx.signer_id || !allowedSenders.includes(tx.signer_id)) return null;
    if (tx.receiver_id !== DARAI_FT_CONTRACT) return null;
    if (!j.result?.status?.SuccessValue && j.result?.status?.SuccessValue !== "") {
      return null;
    }

    let rawAmount = 0n;
    let memo = "";
    for (const a of tx.actions ?? []) {
      const fc = a.FunctionCall;
      if (!fc || fc.method_name !== "ft_transfer" || !fc.args) continue;
      try {
        const args = JSON.parse(Buffer.from(fc.args, "base64").toString("utf8")) as {
          receiver_id?: string;
          amount?: string;
          memo?: string;
        };
        if (args.receiver_id !== DARAI_DEPOSIT_RECEIVER) continue;
        rawAmount += BigInt(args.amount ?? "0");
        if (args.memo) memo = String(args.memo);
      } catch {
        /* битый base64 — пропускаем */
      }
    }
    if (rawAmount <= 0n) return null;
    const human = Number(rawAmount / 10n ** BigInt(DARAI_DECIMALS - 4)) / 1e4;

    let packId = memo.match(/buy chip pack (\S+)/)?.[1] ?? null;
    // market_hidden — паки только для раздач, их не продают. Без фильтра
    // догон подбирал их по совпадению цены и выдавал за обычный перевод.
    const packs = (await pg.chipPacks.findMany({ active: true })).filter((p) => !p.market_hidden);
    if (!packId) {
      const m = packs.find((p) => p.price_darai != null && Math.abs(p.price_darai - human) < 1);
      packId = m?.id ?? null;
    }
    if (!packId) return null;
    const pack = packs.find((p) => p.id === packId);
    if (!pack || pack.price_darai == null) return null;
    const count = Math.floor(human / pack.price_darai);
    if (count < 1) return null;

    // Депозит — он же бронь квитанции. Если строк не вставилось, значит
    // квитанцию уже засчитали параллельно, и выдавать по ней нечего.
    const ins = (await mcpExec(
      `INSERT INTO yuplink.darai_deposits(id, wallet, amount, tx_hash, ft_contract, receiver_id, created_at)
       VALUES ('${nanoid()}','${tx.signer_id.replace(/'/g, "''")}',${count * pack.price_darai},'${txHash.replace(/'/g, "''")}','${DARAI_FT_CONTRACT}','${DARAI_DEPOSIT_RECEIVER}', now())
       ON CONFLICT (tx_hash) DO NOTHING RETURNING id`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }> | null;
    if (!ins?.length) return null;
    for (let i = 0; i < count; i++) {
      const { error } = await sb.rpc("buy_chip_pack_atomic", {
        p_wallet: tx.signer_id,
        p_pack_id: packId,
        p_pay_with: "darai",
      });
      if (error) break;
    }
    // Купил пак — пригласивший дозрел до награды (правило «реф = покупатель»).
    const { noteReferralPurchase } = await import("../referralQualify");
    await noteReferralPurchase(tx.signer_id);
    return { txHash, packId, count };
  } catch {
    return null;
  }
}
