// «Метеостанция» (владелец, 28.10.2026): здание замка. Покупается в Ратуше,
// как «Управление шахтами» (castle_building kind 'weather_station',
// townhall-buy.ts: списание до постройки одной функцией базы, повтор не
// задваивает). Есть здание — в замке иконка и окно погоды миров с шансами
// следующей смены (wstation-list.ts); только смотреть, в замке стоять не нужно.
import { createServerFn } from "@tanstack/react-start";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { accAccountId } from "@/server/api/currency/move";
import { hasCastleBuilding } from "@/server/api/castle-townhall/free-build";
import { WEATHER_STATION_KIND } from "@/lib/townHallCatalog";

/** Аккаунт игрока — тот же, на который здание куплено. */
export async function stationAccount(): Promise<string> {
  const wallet = await requireBetaRaid();
  const account = await accAccountId(wallet);
  if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");
  return account;
}

/** Построена ли станция у аккаунта. */
export async function hasWeatherStation(account: string): Promise<boolean> {
  // Купленное здание или личное право «строить бесплатно» (free-build.ts).
  return hasCastleBuilding(account, WEATHER_STATION_KIND);
}

export async function requireWeatherStation(account: string): Promise<void> {
  if (!(await hasWeatherStation(account))) throw new Error("wstation.not_built");
}

/** Есть ли станция — для иконки и облика на площади замка. */
export const getWeatherStationOwned = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ owned: boolean }> => ({
    owned: await hasWeatherStation(await stationAccount()),
  }),
);
