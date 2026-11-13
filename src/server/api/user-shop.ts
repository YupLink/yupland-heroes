import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import { pg, sbPublic, type PgCampaign } from "../db/pg";
import { getCurrentWallet, isTgBypassWallet, requirePayoutsAdmin } from "../auth";
import { portalProfile } from "./user-portal-profile";
import { assertNotMaintenance } from "../maintenance";
import { mcpExec } from "../db/mcpClient";
import { sameTitle } from "@/lib/normalizeTitle";
import { fetchSendlerNftsByTitle } from "../sendler";
import { verifyFtTransfer } from "../near";
import { requireFreshClient } from "../buildGate";
import { getSisterWallets, invalidateTicketsCache } from "./user";
import { assertWalletPurchaseAllowed } from "./account-rollout";
import { refuseTicketPurchase } from "./tickets-shop-closed";

// ─── Магазин билетов: интеграция с Yupland-Energy ──────────────────────────
//
// Поток:
//   1. Юзер открывает попап «купить билеты» — вызов listMyShopOffers + getYuplandStatus
//   2. Если grant есть → getYuplandStatus вернёт текущий energy_balance.
//      Если нет → юзер жмёт «Подключить Yupland» → getYuplandAuthUrl →
//      окно с consent на yupland.io → callback /api/yupland-callback
//      обменивает code на access_token → сохраняет grant.
//   3. Юзер жмёт оффер → purchaseTicketsViaEnergy →
//      partner-energy?action=debit → INSERT ticket_purchases.
//
// Конфиг через ENV:
//   YUPLAND_API_KEY     — pk_live_... (server-only)
//   YUPLAND_CLIENT_ID   — slug нашего приложения (например golden-drop)
//   YUPLAND_PUBLIC_BASE — https://yupland.io (для redirect на consent)
//   YUPLAND_API_BASE    — https://jkjgpbawhxtafmwsrseb.supabase.co/functions/v1
//   PUBLIC_SITE_ORIGIN  — наш origin для redirect_uri
//
// OAuth-флоу Yupland удалён 2026-06-25: энергия списывается напрямую в
// public.profiles портала через MCP (см. purchaseTicketsViaEnergy), грант не
// нужен. YUPLAND_API_KEY/CLIENT_ID/_BASE больше не используются.

/**
 * Сумма балансов FT-токенов по всем sister-кошелькам текущего TG.
 * Возвращает map symbol → {totalHuman, byWallet[{wallet, human, raw}]}.
 *
 * NEAR-баланс возвращается отдельным полем (human, e.g. "12.345").
 *
 * Источник: FastNear /v1/account/{acc}/ft — индексер. Один HTTP-запрос
 * на кошелёк, параллельно. Кэш не используем т.к. UI вызывает редко.
 */
export const mySisterWalletsBalances = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return { active: null, byToken: {}, near: { totalHuman: "0" } };
  const sisters = await getSisterWallets(wallet);
  const tokens = await pg.rewardTokens.findMany();
  const tokenByContract = new Map(tokens.map((t) => [t.ft_contract, t]));

  const FASTNEAR = "https://api.fastnear.com";
  // Параллельно: для каждого sister-кошелька — FT + NEAR.
  const results = await Promise.all(
    sisters.map(async (acc) => {
      // FT
      let fts: Array<{ contract_id: string; balance: string }> = [];
      try {
        const r = await fetch(`${FASTNEAR}/v1/account/${encodeURIComponent(acc)}/ft`);
        if (r.ok) {
          const j = (await r.json()) as {
            tokens?: Array<{ contract_id: string; balance: string }>;
          };
          fts = (j.tokens ?? []).filter((t) => t.balance && t.balance !== "0");
        }
      } catch {
        // ignore single-wallet failure
      }
      // NEAR
      let nearYocto = "0";
      try {
        const { nearRpc } = await import("../rpc");
        const j = await nearRpc<{ amount?: string }>("query", {
          request_type: "view_account",
          finality: "final",
          account_id: acc,
        });
        nearYocto = j.result?.amount ?? "0";
      } catch {
        // ignore
      }
      return { acc, fts, nearYocto };
    }),
  );

  // Агрегация по symbol.
  const byToken: Record<
    string,
    {
      symbol: string;
      ftContract: string;
      decimals: number;
      totalRaw: string;
      totalHuman: string;
      byWallet: Array<{ wallet: string; raw: string; human: string }>;
    }
  > = {};

  for (const r of results) {
    for (const t of r.fts) {
      const meta = tokenByContract.get(t.contract_id);
      if (!meta) continue; // только known reward-tokens
      const cur = byToken[meta.symbol] ?? {
        symbol: meta.symbol,
        ftContract: meta.ft_contract,
        decimals: meta.decimals,
        totalRaw: "0",
        totalHuman: "0",
        byWallet: [],
      };
      cur.totalRaw = (BigInt(cur.totalRaw) + BigInt(t.balance)).toString();
      cur.byWallet.push({
        wallet: r.acc,
        raw: t.balance,
        human: rawToHumanLocal(t.balance, meta.decimals),
      });
      byToken[meta.symbol] = cur;
    }
  }
  for (const k of Object.keys(byToken)) {
    byToken[k].totalHuman = rawToHumanLocal(byToken[k].totalRaw, byToken[k].decimals);
  }

  const totalNearYocto = results.reduce((acc, r) => acc + BigInt(r.nearYocto), 0n).toString();

  return {
    active: wallet,
    byToken,
    near: {
      totalYocto: totalNearYocto,
      totalHuman: yoctoToNearHuman(totalNearYocto),
      byWallet: results.map((r) => ({
        wallet: r.acc,
        yocto: r.nearYocto,
        human: yoctoToNearHuman(r.nearYocto),
      })),
    },
  };
});

