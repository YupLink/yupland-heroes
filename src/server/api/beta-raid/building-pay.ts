// Оплата постройки: билеты, лайки или токен экосистемы.
//
// Каждый ресурс списывается своим проверенным путём — билеты через леджер
// билетов, лайки через баланс лайков, токен через валютный леджер. Ссылка
// (ref) одна на переход тира, поэтому повторное нажатие не спишет дважды.
import { noteEnergySpendByWallet } from "./econ/energy-note";
import type { BuildPrice } from "./buildings";
import type { ServicePrice } from "@/lib/buildingEffect";

export async function payBuildPrice(wallet: string, price: BuildPrice, ref: string): Promise<void> {
  if (price.kind === "tickets") {
    const { moveTickets } = await import("../tickets-ledger");
    const res = await moveTickets({ wallet, delta: -price.amount, kind: "building", ref });
    if (!res.applied) throw new Error("Оплата билетами не прошла");
    return;
  }

  if (price.kind === "likes") {
    const { spendLikes } = await import("../heroes-shared");
    // ref у постройки уже содержит вид услуги и клетку — в журнал трат он и идёт.
    await spendLikes(wallet, price.amount, "building_service", ref);
    return;
  }

  const symbol = price.token?.trim();
  if (!symbol) throw new Error("Не указан токен оплаты");
  // Токен списывается с ресурсного счёта. Раньше баланс читался из зеркала
  // currency_ledger отдельным запросом, а списание шло следующим — два
  // одновременных нажатия уводили счёт в минус. Теперь и проверка, и списание
  // живут внутри acc_move под замком аккаунта.
  // DARAI — внутренняя механика карты: помимо списания растим пул карты.
  if (symbol === "Darai") {
    const { payDaraiToMapPool } = await import("../currency/pay-darai-map");
    const paid = await payDaraiToMapPool({
      wallet,
      amount: price.amount,
      ref,
      note: `постройка ${ref}`,
    });
    if (!paid.applied) throw new Error("Эта постройка уже оплачена");
    return;
  }
  const { payFromAccount } = await import("../currency/spend");
  const paid = await payFromAccount({ wallet, token: symbol, amount: price.amount, ref });
  if (!paid.applied) throw new Error("Эта постройка уже оплачена");
}

/**
 * Оплата услуги постройки (дерево уровней). То же, что и переход тира, плюс
 * энергия: у дерева она допустима как цена.
 */
export async function payServicePrice(
  wallet: string,
  price: ServicePrice,
  ref: string,
): Promise<void> {
  if (price.kind === "energy") {
    const { sb } = await import("../../db/pg");
    const { error } = await sb.rpc("touch_energy_atomic", {
      p_wallet: wallet,
      p_spend: price.amount,
    });
    if (error) {
      const m = String(error.message ?? "").match(/not_enough_energy:([\d.]+):([\d.]+)/);
      throw new Error(m ? `Нужно ${m[2]} энергии, у тебя ${m[1]}` : "Не хватает энергии");
    }
    void noteEnergySpendByWallet(wallet, price.amount, "build");
    return;
  }
  await payBuildPrice(wallet, price as BuildPrice, ref);
}
