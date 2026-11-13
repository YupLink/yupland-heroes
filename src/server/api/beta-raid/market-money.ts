// Движение денег маркета: списать цену (spend) и зачислить обратно/выдать
// ресурс (credit). Вынесено из market-buy.ts, чтобы покупка, доставка товара и
// откат при сбое пользовались ОДНИМИ функциями, а файлы держались ≤250 строк.
// Гард «не в минус» — внутри каждой нижележащей функции (res_move/tickets/…).
import { sb } from "../../db/pg";
import { spendLikes } from "../heroes-shared";
import { goldForEarnedTickets, goldForTicketPrice } from "@/lib/ticketGold";
import { payFromAccount } from "../currency/spend";
import { payDaraiToMapPool, DARAI_TOKEN } from "../currency/pay-darai-map";
import { grantRaidReward } from "../raid-helpers";
import { creditEnergy, marketEnergyKind } from "../energy-credit";
import { accMove } from "../currency/move";
import { spendInventory, creditInventory, type SpendPick } from "./market-inv-pay";
import type { PawnHeroRef } from "./hero-any";
import { noteEnergySpend } from "./econ/energy-note";
import type { MarketPriceResource } from "@/lib/marketItem";
import type { BackpackTakeSnapshot } from "./market-backpack-take";

const RES = ["gold", "stone", "wood", "diamonds"] as const;
const isRes = (r: string): boolean => (RES as readonly string[]).includes(r);

/** Список того, что реально списано у игрока — нужен, если сервер соберётся
 *  откатывать: например, «арт по редкости» (art_any_X) при spend'е превращается
 *  в конкретные экземпляры, и credit без хинта вернул бы не их. */
export type SpendReceipt = {
  /** Экземпляры артефактов, снятые с инвентаря (user_game_item): id строки,
   *  шаблон и дата получения. Откат возвращает РОВНО ИХ — иначе игрок отдаёт
   *  свой артефакт, а получает назад случайный той же редкости. Дата нужна той
   *  же цели: без неё возвращённый уезжал в конец очереди FIFO, и «сервер
   *  берёт самый старый» начинал врать. */
  paidArts?: Array<{ id: string; templateId: string; obtainedAt?: string | null }>;
  /** Снимок списания со стека рюкзака: откат вернёт штуки с их метками (mob/mine/field/lootTaken). */
  backpack?: BackpackTakeSnapshot;
  /** Герой, с чьего стека списано: откат вернёт ему, а не новому основному. */
  heroId?: string;
  /** Звездочник заплатил за DARAI звёздами — откат вернёт их (не DARAI). */
  starsPaid?: number;
  /** Цену «в билетах» взяли золотом ×500 (§8.61) — откат вернёт столько же, а
   *  не ×100, как при выдаче товара «билеты». */
  ticketsAsGold?: boolean;
  /** Герои, сданные в ломбард «Любым героем»: откат вернёт их из снимка (hero-pawn-take). */
  paidHeroes?: PawnHeroRef[];
};

/** Чем сузить выбор при оплате штучным предметом — тип у его потребителя (market-inv-pay). */
export type { SpendPick };

