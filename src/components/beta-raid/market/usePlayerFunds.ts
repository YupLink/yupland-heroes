// Чем игрок располагает прямо сейчас — одной функцией have(ресурс, символ).
// Нужна витрине, чтобы подсветить нехватку и не пускать заведомо пустую сделку;
// последнее слово всё равно за сервером. Вынесено из MarketAction (лимит ≤250).
//
// Три РАЗНЫХ ответа, и путать их нельзя:
//   число        — столько у игрока есть;
//   null         — баланс ещё не приехал. Непрогретый кэш отдавал ноль, и
//                  витрина честно врала: «Макс 0», «не хватает» — а через
//                  мгновение всё прыгало на настоящие числа;
//   Infinity     — предметный вид, состав которого клиенту не виден: не
//                  блокируем, спросим сервер.
import { useQuery } from "@tanstack/react-query";
import { myLikeBalance } from "@/api";
import { useEnergy } from "@/lib/hooks/useEnergy";
import { useResources } from "@/lib/hooks/useResources";
import { useAccountBalances } from "@/lib/hooks/useAccountBalances";
import type { MarketPriceResource } from "@/lib/marketItem";
import { TICKET_SPEND_GOLD } from "@/lib/ticketGold";

export type HaveFn = (resource: MarketPriceResource, token: string | null) => number | null;

export function usePlayerFunds(): HaveFn {
  const resBal = useResources().data;
  const energyBal = useEnergy().data;
  const accBal = useAccountBalances().data;
  const likesBal = useQuery({
    queryKey: ["my-like-balance"],
    queryFn: () => myLikeBalance(),
    staleTime: 30_000,
  }).data;

  return (resource, token) => {
    if (
      resource === "gold" ||
      resource === "stone" ||
      resource === "wood" ||
      resource === "diamonds"
    )
      return resBal ? (resBal[resource] ?? 0) : null;
    if (resource === "energy") return energyBal ? (energyBal.energy ?? 0) : null;
    if (resource === "likes") return likesBal ? (likesBal.available ?? 0) : null;
    // Билетов нет (§8.61): цена «в билетах» платится золотом ×500 — сколько
    // таких «билетов» по цене покрывает золото на счёте.
    if (resource === "tickets") return resBal ? (resBal.gold ?? 0) / TICKET_SPEND_GOLD : null;
    if (resource === "token")
      return accBal ? (accBal.balances?.find((b) => b.token === token)?.balance ?? 0) : null;
    // Предметная цена лежит в рюкзаке героя — его состав тут не читаем: хватает
    // ли, скажет сервер. Кнопку заранее не блокируем.
    return Number.POSITIVE_INFINITY;
  };
}
