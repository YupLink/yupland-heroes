// Множитель хода героя и судна на карте (shipRules.MoveMult): остров новичка ×0,1
// (island/energy) и погода карты (владелец, 26.10.2026) — ход героя × коэффициент
// «ход героя», посадка и гребок × «ход корабля», последним, после скорости и
// замедления (shipRules.stepEnergyCost). Коэффициенты — mapWeatherCoefs: кэш процесса
// до конца слота, шаг в базу не ходит; влияние выключено, остров, нет погоды — 1, и
// цена прежняя до цифры. Клиент считает тем же (useMoveMult ← getRaidWeather).
import { energyMultOf } from "@/lib/raid/island/energy";
import { moveMultOf, type MoveMult } from "@/lib/shipRules";
import { mapWeatherCoefs } from "@/server/api/beta-raid/weather/weather-read";

/** Множитель хода на карте сейчас. */
export async function stepMultOf(mapId: string): Promise<MoveMult> {
  return moveMultOf(energyMultOf(mapId), await mapWeatherCoefs(mapId));
}