/** Списать цену у игрока. Гард «не в минус» — внутри каждой функции. */
export async function spend(
  wallet: string,
  account: string,
  res: MarketPriceResource,
  token: string | null,
  amount: number,
  ref: string,
  pick?: SpendPick,
): Promise<SpendReceipt> {
  if (amount <= 0) return {};
  if (isRes(res)) {
    const { error } = await sb.rpc("res_move", {
      p_account: account,
      p_resource: res,
      p_delta: -amount,
      p_kind: "market_buy",
      p_ref: ref,
    });
    if (error)
      throw new Error(
        String(error.message).includes("в минус") ? "market.not_enough" : error.message,
      );
  } else if (res === "likes") {
    await spendLikes(wallet, amount, "market_buy", ref);
  } else if (res === "tickets") {
    // Билетов нет (§8.61): цена «в билетах» платится золотом ×500.
    const { error } = await sb.rpc("res_move", {
      p_account: account,
      p_resource: "gold",
      p_delta: -goldForTicketPrice(amount),
      p_kind: "market_buy",
      p_ref: ref,
    });
    if (error)
      throw new Error(
        String(error.message).includes("в минус") ? "market.not_enough" : error.message,
      );
    return { ticketsAsGold: true };
  } else if (res === "energy") {
    const { error } = await sb.rpc("touch_energy_atomic", { p_wallet: wallet, p_spend: amount });
    if (error)
      throw new Error(
        String(error.message).includes("not_enough_energy") ? "market.not_enough" : error.message,
      );
    void noteEnergySpend(account, amount, "market");
  } else if (res === "token") {
    if (!token) throw new Error("market.not_enough");
    // Оплата DARAI внутри карты — счётчик пула карты растёт: маркет-постройка
    // это такая же «внутренняя» механика, как порталы и апгрейды. Токен НЕ
    // Darai платится обычным путём — они пулу карты не адресованы.
    if (token === DARAI_TOKEN) {
      const paid = await payDaraiToMapPool({ wallet, amount, ref, note: `маркет ${ref}` });
      if (paid.stars) return { starsPaid: paid.stars };
    } else {
      await payFromAccount({ wallet, token, amount, ref });
    }
  } else if (
    res === "pack" ||
    res === "hero" ||
    res === "art" ||
    res === "boss" ||
    res === "custom"
  ) {
    // Символ у предметной цены — refId шаблона (в схеме price_token). Без него
    // не платят: непонятно, что именно снимать.
    if (!token) throw new Error("market.not_enough");
    // Артефакт и «любой герой редкости» (ломбард) — НЕ рюкзачные: живут штучно
    // в инвентаре (user_game_item), market-inv-pay. Пока платили с рюкзака,
    // «Ломбард» отвечал «нет артефакта такой редкости» игроку с сотней артефактов.
    const inv = await spendInventory(res, wallet, account, token, amount, ref, pick);
    if (inv) return inv;
    // Пак/герой/босс/кастом — со стека рюкзака героя. Ключ приводим к КАНОНУ:
    // приёмка, выставленная на «Помидоры», обязана принимать и «Помидор» —
    // это один товар (item-alias).
    const { resolveBackpack, takeFromBackpackStack } = await import("./market-backpack");
    const { canonStackKey } = await import("./item-alias");
    const bp = await resolveBackpack(wallet);
    if (!bp) throw new Error("market.need_hero");
    const key = await canonStackKey(res, token);
    const taken = await takeFromBackpackStack(bp.heroId, key, amount);
    if (!taken) throw new Error("market.not_enough");
    return { backpack: taken, heroId: bp.heroId };
  }
  return {};
}

/** Зачислить ресурс игроку — для выдачи ресурс-товара и для отката цены.
 *  При откате оплаты «арт по редкости» вызывающий обязан передать receipt из
 *  spend: без него credit не знает, какой шаблон возвращать (у token в такой
 *  цене — псевдо-строка вида art_any_common). */
