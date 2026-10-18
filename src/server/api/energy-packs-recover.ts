// Самовосстановление покупки энергии: оплатил on-chain, энергия не пришла.
// Отделено от покупки (§13.1); общий приёмник платежей — тот же.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg, sb } from "../db/pg";
import { moneyGate } from "../rateGate";
import { accountOf } from "./user-shared";
import {
  DARAI_FT_CONTRACT,
  DARAI_DECIMALS,
  DARAI_DEPOSIT_RECEIVER,
  requireWallet,
} from "./energy-packs-shared";

// ──────── САМОВОССТАНОВЛЕНИЕ покупки энергии (оплатил on-chain, энергия не пришла) ────────
// Игрок вставляет txHash своей оплаты (DARAI/токен → darai_gdrop.near) и выбирает
// пак. Сервер ВЕРИФИЦИРУЕТ платёж on-chain (токен+сумма+приёмник+отправитель∈sisters)
// и начисляет энергию НАПРЯМУЮ (в обход дневного лимита — платёж реальный).
// Идемпотентность ПО TX (один tx = одно начисление, нельзя натянуть на 2 пака).
export const recoverMyEnergyPurchase = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        packId: z.string().min(1),
        txHash: z.string().min(20).max(64),
        /** Чем платили — для паков с лестницей цен по валютам. */
        tokenSymbol: z.string().min(1).max(24).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    await moneyGate("energy-recover", wallet);
    const pack = await pg.energyPacks.findOne({ id: data.packId });
    if (!pack || !pack.active) throw new Error("Пак не найден");

    // Платёжный токен + цена (лестница ИЛИ старые одиночные поля).
    let ftContract: string;
    let decimals: number;
    let price: number;
    const { pricingOf: pricingOfPack, requireCurrencyPrice } = await import(
      "./energy-packs-steps"
    );
    const ladder = pricingOfPack(pack);
    const ladderSymbol = data.tokenSymbol;
    const isToken = !!pack.price_token_symbol && pack.price_token_amount != null;
    // Цена — ТЕКУЩАЯ ступень и текущий дневной лимит, как в обычной покупке.
    // Раньше брали самую дешёвую ступень и лимит не смотрели вовсе: догон
    // превращался в вечную первую цену без потолка, и его доили — по одному
    // паку пять покупок за сутки при лестнице «один раз по каждой цене».
    // Переплата остаётся переплатой игрока, а не скидкой навсегда.
    const stepAccount = await accountOf(wallet);
    const ladderPriceOf = async (symbol: string | null) =>
      requireCurrencyPrice(
        pack,
        stepAccount,
        symbol ? { kind: "token", symbol } : { kind: "darai" },
      );
    if (ladder.length > 0 && ladderSymbol) {
      const tok = await pg.rewardTokens.findOne({ symbol: ladderSymbol });
      if (!tok) throw new Error(`Токен ${ladderSymbol} не сконфигурирован`);
      ftContract = tok.ft_contract;
      decimals = tok.decimals;
      price = await ladderPriceOf(ladderSymbol);
    } else if (ladder.length > 0 && !ladderSymbol) {
      // Пустой символ = платили $DARAI. В лестнице он лежит отдельным видом,
      // поэтому раньше запрос уходил в мёртвую ветку и падал с «нет цены».
      price = await ladderPriceOf(null);
      ftContract = DARAI_FT_CONTRACT;
      decimals = DARAI_DECIMALS;
    } else if (isToken) {
      const tok = await pg.rewardTokens.findOne({ symbol: pack.price_token_symbol! });
      if (!tok) throw new Error(`Токен ${pack.price_token_symbol} не сконфигурирован`);
      ftContract = tok.ft_contract;
      decimals = tok.decimals;
      price = Number(pack.price_token_amount);
    } else if (pack.price_darai != null) {
      ftContract = DARAI_FT_CONTRACT;
      decimals = DARAI_DECIMALS;
      price = Number(pack.price_darai);
    } else {
      throw new Error("У этого пака нет цены за токен/$DARAI");
    }

    // Идемпотентность ПО TX: этот платёж уже начислял энергию? (любой пак)
    const used = await pg.energyPackPurchases.findFirst({ tx_hash: data.txHash });
    if (used) return { ok: true as const, already: true as const, energyAdded: used.amount };
    // DARAI-пак: если этот tx уже зачтён как DARAI-депозит (баланс кредитован) —
    // не восстанавливаем повторно (энергию можно докупить из баланса штатно).
    if (!isToken) {
      const dep = await pg.daraiDeposits.findFirst({ tx_hash: data.txHash });
      if (dep) throw new Error("Этот DARAI-платёж уже зачтён в баланс — купи пак обычной кнопкой");
    }

    // Верификация on-chain: signer ∈ sisters, контракт = токен пака, ft_transfer на
    // приёмник darai_gdrop.near, сумма ≥ цены. Бросает, если платёж не сходится.
    const { getSisterWallets } = await import("./user");
    const sisters = await getSisterWallets(wallet);
    const allowed = Array.from(new Set([wallet, ...sisters]));
    const { verifyFtTransfer } = await import("../near");
    const { actualSender, paidHuman } = await verifyFtTransfer({
      receiptPurpose: "energy" as const,
      txHash: data.txHash,
      senderAccount: allowed,
      ftContract,
      expectedReceiver: DARAI_DEPOSIT_RECEIVER,
      minAmountHuman: price,
      decimals,
    });

    const paidSymbol =
      ladder.length > 0
        ? (ladderSymbol ?? null)
        : isToken
          ? (pack.price_token_symbol ?? null)
          : null;

    // Кредит НАПРЯМУЮ (зеркало успешной покупки): запись EPP + начисление энергии.
    await pg.energyPackPurchases.insert({
      id: `epp_${nanoid(12)}`,
      pack_id: pack.id,
      wallet,
      amount: pack.amount,
      // Валюта — ТА, КОТОРОЙ заплатили. Платёж в USDT ложился в базу как HOPE
      // (настройка пака), и счётчик ступени считал не ту полку.
      pay_with: paidSymbol ? "token" : "darai",
      tickets_spent: 0,
      darai_spent: paidSymbol ? 0 : price,
      tx_hash: data.txHash,
      idempotency_key: `ft:${data.txHash}:${pack.id}`,
      token_symbol: paidSymbol,
      token_spent: paidSymbol ? price : null,
    } as unknown as Record<string, unknown>);
    await sb.rpc("add_energy", {
      p_wallet: wallet,
      p_amount: pack.amount,
      p_kind: "energy_pack",
      p_ref: data.txHash,
    });
    return {
      ok: true as const,
      already: false as const,
      energyAdded: pack.amount,
      tokenSymbol: pack.price_token_symbol ?? "$DARAI",
      paid: paidHuman,
      actualSender,
    };
  });
