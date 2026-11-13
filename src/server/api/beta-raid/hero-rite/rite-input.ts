// Вход ручек зачарования героев и разбор обряда — из запроса админа и из строки
// базы (migrations/hero-rite-01.sql). Отказы — ключами словаря herorite.* и
// enchant.* (общие с лавкой артефактов: цена, доступ, оплата).
import { z } from "zod";
import {
  HERO_RITE_NEED_MAX,
  HERO_RITE_NEED_MIN,
  HERO_RITE_RARITIES,
  riteLoseOk,
  type HeroRite,
  type HeroRiteRarity,
} from "@/lib/enchant/heroRite";
import { parseCost, MAX_COSTS } from "@/server/api/beta-raid/enchant/enchant-input";
import type { EnchantCost } from "@/lib/enchant/enchant";

/** Обрядов на одной постройке — защита от опечатки. */
export const MAX_RITES = 30;

const cell = { mapId: z.string().min(1).max(80), q: z.number().int(), r: z.number().int() };
export const riteShopInput = z.object(cell);
export const riteHeroesInput = z.object({ rarity: z.enum(["rare", "epic", "legendary"]) });
export const riteSaveInput = z.object({ ...cell, rites: z.array(z.unknown()).max(MAX_RITES) });
export const riteRunInput = z.object({
  ...cell,
  riteId: z.string().min(1).max(64),
  heroIds: z.array(z.string().min(1).max(64)).min(HERO_RITE_NEED_MIN).max(HERO_RITE_NEED_MAX),
  opId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});
export type RiteRunInput = z.infer<typeof riteRunInput>;

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));

/**
 * Обряд из запроса админа. Бросает ключ первой ошибки: название, редкость,
 * сколько героев (2…10), успех 0…100, «пропадёт» 0 ≤ min ≤ max ≤ сколько,
 * цена (1…20 позиций).
 */
export function normalizeRite(raw: unknown): HeroRite {
  const o = obj(raw);
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name || name.length > 60) throw new Error("enchant.bad_name");
  const rarity = o.rarity as HeroRiteRarity;
  if (!HERO_RITE_RARITIES.includes(rarity)) throw new Error("enchant.bad_rarity");
  const need = num(o.need);
  if (!Number.isInteger(need) || need < HERO_RITE_NEED_MIN || need > HERO_RITE_NEED_MAX)
    throw new Error("herorite.bad_need");
  const success = num(o.success);
  if (!Number.isFinite(success) || success < 0 || success > 100)
    throw new Error("enchant.bad_success");
  const loseMin = num(o.loseMin);
  const loseMax = num(o.loseMax);
  if (!riteLoseOk(loseMin, loseMax, need)) throw new Error("herorite.bad_lose");
  const list = Array.isArray(o.cost) ? o.cost : [];
  const cost = list.map(parseCost);
  if (!cost.length || cost.length > MAX_COSTS || cost.some((c) => !c))
    throw new Error("enchant.bad_cost");
  return {
    id: typeof o.id === "string" ? o.id.trim().slice(0, 64) : "",
    name,
    rarity,
    need,
    success,
    loseMin,
    loseMax,
    cost: cost as EnchantCost[],
  };
}

/** Строка raid_hero_rite → обряд. Битую строку пропускаем (null). */
export function riteOfRow(row: Record<string, unknown>): HeroRite | null {
  try {
    const cost = typeof row.cost === "string" ? (JSON.parse(row.cost) as unknown) : row.cost;
    const r = normalizeRite({
      id: row.id,
      name: row.name,
      rarity: row.rarity,
      need: num(row.need),
      success: num(row.success),
      loseMin: num(row.lose_min),
      loseMax: num(row.lose_max),
      cost,
    });
    return r.id ? r : null;
  } catch {
    return null;
  }
}

/** Новый id обряда: сервер выдаёт сам (у нового с клиента id = ""). */
export const newRiteId = (): string =>
  `hrite_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
