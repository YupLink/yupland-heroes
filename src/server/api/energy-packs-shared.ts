// Общее для модулей энергопаков: константы, гейты доступа, скидка подписки.
import { getCurrentWallet, isAdminWallet } from "../auth";
import { pg } from "../db/pg";

export { getCurrentWallet, isAdminWallet };

export const DARAI_FT_CONTRACT = "darai.tkn.near";
export const DARAI_DECIMALS = 18;
export const DARAI_DEPOSIT_RECEIVER = "darai_gdrop.near";
export const ENERGY_SHOP_KEY = "energyShop:enabled";

export function requireWallet(): string {
  const w = getCurrentWallet();
  if (!w) throw new Error("Кошелёк не подключён");
  return w;
}

export function requireAdmin(): string {
  const w = requireWallet();
  if (!isAdminWallet(w)) throw new Error("Только для админа");
  return w;
}

export function sqlStr(v: string) {
  return "'" + String(v).replace(/'/g, "''") + "'";
}

/** Цена со скидкой подписки, округление вверх (не даём копеечных дырок). */
export const applyDiscountCeil = (price: number, disc: number): number =>
  disc > 0 ? Math.ceil(price * (1 - disc / 100) * 100) / 100 : price;

/** Килсвич магазина энергии: пока OFF — витрину видит только админ. */
export async function energyShopEnabled(): Promise<boolean> {
  const row = await pg.settings.findOne({ key: ENERGY_SHOP_KEY });
  return row?.value === "true";
}

/** Человеческий текст вместо кода ошибки атомарной покупки. */
export function mapEnergyErr(msg: string, dailyLimit: number): string {
  if (msg.includes("pack_not_found")) return "Пак не найден";
  if (msg.includes("pack_inactive")) return "Пак неактивен";
  if (msg.includes("no_tickets_price")) return "Этот пак нельзя купить за билеты";
  if (msg.includes("no_darai_price")) return "Этот пак нельзя купить за $DARAI";
  if (msg.includes("no_token_price")) return "Этот пак нельзя купить за токен";
  if (msg.includes("daily_limit")) {
    const m = msg.match(/daily_limit:(\d+)/);
    return `Дневной лимит покупок этого пака исчерпан (${m?.[1] ?? dailyLimit}/день)`;
  }
  if (msg.includes("stale_price")) {
    const m = msg.match(/stale_price:([\d.]+):([\d.]+)/);
    return m
      ? `Цена уже поднялась на следующую ступень: сейчас ${Number(m[2]).toLocaleString("ru-RU")}, а оплачено ${Number(m[1]).toLocaleString("ru-RU")}. Обнови экран.`
      : "Цена уже поднялась на следующую ступень — обнови экран";
  }
  if (msg.includes("not_enough_darai")) {
    const m = msg.match(/not_enough_darai:([\d.]+):([\d.]+)/);
    return m
      ? `Не хватает $DARAI (есть ${Number(m[1]).toLocaleString("ru-RU")}, нужно ${Number(m[2]).toLocaleString("ru-RU")})`
      : "Не хватает $DARAI";
  }
  return msg;
}
