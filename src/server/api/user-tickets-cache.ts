import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { getCurrentWallet } from "../auth";
import { getSisterWallets, resolveAccountId } from "./user-shared";
import { fetchSubscriptionDiscount } from "./user-shop";
import { accountOf } from "./user-shared";
import {
  type TicketsResult, TICKETS_TTL_MS, _ticketsCache, round2, invalidateTicketsCache,
} from "./user-tickets-shared";

export { invalidateTicketsCache };

/**
 * Баланс билетов. ИСТОЧНИК ИСТИНЫ — ticket_ledger/ticket_balance: одно чтение
 * строки вместо пересчёта из десятка таблиц (отсюда же уходят подвисания на
 * 3-5 секунд и устаревшие числа после операции).
 *
 * Разбивка «сколько откуда пришло» (earnedFrom*) считается по-старому только
 * когда её реально просят: она нужна лишь для экрана истории.
 */
export async function computeTickets(wallet: string): Promise<TicketsResult> {
  const cached = _ticketsCache.get(wallet);
  if (cached && Date.now() - cached.at < TICKETS_TTL_MS) return cached.value;

  {
    const { ticketBalanceOf } = await import("./tickets-ledger");
    const balance = await ticketBalanceOf(wallet);
    const result: TicketsResult = {
      total: balance,
      used: 0,
      available: Math.floor(balance),
      availableRaw: balance,
      earnedFromReferrals: 0,
      earnedFromTasks: 0,
      earnedFromTicketEvents: 0,
      earnedFromPurchases: 0,
    };
    _ticketsCache.set(wallet, { value: result, at: Date.now() });
    return result;
  }
}

