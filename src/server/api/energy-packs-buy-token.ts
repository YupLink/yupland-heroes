// Покупка энергии за произвольный FT-токен экосистемы (on-chain).
// За билеты и DARAI — в energy-packs-buy.ts (§13.1).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg, sb } from "../db/pg";
import { requireFreshClient } from "../buildGate";
import { DARAI_DEPOSIT_RECEIVER, mapEnergyErr, requireWallet } from "./energy-packs-shared";
import { assertWalletPurchaseAllowed } from "./account-rollout";
import { accountOf } from "./user-shared";

// ──────── ПОКУПКА за произвольный FT-токен экосистемы (on-chain) ────────
// Оплата как DARAI, но любым токеном из reward_tokens: юзер подписывает ft_transfer
// токена на приёмник (darai_gdrop.near), сервер верифицирует on-chain (сумма ≥ цены
// в токене по его decimals) и начисляет энергию идемпотентно по tx. Внутреннего
// баланса токена не ведём — деньги пришли живыми on-chain.
export const buyEnergyPackViaToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        packId: z.string().min(1),
        txHash: z.string().min(20).max(64),
        // Какой именно валютой платят. Без него сервер брал единственный
        // старый токен пака, и за любой выбор списывался он.
        tokenSymbol: z.string().min(1).max(24).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {    // Оплата подписью кошелька закрыта после раскатки счёта: всё платится
    // со счёта. Догоны и реконсиляции сюда НЕ попадают — уже отправленные
    // переводы обязаны доехать.
    await assertWalletPurchaseAllowed();

    requireFreshClient();
    const wallet = requireWallet();
    const pack = await pg.energyPacks.findOne({ id: data.packId });
    if (!pack || !pack.active) throw new Error("Пак не найден");

    const { pricingOf, requireCurrencyPrice } = await import("./energy-packs-steps");
    const hasLadder = pricingOf(pack).length > 0;
    const symbol = data.tokenSymbol ?? pack.price_token_symbol;
    if (!symbol) throw new Error("Этот пак нельзя купить за токен");
    const tok = await pg.rewardTokens.findOne({ symbol });
    if (!tok) throw new Error(`Токен ${symbol} не сконфигурирован`);


    const price = hasLadder
      ? await requireCurrencyPrice(pack, await accountOf(wallet), { kind: "token", symbol })
      : Number(pack.price_token_amount ?? 0);
    if (!price) throw new Error("Этот пак нельзя купить за токен");

    // Идемпотентность по САМОЙ ТРАНЗАКЦИИ: один перевод = одна покупка.
    // Раньше ключ включал пак, и одной оплатой в 5000 HOPE закрывались сразу
    // и пак за 1000, и пак за 2000 — энергия начислялась дважды.
    const idk = `ft:${data.txHash}`;
    const legacyIdk = `ft:${data.txHash}:${pack.id}`;
    const dup =
      (await pg.energyPackPurchases.findFirst({ idempotency_key: idk })) ??
      (await pg.energyPackPurchases.findFirst({ idempotency_key: legacyIdk })) ??
      (await pg.energyPackPurchases.findFirst({ tx_hash: data.txHash }));
    if (dup) return { ok: true as const, energyAdded: dup.amount ?? pack.amount, already: true };

    const { getSisterWallets } = await import("./user");
    const sisters = await getSisterWallets(wallet);
    const allowed = Array.from(new Set([wallet, ...sisters]));

    // Верификация on-chain: signer ∈ sisters, контракт = токен, ft_transfer на
    // приёмник, сумма ≥ цены (по decimals токена). Бросает, если не сходится.
    const { verifyFtTransfer } = await import("../near");
    await verifyFtTransfer({
      receiptPurpose: "energy" as const,
      txHash: data.txHash,
      senderAccount: allowed,
      ftContract: tok.ft_contract,
      expectedReceiver: DARAI_DEPOSIT_RECEIVER, // = darai_gdrop.near (общий приёмник платежей)
      minAmountHuman: price,
      decimals: tok.decimals,
    });

    // Atomic: дневной лимит + запись покупки + начисление энергии (идемпотентно по idk).
    const { data: rows, error } = await sb.rpc("buy_energy_pack_atomic", {
      p_wallet: wallet,
      p_pack_id: pack.id,
      p_pay_with: "token",
      p_sisters: sisters,
      p_tickets_price: 0,
      p_idk: idk,
      p_token_symbol: symbol,
      p_token_amount: price,
    });
    if (error) throw new Error(mapEnergyErr(error.message || String(error), pack.daily_limit));
    // Проставляем квитанцию: по ней покупку находит и восстановление, и
    // проверка «этот перевод уже зачтён».
    await pg.energyPackPurchases
      .update({ idempotency_key: idk }, { tx_hash: data.txHash })
      .catch(() => {});
    const row = (rows as Array<{ energy_added: number }>)[0];
    return {
      ok: true as const,
      energyAdded: row?.energy_added ?? pack.amount,
      tokenSymbol: symbol,
      tokenSpent: price,
    };
  });
