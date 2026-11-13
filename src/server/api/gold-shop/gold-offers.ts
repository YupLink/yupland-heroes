// Витрина золота (ПРАВИЛА §8.66): пакеты из базы и цены во всех валютах счёта,
// посчитанные от $ по живому курсу (кэш Ref на 5 минут, как у подписки).
// Доступность способов — по правилам Казны: счёт есть — платить можно всем,
// чем есть на счёте (звездочник тоже тратит добытые в игре DARAI и USDT,
// §8.41), DARAI — только пока есть курс. Цены — публичные, витрину видят все.
import { createServerFn } from "@tanstack/react-start";
import { getCurrentWallet } from "../../auth";
import { goldPrices, type GoldBlock, type GoldShop, type GoldToken } from "@/lib/goldShop";
import { isWalletLinked } from "@/lib/walletLinked";

/** Можно ли игроку платить со счёта: счёт раскатан всем или он владелец. */
async function accountBlock(wallet: string | null): Promise<GoldBlock> {
  if (!wallet) return "login";
  const { requireAccountUser } = await import("../account-rollout");
  try {
    await requireAccountUser();
    return null;
  } catch {
    return "account";
  }
}

export const getGoldOffers = createServerFn({ method: "GET" }).handler(
  async (): Promise<GoldShop> => {
    const wallet = getCurrentWallet();
    const { loadGoldOffers } = await import("./gold-sql");
    const rows = await loadGoldOffers();
    const { daraiPerUsd } = await import("../energy-sub/rate");
    const rate = rows.length ? ((await daraiPerUsd())?.rate ?? null) : null;
    const block = await accountBlock(wallet);
    const methods: Record<GoldToken, GoldBlock> = {
      STARS: block,
      USDT: block,
      Darai: block ?? (rate ? null : "no_rate"),
    };
    return {
      offers: rows.map((r) => ({ ...r, prices: goldPrices(r.priceUsd, rate) })),
      methods,
      starOnly: !!wallet && !isWalletLinked(wallet),
    };
  },
);
