// chips-pack-buy — pack purchase and DARAI reconcile endpoints.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg, sb } from "../db/pg";
import { requireWallet, DARAI_FT_CONTRACT } from "./chips-mint-helpers";
import { requireFreshClient } from "../buildGate";
import { DARAI_DECIMALS, DARAI_DEPOSIT_RECEIVER } from "./chips-utils";
import { settleDaraiPackByTx } from "./chips-pack-darai";
import { assertWalletPurchaseAllowed } from "./account-rollout";

export const buyChipPack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        packId: z.string().min(1),
        payWith: z.enum(["tickets", "darai"]),
        count: z.number().int().min(1).max(50).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    {
      const p = await pg.chipPacks.findOne({ id: data.packId });
      if (p?.market_hidden) throw new Error("Этот пак только для раздач");
    }
    if (data.payWith === "tickets") {
      const pack = await pg.chipPacks.findOne({ id: data.packId });
      if (!pack) throw new Error("Пак не найден");
      if (pack.price_tickets == null) throw new Error("Этот пак нельзя купить за билеты");
      const { computeTickets } = await import("./user");
      const tix = await computeTickets(wallet);
      const need = pack.price_tickets * data.count;
      if (tix.availableRaw < need) {
        throw new Error(`Не хватает билетов (есть ${tix.availableRaw.toFixed(2)}, нужно ${need})`);
      }
    }
    const grantIds: string[] = [];
    for (let i = 0; i < data.count; i++) {
      const { data: rpcRows, error } = await sb.rpc("buy_chip_pack_atomic", {
        p_wallet: wallet,
        p_pack_id: data.packId,
        p_pay_with: data.payWith,
      });
      if (error) {
        const msg = error.message || String(error);
        if (msg.includes("pack_not_found")) throw new Error("Пак не найден");
        if (msg.includes("pack_inactive")) throw new Error("Пак неактивен");
        if (msg.includes("pack_not_started")) throw new Error("Продажи ещё не начались");
        if (msg.includes("pack_ended")) throw new Error("Продажи завершены");
        if (msg.includes("sold_out")) throw new Error("Тираж распродан");
        if (msg.includes("daily_limit")) {
          const m = msg.match(/daily_limit:(\d+)/);
          throw new Error(`Дневной лимит ${m?.[1] ?? ""} паков для этого вида исчерпан`);
        }
        if (msg.includes("not_enough_darai")) throw new Error("Не хватает $DARAI");
        if (msg.includes("no_tickets_price")) throw new Error("Пак не продаётся за билеты");
        if (msg.includes("no_darai_price")) throw new Error("Пак не продаётся за $DARAI");
        throw new Error(msg);
      }
      grantIds.push((rpcRows as Array<{ grant_id: string }>)[0].grant_id);
    }
    if (data.payWith === "tickets" && grantIds.length > 0) {
      // Билеты списывает САМА функция buy_chip_pack_atomic — там это в одной
      // транзакции с выдачей пака (ref `grant:{id}`). Второе списание отсюда
      // брало бы плату дважды: ключи идемпотентности разные, гард не спасал.
      const { invalidateTicketsCache } = await import("./user");
      invalidateTicketsCache(wallet);
    }
    // Первый купленный пак «дозревает» реферала: пригласивший получает свой тир.
    if (grantIds.length > 0) {
      const { noteReferralPurchase } = await import("../referralQualify");
      await noteReferralPurchase(wallet);
    }
    return { ok: true, grantIds, bought: grantIds.length };
  });

