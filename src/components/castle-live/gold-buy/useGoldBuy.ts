// Данные и оплата окна «Купить золото» (§8.66). Витрина — getGoldOffers (цены от
// $ по курсу), балансы — общий кэш счёта Казны, золото — общий кэш ресурсов:
// шапка, док, Казна и Торговый дом видят покупку сразу, без перезагрузки.
// Баланс меняется только после ответа сервера — ничего не рисуем заранее.
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGoldOffers } from "@/server/api/gold-shop/gold-offers";
import { buyGold } from "@/server/api/gold-shop/gold-buy";
import { ACC_BALANCES_KEY, useAccountBalances } from "@/lib/hooks/useAccountBalances";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { useEntryRules } from "@/hooks/useEntryRules";
import type { GoldBuyResult, GoldToken } from "@/lib/goldShop";
import { goldCards, type GoldCard, type GoldOpt, type PayRules } from "./goldBuyModel";

export const GOLD_SHOP_KEY = ["gold-shop-offers"] as const;

const AFTER_BUY = [RESOURCES_KEY, ACC_BALANCES_KEY, GOLD_SHOP_KEY, ["my-darai-balance"]] as const;

export function useGoldBuy(open: boolean) {
  const qc = useQueryClient();
  // Курс DARAI плавает: пока окно открыто, витрина обновляется раз в минуту.
  const shop = useQuery({
    queryKey: GOLD_SHOP_KEY,
    queryFn: () => getGoldOffers(),
    enabled: open,
    staleTime: 30_000,
    refetchInterval: open ? 60_000 : false,
  });
  const account = useAccountBalances();
  // §8.127: без настоящего Telegram способа «Stars» нет; «только Google» не пополняет.
  const { stars, googleOnly } = useEntryRules();
  const rules = useMemo<PayRules>(() => ({ stars, googleOnly }), [stars, googleOnly]);
  const cards = useMemo<GoldCard[]>(() => goldCards(shop.data, stars, googleOnly), [shop.data, stars, googleOnly]);

  /** Сколько есть на счёте этой валюты; null — ещё не знаем. */
  const balanceOf = (token: GoldToken): number | null => {
    if (account.isError || (account.isFetching && !account.data)) return null;
    const rows = Array.isArray(account.data?.balances) ? account.data.balances : null;
    if (!rows) return null;
    const needle = token.toLowerCase();
    return Number(rows.find((r) => r.token.toLowerCase() === needle)?.balance ?? 0);
  };

  /**
   * Ключ операции — один на экран подтверждения: и повтор транспорта, и
   * «Повторить» после обрыва связи найдут ту же квитанцию, второго списания нет.
   */
  const pay = async (card: GoldCard, opt: GoldOpt, opId: string): Promise<GoldBuyResult> => {
    try {
      return await buyGold({
        data: { offerId: card.offer.id, token: opt.token, shown: opt.price, gold: card.offer.gold, opId },
      });
    } finally {
      for (const key of AFTER_BUY) void qc.invalidateQueries({ queryKey: [...key], refetchType: "all" });
    }
  };

  const status: "loading" | "error" | "ready" = shop.isPending ? "loading" : shop.isError ? "error" : "ready";
  return {
    cards,
    status,
    starOnly: shop.data?.starOnly === true,
    rules,
    retry: () => void shop.refetch(),
    retryBalance: () => void account.refetch(),
    balanceError: account.isError,
    balanceOf,
    pay,
  };
}
