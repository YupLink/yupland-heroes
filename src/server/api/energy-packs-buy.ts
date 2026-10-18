// Энергопаки: покупка за билеты, $DARAI и токены.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg, sb } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { assertNotMaintenance } from "../maintenance";
import { requireFreshClient } from "../buildGate";
import { accountOf } from "./user-shared";
import {
  DARAI_FT_CONTRACT,
  DARAI_DECIMALS,
  DARAI_DEPOSIT_RECEIVER,
  ENERGY_SHOP_KEY,
  requireWallet,
  requireAdmin,
  sqlStr,
  applyDiscountCeil,
  energyShopEnabled,
  getCurrentWallet,
  isAdminWallet,
  mapEnergyErr,
} from "./energy-packs-shared";

// ──────── ПОКУПКА за билеты ────────
export const buyEnergyPackViaTickets = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ packId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const pack = await pg.energyPacks.findOne({ id: data.packId });
    if (!pack || !pack.active) throw new Error("Пак не найден");
    if (pack.price_tickets == null && !pack.price_steps) {
      throw new Error("Этот пак нельзя купить за билеты");
    }

    const { computeTickets, invalidateTicketsCache, getSisterWallets, fetchSubscriptionDiscount } =
      await import("./user");
    const disc = (await fetchSubscriptionDiscount(wallet)).discountPct ?? 0;
    // Если у пака задана лестница — цена берётся из текущей ступени
    // (каждая следующая покупка за день дороже, кончились ступени — стоп).
    const { pricingOf, requireCurrencyPrice } = await import("./energy-packs-steps");
    const hasLadder = pricingOf(pack).length > 0;
    const stepAccount = await accountOf(wallet);
    const basePrice = hasLadder
      ? await requireCurrencyPrice(pack, stepAccount, { kind: "tickets" })
      : (pack.price_tickets ?? 0);
    const price = applyDiscountCeil(basePrice, disc);
    const sisters = await getSisterWallets(wallet);
    // Atomic: блокировка пака + per-account advisory-lock + дневной лимит (по
    // закоммиченным строкам) + запись расхода + начисление энергии — всё в одной
    // транзакции. idk уникален на покупку.
    const idk = `ep:${nanoid(12)}`;
    // Сначала ДЕНЬГИ, потом товар. Раньше энергию выдавали, а списывали после —
    // при отказе списания игрок получал пак бесплатно, и два параллельных
    // запроса внутри 5-секундного кэша баланса проходили проверку оба.
    // moveTickets блокирует строку баланса и не пускает в минус, поэтому
    // «проверка» тут не нужна — сам факт списания и есть проверка.
    const { moveTickets } = await import("./tickets-ledger");
    try {
      await moveTickets({ wallet, delta: -price, kind: "energy_pack", ref: idk });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("not_enough_tickets") || msg.includes("Не хватает")) {
        const have = (await computeTickets(wallet)).availableRaw;
        throw new Error(`Не хватает билетов (есть ${have.toFixed(2)}, нужно ${price})`);
      }
      throw e;
    }
    const { data: rows, error } = await sb.rpc("buy_energy_pack_atomic", {
      p_wallet: wallet,
      p_pack_id: pack.id,
      p_pay_with: "tickets",
      p_sisters: sisters,
      p_tickets_price: price,
      p_idk: idk,
    });
    if (error) {
      // Возвращаем, только если пака ДЕЙСТВИТЕЛЬНО нет. mcpExec повторяет
      // запрос по таймауту: покупка могла закоммититься, а ошибка прилететь —
      // слепой возврат в этом случае отдаёт энергию бесплатно.
      const done = await pg.energyPackPurchases
        .findFirst({ idempotency_key: idk })
        .catch(() => null);
      if (!done) {
        await moveTickets({
          wallet,
          delta: price,
          kind: "refund",
          ref: `ep-undo:${idk}`,
        }).catch((e: unknown) => console.error(`[energy-pack] возврат не прошёл ${wallet}:`, e));
      }
      invalidateTicketsCache(sisters);
      if (done) {
        // Пак всё-таки выдан — отвечаем успехом, а не ошибкой с возвратом.
        return {
          ok: true as const,
          energyAdded: Number(done.amount ?? pack.amount),
          ticketsSpent: price,
        };
      }
      throw new Error(mapEnergyErr(error.message || String(error), pack.daily_limit));
    }
    invalidateTicketsCache(sisters);
    const row = (rows as Array<{ energy_added: number; tickets_spent: number }>)[0];
    return {
      ok: true as const,
      energyAdded: row?.energy_added ?? pack.amount,
      ticketsSpent: price,
    };
  });

