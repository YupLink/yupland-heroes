// Энергопак со счёта — без похода в блокчейн.
//
// Списание и выдача энергии живут в одной SQL-функции (ветка 'account' внутри
// buy_energy_pack_atomic): транзакций между вызовами БД нет, и разнести деньги
// с товаром означало бы потерять одно из двух на первом же таймауте.
//
// Ключ нажатия приходит с клиента: серверный ключ на каждый вызов уже стоил
// игрокам двойных списаний, когда транспорт повторял запрос по таймауту.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg, sb } from "../db/pg";
import { requirePayoutsAdmin } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { accAccountId, accBalance } from "./currency/move";
import { moneyGate } from "../rateGate";
import { requireAccountUser } from "./account-rollout";
import { ENERGY_PAY_ONLY, isEnergyPayAllowed } from "@/lib/energyPayAllowed";

export const buyEnergyPackFromAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        packId: z.string().min(1).max(64),
        symbol: z.string().min(1).max(24),
        /** Вид предложения в лестнице цен: у DARAI он свой, не «токен». */
        payKind: z.enum(["token", "darai"]).default("token"),
        /** Один на нажатие. Ретрай того же нажатия не должен списывать дважды. */
        opId: z.string().min(8).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = await requireAccountUser();
    await moneyGate("epack-acc", wallet);

    // Энергопак со счёта — только DARAI (владелец, 20.10.2026, §8.61): USDT,
    // magicdust, RF и прочие токены не принимаются. Звёзды — energy-packs-usd-pay.
    if (!isEnergyPayAllowed(data.payKind === "darai" ? "Darai" : data.symbol)) {
      throw new Error(ENERGY_PAY_ONLY);
    }
    const pack = await pg.energyPacks.findOne({ id: data.packId });
    if (!pack || !pack.active) throw new Error("Пак не найден");

    const account = await accAccountId(wallet);
    if (!account) throw new Error("Не найден аккаунт для кошелька");

    // Вид оплаты и символ обязаны совпадать. Иначе цена берётся из ступени
    // DARAI, а списывается названный клиентом токен — 500 000 мусора вместо
    // 500 000 DARAI.
    const symbol = data.payKind === "darai" ? "Darai" : data.symbol.trim();
    const tok = await pg.rewardTokens.findOne({ symbol });
    if (!tok) throw new Error(`Токен ${symbol} не заведён в реестре`);

    // Цена — по той же лестнице, что и при оплате переводом: со счёта не должно
    // быть дешевле, иначе появится арбитраж на ровном месте.
    const { getSisterWallets } = await import("./user-shared");
    const sisters = await getSisterWallets(wallet);
    const { pricingOf, requireCurrencyPrice } = await import("./energy-packs-steps");
    // DARAI живёт в лестнице отдельным видом, а не как «токен с символом».
    // Без этой ветки его предложение не находило свою ступень, и заплатить
    // со счёта за энергию в DARAI было нечем.
    const pay =
      data.payKind === "darai"
        ? ({ kind: "darai" } as const)
        : ({ kind: "token", symbol } as const);
    let price: number;
    if (pricingOf(pack).length > 0) {
      price = await requireCurrencyPrice(pack, account, pay);
    } else if (data.payKind === "darai") {
      price = Number(pack.price_darai ?? 0);
    } else {
      // Пак без лестницы оценён В ОДНОЙ валюте. Без этой сверки за пак ценой
      // «10 MED» можно было заплатить 10 чего угодно — символ приходит с
      // клиента, а цена бралась из пака.
      const want = String(pack.price_token_symbol ?? "").trim();
      if (!want || want.toLowerCase() !== symbol.toLowerCase()) {
        throw new Error(`Этот пак оплачивается только ${want || "золотом"}`);
      }
      price = Number(pack.price_token_amount ?? 0);
    }
    if (!(price > 0)) throw new Error("Этот пак нельзя оплатить этим токеном");

    const idk = `acc:${account}:${data.packId}:${data.opId}`;
    const { data: res, error } = await sb.rpc("buy_energy_pack_atomic", {
      p_wallet: wallet,
      p_pack_id: data.packId,
      p_pay_with: "account",
      p_sisters: sisters,
      p_tickets_price: 0,
      p_idk: idk,
      p_token_symbol: symbol,
      p_token_amount: price,
      p_price: price,
    });
    if (error) {
      const { mapEnergyErr } = await import("./energy-packs-shared");
      const msg = String(error.message ?? "");
      const notEnough = msg.match(/not_enough_currency:([^:]+):([\d.-]+):([\d.-]+)/);
      if (notEnough) {
        throw new Error(
          `Не хватает ${notEnough[1]}: нужно ${Number(notEnough[3])}, есть ${Number(notEnough[2])}`,
        );
      }
      throw new Error(mapEnergyErr(msg, Number(pack.daily_limit ?? 0)));
    }

    const row = (res as Array<{ energy_added: number }> | null)?.[0];
    // Внешний магазин, но за DARAI — пул карты растёт (правило пользователя).
    // Оплаты другими токенами (STARS, HOPE и т.п.) пула не касаются.
    if (symbol === "Darai" && price > 0) {
      const { insertPoolMove } = await import("./darai-pools-move");
      await insertPoolMove({
        pool: "map",
        kind: "player_spend",
        amount: price,
        ref: `epack:${idk}`,
        note: "энерго-пак за DARAI со счёта",
      }).catch((e) => console.warn("[pool] энерго-пак (счёт) не записан:", idk, e));
    }
    return {
      ok: true as const,
      energyAdded: Number(row?.energy_added ?? 0),
      token: symbol,
      spent: price,
      balance: await accBalance(wallet, symbol),
    };
  });
