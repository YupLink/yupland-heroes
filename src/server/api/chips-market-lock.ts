// Сервис-лок Маркета фишек для НОВЫХ игроков (вынесен из chipsMarket.ts).
// Новый игрок (прошёл прихожу, onboarding=true) не может покупать в Маркете, пока
// не купит хотя бы 1 ПАК в магазине (source purchase_*). Старые юзеры
// (onboarding=false) — без ограничений. Всё по аккаунту.
// `purchase_account` — пак оплачен со счёта (DARAI/ресурс), тот же поток что
// «purchase_darai», только у него теперь единый счёт. Без этого источника
// новичок покупает пак за 50 000 DARAI, а Маркет всё равно закрыт
// (жалоба «купил пак — маркет пишет что нельзя, надо купить пак»).
import { pg } from "../db/pg";
import { accountOf } from "./user-shared";

// Пак за золото пишется прежним 'purchase_tickets' (tix-gold-02).
const PURCHASE_SOURCES = ["purchase_tickets", "purchase_darai", "purchase_account"];

export const MARKET_LOCKED = "Купи хотя бы 1 пак в Магазине, чтобы открыть Маркет";

export async function marketLockState(
  account: string,
): Promise<{ locked: boolean; isNew: boolean; boughtPack: boolean }> {
  const { data: newRows } = await pg.users
    .raw()
    .select("wallet")
    .eq("account_id", account)
    .eq("hallway_onboarding", true)
    .limit(1);
  const isNew = (newRows?.length ?? 0) > 0;
  if (!isNew) return { locked: false, isNew: false, boughtPack: true };
  const { data: packRows } = await pg.chipPackGrants
    .raw()
    .select("id")
    .eq("account_id", account)
    .in("source", PURCHASE_SOURCES)
    .limit(1);
  const boughtPack = (packRows?.length ?? 0) > 0;
  return { locked: !boughtPack, isNew, boughtPack };
}

/** Лок Маркета для новичка — по кошельку (групповая покупка). */
export async function marketLockedFor(wallet: string): Promise<boolean> {
  return (await marketLockState(await accountOf(wallet))).locked;
}
