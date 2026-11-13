// Цены Ратуши замка (ПРАВИЛА §8.64): уровни, здания, декор. Одна строка JSON в
// yuplink.settings (ключ townhall_config) — как architect_config; нет строки или
// поля — значения по умолчанию из lib/townHall и lib/townHallCatalog.
//
// Читают её окно и каждая покупка — кэш процесса на 2 с: админ сохранил — новую
// цену видят и платят сразу, в любом процессе.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { requireAdmin } from "@/server/auth";
import { TOWN_HALL_CONFIG_KEY, TOWN_HALL_COST_MAX, TOWN_HALL_MAX_LEVEL } from "@/lib/townHall";
import {
  BUILDING_MAX_COUNT,
  KIND_RE,
  parseTownHallConfig,
  type TownHallConfig,
} from "@/lib/townHallCatalog";

const TTL_MS = 2_000;
let cache: { at: number; cfg: TownHallConfig } | null = null;

/** Цены Ратуши: настройка поверх значений по умолчанию. */
export async function loadTownHallConfig(): Promise<TownHallConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cfg;
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(TOWN_HALL_CONFIG_KEY)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ value: unknown }>;
  const cfg = parseTownHallConfig(rows?.[0]?.value ?? null);
  cache = { at: Date.now(), cfg };
  return cfg;
}

/**
 * Цены уровней и декора составлены мной и ждут «да» владельца (22.10.2026: «по ратуше
 * я не увидел твоих цен — собственно я ничего не одобрял»). Пока в settings нет
 * townhall_prices_open = true — улучшение и покупка декора закрыты. Открыть — одна
 * строка в базе, без выката.
 */
export const TOWN_HALL_OPEN_KEY = "townhall_prices_open";
let openCache: { at: number; open: boolean } | null = null;

export async function townHallPricesOpen(): Promise<boolean> {
  if (openCache && Date.now() - openCache.at < TTL_MS) return openCache.open;
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(TOWN_HALL_OPEN_KEY)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ value: unknown }>;
  const v = rows?.[0]?.value;
  const open = v === true || v === "true";
  openCache = { at: Date.now(), open };
  return open;
}

/** Только для тестов: забыть кэш. */
export function dropTownHallConfigCache(): void {
  cache = null;
  openCache = null;
}

/** Админ: настройка как есть (свежая, мимо кэша). */
export const getTownHallAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<TownHallConfig> => {
    requireAdmin();
    cache = null;
    return loadTownHallConfig();
  },
);

const amount = z.number().int().min(0).max(TOWN_HALL_COST_MAX);
const cost = z.object({ wood: amount, stone: amount, gold: amount, diamonds: amount });
const kind = z.string().regex(KIND_RE);
const offer = z.object({
  cost,
  max: z.number().int().min(1).max(BUILDING_MAX_COUNT),
  needLevel: z.number().int().min(1).max(TOWN_HALL_MAX_LEVEL),
});

/** Админ: сохранить цены уровней (шаги 1→2 … 8→9), зданий и декора. */
export const saveTownHallAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        levels: z.array(cost).length(TOWN_HALL_MAX_LEVEL - 1),
        buildings: z.record(kind, offer),
        decor: z.record(kind, z.number().int().min(1).max(TOWN_HALL_COST_MAX)),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<TownHallConfig> => {
    requireAdmin();
    const cfg = parseTownHallConfig(data);
    await mcpExec(
      `INSERT INTO yuplink.settings (key, value)
       VALUES (${sqlStr(TOWN_HALL_CONFIG_KEY)}, ${sqlStr(JSON.stringify(cfg))})
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
    );
    cache = { at: Date.now(), cfg };
    return cfg;
  });
