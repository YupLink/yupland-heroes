// Магазин на клетке целиком: кто в нём вообще может торговать. Фильтр общий на
// обе витрины (покупку и скупку) и на все товары — поэтому живёт отдельной
// таблицей raid_market_shop, а не полем товара.
//
// Вынесено из market-admin.ts (лимит ≤250) вместе с проверкой героя, которая
// раньше лежала копией в market-buy и market-sell.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { getCurrentWallet, isAdminWallet } from "../../auth";
import { activeBetaMapId, myMapId } from "./encounter-where";
import { godMapId } from "./god-map";
import { selectedHero } from "./hero-current";

export type MarketShop = { races: string[]; specs: string[] };

/** Фильтр торгующих на клетке (пусто — торгуют все). */
export async function marketShopFor(mapId: string, q: number, r: number): Promise<MarketShop> {
  const rows = (await mcpExec(
    `SELECT buyer_races, buyer_specs FROM yuplink.raid_market_shop
      WHERE map_id=${sqlStr(mapId)} AND q=${q} AND r=${r} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ buyer_races: unknown; buyer_specs: unknown }>;
  const row = rows?.[0];
  return {
    races: Array.isArray(row?.buyer_races) ? row!.buyer_races.map(String) : [],
    specs: Array.isArray(row?.buyer_specs) ? row!.buyer_specs.map(String) : [],
  };
}

/**
 * Пустить ли игрока к сделке: фильтр ОБЩИЙ на магазин, смотрим ВЫБРАННОГО
 * героя. Фильтра нет — пускаем молча.
 */
export async function assertShopAllowed(
  wallet: string,
  mapId: string,
  q: number,
  r: number,
): Promise<void> {
  const shop = await marketShopFor(mapId, q, r).catch(() => ({
    races: [] as string[],
    specs: [] as string[],
  }));
  if (!shop.races.length && !shop.specs.length) return;
  const hero = await selectedHero(wallet).catch(() => null);
  if (!hero || !hero.race) throw new Error("market.need_hero");
  const raceOk = shop.races.length === 0 || shop.races.includes(hero.race);
  // Универсальная спека (common без spec) проходит любые спек-фильтры.
  const universalSpec =
    hero.spec == null || /^(универс|universal|все|any)/i.test(String(hero.spec).trim());
  const specOk =
    shop.specs.length === 0 ||
    universalSpec ||
    (hero.spec != null && shop.specs.includes(hero.spec));
  if (!raceOk || !specOk) throw new Error("market.locked_hero");
}

export const getMarketShop = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d))
  .handler(async ({ data }): Promise<MarketShop> => {
    // Карта ИГРОКА (мультикарта): лавку читаем на его карте. Нет кошелька —
    // активная (фоллбэк). setMarketShop ниже — админский, на этаже админа.
    const w = getCurrentWallet();
    const mapId = w ? await myMapId(w) : await activeBetaMapId();
    return marketShopFor(mapId, data.q, data.r);
  });

export const setMarketShop = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        races: z.array(z.string()).default([]),
        specs: z.array(z.string()).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const w = getCurrentWallet();
    if (!w || !isAdminWallet(w)) throw new Error("Маркет настраивает только админ");
    const mapId = await godMapId();
    const races = JSON.stringify(data.races ?? []);
    const specs = JSON.stringify(data.specs ?? []);
    await mcpExec(
      `INSERT INTO yuplink.raid_market_shop(map_id,q,r,buyer_races,buyer_specs,updated_at)
       VALUES (${sqlStr(mapId)}, ${data.q}, ${data.r}, ${sqlStr(races)}::jsonb, ${sqlStr(specs)}::jsonb, now())
       ON CONFLICT (map_id,q,r) DO UPDATE SET
         buyer_races=EXCLUDED.buyer_races, buyer_specs=EXCLUDED.buyer_specs, updated_at=now();`,
    );
    return { ok: true as const };
  });
