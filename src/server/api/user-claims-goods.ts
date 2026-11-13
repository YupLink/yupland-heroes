// Награда дропа «Товар» (владелец, 28.10.2026: «для раздачи по NFT — чтобы я мог
// раздавать товары»): товар маркета (cst_…) ложится в «Подарки» аккаунта — забрать
// его можно и без героя, когда удобно; подарок не сгорает (оплачен NFT).
//
// Порядок — как у энергии (user-claims-energy): строка погашения (она же замок
// «эту NFT уже гасили») → золото платного дропа → подарок. Подарок не лёг — строку
// снимаем и золото возвращаем. Повтор того же погашения подарок не задвоит
// (ключ goodsdrop:<id погашения>). В redemptions — reward_token 'custom': такую
// строку никакая выплата токенов не оплатит.
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { goldForTicketPrice } from "@/lib/ticketGold";
import type { RewardTier } from "../random";

/** Имя и картинка товара — из справочника маркета (заодно проверка, что он есть). */
async function itemMeta(itemId: string): Promise<{ name: string; image: string | null }> {
  const rows = (await mcpExec(
    `SELECT name, image FROM yuplink.raid_custom_item WHERE id = ${sqlStr(itemId)} LIMIT 1`,
    { wrapJson: true },
  )) as Array<{ name: string; image: string | null }> | null;
  if (!rows?.[0]) throw new Error("Товар награды не найден");
  return rows[0];
}

export async function creditDropGoods(opts: {
  wallet: string;
  campaign: { id: string; contract_id: string };
  tokenId: string;
  tier: RewardTier;
  amount: number;
  ticketCost: number;
}): Promise<{ qty: number; name: string }> {
  const itemId = opts.tier.itemId;
  if (!itemId?.startsWith("cst_")) throw new Error("Товар награды не задан");
  const qty = Math.max(1, Math.round(opts.amount));
  const meta = await itemMeta(itemId);
  const { accountOf } = await import("./user-shared");
  const account = await accountOf(opts.wallet);
  const redId = nanoid();
  try {
    await pg.redemptions.insert({
      id: redId,
      contract_id: opts.campaign.contract_id,
      token_id: opts.tokenId,
      campaign_id: opts.campaign.id,
      wallet: opts.wallet,
      amount: qty,
      tx_hash: null,
      status: "paid",
      reward_token: "custom",
      ft_contract: null,
      decimals: null,
      ticket_cost: opts.ticketCost,
      redeemed_at: new Date().toISOString().replace("T", " ").slice(0, 16),
    });
  } catch {
    throw new Error("NFT уже погашен (гонка запросов)");
  }
  const { debitClaim, refundClaim } = await import("./claim-ticket-debit");
  const ref = `goodsdrop:${redId}`;
  if (!(await debitClaim({ wallet: opts.wallet, cost: opts.ticketCost, ref }))) {
    await pg.redemptions.delete({ id: redId }).catch(() => undefined);
    throw new Error(`Не хватает золота: нужно ${goldForTicketPrice(opts.ticketCost)}`);
  }
  const { createGift } = await import("./gifts-create");
  const ok = await createGift(
    {
      accountId: account,
      kind: "custom",
      amount: qty,
      refId: itemId,
      title: meta.name,
      image: meta.image,
      sourceRef: ref,
      expiresNever: true,
      // Письмо — нет: гасят пачкой, письмо на каждую NFT было бы спамом; игрок и так
      // на экране погашения, «Подарки» обновляются сразу.
    },
    { notify: false },
  ).catch((e: unknown) => {
    console.warn("[goodsdrop] подарок не лёг:", e instanceof Error ? e.message : e);
    return false;
  });
  if (!ok) {
    await pg.redemptions.delete({ id: redId }).catch(() => undefined);
    await refundClaim({ wallet: opts.wallet, cost: opts.ticketCost, ref });
    throw new Error("Не удалось выдать товар");
  }
  return { qty, name: meta.name };
}