function rawToHumanLocal(raw: string, decimals: number): string {
  if (decimals === 0) return raw;
  const r = BigInt(raw);
  const divisor = 10n ** BigInt(decimals);
  const whole = r / divisor;
  const remainder = r % divisor;
  if (remainder === 0n) return whole.toString();
  const frac = remainder.toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, 4);
  return frac ? `${whole}.${frac}` : whole.toString();
}
function yoctoToNearHuman(y: string): string {
  return rawToHumanLocal(y, 24);
}

/**
 * Глобальные итоги магазина билетов: всего сожжено энергии и токенов
 * за всё время. Public-эндпоинт — отображается в шапке магазина.
 */
export const getShopGlobalStats = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await pg.ticketPurchases
    .raw()
    .select("energy_spent, payment_token, payment_amount, tickets_added");
  const rows =
    ((data ?? []) as Array<{
      energy_spent: number | null;
      payment_token: string | null;
      payment_amount: number | null;
      tickets_added: number | null;
    }>) ?? [];

  let energyBurned = 0;
  let ticketsSold = 0;
  const tokenBurned: Record<string, number> = {};
  for (const r of rows) {
    energyBurned += r.energy_spent ?? 0;
    ticketsSold += r.tickets_added ?? 0;
    if (r.payment_token && r.payment_amount) {
      tokenBurned[r.payment_token] = (tokenBurned[r.payment_token] ?? 0) + r.payment_amount;
    }
  }
  return {
    totalPurchases: rows.length,
    energyBurned,
    ticketsSold,
    tokens: Object.entries(tokenBurned)
      .map(([symbol, amount]) => ({ symbol, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
});

export const listMyShopOffers = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  // Магазина билетов больше нет (§8.61): предложений не отдаём, в базу не ходим.
  const rows: Array<{
    id: string;
    tickets: number;
    price_energy: number;
    payment_token: string | null;
    price_token: number | null;
    price_stars: number | null;
    price_usd?: number | string | null;
    active: boolean;
    sort_order: number;
    created_at: string;
  }> = [];
  if (rows.length === 0) return [];
  const tokens = await pg.rewardTokens.findMany();
  const tokenMap = new Map(tokens.map((t) => [t.symbol, t]));
  // Активная подписка → процент скидки. Применяется в effective*-полях.
  const sub = wallet ? await fetchSubscriptionDiscount(wallet) : { discountPct: 0, level: 0 };
  // Тариф в $: валюты считаются по курсу DARAI (кэш Ref, как у подписки).
  const { rateFor, usdFields } = await import("./user-shop-usd");
  const rate = await rateFor(rows);
  return rows.map((r) => {
    const tok = r.payment_token ? tokenMap.get(r.payment_token) : null;
    return {
      id: r.id,
      tickets: r.tickets,
      priceEnergy: r.price_energy,
      // Цена со скидкой подписки (если есть). UI показывает effective.
      effectivePriceEnergy: applyDiscountCeil(r.price_energy, sub.discountPct),
      paymentToken: r.payment_token,
      priceToken: r.price_token,
      priceStars: r.price_stars,
      ...usdFields(r, rate, sub.discountPct),
      effectivePriceToken:
        r.price_token != null ? applyDiscountCeil(r.price_token, sub.discountPct) : null,
      subscriptionDiscountPct: sub.discountPct,
      subscriptionLevel: sub.level,
      active: r.active,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
      ftContract: tok?.ft_contract ?? null,
      decimals: tok?.decimals ?? null,
    };
  });
});

/**
 * История покупок билетов игрока (по всем sister-кошелькам аккаунта). Для раздела
 * «История» в билет-табе. Компенсации/восстановления (offer_id не ts_*) помечаем.
 */
export const getMyTicketHistory = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet)
    return [] as Array<{
      offerId: string;
      ticketsAdded: number;
      paymentToken: string | null;
      paymentAmount: number | null;
      energySpent: number;
      kind: "token" | "energy" | "comp";
      createdAt: string;
    }>;
  const sisters = await getSisterWallets(wallet);
  const inl = sisters.map((w) => `'${w.replace(/'/g, "''")}'`).join(",");
  const rows = (await mcpExec(
    `SELECT offer_id, tickets_added, payment_token, payment_amount, energy_spent, created_at
         FROM yuplink.ticket_purchases WHERE wallet IN (${inl})
         ORDER BY created_at DESC LIMIT 100;`,
    { wrapJson: true },
  )) as Array<{
    offer_id: string;
    tickets_added: number;
    payment_token: string | null;
    payment_amount: number | null;
    energy_spent: number;
    created_at: string;
  }>;
  return rows.map((r) => {
    const isToken = !!r.payment_token && Number(r.payment_amount) > 0;
    const isEnergy = Number(r.energy_spent) > 0;
    return {
      offerId: r.offer_id,
      ticketsAdded: Number(r.tickets_added),
      paymentToken: r.payment_token,
      paymentAmount: r.payment_amount != null ? Number(r.payment_amount) : null,
      energySpent: Number(r.energy_spent),
      kind: isToken ? ("token" as const) : isEnergy ? ("energy" as const) : ("comp" as const),
      createdAt: r.created_at,
    };
  });
});

