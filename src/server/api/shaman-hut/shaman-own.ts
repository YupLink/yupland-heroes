// «Хижина шаманов» (владелец, 28.10.2026): здание замка. Покупается в Ратуше,
// как «Метеостанция» (castle_building kind 'shaman_hut', townhall-buy.ts:
// списание до постройки одной функцией базы, повтор не задваивает). Есть
// хижина — в замке иконка и окно шаманов (shaman-hut.ts).
import { createServerFn } from "@tanstack/react-start";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { accAccountId } from "@/server/api/currency/move";
import { hasCastleBuilding } from "@/server/api/castle-townhall/free-build";
import { SHAMAN_HUT_KIND } from "@/lib/townHallCatalog";

/** Кошелёк и аккаунт игрока — тот же аккаунт, на который куплена хижина. */
export async function hutPlayer(): Promise<{ wallet: string; account: string }> {
  const wallet = await requireBetaRaid();
  const account = await accAccountId(wallet);
  if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");
  return { wallet, account };
}

/** Построена ли хижина у аккаунта. */
export async function hasShamanHut(account: string): Promise<boolean> {
  // Купленное здание или личное право «строить бесплатно» (free-build.ts).
  return hasCastleBuilding(account, SHAMAN_HUT_KIND);
}

export async function requireShamanHut(account: string): Promise<void> {
  if (!(await hasShamanHut(account))) throw new Error("shaman.not_built");
}

/** Есть ли хижина — для иконки и облика на площади замка. */
export const getShamanHutOwned = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ owned: boolean }> => ({
    owned: await hasShamanHut((await hutPlayer()).account),
  }),
);
