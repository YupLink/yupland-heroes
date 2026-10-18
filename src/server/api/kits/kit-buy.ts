// Покупка набора со счёта игрока (USDT / DARAI / Stars) — цена как у подписки.
//
// Сумма к оплате — от цены набора в $ (lib/energySub.ts::priceIn): DARAI по
// курсу со скидкой подписки, Stars — с её наценкой. Игрок шлёт сумму, которую
// видел: выросла сверх допуска (priceMovedUp) — отказ ДО брони и денег.
//
// Порядок — правило проекта «сначала деньги, потом товар», с бронью впереди:
//   0) бронь единицы — ДО денег: тираж кончился, лимит аккаунта выбран или
//      набор поменяли с показа (цена в $, бокс, количество) — отказ, игрок
//      ничего не потратил (kit_reserve, под замком набора; там же снимок:
//      валюта, сумма, цена в $, бокс и количество);
//   1) списание со счёта (kit_pay: acc_move под замком брони и только пока она
//      «reserved»; ключ = аккаунт + набор + нажатие, сумма — из снимка брони);
//   2) выдача: подарок «бокс ×N» + деньги по корзинам + отметка «выдано» —
//      одним запросом и только если деньги по ключу на месте (kit-grant-sql.ts);
//   3) сорвалось после брони — бронь снимается, а списанное возвращается на
//      счёт одной транзакцией (kit_release).
// Неясный сбой оплаты (таймаут моста: kit_pay мог пройти позже) бронь НЕ
// снимает — её доводит самопочинка (kit-heal.ts): оплачена — выдать, нет —
// снять. Повтор нажатия: бронь находится по ключу, оплата отвечает «уже было»,
// выдача — «уже выдано». Второго списания и второго набора нет. Повтор после
// отката — отказ «начни заново»: иначе набор вышел бы даром.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertNotMaintenance } from "../../maintenance";
import { moneyGate } from "../../rateGate";
import { requireAccountUser } from "../account-rollout";
import { isAdminWallet } from "../../auth";
import { KITS_ADMIN_ONLY } from "@/lib/featureGates";
import { accAccountId } from "../currency/move";
import { daraiPerUsd } from "../energy-sub/rate";
import { priceIn, priceMovedUp } from "@/lib/energySub";
import { KIT_MAX_BOXES, KIT_TOKENS, type KitToken } from "@/lib/kits";
import {
  grantOrder,
  kitPriceUsd,
  payOrder,
  releaseOrder,
  reserveKit,
  type KitOrder,
  type KitOrderStatus,
} from "./kit-order";

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Ключи в составе ключа оплаты: без «:», иначе ключи разных покупок сойдутся. */
const KEY_PART = /^[A-Za-z0-9_-]+$/;

/** «Не хватает денег» — окончательный отказ: списания не было и не будет. */
export const MONEY_REFUSAL = "kits.err_money";

/**
 * Отказ оплаты → ключ словаря. Коды приходят из SQL сырыми:
 * not_enough_currency:<токен>:<есть>:<нужно>, ref_refunded:…, kit_released.
 * Остальное (таймаут моста и т. п.) — как есть: исход оплаты неизвестен.
 */
export function payError(e: unknown): Error {
  const text = msg(e);
  const m = /not_enough_currency:([^:]+):([\d.-]+):([\d.-]+)/.exec(text);
  if (m) {
    const token = m[1] === "Darai" ? "DARAI" : m[1];
    const need = String(Number(m[3]));
    const have = String(Number(m[2]));
    return new Error(`${MONEY_REFUSAL}|${JSON.stringify({ token, need, have })}`);
  }
  if (/ref_refunded:|kit_released/.test(text)) return new Error("kits.err_retry");
  return e instanceof Error ? e : new Error(text);
}

