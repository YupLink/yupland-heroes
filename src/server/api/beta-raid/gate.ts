// Доступ к бета-рейду: админы и тестеры, которым владелец включил механику.
//
// Раньше проверки не было вовсе: кнопку прятали в UI, а серверные ходы и бой
// работали у любого, кто знал адрес /beta-raid.
import { requireFeature } from "../testers";
import { legacyRaidsEnabled } from "../raid-mode";
import { getCurrentWallet } from "../../auth";

export async function requireBetaRaid(): Promise<string> {
  // Старые рейды закрыты — гекс-карта стала основным рейдом и открыта всем.
  if (!(await legacyRaidsEnabled())) {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    return wallet;
  }
  return requireFeature("beta_raid");
}
