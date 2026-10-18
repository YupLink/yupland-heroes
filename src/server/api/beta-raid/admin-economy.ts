// Админ-панель «$ Экономика»: сводка по товарам, игрокам, ратушам и ценам.
// Только для владельца (requireAdmin). Кэш 30 секунд — панель открывают
// часто, дёргать базу ежесекундно смысла нет.
//
// Аггрегация разложена по модулям (правило ≤250 строк):
//   goods    — товарная таблица, места, «есть сейчас», продажи;
//   players  — балансы игроков по всем валютам/ресурсам/кастомам;
//   towns    — ратуши, потребление, производство, запасы;
//   prices   — цены маркетов для выпадающего «Дёшево / Дорого».
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "../../auth";
import { activeBetaMapId } from "./encounter-where";
import type { EconomyOverview, EconomyPeriod, PriceExtreme } from "./admin-economy-types";
import { buildGoods } from "./admin-economy-goods";
import { buildPlayers } from "./admin-economy-players";
import { buildTowns } from "./admin-economy-towns";
import { buildPrices } from "./admin-economy-prices";
import {
  fetchCurrencyIcons,
  labelForCurrency,
  sortCurrencyKeys,
} from "./admin-economy-currency-icons";

type CacheEntry = { data: EconomyOverview; at: number; extremes: Record<string, PriceExtreme[]> };

async function enrichCurrencies(
  keys: string[],
): Promise<Array<{ key: string; label: string; image: string | null }>> {
  const icons = await fetchCurrencyIcons(keys);
  // Порядок валют «деньги слева, товары справа» задаётся здесь: клиент
  // ничего не переставляет, поэтому пикер столбцов и таблица показывают
  // список в одном и том же порядке.
  const ordered = sortCurrencyKeys(keys);
  return ordered.map((k) => ({
    key: k,
    label: labelForCurrency(k),
    image: icons.get(k) ?? null,
  }));
}

const CACHE_MS = 30_000;
const cache = new Map<string, CacheEntry>();

// ➤ Форма ответа с ценами: extremes уходят по требованию (get-item-prices),
//    основной запрос сводки их не тащит — иначе payload на большой карте
//    раздувается за счёт витрин, которые в первых трёх вкладках не нужны.

const inputSchema = z.object({
  period: z.enum(["24h", "7d", "30d"]).default("7d"),
});

export const getEconomyOverview = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => inputSchema.parse(d ?? {}))
  .handler(async ({ data }): Promise<EconomyOverview> => {
    requireAdmin();
    const mapId = await activeBetaMapId();
    const key = `${mapId}:${data.period}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_MS) return hit.data;

    const period = data.period as EconomyPeriod;
    const [goods, players, towns, prices] = await Promise.all([
      buildGoods(mapId, period),
      buildPlayers(),
      buildTowns(mapId),
      buildPrices(mapId),
    ]);

    const overview: EconomyOverview = {
      period,
      updatedAt: new Date(now).toISOString(),
      goods,
      players: players.players,
      currencies: await enrichCurrencies(players.currencies),
      towns,
      priceGoods: prices.goods,
    };

    cache.set(key, { data: overview, at: now, extremes: prices.extremes });
    return overview;
  });

/**
 * Витрины по одному товару — для вкладки «Дёшево / Дорого». Отдаётся тем же
 * кэшем, что и сводка: если он ещё жив, второй запрос идёт без базы.
 */
export const getEconomyPrices = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        period: z.enum(["24h", "7d", "30d"]).default("7d"),
        goodKey: z.string().min(1),
      })
      .parse(d),
  )
  .handler(
    async ({ data }): Promise<{ goodKey: string; extremes: PriceExtreme[] }> => {
      requireAdmin();
      const mapId = await activeBetaMapId();
      const key = `${mapId}:${data.period}`;
      let hit = cache.get(key);
      if (!hit || Date.now() - hit.at >= CACHE_MS) {
        // Свежий сводный запрос заодно прогреет весь кэш: если админ спросил
        // цены раньше сводки, готовим и её (страница обычно открывается
        // именно так — сначала сводка, потом клик по товару).
        const period = data.period as EconomyPeriod;
        const [goods, players, towns, prices] = await Promise.all([
          buildGoods(mapId, period),
          buildPlayers(),
          buildTowns(mapId),
          buildPrices(mapId),
        ]);
        const overview: EconomyOverview = {
          period,
          updatedAt: new Date().toISOString(),
          goods,
          players: players.players,
          currencies: await enrichCurrencies(players.currencies),
          towns,
          priceGoods: prices.goods,
        };
        hit = { data: overview, at: Date.now(), extremes: prices.extremes };
        cache.set(key, hit);
      }
      return { goodKey: data.goodKey, extremes: hit.extremes[data.goodKey] ?? [] };
    },
  );