// Системный кошелёк YUPLINK: сюда юзеры платят за билеты и сюда
// депозитят DARAI для крафта/паков/минта. Адрес фиксированный,
// не меняется через админку.
const TOKEN_BURN_RECEIVER = "darai_gdrop.near";

/**
 * Покупка билетов за FT-токены.
 *
 * Поток:
 *   1. Клиент сам подписывает ft_transfer на TOKEN_BURN_RECEIVER нужной
 *      суммы (paymentToken priceToken) активным wallet'ом.
 *   2. Получает tx_hash → шлёт сюда вместе с offerId.
 *   3. Сервер дёргает NEAR RPC, проверяет: signer = текущий wallet,
 *      receiver = ftContract, action = ft_transfer на TOKEN_BURN_RECEIVER,
 *      amount >= priceToken * 10^decimals, status = SuccessValue.
 *   4. Если ок — INSERT в ticket_purchases с idempotencyKey=`ft:<txHash>`
 *      (UNIQUE защита от повторного зачисления одной тем же tx).
 *
 * Кошелёк: используется активный wallet текущей сессии. Если нужно
 * платить другим — юзер сначала switch'ится через wallet-picker в хедере.
 */
export const purchaseTicketsViaToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        offerId: z.string().min(1),
        txHash: z.string().min(20),
        // Сколько паков купить за раз. Цена в tx должна быть >= price * qty.
        // Билеты начисляются tickets * qty.
        quantity: z.number().int().positive().max(50).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // Магазина билетов больше нет (§8.61): отказ до любых проверок и записей.
    refuseTicketPurchase();
    assertNotMaintenance();
    // Старый клиент имеет TOKEN_BURN_RECEIVER=darai_duplo.near в бандле —
    // если попытается купить, DARAI улетят не туда. Блокируем заранее.
    requireFreshClient(); // Оплата подписью кошелька закрыта после раскатки счёта: всё платится
    // со счёта. Догоны и реконсиляции сюда НЕ попадают — уже отправленные
    // переводы обязаны доехать.
    await assertWalletPurchaseAllowed();

    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    await requireLinkedTelegram(wallet);

    const offer = await pg.ticketShopOffers.findFirst({
      id: data.offerId,
      active: true,
    });
    if (!offer) throw new Error("Оффер не найден или отключён");
    if (!offer.payment_token || !offer.price_token) {
      throw new Error("Этот оффер не за токены");
    }

    const tok = await pg.rewardTokens.findOne({ symbol: offer.payment_token });
    if (!tok) throw new Error(`Токен ${offer.payment_token} не сконфигурирован`);

    const qty = data.quantity;
    const totalPriceBase = offer.price_token * qty;
    const sub = await fetchSubscriptionDiscount(wallet);
    const totalPrice = applyDiscountCeil(totalPriceBase, sub.discountPct);
    const totalTickets = offer.tickets * qty;

    // Принимаем подпись с ЛЮБОГО кошелька, привязанного к этому TG —
    // часто бывает, что юзер сидит активной сессией в одном кошельке,
    // а HOT подписывает из другого «основного». Билеты всё равно
    // суммируются по сёстрам в computeTickets, так что криминала нет.
    const sisters = await getSisterWallets(wallet);
    const allowedSenders = Array.from(new Set([wallet, ...sisters]));
    const { paidHuman, actualSender } = await verifyFtTransfer({
      txHash: data.txHash,
      senderAccount: allowedSenders,
      ftContract: tok.ft_contract,
      expectedReceiver: TOKEN_BURN_RECEIVER,
      minAmountHuman: totalPrice,
      decimals: tok.decimals,
    });

    // Запись привязываем к кошельку, который реально заплатил (так
    // on-chain аудит совпадает с БД). Юзеру в UI это всё равно видно
    // как один общий баланс по всем его кошелькам.
    const creditedWallet = actualSender || wallet;

    const idempotencyKey = `ft:${data.txHash}`;
    try {
      await pg.ticketPurchases.insert({
        id: `tp_${nanoid(10)}`,
        wallet: creditedWallet,
        offer_id: offer.id,
        tickets_added: totalTickets,
        energy_spent: 0,
        yupland_tx_id: null,
        payment_token: offer.payment_token,
        payment_amount: paidHuman,
        near_tx_hash: data.txHash,
        idempotency_key: idempotencyKey,
      });
    } catch (e) {
      // Идемпотентность: если эта же квитанция уже зачтена (UNIQUE на
      // idempotency_key, код 23505) — возвращаем success с уже начисленными
      // билетами, чтобы повторный «зачти ещё раз» не пугал юзера.
      const msg = e instanceof Error ? e.message : String(e);
      const isUniqueViolation = /23505|duplicate|idempotency_key|unique constraint/i.test(msg);
      if (isUniqueViolation) {
        const existing = await pg.ticketPurchases.findFirst({
          idempotency_key: idempotencyKey,
        });
        if (existing) {
          invalidateTicketsCache(allowedSenders);
          return {
            ok: true,
            ticketsAdded: existing.tickets_added,
            paymentToken: existing.payment_token ?? offer.payment_token,
            paymentAmount: existing.payment_amount ?? paidHuman,
            quantity: qty,
            alreadyCredited: true as const,
          };
        }
      }
      // Любая другая ошибка БД — пробрасываем, чтобы фронт мог сохранить
      // pending-покупку и предложить повторить зачёт.
      throw new Error(`Не удалось записать покупку: ${msg}`);
    }

    invalidateTicketsCache(allowedSenders);
    return {
      ok: true,
      ticketsAdded: totalTickets,
      paymentToken: offer.payment_token,
      paymentAmount: paidHuman,
      quantity: qty,
      alreadyCredited: false as const,
    };
  });

