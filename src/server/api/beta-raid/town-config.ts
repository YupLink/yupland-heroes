// Настройки ратуши: чтение (для витрины и админа) + запись (админ).
//
// Что где живёт:
//   raid_town.config     — жители + список товаров (jsonb, схема — townConfig);
//   raid_town_stock      — текущий остаток по каждому good_id (одна строка на товар).
// Форма конфига держится в @/lib/townConfig — единый источник и для клиента.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireGodAdmin } from "./island/island-editor-auth";
import { assertMarketPacksRight } from "./god-money";
import { publishRaid } from "../../raidLive";
import {
  ensureTownSchema,
  isCellTownHall,
  isTownHallTemplate,
  readCellBuildingId,
} from "./town-resolve";
import { readTownStock, seedTownStock } from "./town-stock";
import { townCurve } from "@/lib/townPricing";
import { areaOf } from "@/lib/townYield";
import {
  emptyTownConfig,
  parseTownConfig,
  safeParseTownConfig,
  townConfigSchema,
  type TownConfig,
} from "@/lib/townConfig";

/** Конфиг ратуши и отметка голода; нет строки — пустой снимок (первое открытие). */
async function readConfig(
  mapId: string,
  q: number,
  r: number,
): Promise<{ config: TownConfig; starvingSince: string | null }> {
  const rows = (await mcpExec(
    `SELECT config, starving_since FROM yuplink.raid_town
      WHERE map_id=${sqlStr(mapId)} AND q=${q} AND r=${r} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ config: unknown; starving_since: string | null }>;
  const row = rows?.[0];
  return row
    ? { config: safeParseTownConfig(row.config), starvingSince: row.starving_since ?? null }
    : { config: emptyTownConfig(), starvingSince: null };
}

export const getTownConfig = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d))
  .handler(
    async ({
      data,
    }): Promise<{
      config: TownConfig;
      stock: Record<string, number>;
      starvingSince: string | null;
      halls: { q: number; r: number };
      /** Добыча с окрестности в сутки: id товара ратуши → штук. */
      area: Record<string, number>;
      /** С какого момента запас на НЗ и ниже (особый спрос, town-rush). */
      lowSince: Record<string, string | null>;
    }> => {
      // Настройки, склад и голод — только админу: игроку ратуша показывает
      // справку (town-hall-extra), а не пульт.
      const { mapId } = await requireGodAdmin();
      await ensureTownSchema();
      const town = { mapId, q: data.q, r: data.r };
      const { townAreaYield } = await import("./town-area");
      const [read, stock, yields] = await Promise.all([
        readConfig(mapId, data.q, data.r),
        readTownStock(town),
        townAreaYield(town).catch(() => ({}) as Record<string, number>),
      ]);
      // По товарам пульта — так пульт кладёт цифру рядом с товаром.
      const area: Record<string, number> = {};
      for (const g of read.config.goods) area[g.id] = areaOf(g, yields);
      const reserves: Record<string, number> = {};
      for (const g of read.config.goods)
        reserves[g.id] = townCurve(g, read.config.residents, read.config.rules).reserve;
      const { readLowSince } = await import("./town-rush");
      const lowSince = await readLowSince(town, reserves).catch(() => ({}));
      return { ...read, stock, halls: { q: data.q, r: data.r }, area, lowSince };
    },
  );

export const setTownConfig = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        config: townConfigSchema,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const god = await requireGodAdmin();
    const mapId = god.mapId;
    // Право island_god — без денег: товары ратуши в токенах только админу.
    if (!god.money && data.config.goods.some((g) => g.refId === "token" || !!g.token)) {
      throw new Error("Токены в ратуше — только админу");
    }
    for (const g of data.config.goods) await assertMarketPacksRight(g, god.money);
    await ensureTownSchema();
    // Клетка обязана быть ратушей — по meta шаблона ИЛИ по override клетки
    // (админ через режим бога назначает effect='town_hall' прямо клетке,
    // тогда шаблон не переопределён, а роль ратуши уже у клетки).
    if (!(await isCellTownHall(mapId, data.q, data.r))) {
      throw new Error("town.not_a_hall");
    }

    // Валидируем ещё раз: zod уже прогнал форму, тут переводим в чистый TownConfig.
    const cfg = parseTownConfig(data.config);
    const jsonb = JSON.stringify(cfg);
    await mcpExec(
      `INSERT INTO yuplink.raid_town(map_id, q, r, config, created_at, updated_at)
       VALUES (${sqlStr(mapId)}, ${data.q}, ${data.r}, ${sqlStr(jsonb)}::jsonb, now(), now())
       ON CONFLICT (map_id, q, r) DO UPDATE SET config=EXCLUDED.config, updated_at=now();`,
      { wrapJson: false },
    );
    // Стартовый склад — только для НОВЫХ товаров: старые ON CONFLICT DO NOTHING
    // не трогает, иначе редактирование конфига обнуляло бы фактический запас.
    await seedTownStock({ mapId, q: data.q, r: data.r }, cfg.goods, cfg.residents);

    // Клиент должен увидеть новые товары сразу — событие клетки инвалидирует
    // town-config кэш на клиенте.
    publishRaid({ mapId, type: "built", cells: [`${data.q},${data.r}`] });
    return { ok: true as const };
  });

/** Сводка всех ратуш карты — админам, чтобы видеть, что где стоит. */
export const listTownsOnMap = createServerFn({ method: "GET" })
  .inputValidator((_d: unknown) => z.object({}).parse({}))
  .handler(async () => {
    const { mapId } = await requireGodAdmin();
    await ensureTownSchema();
    const rows = (await mcpExec(
      `SELECT q, r, config FROM yuplink.raid_town WHERE map_id=${sqlStr(mapId)};`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ q: number; r: number; config: unknown }>;
    return (rows ?? []).map((row) => {
      const cfg = safeParseTownConfig(row.config);
      const dailyConsumption: Record<string, number> = {};
      for (const g of cfg.goods) {
        const consumed = cfg.residents * g.consumePerResident;
        if (consumed > 0) dailyConsumption[g.id] = consumed;
      }
      return {
        q: Number(row.q),
        r: Number(row.r),
        name: cfg.name || `Ратуша @ ${row.q},${row.r}`,
        residents: cfg.residents,
        goodsCount: cfg.goods.length,
        dailyConsumption,
      };
    });
  });
