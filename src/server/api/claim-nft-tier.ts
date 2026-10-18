// Выдача яруса-«NFT-приз» в клейме: одна дорога для простого и комбо-дропа.
//
// Порядок здесь неслучаен. Резерв приза занимает штуку в пуле и вернуть её
// нельзя, поэтому билеты уходят ПЕРЕД резервом, а не после выдачи: раньше
// оплата шла последней, её ошибка глоталась, и приз доставался бесплатно.
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { tryReserveNftPrize } from "./user-claims-core";
import { debitClaim, refundClaim } from "./claim-ticket-debit";

export type NftTierToken = { token: string; owner: string };

export async function awardNftTier(opts: {
  nftContract: string | null | undefined;
  nftTitle: string;
  dropId: string;
  contractId: string;
  rewardToken: string;
  /** С чьего счёта платим (сессия), и на кого записываем приз. */
  payerWallet: string;
  ownerWallet: string;
  /** Весь набор: цена и сумма пишутся в первую строку, остальные — «paid». */
  tokens: NftTierToken[];
  ticketDebit: number;
  ticketCost: number;
  nowIso: string;
}): Promise<boolean> {
  const redId = nanoid();
  const ref = `redeem:${redId}`;
  if (!(await debitClaim({ wallet: opts.payerWallet, cost: opts.ticketDebit, ref })))
    return false;

  const reserved = await tryReserveNftPrize({
    contractId: opts.nftContract ?? opts.contractId,
    nftTitle: opts.nftTitle,
    userWallet: opts.ownerWallet,
    campaignId: opts.dropId,
  });
  if (!reserved) {
    await refundClaim({ wallet: opts.payerWallet, cost: opts.ticketDebit, ref });
    return false;
  }

  const rows: string[] = [];
  try {
    for (let i = 0; i < opts.tokens.length; i++) {
      const t = opts.tokens[i];
      const rowId = i === 0 ? redId : nanoid();
      rows.push(rowId);
      await pg.redemptions.insert({
        id: rowId,
        contract_id: opts.contractId,
        token_id: t.token,
        campaign_id: opts.dropId,
        wallet: t.owner,
        amount: 0,
        tx_hash: null,
        status: "paid",
        reward_token: opts.rewardToken,
        ft_contract: null,
        decimals: null,
        ticket_cost: i === 0 ? opts.ticketCost : 0,
        redeemed_at: opts.nowIso,
      });
    }
    return true;
  } catch {
    // Гонка: часть строк уже была. Снимаем свои и возвращаем билеты —
    // приз останется зарезервированным, это видно в админке пула.
    await Promise.all(rows.map((id) => pg.redemptions.delete({ id }).catch(() => undefined)));
    await refundClaim({ wallet: opts.payerWallet, cost: opts.ticketDebit, ref });
    return false;
  }
}