/**
 * АДМИН: ручной подбор «осиротевшего» FT-платежа.
 *
 * Когда юзер подписал ft_transfer DARAI → TOKEN_BURN_RECEIVER, но
 * фронт НЕ дошёл до purchaseTicketsViaToken (закрыл вкладку, отвалилась
 * сеть и т.п.) — в ticket_purchases записи нет, билеты не зачислены.
 * Сам юзер уже не может повторить (нет tx_hash в localStorage).
 *
 * Этот endpoint принимает txHash и offerId, верифицирует tx (sender, FT,
 * receiver, amount) и зачисляет билеты в ту же таблицу с тем же
 * idempotencyKey — так что повторный submit с фронта (если случится)
 * получит alreadyCredited=true.
 */
export const adminClaimOrphanFtPurchase = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        txHash: z.string().min(20),
        offerId: z.string().min(1),
        // Кто подписывал ft_transfer. Чаще всего это активный кошелёк
        // юзера в момент покупки. Можем дать список sister-кошельков —
        // verifyFtTransfer проверит подписи через любой.
        senderWallet: z.string().min(2),
        quantity: z.number().int().positive().max(50).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // Магазина билетов больше нет (§8.61): отказ до любых проверок и записей.
    refuseTicketPurchase();
    requirePayoutsAdmin();

    const offer = await pg.ticketShopOffers.findFirst({
      id: data.offerId,
      active: true,
    });
    if (!offer) throw new Error("Оффер не найден или отключён");
    if (!offer.payment_token || !offer.price_token) throw new Error("Этот оффер не за токены");

    const tok = await pg.rewardTokens.findOne({ symbol: offer.payment_token });
    if (!tok) throw new Error(`Токен ${offer.payment_token} не сконфигурирован`);

    const qty = data.quantity;
    const totalTickets = offer.tickets * qty;
    // Принимаем ровно ту цену, которую игрок и должен был заплатить: базовая
    // минус его подписочная скидка (максимум 15%). Раньше здесь стояло
    // «половина базы» с комментарием про скидку до 50% — такой скидки в
    // проекте нет, и билеты уходили за полцены через «восстановить покупку».
    const minAcceptable = applyDiscountCeil(
      offer.price_token * qty,
      (await fetchSubscriptionDiscount(data.senderWallet)).discountPct,
    );

    // Tx может быть подписана любым кошельком этого TG.
    const sisters = await getSisterWallets(data.senderWallet);
    const allowedSenders = Array.from(new Set([data.senderWallet, ...sisters]));

    // На старом клиентском бандле receiver был darai_duplo.near
    // (его и сейчас держим как наш приёмный коша). Принимаем оба.
    const LEGACY_RECEIVERS = ["darai_duplo.near"];
    let paidHuman = 0;
    let actualSender = "";
    let lastErr: Error | null = null;
    for (const recv of [TOKEN_BURN_RECEIVER, ...LEGACY_RECEIVERS]) {
      try {
        const r = await verifyFtTransfer({
          txHash: data.txHash,
          senderAccount: allowedSenders,
          ftContract: tok.ft_contract,
          expectedReceiver: recv,
          minAmountHuman: minAcceptable,
          decimals: tok.decimals,
        });
        paidHuman = r.paidHuman;
        actualSender = r.actualSender;
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
      }
    }
    if (lastErr) throw lastErr;

    const idempotencyKey = `ft:${data.txHash}`;
    const existing = await pg.ticketPurchases.findFirst({
      idempotency_key: idempotencyKey,
    });
    if (existing) {
      invalidateTicketsCache(allowedSenders);
      return {
        ok: true,
        alreadyCredited: true as const,
        wallet: existing.wallet,
        ticketsAdded: existing.tickets_added,
      };
    }

    await pg.ticketPurchases.insert({
      id: `tp_${nanoid(10)}`,
      wallet: actualSender || data.senderWallet,
      offer_id: offer.id,
      tickets_added: totalTickets,
      energy_spent: 0,
      yupland_tx_id: null,
      payment_token: offer.payment_token,
      payment_amount: paidHuman,
      near_tx_hash: data.txHash,
      idempotency_key: idempotencyKey,
    });
    invalidateTicketsCache(allowedSenders);
    return {
      ok: true,
      alreadyCredited: false as const,
      wallet: actualSender || data.senderWallet,
      ticketsAdded: totalTickets,
    };
  });

/**
 * ЮЗЕР сам восстанавливает «осиротевшую» покупку билетов по txHash (как форма
 * восстановления пака, но для билетов): подписал ft_transfer на приёмник, но
 * фронт не дошёл до purchaseTicketsViaToken. Гейт — СВОЙ кошелёк (+ sisters);
 * verifyFtTransfer перебирает все sister-кошельки. Идемпотентно по ft:txHash.
 */
