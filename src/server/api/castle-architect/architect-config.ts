// Цены Архитектора (ПРАВИЛА §8.59.7): уровни и заготовки шахт задаёт админ.
// Одна строка JSON в yuplink.settings (ключ architect_config) — как настройка
// рыбалки; нет строки или поля — значения по умолчанию из lib/castleArchitect.
//
// Читают её окно и каждая оплата — кэш процесса на 2 с (только пачка запросов
// подряд): админ сохранил — новую цену видят и платят сразу, в любом процессе.
// Правит админ в окне Архитектора («Изменить цены») и в админке «Шахты»: та же
// ручка. Товары цены — только из справочника своих товаров (проверка здесь,
// имя — из справочника).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { requireAdmin } from "@/server/auth";
import {
  ARCHITECT_CONFIG_KEY,
  ARCHITECT_COST_MAX,
  ARCHITECT_MAX_LEVEL,
  parseArchitectConfig,
  type ArchitectConfig,
  type ArchitectCost,
} from "@/lib/castleArchitect";
import {
  ARCHITECT_GOOD_QTY_MAX,
  ARCHITECT_GOODS_MAX,
  goodId,
  isGoodKey,
} from "@/lib/castleArchitectGoods";

const TTL_MS = 2_000;
let cache: { at: number; cfg: ArchitectConfig } | null = null;

/** Цены Архитектора: настройка поверх значений по умолчанию. */
export async function loadArchitectConfig(): Promise<ArchitectConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cfg;
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(ARCHITECT_CONFIG_KEY)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ value: unknown }>;
  const cfg = parseArchitectConfig(rows?.[0]?.value ?? null);
  cache = { at: Date.now(), cfg };
  return cfg;
}

/** Только для тестов: забыть кэш. */
export function dropArchitectConfigCache(): void {
  cache = null;
}

/** Админ: настройка как есть (свежая, мимо кэша). */
export const getArchitectAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<ArchitectConfig> => {
    requireAdmin();
    cache = null;
    return loadArchitectConfig();
  },
);

const amount = z.number().int().min(0).max(ARCHITECT_COST_MAX);
const good = z.object({
  key: z.string().refine(isGoodKey, "architect.bad_good"),
  qty: z.number().int().min(1).max(ARCHITECT_GOOD_QTY_MAX),
  name: z.string().max(200).optional(),
});
const cost = z.object({
  wood: amount,
  stone: amount,
  gold: amount,
  diamonds: amount,
  goods: z.array(good).max(ARCHITECT_GOODS_MAX).optional(),
});

/**
 * Товары цен — только существующие в справочнике; имя строки — оттуда же
 * (клиентскому не верим). Нет товара — отказ architect.bad_good.
 */
export async function nameGoods(cfg: ArchitectConfig): Promise<ArchitectConfig> {
  const prices: ArchitectCost[] = [...cfg.levels, ...Object.values(cfg.blueprints)];
  const ids = [...new Set(prices.flatMap((c) => (c.goods ?? []).map((g) => goodId(g.key))))];
  if (!ids.length) return cfg;
  const rows = (await mcpExec(
    `SELECT id, name FROM yuplink.raid_custom_item WHERE id IN (${ids.map(sqlStr).join(", ")});`,
    { wrapJson: true },
  )) as Array<{ id: string; name: string | null }>;
  const names = new Map((rows ?? []).map((r) => [String(r.id), String(r.name ?? r.id)]));
  const named = (c: ArchitectCost): ArchitectCost => {
    if (!c.goods?.length) return c;
    return {
      ...c,
      goods: c.goods.map((g) => {
        const name = names.get(goodId(g.key));
        if (name === undefined) throw new Error("architect.bad_good");
        return { ...g, name };
      }),
    };
  };
  return {
    levels: cfg.levels.map(named),
    blueprints: {
      wood: named(cfg.blueprints.wood),
      stone: named(cfg.blueprints.stone),
      gold: named(cfg.blueprints.gold),
      diamonds: named(cfg.blueprints.diamonds),
    },
  };
}

/** Админ: сохранить цены уровней (шаги 0→1 … 3→4) и заготовок. */
export const saveArchitectAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        levels: z.array(cost).length(ARCHITECT_MAX_LEVEL),
        blueprints: z.object({ wood: cost, stone: cost, gold: cost, diamonds: cost }),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<ArchitectConfig> => {
    requireAdmin();
    // Разбор складывает повторы товара в строку; поле goods есть всегда —
    // пустое снимает товары с цены.
    const withGoods = <T extends { goods?: unknown[] }>(c: T) => ({ ...c, goods: c.goods ?? [] });
    const cfg = await nameGoods(
      parseArchitectConfig({
        levels: data.levels.map(withGoods),
        blueprints: Object.fromEntries(
          Object.entries(data.blueprints).map(([k, c]) => [k, withGoods(c)]),
        ),
      }),
    );
    await mcpExec(
      `INSERT INTO yuplink.settings (key, value)
       VALUES (${sqlStr(ARCHITECT_CONFIG_KEY)}, ${sqlStr(JSON.stringify(cfg))})
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
    );
    cache = { at: Date.now(), cfg };
    return cfg;
  });