/** Снять бронь после сбоя. Не вышло — бронь доведёт самопочинка. */
async function undo(order: KitOrder): Promise<KitOrderStatus> {
  try {
    return await releaseOrder(order.id);
  } catch (e) {
    console.warn("[kits] бронь не снялась — разберёт самопочинка:", order.id, msg(e));
    return "reserved";
  }
}

export type KitBuyInput = {
  kitId: string;
  token: KitToken;
  expected: number;
  /** Бокс и количество, которые игрок видел: набор поменяли — отказ до денег. */
  boxId: string;
  boxCount: number;
  opId: string;
};

/** Сумма к оплате по цене набора сейчас. Выросла с показа — отказ до брони. */
async function quote(d: KitBuyInput): Promise<{ priceUsd: number; amount: number }> {
  const priceUsd = await kitPriceUsd(d.kitId);
  if (priceUsd == null) throw new Error("kits.err_not_found");
  const rate = d.token === "Darai" ? ((await daraiPerUsd())?.rate ?? null) : null;
  const amount = priceIn(priceUsd, d.token, rate);
  if (amount == null || !(amount > 0)) throw new Error("kits.err_no_rate");
  if (priceMovedUp(d.expected, amount)) throw new Error("kits.err_price_changed");
  return { priceUsd, amount };
}

/** Сам путь покупки — отдельно от гейтов, чтобы его можно было проверить. */
export async function purchaseKit(wallet: string, account: string, data: KitBuyInput) {
  const { priceUsd, amount } = await quote(data);
  const payRef = `kit:${account}:${data.kitId}:${data.opId}`;

  // 0) бронь — до денег
  const order = await reserveKit({
    kitId: data.kitId,
    account,
    wallet,
    payRef,
    token: data.token,
    amount,
    priceUsd,
    boxId: data.boxId,
    boxCount: data.boxCount,
  });
  // Этот ключ уже откатан (деньги вернулись) — покупка только заново.
  if (order.status === "released") throw new Error("kits.err_retry");

  if (order.status === "reserved") {
    // 1) деньги. applied=false — оплачено прошлой попыткой: товар выдать.
    try {
      await payOrder(order.id);
    } catch (e) {
      const err = payError(e);
      // Снимаем бронь только при окончательном «не хватает»: при неясном
      // исходе оплата могла пройти — бронь доведёт самопочинка.
      if (err.message.startsWith(MONEY_REFUSAL)) await undo(order);
      throw err;
    }

    // 2) товар. Не встал — снять бронь с возвратом; выдался на самом деле
    // (ответ потерялся) — это успех.
    try {
      await grantOrder(order);
    } catch (e) {
      if ((await undo(order)) !== "granted") throw e;
    }
  }

  // Корзины — пачкой, если набрали порог: как после покупки подписки.
  void import("../energy-sub/batch")
    .then((m) => m.runDueBatches("auto"))
    .catch((e) => console.warn("[kits] пачки:", msg(e)));

  return { ok: true as const, orderId: order.id, token: order.token, spent: order.amount };
}

export const buyKit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        kitId: z.string().min(1).max(40).regex(KEY_PART),
        token: z.enum(KIT_TOKENS),
        /** Сумма, которую игрок видел: выросла сверх допуска — отказ. */
        expected: z.number().positive(),
        /** Бокс и количество, которые игрок видел: набор поменяли — отказ. */
        boxId: z.string().min(1).max(60).regex(KEY_PART),
        boxCount: z.number().int().min(1).max(KIT_MAX_BOXES),
        /** Один на нажатие: ретрай того же нажатия не спишет дважды. */
        opId: z.string().min(8).max(40).regex(KEY_PART),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = await requireAccountUser();
    // Пока наборы только админам (featureGates): игроку — «не продаётся», до денег.
    if (KITS_ADMIN_ONLY && !isAdminWallet(wallet)) throw new Error("kits.err_off");
    await moneyGate("kit", wallet);
    const account = await accAccountId(wallet);
    if (!account) throw new Error("kits.err_account");
    return purchaseKit(wallet, account, data);
  });