export const recoverMyTicketPurchase = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        txHash: z.string().min(20),
        offerId: z.string().min(1),
        quantity: z.number().int().positive().max(50).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // Магазина билетов больше нет (§8.61): отказ до любых проверок и записей.
    refuseTicketPurchase();
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");

    const offer = await pg.ticketShopOffers.findFirst({
      id: data.offerId,
      active: true,
    });
    if (!offer) throw new Error("Оффер не найден или отключён");
    if (!offer.payment_token || !offer.price_token) throw new Error("Этот оффер не за токены");
    const tok = await pg.rewardTokens.findOne({ symbol: offer.payment_token });
    if (!tok) throw new Error(`Токен ${offer.payment_token} не сконфигурирован`);

    const qty = data.quantity;
    const totalTickets = offer.tickets * qty;
    // Принимаем ровно ту цену, которую игрок и должен был заплатить: базовая
    // минус его подписочная скидка (максимум 15%). Раньше здесь стояло
    // «половина базы» с комментарием про скидку до 50% — такой скидки в
    // проекте нет, и билеты уходили за полцены через «восстановить покупку».
    const minAcceptable = applyDiscountCeil(
      offer.price_token * qty,
      (await fetchSubscriptionDiscount(wallet)).discountPct,
    );

    const sisters = await getSisterWallets(wallet);
    const allowedSenders = Array.from(new Set([wallet, ...sisters]));

    // Старый бандл слал на darai_duplo.near — принимаем оба приёмника.
    const LEGACY_RECEIVERS = ["darai_duplo.near"];
    let paidHuman = 0;
    let actualSender = "";
    let lastErr: Error | null = null;
    for (const recv of [TOKEN_BURN_RECEIVER, ...LEGACY_RECEIVERS]) {
      try {
        const r = await verifyFtTransfer({
          txHash: data.txHash,
          senderAccount: allowedSenders,
          ftContract: tok.ft_contract,
          expectedReceiver: recv,
          minAmountHuman: minAcceptable,
          decimals: tok.decimals,
        });
        paidHuman = r.paidHuman;
        actualSender = r.actualSender;
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
      }
    }
    if (lastErr) throw lastErr;

    const idempotencyKey = `ft:${data.txHash}`;
    const existing = await pg.ticketPurchases.findFirst({
      idempotency_key: idempotencyKey,
    });
    if (existing) {
      invalidateTicketsCache(allowedSenders);
      return {
        ok: true,
        alreadyCredited: true as const,
        ticketsAdded: existing.tickets_added,
      };
    }
    await pg.ticketPurchases.insert({
      id: `tp_${nanoid(10)}`,
      wallet: actualSender || wallet,
      offer_id: offer.id,
      tickets_added: totalTickets,
      energy_spent: 0,
      yupland_tx_id: null,
      payment_token: offer.payment_token,
      payment_amount: paidHuman,
      near_tx_hash: data.txHash,
      idempotency_key: idempotencyKey,
    });
    invalidateTicketsCache(allowedSenders);
    return {
      ok: true,
      alreadyCredited: false as const,
      ticketsAdded: totalTickets,
    };
  });

/**
 * Текущее состояние Yupland-привязки:
 *   linked=false — нужен OAuth-флоу
 *   linked=true  — есть grant; вернём свежий energy_balance с Yupland
 *   error        — grant был, но протух / отозван
 */
export const getYuplandStatus = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return { linked: false as const, configured: false };

  // Считаем «подключённым» если есть grant ИЛИ есть профиль на портале
  // с этим near_account_id. Старая логика требовала grant — теперь
  // живём напрямую от БД, grant служит только историческим маркером.
  const grant = await pg.yuplandGrants.findOne({ wallet });

  // Профилей на портале может быть несколько — по одному на кошелёк-сестру
  // (portalProfile выбирает нужный). Прежний `.maybeSingle()` на двух и
  // более строках отдавал null, и связь «терялась» у самых активных игроков.
  const profile = await portalProfile<{
    energy_balance?: number | null;
    minidar_balance?: number | null;
  }>(wallet, "id,energy_balance,minidar_balance");

  if (!profile) {
    return {
      linked: !!grant,
      configured: true,
      energyBalance: null,
    } as const;
  }

  return {
    linked: true as const,
    configured: true,
    energyBalance: profile.energy_balance ?? 0,
    minidarBalance: profile.minidar_balance ?? 0,
  };
});

/**
 * Профиль юзера из Yupland-портала (public.profiles): уровень, XP, статус.
 * Mapping: yuplink.users.wallet ↔ public.profiles.near_account_id.
 * Возвращает null если профиль не найден на портале.
 */
export const getYuplandProfile = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return null;
  const profile = await portalProfile<{
    id?: string;
    level?: number | null;
    experience_points?: number | null;
    energy_balance?: number | null;
    current_status?: string | null;
    status_color?: string | null;
    avatar_url?: string | null;
    display_name?: string | null;
    minidar_balance?: number | null;
    tokens_balance?: number | null;
  }>(
    wallet,
    "id,level,experience_points,energy_balance,current_status,status_color,avatar_url,display_name,minidar_balance,tokens_balance",
  );
  if (!profile) return null;
  const { data: lvl } = await sbPublic
    .from("levels_with_progress")
    .select(
      "level_number,required_xp,xp_needed_for_level,previous_level_xp,name,status_title,status_color,icon,rewards",
    )
    .eq("level_number", profile.level ?? 1)
    .maybeSingle();
  const xp = profile.experience_points ?? 0;
  const prevXp = lvl?.previous_level_xp ?? 0;
  const nextXp = lvl?.required_xp ?? 0;
  const progressPct =
    nextXp > prevXp ? Math.min(100, ((xp - prevXp) / (nextXp - prevXp)) * 100) : 0;
  return {
    userId: profile.id as string,
    level: profile.level ?? 1,
    xp,
    nextLevelXp: nextXp,
    progressPct: Math.round(progressPct),
    currentStatus: profile.current_status as string | null,
    statusColor: profile.status_color as string | null,
    avatarUrl: profile.avatar_url as string | null,
    displayName: profile.display_name as string | null,
    levelTitle: (lvl?.status_title as string) ?? "",
    levelIcon: (lvl?.icon as string) ?? null,
    levelName: (lvl?.name as string) ?? "",
    minidarBalance: Number(profile.minidar_balance ?? 0),
    tokensBalance: Number(profile.tokens_balance ?? 0),
  };
});

