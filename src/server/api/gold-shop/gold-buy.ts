// Покупка золота со счёта Казны — USDT, DARAI или звёзды (владелец, 22.10.2026,
// ПРАВИЛА §8.66). Цена — от $ пакета по правилам подписки (lib/energySub.ts::
// priceIn); игрок шлёт сумму, которую видел: выросла сверх допуска — отказ до денег.
//
// Списание, золото, квитанция и деньги по корзинам — одной SQL-функцией
// (gold_shop_buy): «оплатил, а золота нет» не бывает, восстанавливать нечего.
// Ключ — один на нажатие (с клиента): повтор после обрыва связи находит
// квитанцию и отвечает ею, второго списания нет. Звёзд не хватает — окно
// пополняет Казну обычным счётом Telegram (currency/stars.ts, вебхук зачисляет
// по charge id), потом игрок платит звёздами со счёта тем же путём.
//
// Деньги — по рельсам $-покупок (подписка, наборы): splitPayment — DARAI 60 % в
// пул карты, 15 % «Сжечь», 25 % «Разработчики»; USDT 30 % «$ → карта», 70 % «$»;
// звёзды — корзина звёзд. Старые ручки билетов закрыты и остаются закрытыми.
// Рефка золотом (§8.101): у покупателя есть пригласивший — тот же процент оплаты
// уходит в фонд выкупа золота (строка 'ref_bb'), пригласившему — строка ref_spend
// той же функцией; остальное — обычной раскладкой.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertNotMaintenance } from "../../maintenance";
import { moneyGate } from "../../rateGate";
import { requireAccountUser } from "../account-rollout";
import { accAccountId } from "../currency/move";
import { daraiPerUsd } from "../energy-sub/rate";
import { priceIn, priceMovedUp, splitPayment } from "@/lib/energySub";
import { refBuybackShare, refGoldEq } from "@/lib/referralGold";
import { refContextFor } from "../referral-gold/ref-context";
import { GOLD_TOKENS, type GoldBuyResult, type GoldToken } from "@/lib/goldShop";
import {
  callGoldBuy,
  findGoldReceipt,
  goldOpRef,
  loadGoldOffer,
  type GoldReceipt,
} from "./gold-sql";

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Части ключа нажатия: без «:», иначе ключи разных покупок сойдутся. */
const KEY_PART = /^[A-Za-z0-9_-]+$/;

/** «Не хватает денег» — окончательный отказ: списания не было. */
export const GOLD_MONEY_REFUSAL = "gshop.err_money";

/**
 * Отказ SQL → ключ словаря. not_enough_currency:<токен>:<есть>:<нужно> несёт
 * числа для подписи. Неизвестное (таймаут моста) — как есть: исход неясен, и
 * повтор того же нажатия безопасен — он найдёт квитанцию.
 */
export function goldError(e: unknown): Error {
  const text = msg(e);
  const m = /not_enough_currency:([^:]+):([\d.-]+):([\d.-]+)/.exec(text);
  if (m) {
    const token = m[1] === "Darai" ? "DARAI" : m[1];
    const need = String(Number(m[3]));
    const have = String(Number(m[2]));
    return new Error(`${GOLD_MONEY_REFUSAL}|${JSON.stringify({ token, need, have })}`);
  }
  if (/gold_offer_off/.test(text)) return new Error("gshop.err_off");
  if (/gold_offer_changed/.test(text)) return new Error("gshop.err_changed");
  if (/gold_price_mismatch/.test(text)) return new Error("gshop.err_price_changed");
  if (/gold_no_rate/.test(text)) return new Error("gshop.err_no_rate");
  if (/ref_refunded:|gold_desync:/.test(text)) return new Error("gshop.err_retry");
  // Взаимная блокировка с другой операцией аккаунта (банк, рынок): база откатила
  // всё целиком; повтор того же нажатия безопасен.
  if (/deadlock detected|could not serialize/.test(text)) return new Error("gshop.err_unknown");
  return e instanceof Error ? e : new Error(text);
}

export type GoldBuyInput = {
  offerId: string;
  token: GoldToken;
  /** Сумма, которую игрок видел: выросла сверх допуска — отказ. */
  shown: number;
  /** Золото, которое игрок видел: пакет поменяли — отказ до денег. */
  gold: number;
  opId: string;
};

const done = (r: GoldReceipt): GoldBuyResult => ({
  ok: true,
  gold: r.gold,
  token: r.token,
  spent: r.spent,
  applied: r.applied,
});

/** Сам путь покупки — отдельно от ворот, чтобы его можно было проверить тестом. */
export async function purchaseGold(
  wallet: string,
  account: string,
  d: GoldBuyInput,
): Promise<GoldBuyResult> {
  // Повтор нажатия (ответ потерялся) — квитанция, даже если цена с тех пор сдвинулась.
  const prev = await findGoldReceipt(goldOpRef(account, d.offerId, d.opId));
  if (prev) return done(prev);

  const offer = await loadGoldOffer(d.offerId);
  if (!offer) throw new Error("gshop.err_off");
  if (offer.gold !== d.gold) throw new Error("gshop.err_changed");
  const rate = d.token === "Darai" ? ((await daraiPerUsd())?.rate ?? null) : null;
  const price = priceIn(offer.priceUsd, d.token, rate);
  if (price == null || !(price > 0)) throw new Error("gshop.err_no_rate");
  if (priceMovedUp(d.shown, price)) throw new Error("gshop.err_price_changed");

  const ref = await refContextFor(account, wallet, refGoldEq("gold", offer.priceUsd, offer.gold));
  const split = ref ? refBuybackShare(d.token, price, ref.pct) : null;
  const money = split
    ? [
        ...splitPayment(d.token, split.rest),
        ...(split.share > 0
          ? [{ bucket: "ref_bb" as const, token: d.token, amount: split.share }]
          : []),
      ]
    : splitPayment(d.token, price);

  let receipt: GoldReceipt;
  try {
    receipt = await callGoldBuy({
      account,
      wallet,
      offer,
      token: d.token,
      price,
      rate,
      opId: d.opId,
      money,
      ref,
    });
  } catch (e) {
    throw goldError(e);
  }
  // Корзины $ и DARAI — пачкой, если набрали порог: как после подписки и наборов.
  if (receipt.applied && d.token !== "STARS") {
    void import("../energy-sub/batch")
      .then((m) => m.runDueBatches("auto"))
      .catch((e) => console.warn("[gold-shop] пачки:", msg(e)));
  }
  // Друг потратил — пригласивший мог дорасти до боксов и «Много друзей» (§8.101).
  if (receipt.applied && ref) {
    void import("../../referralQualify").then((m) => m.noteReferralPurchase(wallet));
    if (d.token === "Darai") void import("../bank/license-money").then((m) => m.runBuyback());
  }
  return done(receipt);
}

export const buyGold = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        offerId: z.string().min(1).max(40).regex(KEY_PART),
        token: z.enum(GOLD_TOKENS),
        shown: z.number().positive(),
        gold: z.number().int().positive(),
        /** Один на нажатие: ретрай того же нажатия не спишет дважды. */
        opId: z.string().min(8).max(40).regex(KEY_PART),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<GoldBuyResult> => {
    assertNotMaintenance();
    const wallet = await requireAccountUser();
    (await import("../xsolla/cardOnly")).assertNotCardOnly(data.token);
    await moneyGate("gold-shop", wallet);
    const account = await accAccountId(wallet);
    if (!account) throw new Error("gshop.err_account");
    return purchaseGold(wallet, account, data);
  });
