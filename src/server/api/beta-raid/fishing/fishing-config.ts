// Настройка «Рыбалка» (ПРАВИЛА §8.35): интервал между попытками (минуты, по
// умолчанию 1), шанс рыбы на попытку (%, по умолчанию 10) и улов — свои товары
// со СВОИМИ долями: шанс поимки делится между видами рыбы, сумма ровно 100 %
// (владелец, 06.10.2026). Доли нормализует сервер — что бы ни прислала форма,
// в настройке лежит сотня. Одна
// строка JSON в yuplink.settings (ключ fishing_config) — как цены смены героя
// в таверне и имена сетей порталов: настройка мира, одна на всю игру.
//
// Её читает каждая поимка — кэш процесса на полминуты; админ сохранил — кэш
// этого процесса сразу свежий, соседние процессы доживают свои 30 с.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { requireAdmin } from "@/server/auth";
import {
  FISH_CHANCE_MAX,
  FISH_CHANCE_MIN,
  FISH_INTERVAL_MAX,
  FISH_INTERVAL_MIN,
  FISH_ITEMS_MAX,
  parseFishingConfig,
  type FishingConfig,
} from "@/lib/raid/fishing";
import { normalizeFish, type FishItem } from "@/lib/raid/fishChances";

export const FISHING_KEY = "fishing_config";

const TTL_MS = 30_000;
let cache: { at: number; cfg: FishingConfig } | null = null;

/** Настройка рыбалки; строки нет — по умолчанию (1 минута, 10 %, улова нет). */
export async function loadFishingConfig(): Promise<FishingConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cfg;
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(FISHING_KEY)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ value: unknown }>;
  const cfg = parseFishingConfig(rows?.[0]?.value ?? null);
  cache = { at: Date.now(), cfg };
  return cfg;
}

/** Только для тестов: забыть кэш. */
export function dropFishingConfigCache(): void {
  cache = null;
}

/** Админ: настройка как есть (свежая, мимо кэша). */
export const getFishingAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<FishingConfig> => {
    requireAdmin();
    cache = null;
    return loadFishingConfig();
  },
);

const ID_RE = /^cst_[A-Za-z0-9_-]{1,40}$/;

/**
 * Админ: сохранить интервал, шанс и улов. Улов — только товары справочника: удалённый
 * или выдуманный id — отказ с его именем, а не тихая дыра в улове.
 */
export const saveFishingAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        intervalMin: z.number().int().min(FISH_INTERVAL_MIN).max(FISH_INTERVAL_MAX),
        chancePct: z.number().int().min(FISH_CHANCE_MIN).max(FISH_CHANCE_MAX),
        // Доли приходят как есть — сумму приводит к 100 % normalizeFish.
        items: z
          .array(
            z.union([
              z.string().regex(ID_RE),
              z.object({ id: z.string().regex(ID_RE), pct: z.number().min(0).max(100) }),
            ]),
          )
          .max(FISH_ITEMS_MAX),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<FishingConfig> => {
    requireAdmin();
    const raw: FishItem[] = data.items.map((x) =>
      typeof x === "string" ? { id: x, pct: 0 } : { id: x.id, pct: x.pct },
    );
    const items = normalizeFish(raw.filter((it, i) => raw.findIndex((o) => o.id === it.id) === i));
    if (items.length > 0) {
      const ids = items.map((it) => it.id);
      const rows = (await mcpExec(
        `SELECT id FROM yuplink.raid_custom_item WHERE id IN (${ids.map(sqlStr).join(", ")});`,
        { wrapJson: true },
      )) as Array<{ id: string }>;
      const have = new Set((rows ?? []).map((r) => String(r.id)));
      const miss = ids.filter((id) => !have.has(id));
      if (miss.length > 0) throw new Error(`Нет такого товара: ${miss.join(", ")}`);
    }
    const cfg: FishingConfig = { intervalMin: data.intervalMin, chancePct: data.chancePct, items };
    await mcpExec(
      `INSERT INTO yuplink.settings (key, value)
       VALUES (${sqlStr(FISHING_KEY)}, ${sqlStr(JSON.stringify(cfg))})
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
    );
    cache = { at: Date.now(), cfg };
    return cfg;
  });
