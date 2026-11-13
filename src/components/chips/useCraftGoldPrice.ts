// Текущая цена улучшения фишки в золоте (server/api/craft-gold-price):
//
//   const mult = useCraftGoldPrice().data?.multiplier;   // нет — цена неизвестна
//   const cost = mult == null ? null : goldAtMultiplier(rule.costGold, mult);
//
// Сервер отдаёт множитель к стандарту, цену считает lib/craftGold — та же
// функция, что у списания, поэтому показанное совпадает с отправленным
// expectGold. Отказ «Цена изменилась» — повод перечитать: invalidate по ключу.
import { useQuery } from "@tanstack/react-query";
import { getCraftGoldPrice } from "@/server/api/craft-gold-price";

export const CRAFT_GOLD_KEY = ["craft-gold-price"] as const;

export function useCraftGoldPrice() {
  return useQuery({
    queryKey: CRAFT_GOLD_KEY,
    queryFn: () => getCraftGoldPrice(),
    staleTime: 30_000,
  });
}