/**
 * Подписка юзера на Yupland-портале (public.user_subscriptions + tiers).
 * Возвращает активную подписку (status='active', expires_at > now) или null.
 *
 * Уровень → скидка на покупку билетов в нашем магазине:
 *   tier.level=1 → 5%, level=2 → 10%, level=3 → 15%.
 * Применяется ПОВЕРХ объёмной скидки оффера.
 */
export function subscriptionDiscountPct(level: number | null | undefined): number {
  if (!level || level < 1) return 0;
  if (level === 1) return 5;
  if (level === 2) return 10;
  return 15; // level >=3
}

/**
 * Внутренний helper: вернуть {discountPct, level} активной подписки для wallet.
 * Используется в purchaseTickets* и listMyShopOffers чтобы не дублировать
 * SQL. Возвращает {discountPct:0,level:0} если подписки нет.
 */
export async function fetchSubscriptionDiscount(
  wallet: string,
): Promise<{ discountPct: number; level: number }> {
  try {
    // Подписка — привилегия АККАУНТА (per-TG). Ищем по всем кошам аккаунта и
    // берём высший тир: иначе на сестре без своей строки подписки скидка=0.
    const sisters = await getSisterWallets(wallet);
    const { data: profiles } = await sbPublic
      .from("profiles")
      .select("id")
      .in("near_account_id", sisters);
    const ids = ((profiles ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (ids.length === 0) return { discountPct: 0, level: 0 };
    const { data: subs } = await sbPublic
      .from("user_subscriptions")
      .select("tier_id")
      .in("profile_id", ids)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString());
    const tierIds = Array.from(
      new Set(((subs ?? []) as Array<{ tier_id: string }>).map((s) => s.tier_id)),
    );
    if (tierIds.length === 0) return { discountPct: 0, level: 0 };
    const { data: tiers } = await sbPublic
      .from("subscription_tiers")
      .select("level")
      .in("id", tierIds);
    const lvl = Math.max(
      0,
      ...((tiers ?? []) as Array<{ level?: number }>).map((t) => t.level ?? 0),
    );
    return { discountPct: subscriptionDiscountPct(lvl), level: lvl };
  } catch {
    return { discountPct: 0, level: 0 };
  }
}

/**
 * Округление цены ВВЕРХ после применения процентной скидки. Защищает нас
 * от ситуации "клиент шлёт меньше из-за скидки 5% от 1 → ожидаем >=1".
 */
function applyDiscountCeil(price: number, discountPct: number): number {
  if (discountPct <= 0 || price <= 0) return price;
  const factor = (100 - discountPct) / 100;
  return Math.max(1, Math.ceil(price * factor));
}

export const getMySubscription = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return null;
  // Подписка — по всему аккаунту (per-TG): ищем по всем кошам, берём активную
  // с наибольшим сроком, иначе на сестре без своей строки показывало «нет».
  const sisters = await getSisterWallets(wallet);
  const { data: profiles } = await sbPublic
    .from("profiles")
    .select("id")
    .in("near_account_id", sisters);
  const profileIds = ((profiles ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (profileIds.length === 0) return null;
  const { data: sub } = await sbPublic
    .from("user_subscriptions")
    .select("id,tier_id,status,started_at,expires_at,price_paid_darai,near_account_id")
    .in("profile_id", profileIds)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub) return null;
  const subRow = sub as {
    id: string;
    tier_id: string;
    status: string;
    started_at: string;
    expires_at: string;
  };
  const { data: tier } = await sbPublic
    .from("subscription_tiers")
    .select("id,slug,title,level,color,icon")
    .eq("id", subRow.tier_id)
    .maybeSingle();
  const t = tier as {
    slug: string;
    title: string;
    level: number;
    color: string | null;
    icon: string | null;
  } | null;
  return {
    id: subRow.id,
    tierId: subRow.tier_id,
    level: t?.level ?? 0,
    slug: t?.slug ?? null,
    title: t?.title ?? null,
    color: t?.color ?? null,
    icon: t?.icon ?? null,
    startedAt: subRow.started_at,
    expiresAt: subRow.expires_at,
    discountPct: subscriptionDiscountPct(t?.level),
  };
});

/**
 * Ачивки текущего юзера: каталог + статус (earned/locked).
 * Берёт из public.achievements + public.user_achievements (через profiles.id).
 */
export const getMyYuplandAchievements = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return { earned: [], locked: [], total: 0 };
  const profile = await portalProfile<{ id?: string }>(wallet, "id");
  if (!profile) return { earned: [], locked: [], total: 0 };
  const userId = profile.id as string;

  const { data: catalog } = await sbPublic
    .from("achievements")
    .select(
      "id,name,description,icon,points,category,difficulty,reward_kind,reward_amount,reward_nft_name",
    )
    .order("points", { ascending: false });
  const all = (catalog ?? []) as Array<{
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    points: number | null;
    category: string | null;
    difficulty: string | null;
    reward_kind: string | null;
    reward_amount: number | null;
    reward_nft_name: string | null;
  }>;

  const { data: mine } = await sbPublic
    .from("user_achievements")
    .select("achievement_id,earned_at")
    .eq("user_id", userId);
  const earnedMap = new Map(
    ((mine ?? []) as Array<{ achievement_id: string; earned_at: string }>).map((m) => [
      m.achievement_id,
      m.earned_at,
    ]),
  );

  const earned: typeof all = [];
  const locked: typeof all = [];
  for (const a of all) {
    if (earnedMap.has(a.id)) earned.push(a);
    else locked.push(a);
  }
  return {
    earned: earned.map((a) => ({ ...a, earnedAt: earnedMap.get(a.id) })),
    locked,
    total: all.length,
  };
});