// Маппинг ошибок atomic-функции в человекочитаемые сообщения.

// ──────── ПОКУПКА за DARAI (on-chain) ────────
export const buyEnergyPackViaDarai = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ packId: z.string().min(1), txHash: z.string().min(20).max(64) }).parse(d),
  )
  .handler(async ({ data }) => {
    requireFreshClient();
    const wallet = requireWallet();
    // Оплата подписью кошелька закрыта после раскатки счёта.
    const { assertWalletPurchaseAllowed } = await import("./account-rollout");
    await assertWalletPurchaseAllowed();
    const pack = await pg.energyPacks.findOne({ id: data.packId });
    if (!pack || !pack.active) throw new Error("Пак не найден");

    // Цена — из текущей ступени лестницы, как её видит игрок в списке. Раньше
    // здесь бралось старое одиночное поле price_darai: витрина показывала
    // 500 000, а списывался миллион.
    const { pricingOf, requireCurrencyPrice } = await import("./energy-packs-steps");
    const hasLadder = pricingOf(pack).length > 0;
    if (!hasLadder && pack.price_darai == null) {
      throw new Error("Этот пак нельзя купить за $DARAI");
    }
    const price = hasLadder
      ? await requireCurrencyPrice(pack, await accountOf(wallet), { kind: "darai" })
      : Number(pack.price_darai);

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

    // 1) Verify on-chain (как purchaseChipPackViaDarai): signer ∈ sisters,
    //    receiver = DARAI-контракт, ft_transfer на приёмник, сумма ≥ цены.
    //    Депозит кредитует баланс; списание/лимит/начисление — в atomic-функции.
    const existingDep = await pg.daraiDeposits.findFirst({ tx_hash: data.txHash });
    if (!existingDep) {
      // ОБЩИЙ надёжный verifyFtTransfer (Sendler + RPC-фолбэк, перебор всех
      // sister-кошельков, ретраи). Раньше был ручной one-shot `tx` с ОДНИМ
      // отправителем allowed[0] → чужой sister-подписант / несинхрон RPC ронял
      // verify, DARAI ушли, энергия не начислялась, авто-реконсиляции нет.
      const allowed = Array.from(new Set([wallet, ...sisters]));
      const { verifyFtTransfer } = await import("../near");
      const { actualSender } = await verifyFtTransfer({
        receiptPurpose: "darai" as const,
        txHash: data.txHash,
        senderAccount: allowed,
        ftContract: DARAI_FT_CONTRACT,
        expectedReceiver: DARAI_DEPOSIT_RECEIVER,
        minAmountHuman: price,
        decimals: DARAI_DECIMALS,
      });
      await pg.daraiDeposits.insert({
        id: nanoid(),
        wallet: actualSender,
        amount: price,
        tx_hash: data.txHash,
        ft_contract: DARAI_FT_CONTRACT,
        receiver_id: DARAI_DEPOSIT_RECEIVER,
        created_at: new Date().toISOString(),
      });
    }

    // 2) Atomic: дневной лимит + проверка DARAI-баланса (redemptions+deposits−spend−mintspend
    //    по аккаунту, как computeDaraiBalance) ≥ цены + запись расхода + начисление энергии —
    //    всё в одной транзакции. Идемпотентно по idk (повтор/реюз tx на дорогой пак заблокирован:
    //    баланс уже списан прошлой покупкой → not_enough_darai).
    const { data: rows, error } = await sb.rpc("buy_energy_pack_atomic", {
      p_wallet: wallet,
      p_pack_id: pack.id,
      p_pay_with: "darai",
      p_sisters: sisters,
      p_tickets_price: 0,
      p_idk: idk,
      p_price: price,
    });
    if (error) throw new Error(mapEnergyErr(error.message || String(error), pack.daily_limit));
    const row = (rows as Array<{ energy_added: number; darai_spent: number }>)[0];
    // Внешний магазин, но за DARAI — по правилу пользователя такая покупка
    // всё равно наполняет пул карты. Ключ = idk покупки: повтор нажатия
    // пул не удвоит (ON CONFLICT ref DO UPDATE в insertPoolMove).
    const spent = Number(row?.darai_spent ?? price);
    if (spent > 0) {
      const { insertPoolMove } = await import("./darai-pools-move");
      await insertPoolMove({
        pool: "map",
        kind: "player_spend",
        amount: spent,
        ref: `epack:${idk}`,
        note: "энерго-пак за DARAI",
      }).catch((e) => console.warn("[pool] энерго-пак DARAI не записан:", idk, e));
    }
    return {
      ok: true as const,
      energyAdded: row?.energy_added ?? pack.amount,
      daraiSpent: row?.darai_spent ?? price,
    };
  });
