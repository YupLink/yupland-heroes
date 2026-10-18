// Данные и оплата окна «Купить энергию» в замке. Запросы и пути оплаты — те же,
// что у старого окна энергии (useEnergyPurchase, EnergySubSection,
// EnergyLikeOfferCard), общие ключи кэша — шапка и Казна видят покупку сразу.
// Платим только со счёта и игровыми валютами: подпись в кошельке осталась в
// старом окне на карте.
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listEnergyPacksPublic, buyEnergyPackViaTickets } from "@/server/api/energyPacks";
import { getEnergyLikeOffer, buyEnergyForLikes } from "@/server/api/chips-stake";
import { buyEnergyPackFromAccount } from "@/server/api/energy-packs-account-pay";
import { buyEnergyPackForUsd } from "@/server/api/energy-packs-usd-pay";
import { getEnergySubOffers } from "@/server/api/energy-sub/tiers";
import { buyEnergySub } from "@/server/api/energy-sub/buy";
import { myLikeBalance } from "@/server/api/likes";
import { ACC_BALANCES_KEY, useAccountBalances } from "@/lib/hooks/useAccountBalances";
import { TICKETS_KEY, useTickets } from "@/lib/hooks/useTickets";
import { newOpId } from "@/lib/opId";
import { likesCard, packCard, subSaving, type PackCard, type PayOpt } from "./energyOffers";

/** Тот же ключ, что у EnergySubSection: витрина подписки одна на приложение. */
const ESUB_KEY = ["energy-sub-offers"];
const PACKS_KEY = ["energy-packs-public"];
const LIKE_OFFER_KEY = ["energy-like-offer"];
const LIKES_KEY = ["my-like-balance"];

const AFTER_BUY = [
  ["my-energy"],
  TICKETS_KEY,
  LIKES_KEY,
  ["my-darai-balance"],
  PACKS_KEY,
  LIKE_OFFER_KEY,
  ESUB_KEY,
  ACC_BALANCES_KEY,
  ["my-gifts"],
  ["boss-active"],
  ["my-payouts"],
  // Подписка даёт лицензию банка (esub-06) — окно банка видит её сразу.
  ["bank-license"],
] as const;

export function useEnergyBuy(open: boolean) {
  const qc = useQueryClient();
  const packs = useQuery({ queryKey: PACKS_KEY, queryFn: () => listEnergyPacksPublic(), enabled: open });
  const like = useQuery({ queryKey: LIKE_OFFER_KEY, queryFn: () => getEnergyLikeOffer(), enabled: open });
  const subs = useQuery({ queryKey: ESUB_KEY, queryFn: () => getEnergySubOffers(), enabled: open, staleTime: 60_000 });
  const likes = useQuery({ queryKey: LIKES_KEY, queryFn: () => myLikeBalance(), staleTime: 30_000 });
  const tickets = useTickets();
  const account = useAccountBalances();

  const cards = useMemo<PackCard[]>(() => {
    const list = (packs.data?.packs ?? []).map(packCard).filter((c) => c.game || c.others.length);
    const l = likesCard(like.data);
    return [...(l ? [l] : []), ...list].sort((a, b) => a.amount - b.amount);
  }, [packs.data, like.data]);

  const tiers = useMemo(() => (subs.data?.visible ? subs.data.tiers : []), [subs.data]);
  const savings = useMemo(() => tiers.map((t) => subSaving(t, cards)), [tiers, cards]);

  /** Сколько есть у игрока того, чем он платит. null — ещё не знаем. */
  const balanceOf = (o: PayOpt): number | null => {
    if (o.method === "tickets") {
      const t = tickets.data as { availableRaw?: number; available?: number } | undefined;
      return t ? Number(t.availableRaw ?? t.available ?? 0) : null;
    }
    if (o.method === "likes") return likes.data ? Number(likes.data.available ?? 0) : null;
    if (account.isFetching && !account.data) return null;
    const rows = Array.isArray(account.data?.balances) ? account.data.balances : null;
    if (!rows) return null;
    const needle = o.token.toLowerCase();
    return Number(rows.find((r) => r.token.toLowerCase() === needle)?.balance ?? 0);
  };

  /**
   * Ключ операции — один на экран подтверждения: и повтор транспорта, и
   * повторное нажатие после обрыва связи не спишут дважды.
   */
  const pay = async (o: PayOpt, opId: string = newOpId()): Promise<void> => {
    const h = o.how;
    try {
      if (h.kind === "tickets") await buyEnergyPackViaTickets({ data: { packId: h.packId } });
      else if (h.kind === "likes") await buyEnergyForLikes({ data: { expectedPrice: h.expected } });
      else if (h.kind === "account")
        await buyEnergyPackFromAccount({ data: { packId: h.packId, symbol: h.symbol, payKind: h.payKind, opId } });
      else if (h.kind === "usd")
        await buyEnergyPackForUsd({ data: { packId: h.packId, token: h.token, shown: o.price, opId } });
      else await buyEnergySub({ data: { tierId: h.tierId, token: h.token, expected: o.price, opId } });
    } finally {
      for (const key of AFTER_BUY) void qc.invalidateQueries({ queryKey: [...key], refetchType: "all" });
    }
  };

  const status: "loading" | "error" | "ready" =
    packs.isPending && subs.isPending && like.isPending ? "loading" :
    packs.isError && subs.isError && like.isError ? "error" : "ready";
  const sectionStatus = {
    packs: packs.isPending ? "loading" : packs.isError ? "error" : "ready",
    subs: subs.isPending ? "loading" : subs.isError ? "error" : "ready",
    like: like.isPending ? "loading" : like.isError ? "error" : "ready",
  } as const;
  const retry = () => {
    void packs.refetch();
    void subs.refetch();
    void like.refetch();
  };
  return {
    cards, tiers, mine: subs.data?.visible ? subs.data.mine : [], savings, status, sectionStatus, retry,
    retryPacks: () => void packs.refetch(),
    retrySubs: () => void subs.refetch(),
    retryLike: () => void like.refetch(),
    balanceOf, pay, account,
  };
}
