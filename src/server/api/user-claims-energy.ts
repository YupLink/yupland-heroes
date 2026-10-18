import { nanoid } from "nanoid";
import { pg, sb, type PgCampaign } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { resolveAccountId } from "./user-claims-core";

export async function storeAccountTickets(
  wallet: string,
  availableRaw: number
): Promise<void> {
  const me = (await pg.users.findOne({ wallet })) as {
    wallet: string;
    telegram_id: number | null;
    account_id?: string | null;
  } | null;
  if (!me) return;
  const accId = await resolveAccountId(me);
  if (!accId) return;
  const v = Math.round(Number(availableRaw) * 100) / 100;
  await mcpExec(
    `INSERT INTO yuplink.account_balances(account_id, tickets) VALUES('${accId.replace(/'/g, "''")}', ${v})
     ON CONFLICT (account_id) DO UPDATE SET tickets=${v}, updated_at=now();`
  );
}

export async function creditDropEnergy(opts: {
  wallet: string;
  campaign: PgCampaign;
  tokenId: string;
  amount: number;
  ticketCost: number;
}): Promise<number> {
  const amt = Math.max(0, Math.round(opts.amount));
  const redId = nanoid();
  try {
    await pg.redemptions.insert({
      id: redId,
      contract_id: opts.campaign.contract_id,
      token_id: opts.tokenId,
      campaign_id: opts.campaign.id,
      wallet: opts.wallet,
      amount: amt,
      tx_hash: null,
      status: "paid",
      reward_token: "energy",
      ft_contract: null,
      decimals: null,
      ticket_cost: opts.ticketCost,
      redeemed_at: new Date().toISOString().replace("T", " ").slice(0, 16),
    });
  } catch {
    throw new Error("NFT уже погашен (гонка запросов)");
  }
  // Платный энерго-дроп: цена в билетах писалась в запись, но из баланса не
  // уходила — клейм был бесплатным.
  if (opts.ticketCost > 0) {
    const { moveTickets } = await import("./tickets-ledger");
    // Билетов не хватило — энергию не выдаём и снимаем запись о погашении,
    // иначе NFT числится потраченной, а награды нет.
    const paid = await moveTickets({
      wallet: opts.wallet,
      delta: -opts.ticketCost,
      kind: "redemption",
      ref: `energydrop:${redId}`,
    }).catch(() => ({ applied: false }) as { applied: boolean });
    if (!paid.applied) {
      await pg.redemptions.delete({ id: redId }).catch(() => undefined);
      throw new Error("Не хватило билетов");
    }
  }
  if (amt > 0) {
    const { error } = await sb.rpc("add_energy", {
      p_wallet: opts.wallet,
      p_amount: amt,
      p_kind: "energy_drop",
      p_ref: `energydrop:${redId}`,
    });
    if (error) {
      await pg.redemptions
        .delete({
          campaign_id: opts.campaign.id,
          contract_id: opts.campaign.contract_id,
          token_id: opts.tokenId,
        })
        .catch(() => {});
      // Энергию не выдали — значит и билеты брать не за что.
      if (opts.ticketCost > 0) {
        const { moveTickets } = await import("./tickets-ledger");
        await moveTickets({
          wallet: opts.wallet,
          delta: opts.ticketCost,
          kind: "refund",
          ref: `energydrop-undo:${redId}`,
        }).catch((e: unknown) => {
          console.error(`[energy-drop] возврат билетов не прошёл ${opts.wallet}:`, e);
        });
      }
      throw new Error("Не удалось начислить энергию: " + error.message);
    }
  }
  return amt;
}