export const unlinkYupland = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) throw new Error("Кошелёк не подключён");
  await pg.yuplandGrants.delete({ wallet });
  return { ok: true };
});

export const purchaseTicketsViaEnergy = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        offerId: z.string().min(1),
        // Сколько паков купить за раз. priceEnergy и tickets умножаются на qty.
        quantity: z.number().int().positive().max(50).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // Магазина билетов больше нет (§8.61): отказ до любых проверок и записей.
    refuseTicketPurchase();
    assertNotMaintenance();
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    await requireLinkedTelegram(wallet);

    const offer = await pg.ticketShopOffers.findFirst({
      id: data.offerId,
      active: true,
    });
    if (!offer) throw new Error("Оффер не найден или отключён");

    // Профиль на портале — нужен и для baseline-проверки баланса, и для
    // INSERT в energy_transactions (там user_id = profile.id).
    const profile = await portalProfile<{ id?: string; energy_balance?: number | null }>(
      wallet,
      "id,energy_balance",
    );
    if (!profile) {
      throw new Error("Профиль Yupland не найден для этого кошелька");
    }

    const qty = data.quantity;
    // Только предложение с ценой в энергии: у токеновой строки и тарифа в $ её
    // нет, и списание нуля отдало бы билеты даром.
    (await import("./user-shop-usd")).assertEnergyOffer(offer);
    const totalEnergyBase = offer.price_energy * qty;
    const sub = await fetchSubscriptionDiscount(wallet);
    const totalEnergy = applyDiscountCeil(totalEnergyBase, sub.discountPct);
    const totalTickets = offer.tickets * qty;

    if ((profile.energy_balance ?? 0) < totalEnergy) {
      throw new Error("Недостаточно энергии");
    }

    // Идемпотентность: ключ + проверка через unique-индекс в БД.
    const idempotencyKey = `gd:tickets:${nanoid(16)}`;

    // Atomic UPDATE с условием — если энергии стало меньше пока считали,
    // строка не обновится и мы откатим.
    // Списание относительным выражением под условием, а не записью абсолюта:
    // два одновременных запроса читали один и тот же остаток, оба проходили
    // проверку «хватает» и записывали одно и то же число — энергия снималась
    // один раз, а билеты начислялись дважды.
    const { data: debited, error: upErr } = await sbPublic.rpc("gd_debit_energy", {
      p_profile: profile.id,
      p_amount: totalEnergy,
    });
    const updated = Array.isArray(debited) ? debited[0] : debited;
    if (upErr || !updated) {
      throw new Error("Не удалось списать энергию (не хватило или гонка запросов)");
    }

    // Фиксируем транзакцию для аудита/портала.
    await sbPublic.from("energy_transactions").insert({
      user_id: profile.id,
      amount: -totalEnergy,
      transaction_type: "partner_debit",
      currency: "energy",
      description: `golden-drop tickets ×${qty}`,
      idempotency_key: idempotencyKey,
    });

    await pg.ticketPurchases.insert({
      id: `tp_${nanoid(10)}`,
      wallet,
      offer_id: offer.id,
      tickets_added: totalTickets,
      energy_spent: totalEnergy,
      yupland_tx_id: null,
      idempotency_key: idempotencyKey,
    });

    return {
      ok: true,
      ticketsAdded: totalTickets,
      energySpent: totalEnergy,
      newEnergyBalance: updated.energy_balance,
      quantity: qty,
    };
  });

// ─── Публичный поиск NFT по token_id ──────────────────────────────────────
// Не требует подключённого кошелька. Для покупателей / третьих лиц:
// «погашен ли этот NFT, в каких дропах участвовал».

const SENDLER_LOOKUP_CONTRACT = "yuplandshop.mintbase1.near";

