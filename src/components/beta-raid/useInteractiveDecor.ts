// Декор со «Взаимодействием» — один кэш на экран рейда: тап по клетке
// (useDecorInteract) и плашка маршрута с надписью действия (usePathBadgeTarget)
// читают один и тот же список. Свежесть: сервер держит его 30 с и сбрасывает
// при сохранении в админке (decor-interact-admin), админка сбрасывает этот ключ.
import { useQuery } from "@tanstack/react-query";
import { getInteractiveDecor } from "@/server/api/beta-raid/decor-interact";

/** enabled: false — только читать то, что уже в кэше, не запрашивая. */
export function useInteractiveDecor(enabled = true) {
  return useQuery({
    queryKey: ["interactive-decor"],
    queryFn: () => getInteractiveDecor(),
    staleTime: 60_000,
    enabled,
  });
}