/** Старый пересчёт из таблиц-фактов: оставлен для сверки (v_tickets_drift). */
export async function computeTicketsLegacy(wallet: string): Promise<TicketsResult> {
  const sisters = await getSisterWallets(wallet);
  const refRows = (
    await pg.referrals.raw().select("friend_wallet").in("inviter_wallet", sisters)
  ).data as Array<{ friend_wallet: string }> | null;
  const sisterSet = new Set(sisters);
  const friendWallets = (refRows ?? []).map((r) => r.friend_wallet).filter((fw) => !sisterSet.has(fw));
  let earnedFromReferrals = 0;
  if (friendWallets.length > 0) {
    const friendUsersData = (
      await pg.users.raw().select("wallet,telegram_id").in("wallet", friendWallets)
    ).data as Array<{ wallet: string; telegram_id: number | null }> | null;
    const fuMap = new Map((friendUsersData ?? []).map((u) => [u.wallet, u.telegram_id]));
    const friendsWithRedemptions = (
      await pg.redemptions.raw().select("wallet").in("wallet", friendWallets)
    ).data as Array<{ wallet: string }> | null;
    const activeFriends = new Set((friendsWithRedemptions ?? []).map((r) => r.wallet));
    const dedup = new Set<string>();
    for (const fw of friendWallets) {
      if (!activeFriends.has(fw)) continue;
      const tg = fuMap.get(fw);
      dedup.add(tg ? `tg:${tg}` : `w:${fw}`);
    }
    earnedFromReferrals = dedup.size;
  }
  const taskRows = (
    await pg.taskCompletions.raw().select("task_id").in("wallet", sisters)
  ).data as Array<{ task_id: string }> | null;
  const earnedFromTasks = new Set((taskRows ?? []).map((r) => r.task_id)).size;
  const tcRows = (
    await pg.ticketClaims.raw().select("tickets_awarded").in("wallet", sisters)
  ).data as Array<{ tickets_awarded: number }> | null;
  const earnedFromTicketEvents = (tcRows ?? []).reduce((s, r) => s + (r.tickets_awarded ?? 0), 0);
  const tpRows = (
    await pg.ticketPurchases.raw().select("tickets_added").in("wallet", sisters)
  ).data as Array<{ tickets_added: number }> | null;
  const earnedFromPurchases = (tpRows ?? []).reduce((s, r) => s + (r.tickets_added ?? 0), 0);
  const myRedemps = (
    await pg.redemptions.raw().select("campaign_id,amount,ticket_cost").in("wallet", sisters).gt("ticket_cost", 0)
  ).data as Array<{ campaign_id: string | null; amount: number; ticket_cost: number | null }> | null;
  const campIdsUsed = Array.from(new Set((myRedemps ?? []).map((r) => r.campaign_id).filter(Boolean))) as string[];
  let used = 0;
  if (campIdsUsed.length > 0) {
    const camps = (
      await pg.campaigns.raw().select("id").in("id", campIdsUsed).eq("free_claim", false)
    ).data as Array<{ id: string }> | null;
    const paidIds = new Set((camps ?? []).map((c) => c.id));
    used = (myRedemps ?? [])
      .filter((r) => r.campaign_id && paidIds.has(r.campaign_id))
      .reduce((s, r) => s + (r.ticket_cost ?? 1), 0);
  }
  const likeSpendRows = (
    await pg.likePurchases.raw().select("tickets_spent").in("wallet", sisters)
  ).data as Array<{ tickets_spent: number }> | null;
  const usedForLikes = (likeSpendRows ?? []).reduce((s, r) => s + (r.tickets_spent ?? 0), 0);
  const chipPackSpendRows = (
    await pg.chipPackGrants.raw().select("tickets_spent").in("wallet", sisters)
  ).data as Array<{ tickets_spent: number }> | null;
  const usedForChipPacks = (chipPackSpendRows ?? []).reduce((s, r) => s + (r.tickets_spent ?? 0), 0);
  const energyPackSpendRows = (
    await pg.energyPackPurchases.raw().select("tickets_spent").in("wallet", sisters)
  ).data as Array<{ tickets_spent: number }> | null;
  const usedForEnergyPacks = (energyPackSpendRows ?? []).reduce((s, r) => s + Number(r.tickets_spent ?? 0), 0);
  const craftSpendRows = (
    await pg.chipCraftTicketSpend.raw().select("amount").in("wallet", sisters)
  ).data as Array<{ amount: number }> | null;
  const usedForCraft = (craftSpendRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  // Состояние майнинга живёт под ключом аккаунта.
  const miningKeys = [`mining:${await accountOf(wallet)}`];
  const collFarmKeys = sisters.map((w) => `collfarm:${w}`);
  const { data: settingRows } = await pg.settings.raw().select("key,value").in("key", [...miningKeys, ...collFarmKeys]);
  let earnedFromMining = 0;
  let usedForSlots = 0;
  let earnedFromCollectionFarm = 0;
  for (const r of (settingRows ?? []) as Array<{ key: string; value: string }>) {
    if (r.key.startsWith("mining:")) {
      try {
        const st = JSON.parse(r.value) as { lifetimeMined?: number; lifetimeSlotSpend?: number };
        earnedFromMining += Number(st.lifetimeMined ?? 0);
        usedForSlots += Number(st.lifetimeSlotSpend ?? 0);
      } catch { /* skip */ }
    } else if (r.key.startsWith("collfarm:")) {
      try {
        const st = JSON.parse(r.value) as { collections?: Record<string, { totalClaimed?: number }> };
        for (const ent of Object.values(st.collections ?? {})) earnedFromCollectionFarm += Number(ent.totalClaimed ?? 0);
      } catch { /* skip */ }
    }
  }
  const marketRows = (
    await pg.chipMarketLedger.raw().select("kind,amount_tickets").in("wallet", sisters)
  ).data as Array<{ kind: string; amount_tickets: number }> | null;
  let earnedFromMarket = 0;
  let usedForMarket = 0;
  for (const r of marketRows ?? []) {
    const a = Number(r.amount_tickets ?? 0);
    if (r.kind === "earned") earnedFromMarket += a;
    else if (r.kind === "spend") usedForMarket += a;
  }
  const totalRaw = 1 + earnedFromReferrals + earnedFromTasks + earnedFromTicketEvents + earnedFromPurchases + earnedFromMining + earnedFromCollectionFarm + earnedFromMarket;
  const total = round2(totalRaw);
  const raw = Math.max(0, round2(totalRaw - used - usedForLikes - usedForChipPacks - usedForEnergyPacks - usedForSlots - usedForCraft - usedForMarket));
  const result: TicketsResult = {
    total, used, available: Math.floor(raw), availableRaw: raw,
    earnedFromReferrals, earnedFromTasks, earnedFromTicketEvents, earnedFromPurchases,
  };
  void storeAccountTickets(wallet, raw).catch(() => {});
  return result;
}

export const getMyTickets = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return { total: 0, used: 0, available: 0, earnedFromReferrals: 0 };
  return computeTickets(wallet);
});

async function storeAccountTickets(wallet: string, availableRaw: number): Promise<void> {
  const accId = await accountOf(wallet).catch(() => null);
  if (!accId) return;
  const v = Math.round(Number(availableRaw) * 100) / 100;
  await mcpExec(
    `INSERT INTO yuplink.account_balances(account_id, tickets) VALUES('${accId.replace(/'/g, "''")}', ${v})
     ON CONFLICT (account_id) DO UPDATE SET tickets=${v}, updated_at=now();`
  );
}