function maskWallet(w: string): string {
  if (!w) return "";
  if (w.length <= 14) return w;
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

export const lookupNftClaim = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        tokenId: z.string().min(1),
        contractId: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const contractId = data.contractId?.trim() || SENDLER_LOOKUP_CONTRACT;
    const tokenId = data.tokenId.trim();

    // 1. История погашений в drop'ах (любых — активных и неактивных)
    const redRows = await pg.redemptions.findMany({
      contract_id: contractId,
      token_id: tokenId,
    });

    const campIds = Array.from(
      new Set(redRows.map((r) => r.campaign_id).filter(Boolean) as string[]),
    );
    const camps =
      campIds.length > 0
        ? (((await pg.campaigns.raw().select("*").in("id", campIds)).data as PgCampaign[]) ?? [])
        : [];
    const campMap = new Map(camps.map((c) => [c.id, c]));

    const redemptionsOut = redRows.map((r) => {
      const c = r.campaign_id ? campMap.get(r.campaign_id) : null;
      return {
        dropId: r.campaign_id,
        dropTitle: c?.name ?? "(дроп удалён)",
        amount: r.amount,
        rewardToken: r.reward_token ?? c?.reward_token ?? "?",
        redeemedAt: r.redeemed_at,
        status: r.status,
        walletMasked: maskWallet(r.wallet),
      };
    });

    // 2. Узнаём title + image + текущего owner'а у NFT.
    //    Sendler ?token_id=... поломан (игнорирует фильтр), ?owner_id=... тоже,
    //    зато ?title=... надёжно отдаёт всех владельцев title'а. Стратегия:
    //      a) nfts-кэш (быстро если уже видели)
    //      b) campaign.name из истории погашений (если был клейм — title тот же)
    //      c) перебираем title'ы из collection_titles этого контракта,
    //         каждый title=... ищем — на хите получаем title+media+owner.
    let nftTitle: string | null = null;
    let nftMedia: string | null = null;
    let currentOwner: string | null = null;
    const cachedNft = await pg.nfts.findFirst({
      contract_id: contractId,
      token_id: tokenId,
    });
    if (cachedNft) {
      nftTitle = cachedNft.name;
      nftMedia = cachedNft.image;
      currentOwner = cachedNft.owner_wallet ?? null;
    }
    if (!nftTitle && camps.length > 0) {
      nftTitle = camps[0].name;
    }
    if (!nftMedia || !currentOwner) {
      const candidateTitles: string[] = [];
      if (nftTitle) {
        candidateTitles.push(nftTitle);
      } else {
        const titles = await pg.collectionTitles.findMany({
          contract_id: contractId,
        });
        for (const r of titles) candidateTitles.push(r.title);
      }
      const findResults = await Promise.all(
        candidateTitles.map(async (t) => {
          try {
            const items = await fetchSendlerNftsByTitle(contractId, t);
            const hit = items.find((it) => it.token_id === tokenId);
            return hit ? { title: t, hit } : null;
          } catch {
            return null;
          }
        }),
      );
      const found = findResults.find((x) => x !== null) as
        | { title: string; hit: { title?: string; media?: string; owner_id?: string } }
        | null
        | undefined;
      if (found) {
        const fromHit = (found.hit.title ?? "").trim();
        nftTitle = nftTitle ?? (fromHit || found.title);
        nftMedia = nftMedia ?? found.hit.media ?? null;
        currentOwner = currentOwner ?? found.hit.owner_id ?? null;
        try {
          await pg.nfts.upsert(
            {
              id: `${contractId}:${tokenId}`,
              contract_id: contractId,
              token_id: tokenId,
              collection: contractId,
              name: nftTitle ?? found.title,
              image: nftMedia ?? "",
              owner_wallet: currentOwner,
            },
            { onConflict: "id" },
          );
        } catch {
          // ignore
        }
      }
    }

    const redeemedDropIds = new Set(redemptionsOut.map((r) => r.dropId));
    let eligibleDrops: Array<{
      id: string;
      title: string;
      rewardSpec: string;
      rewardToken: string;
      freeClaim: boolean;
      alreadyRedeemed: boolean;
      mode: "simple" | "combo";
    }> = [];
    if (nftTitle) {
      const activeDrops = await pg.campaigns.findMany({
        status: "active",
        contract_id: contractId,
      });
      eligibleDrops = activeDrops
        .filter((d) => {
          if (d.mode === "combo") {
            try {
              const reqs = JSON.parse(d.requirements ?? "[]") as Array<{
                title: string;
                count: number;
              }>;
              return reqs.some((r) => sameTitle(r.title, nftTitle));
            } catch {
              return false;
            }
          }
          return sameTitle(d.name, nftTitle);
        })
        .map((d) => ({
          id: d.id,
          title: d.name,
          rewardSpec:
            d.reward_min === d.reward_max
              ? String(d.reward_min)
              : `${d.reward_min}-${d.reward_max}`,
          rewardToken: d.reward_token,
          freeClaim: d.free_claim,
          alreadyRedeemed: redeemedDropIds.has(d.id),
          mode: (d.mode ?? "simple") as "simple" | "combo",
        }));
    }

    // 3. Активные ticket-events, где эта NFT (по title) требуется.
    let ticketEventsUsing: Array<{
      id: string;
      requirements: Array<{ title: string; count: number }>;
      rewardTickets: number;
      cooldownHours: number;
    }> = [];
    if (nftTitle) {
      const allActiveEvents = await pg.ticketEvents.findMany({ active: true });
      ticketEventsUsing = allActiveEvents
        .map((e) => {
          let reqs: Array<{ title: string; count: number }> = [];
          try {
            reqs = JSON.parse(e.requirements);
          } catch {
            reqs = [];
          }
          return { e, reqs };
        })
        .filter(({ reqs }) => reqs.some((r) => sameTitle(r.title, nftTitle)))
        .map(({ e, reqs }) => ({
          id: e.id,
          requirements: reqs,
          rewardTickets: e.reward_tickets,
          cooldownHours: e.hold_duration_sec / 3600,
        }));
    }

    return {
      contractId,
      tokenId,
      title: nftTitle,
      media: nftMedia,
      currentOwner,
      currentOwnerMasked: currentOwner ? maskWallet(currentOwner) : null,
      redemptions: redemptionsOut,
      eligibleDrops,
      ticketEventsUsing,
    };
  });

async function requireLinkedTelegram(wallet: string): Promise<void> {
  if (isTgBypassWallet(wallet)) return;
  const u = await pg.users.findOne({ wallet });
  if (!u?.telegram_id) {
    throw new Error("Сначала подтверди Telegram");
  }
}