export const purchaseChipPackViaDarai = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        packId: z.string().min(1),
        txHash: z.string().min(20).max(64),
        count: z.number().int().min(1).max(50).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireFreshClient(); // Оплата подписью кошелька закрыта после раскатки счёта: всё платится
    // со счёта. Догоны и реконсиляции сюда НЕ попадают — уже отправленные
    // переводы обязаны доехать.
    await assertWalletPurchaseAllowed();

    const wallet = requireWallet();
    const pack = await pg.chipPacks.findOne({ id: data.packId });
    if (!pack) throw new Error("Пак не найден");
    if (!pack.active) throw new Error("Пак неактивен");
    if (pack.market_hidden) throw new Error("Этот пак только для раздач");
    if (pack.price_darai == null) throw new Error("Этот пак нельзя купить за $DARAI");
    const totalPrice = pack.price_darai * data.count;

    const existingDep = await pg.daraiDeposits.findFirst({ tx_hash: data.txHash });
    if (!existingDep) {
      const { getSisterWallets } = await import("./user");
      const sisters = await getSisterWallets(wallet);
      const allowedSenders = Array.from(new Set([wallet, ...sisters]));
      const { verifyFtTransfer } = await import("../near");
      const { actualSender } = await verifyFtTransfer({
        receiptPurpose: "darai" as const,
        txHash: data.txHash,
        senderAccount: allowedSenders,
        ftContract: DARAI_FT_CONTRACT,
        expectedReceiver: DARAI_DEPOSIT_RECEIVER,
        minAmountHuman: totalPrice,
        decimals: DARAI_DECIMALS,
      });
      await pg.daraiDeposits.insert({
        id: nanoid(),
        wallet: actualSender,
        amount: totalPrice,
        tx_hash: data.txHash,
        ft_contract: DARAI_FT_CONTRACT,
        receiver_id: DARAI_DEPOSIT_RECEIVER,
        created_at: new Date().toISOString(),
      });
    }

    const grantIds: string[] = [];
    for (let i = 0; i < data.count; i++) {
      const { data: rpcRows, error } = await sb.rpc("buy_chip_pack_atomic", {
        p_wallet: wallet,
        p_pack_id: data.packId,
        p_pay_with: "darai",
      });
      if (error) {
        const msg = error.message || String(error);
        if (msg.includes("sold_out")) throw new Error("Тираж распродан");
        if (msg.includes("daily_limit")) {
          const m = msg.match(/daily_limit:(\d+)/);
          throw new Error(`Дневной лимит ${m?.[1] ?? ""} паков исчерпан`);
        }
        if (msg.includes("not_enough_darai"))
          throw new Error("Не хватает $DARAI после verify — race condition");
        throw new Error(msg);
      }
      grantIds.push((rpcRows as Array<{ grant_id: string }>)[0].grant_id);
    }
    if (grantIds.length > 0) {
      const { noteReferralPurchase } = await import("../referralQualify");
      await noteReferralPurchase(wallet);
    }
    return {
      ok: true,
      grantIds,
      bought: grantIds.length,
      txHash: data.txHash,
      paidDarai: totalPrice,
    };
  });

export const reconcileMyDaraiPacks = createServerFn({ method: "POST" }).handler(async () => {
  requireFreshClient();
  const wallet = requireWallet();
  const { getSisterWallets } = await import("./user");
  const sisters = await getSisterWallets(wallet);
  const allowed = Array.from(new Set([wallet, ...sisters]));
  const allowedSet = new Set(allowed);

  let txns: Array<{
    transaction_hash: string;
    involved_account_id: string | null;
    delta_amount: string;
    cause: string;
    ft?: { contract?: string };
  }> = [];
  try {
    const r = await fetch(
      `https://api.nearblocks.io/v1/account/${DARAI_DEPOSIT_RECEIVER}/ft-txns?per_page=25&order=desc`,
      { headers: { accept: "application/json" } },
    );
    if (r.ok) txns = ((await r.json()) as { txns?: typeof txns }).txns ?? [];
  } catch {
    return { ok: true, recovered: 0, packs: [] as string[] };
  }

  const mine = txns.filter(
    (t) =>
      t.ft?.contract === DARAI_FT_CONTRACT &&
      t.cause === "TRANSFER" &&
      !!t.involved_account_id &&
      allowedSet.has(t.involved_account_id) &&
      BigInt(t.delta_amount || "0") > 0n,
  );
  if (mine.length === 0) return { ok: true, recovered: 0, packs: [] };

  const hashes = mine.map((t) => t.transaction_hash);
  const { data: knownRows } = await pg.daraiDeposits.raw().select("tx_hash").in("tx_hash", hashes);
  const known = new Set(((knownRows as Array<{ tx_hash: string }>) ?? []).map((r) => r.tx_hash));

  const recovered: string[] = [];
  for (const t of mine) {
    if (known.has(t.transaction_hash)) continue;
    const res = await settleDaraiPackByTx(t.transaction_hash, allowed);
    if (res) for (let i = 0; i < res.count; i++) recovered.push(res.packId);
  }
  return { ok: true, recovered: recovered.length, packs: recovered };
});
