// «Газетный киоск» (Ангелина, 30.10.2026): здание замка. Покупается в Ратуше,
// как «Хижина шаманов» (castle_building kind 'newspaper_kiosk', townhall-buy.ts:
// списание до постройки одной функцией базы, повтор не задваивает). Есть
// киоск — в замке его облик и окно газет (окно и газеты — отдельно).
import { createServerFn } from "@tanstack/react-start";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { accAccountId } from "@/server/api/currency/move";
import { hasCastleBuilding } from "@/server/api/castle-townhall/free-build";
import { NEWSPAPER_KIOSK_KIND } from "@/lib/townHallCatalog";

/** Аккаунт игрока — тот же, на который куплен киоск. */
export async function kioskAccount(): Promise<string> {
  const wallet = await requireBetaRaid();
  const account = await accAccountId(wallet);
  if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");
  return account;
}

/** Построен ли киоск у аккаунта: купленный или по праву «строить бесплатно». */
export async function hasNewspaperKiosk(account: string): Promise<boolean> {
  return hasCastleBuilding(account, NEWSPAPER_KIOSK_KIND);
}

export async function requireNewspaperKiosk(account: string): Promise<void> {
  if (!(await hasNewspaperKiosk(account))) throw new Error("kiosk.not_built");
}

/** Есть ли киоск — для облика на площади замка и окна газет. */
export const getNewspaperKioskOwned = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ owned: boolean }> => ({
    owned: await hasNewspaperKiosk(await kioskAccount()),
  }),
);