export async function credit(
  wallet: string,
  account: string,
  res: MarketPriceResource,
  token: string | null,
  amount: number,
  ref: string,
  receipt?: SpendReceipt,
): Promise<void> {
  if (amount <= 0) return;
  if (isRes(res)) {
    // Шим отдаёт отказ базы ОБЪЕКТОМ {error}, а не броском: без этой проверки
    // непрошедший возврат золота/камня/дерева/алмазов выглядел как успех —
    // игрок оставался без товара и без денег, а алерт о провале возврата
    // (market-undo-alert) не срабатывал, потому что бросать было нечему.
    const { error } = await sb.rpc("res_move", {
      p_account: account,
      p_resource: res,
      p_delta: amount,
      p_kind: "market_sell",
      p_ref: ref,
    });
    if (error) throw new Error(error.message || "market.give_failed");
  } else if (res === "energy") {
    // Энергия маркета — ПОКУПКА (не тает выше лимита), откат цены — возврат.
    // Через grantRaidReward она шла как награда energy_reward без ref, и
    // таяние (acc-45) не могло отличить её от сундука.
    await creditEnergy(wallet, amount, marketEnergyKind(ref), ref);
  } else if (res === "tickets") {
    // Билетов нет (§8.61): откат цены «в билетах» — то же золото ×500, что взял
    // spend (квитанция); товар/выплата «билеты» — золото ×100, как всё полученное.
    const gold = receipt?.ticketsAsGold ? goldForTicketPrice(amount) : goldForEarnedTickets(amount);
    const { error } = await sb.rpc("res_move", {
      p_account: account,
      p_resource: "gold",
      p_delta: gold,
      p_kind: "market_sell",
      p_ref: ref,
    });
    if (error) throw new Error(error.message || "market.give_failed");
  } else if (res === "likes") {
    await grantRaidReward(wallet, res, amount, null, ref);
  } else if (res === "token") {
    // Токен без символа выдать некуда — раньше это была тихая потеря денег.
    // Бросаем, чтобы сработал откат цены (см. buyMarketItem()).
    if (!token) throw new Error("market.give_failed");
    // Откат оплаты, сделанной звёздами вместо DARAI, — звёздами, пул не трогаем.
    if (token === DARAI_TOKEN && receipt?.starsPaid) {
      await accMove({ wallet, token: "STARS", delta: receipt.starsPaid, kind: "acc_reward", ref });
      return;
    }
    await accMove({ wallet, token, delta: amount, kind: "acc_reward", ref });
    // Пул карты уменьшается всякий раз, когда DARAI УХОДИТ игроку с адреса
    // игры — независимо от причины (откат покупки, выдача DARAI-товара,
    // выплата за проданное игроком). Симметрично к spend, там пул растёт.
    if (token === DARAI_TOKEN) {
      const { insertPoolMove } = await import("../darai-pools-move");
      await insertPoolMove({
        pool: "map",
        kind: "player_spend",
        amount: -amount,
        ref,
        note: `выдача карта ${ref}`,
      }).catch((e) => console.warn("[pool] map player_spend (выдача) не записан:", ref, e));
    }
  } else if (
    res === "pack" ||
    res === "hero" ||
    res === "art" ||
    res === "boss" ||
    res === "custom"
  ) {
    // Возврат предметной цены (или выдача такого товара). Символ обязателен:
    // без него непонятно, что возвращать, и товар пропал бы.
    if (!token) throw new Error("market.give_failed");
    // Артефакт (и сданный в ломбард герой) возвращается в ИНВЕНТАРЬ, а не в
    // рюкзак, и по квитанции — ровно теми экземплярами, что списали. Без
    // квитанции (выдача артефакта как товара) чеканим новые (market-inv-pay).
    if (await creditInventory(res, wallet, account, token, amount, ref, receipt)) return;
    const { resolveBackpack, returnToBackpackStack } = await import("./market-backpack");
    // Откат — тому герою, с кого списали (квитанция): сменил игрок основного
    // между оплатой и откатом — зелья не лягут в чужую сумку мимо её ёмкости.
    const heroId = receipt?.heroId ?? (await resolveBackpack(wallet))?.heroId;
    if (!heroId) throw new Error("market.give_failed");
    const { canonStackKey, canonCustomMeta } = await import("./item-alias");
    const stackKey = await canonStackKey(res, token);
    // Имя и картинка — со снимка списания: стопку целиком продали, сделка
    // сорвалась (16.10: «у ратуши нет денег») — без них ячейка вставала заново
    // под кодом «cst_…» и без картинки. Без квитанции — из справочника товара.
    const look = receipt?.backpack ?? (res === "custom" ? await canonCustomMeta(token) : null);
    await returnToBackpackStack(
      heroId,
      stackKey,
      amount,
      {
        kind: res,
        refId: token,
        name: look?.name || token,
        image: look?.image ?? null,
        mobTaken: receipt?.backpack?.mobTaken,
        mineTaken: receipt?.backpack?.mineTaken,
        fieldTaken: receipt?.backpack?.fieldTaken,
        lootTaken: receipt?.backpack?.lootTaken,
      },
      account,
    );
  }
}
