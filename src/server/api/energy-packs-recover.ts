// Самовосстановление покупки энергии: оплатил on-chain, энергия не пришла.
// Отделено от покупки (§13.1); общий приёмник платежей — тот же.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg, sb } from "../db/pg";
import { moneyGate } from "../rateGate";
import { ENERGY_PAY_ONLY } from "@/lib/energyPayAllowed";
import { accountOf } from "./user-shared";
import {
  DARAI_FT_CONTRACT,
  DARAI_DECIMALS,
  DARAI_DEPOSIT_RECEIVER,
  requireWallet,
} from "./energy-packs-shared";

// ──────── САМОВОССТАНОВЛЕНИЕ покупки энергии (оплатил on-chain, энергия не пришла) ────────
// Игрок вставляет txHash своей оплаты (DARAI → darai_gdrop.near) и выбирает пак.
// Сервер ВЕРИФИЦИРУЕТ платёж on-chain (DARAI+сумма+приёмник+отправитель∈sisters)
// и начисляет энергию НАПРЯМУЮ (в обход дневного лимита — платёж реальный).
// Идемпотентность ПО TX (один tx = одно начисление, нельзя натянуть на 2 пака).
// §8.61 (владелец, 20.10.2026): энергопак за токен (USDT, magicdust, RF…) не
// продаётся — здесь только DARAI. Застрявший перевод токеном, отправленный до
// среза, добивает догон по времени блока (lost-payments-energy-settle).
export const recoverMyEnergyPurchase = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        packId: z.string().min(1),
        txHash: z.string().min(20).max(64),
        /** Чем платили: пусто или DARAI; иной токен — отказ energy.pay_only. */
        tokenSymbol: z.string().min(1).max(24).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const sym = (data.tokenSymbol ?? "").trim().replace(/^\$/, "");
    if (sym && sym.toLowerCase() !== "darai") throw new Error(ENERGY_PAY_ONLY);
    await moneyGate("energy-recover", wallet);
    const pack = await pg.energyPacks.findOne({ id: data.packId });
    if (!pack || !pack.active) throw new Error("Пак не найден");

    // Цена в DARAI: лестница ИЛИ старое одиночное поле.
    const { pricingOf: pricingOfPack, requireCurrencyPrice } = await import("./energy-packs-steps");
    let price: number;
    if (pricingOfPack(pack).length > 0) {
      // Цена — ТЕКУЩАЯ ступень и текущий дневной лимит, как в обычной покупке.
      // Раньше брали самую дешёвую ступень и лимит не смотрели вовсе: догон
      // превращался в вечную первую цену без потолка, и его доили — по одному
      // паку пять покупок за сутки при лестнице «один раз по каждой цене».
      // Переплата остаётся переплатой игрока, а не скидкой навсегда.
      price = await requireCurrencyPrice(pack, await accountOf(wallet), { kind: "darai" });
    } else if (pack.price_darai != null) {
      price = Number(pack.price_darai);
    } else {
      throw new Error(ENERGY_PAY_ONLY);
    }

    // Идемпотентность ПО TX: этот платёж уже начислял энергию? (любой пак)
    const used = await pg.energyPackPurchases.findFirst({ tx_hash: data.txHash });
    if (used) return { ok: true as const, already: true as const, energyAdded: used.amount };
    // Если этот tx уже зачтён как DARAI-депозит (баланс кредитован) — не
    // восстанавливаем повторно (энергию можно докупить из баланса штатно).
    const dep = await pg.daraiDeposits.findFirst({ tx_hash: data.txHash });
    if (dep) throw new Error("Этот DARAI-платёж уже зачтён в баланс — купи пак обычной кнопкой");

    // Верификация on-chain: signer ∈ sisters, контракт DARAI, ft_transfer на
    // приёмник darai_gdrop.near, сумма ≥ цены. Бросает, если платёж не сходится.
    const { getSisterWallets } = await import("./user");
    const sisters = await getSisterWallets(wallet);
    const allowed = Array.from(new Set([wallet, ...sisters]));
    const { verifyFtTransfer } = await import("../near");
    const { actualSender, paidHuman } = await verifyFtTransfer({
      receiptPurpose: "energy" as const,
      txHash: data.txHash,
      senderAccount: allowed,
      ftContract: DARAI_FT_CONTRACT,
      expectedReceiver: DARAI_DEPOSIT_RECEIVER,
      minAmountHuman: price,
      decimals: DARAI_DECIMALS,
    });

    // Квитанцию занимаем ДО начисления (аудит 11.11.2026): нулевая строка в
    // darai_deposits — там tx_hash уникален. Параллельный «зачесть депозитом»
    // (или второе восстановление на другой пак) тем же переводом упрётся в неё;
    // раньше обе ручки проверяли «не использована» до долгой сверки в сети и
    // одним переводом давали и энергию, и DARAI на баланс. Баланс нулевая
    // строка не меняет.
    const { mcpExec } = await import("../db/mcpClient");
    const { sqlStr } = await import("./raid-shared");
    const claimed = (await mcpExec(
      `INSERT INTO yuplink.darai_deposits (id, wallet, amount, tx_hash, ft_contract, receiver_id, created_at)
       VALUES (${sqlStr(`ddr_${nanoid(12)}`)}, ${sqlStr(actualSender)}, 0, ${sqlStr(data.txHash)},
               ${sqlStr(DARAI_FT_CONTRACT)}, ${sqlStr(DARAI_DEPOSIT_RECEIVER)}, now())
       ON CONFLICT (tx_hash) DO NOTHING
       RETURNING id`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }> | null;
    if (!claimed?.length) {
      throw new Error("Этот DARAI-платёж уже зачтён в баланс — купи пак обычной кнопкой");
    }

    // Кредит НАПРЯМУЮ (зеркало успешной покупки): запись EPP + начисление энергии.
    // Запись не легла — квитанцию освобождаем, иначе повтор упрётся в «уже зачтён».
    const claimId = claimed[0].id;
    const release = () =>
      mcpExec(
        `DELETE FROM yuplink.darai_deposits WHERE id = ${sqlStr(claimId)} AND amount = 0;`,
      ).catch(() => {});
    await pg.energyPackPurchases
      .insert({
        id: `epp_${nanoid(12)}`,
        pack_id: pack.id,
        wallet,
        amount: pack.amount,
        pay_with: "darai",
        tickets_spent: 0,
        darai_spent: price,
        tx_hash: data.txHash,
        idempotency_key: `ft:${data.txHash}:${pack.id}`,
        token_symbol: null,
        token_spent: null,
      } as unknown as Record<string, unknown>)
      .catch(async (e: unknown) => {
        await release();
        throw e;
      });
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
      tokenSymbol: "$DARAI",
      paid: paidHuman,
      actualSender,
    };
  });
