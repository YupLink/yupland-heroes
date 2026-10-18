// Энергопак по цене в $ (владелец, 07.10.2026: «тарифы за $, цена — как у
// подписки, динамическая; если $ — от $»). Ступень — в $: вид usd лестницы
// (USDT, DARAI по курсу, звёзды) или USDT-лесенка пака (к ней — звёзды от её
// цены). Платят со счёта Казны (lib/usdTariff.ts).
//
// Отдельным файлом: прежние пути оплаты (билеты, перевод, счёт в токене) не
// трогаем. Сумму в валюте считает приложение от ступени, а ступень под замком
// пересчитывает SQL (ветка 'usd' в buy_energy_pack_atomic): сдвинулась —
// отказ, сумма посчитана не от неё.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg, sb } from "../db/pg";
import { assertNotMaintenance } from "../maintenance";
import { accAccountId, accBalance } from "./currency/move";
import { moneyGate } from "../rateGate";
import { requireAccountUser } from "./account-rollout";
import { USD_TOKENS, usdPriceOrThrow, assertShownPrice } from "@/lib/usdTariff";

export const buyEnergyPackForUsd = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        packId: z.string().min(1).max(64),
        token: z.enum(USD_TOKENS),
        /** Цена, которую видел игрок: курс вырос сильнее допуска — не списываем. */
        shown: z.number().positive().optional(),
        /** Один на нажатие. Ретрай того же нажатия не должен списывать дважды. */
        opId: z.string().min(8).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = await requireAccountUser();
    await moneyGate("epack-usd", wallet);

    const pack = await pg.energyPacks.findOne({ id: data.packId });
    if (!pack || !pack.active) throw new Error("Пак не найден");
    const account = await accAccountId(wallet);
    if (!account) throw new Error("Не найден аккаунт для кошелька");

    const { requireCurrencyPrice, pricingOf } = await import("./energy-packs-steps");
    const { usdKeyOf } = await import("@/lib/energySteps");
    // Ступень в $: вид usd, а нет его — USDT-лесенка («если $ — от $»): тогда
    // этим путём платят только звёздами, USDT и DARAI — своими лесенками.
    const usdKey = usdKeyOf(pricingOf(pack));
    if (!usdKey) throw new Error("У этого пака нет цены в $");
    if (usdKey === "token:USDT" && data.token !== "STARS") {
      throw new Error("Этот пак оплачивается звёздами по цене в $, USDT и DARAI — своими кнопками");
    }
    const stepUsd = await requireCurrencyPrice(
      pack,
      account,
      usdKey === "usd" ? { kind: "usd" } : { kind: "token", symbol: "USDT" },
    );
    const rate =
      data.token === "Darai"
        ? ((await (await import("./energy-sub/rate")).daraiPerUsd())?.rate ?? null)
        : null;
    const price = usdPriceOrThrow(stepUsd, data.token, rate);
    assertShownPrice(data.shown, price);

    const { getSisterWallets } = await import("./user-shared");
    const idk = `acc:${account}:${data.packId}:${data.opId}`;
    const { data: res, error } = await sb.rpc("buy_energy_pack_atomic", {
      p_wallet: wallet,
      p_pack_id: data.packId,
      p_pay_with: "usd",
      p_sisters: await getSisterWallets(wallet),
      p_tickets_price: 0,
      p_idk: idk,
      p_token_symbol: data.token,
      p_token_amount: stepUsd,
      p_price: price,
    });
    if (error) {
      const msg = String(error.message ?? "");
      const notEnough = msg.match(/not_enough_currency:([^:]+):([\d.-]+):([\d.-]+)/);
      if (notEnough) {
        throw new Error(
          `Не хватает ${notEnough[1]}: нужно ${Number(notEnough[3])}, есть ${Number(notEnough[2])}`,
        );
      }
      if (/stale_price:/.test(msg)) {
        throw new Error("Цена уже поднялась на следующую ступень — открой окно покупки заново");
      }
      const { mapEnergyErr } = await import("./energy-packs-shared");
      throw new Error(mapEnergyErr(msg, Number(pack.daily_limit ?? 0)));
    }

    const row = (res as Array<{ energy_added: number }> | null)?.[0];
    // DARAI за энергию растит пул карты — как у оплаты со счёта в DARAI.
    if (data.token === "Darai") {
      const { insertPoolMove } = await import("./darai-pools-move");
      await insertPoolMove({
        pool: "map",
        kind: "player_spend",
        amount: price,
        ref: `epack:${idk}`,
        note: "энерго-пак за DARAI (тариф в $)",
      }).catch((e) => console.warn("[pool] энерго-пак ($) не записан:", idk, e));
    }
    return {
      ok: true as const,
      energyAdded: Number(row?.energy_added ?? 0),
      token: data.token,
      spent: price,
      balance: await accBalance(wallet, data.token),
    };
  });
