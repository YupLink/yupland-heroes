// Энергия игрока — ОДИН источник на всё приложение.
//
// Раньше каждый экран возил свой снимок (состояние рейда, состояние босса), и
// числа расходились: в шапке 12, на карте 8, а бой отказывал «Нужно 10
// энергии» при достаточном балансе. Теперь все читают этот кэш — шапка,
// главная, рейд, бета-рейд и босс, — поэтому цифра везде одна и обновляется
// без перезагрузки страницы.
import { useQuery } from "@tanstack/react-query";
import { getMyEnergy } from "@/server/api/chips-stake-energy";

// Куда движется энергия (реген / таяние / стоит) — один источник для всех
// HUD-ов, чтобы шапка и полоса рейда не спорили о подписи. Выше лимита запас
// ТАЕТ (acc-45): «+1 через …» там врал бы.
export { energyTrend, type EnergyTrend } from "@/lib/energySettle";

export const ENERGY_KEY = ["my-energy"] as const;

export type EnergyData = {
  energy: number;
  maxEnergy: number;
  nextRegenSec: number;
};

// Боевые экраны гейтят кнопки этим числом, поэтому опаздывать нельзя: до
// правки состояние босса обновлялось каждые 12с, рейда — каждые 20с, и общий
// кэш не должен быть медленнее. Плюс возврат в приложение (вебвью Telegram
// часто «замораживает» вкладку) сразу перечитывает баланс.
const REFETCH_MS = 15_000;

export function useEnergy() {
  return useQuery({
    queryKey: ENERGY_KEY,
    queryFn: () => getMyEnergy(),
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}
