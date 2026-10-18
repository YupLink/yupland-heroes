// Сколько СВОБОДНЫХ артефактов каждого шаблона у игрока — для кнопки «Макс» на
// ИМЕННОЙ позиции: витрина просит конкретный артефакт, пикера у неё нет, и
// считать было нечем.
//
// ПОЧЕМУ по требованию (enabled), а не всегда. Именные артефакты в цене —
// редкость: на большинстве клеток такой позиции нет, а окно постройки
// открывают на каждый тап. Спрашиваем, только когда на витрине есть кому
// ответить.
//
// Ключ разделяет префикс с пикером (SELLABLE_ARTS_KEY): сделка сбрасывает
// проданное сразу в обоих списках (useMarketCheckout).
import { useQuery } from "@tanstack/react-query";
import { listSellableArtifacts } from "@/server/api/beta-raid/artifacts-sellable";
import { SELLABLE_ARTS_KEY } from "./MarketArtPick";

/** Свободных штук по шаблону. null — список ещё не готов (не спрашивали/грузим). */
export function useFreeArtCounts(enabled: boolean): (templateId: string) => number | null {
  const q = useQuery({
    // Без редкости — весь свободный инвентарь: именные позиции бывают любой.
    queryKey: [...SELLABLE_ARTS_KEY, "all"],
    queryFn: () => listSellableArtifacts({ data: {} }),
    staleTime: 30_000,
    enabled,
  });
  return (templateId) => {
    const list = q.data;
    // Отсутствие шаблона в готовом списке — честный ноль: значит все такие
    // артефакты надеты либо их нет вовсе.
    if (!list) return null;
    return list.find((a) => a.templateId === templateId)?.count ?? 0;
  };
}
