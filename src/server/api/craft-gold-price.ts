// Текущая цена улучшения фишки в золоте: множитель к стандарту (lib/craftGold).
//
// Первую неделю — стандарт. Момент включения привязки к курсу — настройка
// craft_gold_dynamic_from (ISO-время; нет ключа или пусто — всегда стандарт),
// её ставит ведущий при выкате. Курс — пул банка золото/DARAI
// (yuplink.bank_pool, token_a='gold', token_b='Darai'): DARAI за 1 золото.
// Кэш 30 с: курс пула меняется с каждым обменом, а крафт зовут пачками.
import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { craftGoldDynamicOn, craftGoldMultiplier } from "@/lib/craftGold";

export const CRAFT_GOLD_DYNAMIC_KEY = "craft_gold_dynamic_from";
const TTL_MS = 30_000;

export type GoldPoolRow = {
  reserve_a: number | string;
  reserve_b: number | string;
  weight_a: number | string;
  weight_b: number | string;
};
export type CraftGoldState = { rate: number | null; dynamicFrom: string | null };

/**
 * Курс пула: DARAI за 1 золото — запасы reserve_b / reserve_a; пул пуст
 * (запаса нет) — стартовый курс по весам weight_b / weight_a. Пула нет или
 * курс не число > 0 — null (тогда цена — стандарт).
 */
export function poolGoldRate(row: GoldPoolRow | null | undefined): number | null {
  if (!row) return null;
  const ra = Number(row.reserve_a);
  const rb = Number(row.reserve_b);
  const rate = ra > 0 && rb > 0 ? rb / ra : Number(row.weight_b) / Number(row.weight_a);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

async function readState(): Promise<CraftGoldState> {
  const [setting, rows] = await Promise.all([
    pg.settings.findOne({ key: CRAFT_GOLD_DYNAMIC_KEY }),
    mcpExec(
      `SELECT reserve_a, reserve_b, weight_a, weight_b FROM yuplink.bank_pool
        WHERE token_a = 'gold' AND token_b = 'Darai' LIMIT 1;`,
      { wrapJson: true },
    ),
  ]);
  const from = String(setting?.value ?? "").trim();
  return { rate: poolGoldRate((rows as GoldPoolRow[] | null)?.[0]), dynamicFrom: from || null };
}

let cache: { at: number; state: CraftGoldState } | null = null;

/** Курс и момент включения. Сбой чтения — прошлый снимок; без него — ошибка, а не стандарт. */
export async function craftGoldState(now = Date.now()): Promise<CraftGoldState> {
  if (cache && now - cache.at < TTL_MS) return cache.state;
  try {
    const state = await readState();
    cache = { at: now, state };
    return state;
  } catch (e) {
    if (cache) return cache.state;
    throw e;
  }
}

/** Множитель цены сейчас: 1 — стандарт. */
export async function craftGoldMult(now = Date.now()): Promise<number> {
  const s = await craftGoldState(now);
  return craftGoldMultiplier(s.rate, s.dynamicFrom, now);
}

/** Для тестов: сбросить кэш. */
export function resetCraftGoldCache(): void {
  cache = null;
}

/** Для окна улучшения: множитель (цена = стандарт × он, вверх), курс, включена ли привязка. */
export const getCraftGoldPrice = createServerFn({ method: "GET" }).handler(async () => {
  const now = Date.now();
  const s = await craftGoldState(now);
  return {
    multiplier: craftGoldMultiplier(s.rate, s.dynamicFrom, now),
    rate: s.rate,
    dynamic: craftGoldDynamicOn(s.dynamicFrom, now),
  };
});
