// Вход ручек лавки зачарования и разбор заклинания — из запроса админа и из
// строки базы. Отказы — ключами словаря enchant.* (их переводит humanError).
import { z } from "zod";
import {
  ENCHANT_FX_STEPS,
  ENCHANT_RARITIES,
  enchantBoostOk,
  type EnchantCost,
  type EnchantRarity,
  type EnchantSpell,
} from "@/lib/enchant/enchant";

/** Заклинаний на одной постройке и позиций в одной цене — защита от опечатки. */
export const MAX_SPELLS = 50;
export const MAX_COSTS = 20;
const MAX_AMOUNT = 1_000_000_000;

const cell = { mapId: z.string().min(1).max(80), q: z.number().int(), r: z.number().int() };
export const shopInput = z.object(cell);
export const saveInput = z.object({ ...cell, spells: z.array(z.unknown()).max(MAX_SPELLS) });
export const enchantInput = z.object({
  ...cell,
  spellId: z.string().min(1).max(64),
  itemId: z.string().min(1).max(64),
  steps: z.number().int().min(0).max(ENCHANT_FX_STEPS),
  opId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});
export type EnchantInput = z.infer<typeof enchantInput>;

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));
const fin = (v: unknown): boolean => Number.isFinite(num(v));

/** Позиция цены: вид, код, целое количество ≥ 1. null — битая. */
export function parseCost(raw: unknown): EnchantCost | null {
  const o = obj(raw);
  const kind = o.kind;
  if (kind !== "resource" && kind !== "token" && kind !== "custom") return null;
  const code = typeof o.code === "string" ? o.code.trim() : "";
  const amount = num(o.amount);
  if (!code || code.length > 80 || !Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT)
    return null;
  return { kind, code, amount };
}

/** Пустышка цены шага, когда усиление выключено: не списывается никогда. */
const FX_OFF_COST: EnchantCost = { kind: "resource", code: "gold", amount: 1 };

/**
 * Заклинание из запроса админа. Бросает ключ первой ошибки: название, усиление
 * (целые −99…1000, min ≤ max, не ровно 0 — enchantBoostOk, та же проверка у
 * формы), успех 0…100, разрушение ≤ 100 − успех, цена
 * (1…20 позиций), шаг усиления (1…100 % и цена — если включено).
 */
export function normalizeSpell(raw: unknown): EnchantSpell {
  const o = obj(raw);
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name || name.length > 60) throw new Error("enchant.bad_name");
  const rarity = o.rarity as EnchantRarity;
  if (!ENCHANT_RARITIES.includes(rarity)) throw new Error("enchant.bad_rarity");
  const boostMin = num(o.boostMin);
  const boostMax = num(o.boostMax);
  if (!enchantBoostOk(boostMin, boostMax)) throw new Error("enchant.bad_boost");
  const success = num(o.success);
  if (!fin(success) || success < 0 || success > 100) throw new Error("enchant.bad_success");
  const destroy = o.destroy === true;
  const destroyChance = destroy ? num(o.destroyChance) : 0;
  if (!fin(destroyChance) || destroyChance < 0 || destroyChance > 100 - success)
    throw new Error("enchant.bad_destroy");
  const list = Array.isArray(o.cost) ? o.cost : [];
  const cost = list.map(parseCost);
  if (!cost.length || cost.length > MAX_COSTS || cost.some((c) => !c))
    throw new Error("enchant.bad_cost");
  const fxRaw = obj(o.fx);
  const on = fxRaw.on === true;
  const pct = num(fxRaw.pct);
  const fxCost = parseCost(fxRaw.cost);
  if (on && (!fin(pct) || pct < 1 || pct > 100 || !fxCost)) throw new Error("enchant.bad_fx");
  return {
    id: typeof o.id === "string" ? o.id.trim().slice(0, 64) : "",
    name,
    rarity,
    boostMin,
    boostMax,
    success,
    destroy,
    destroyChance,
    cost: cost as EnchantCost[],
    fx: {
      on,
      pct: fin(pct) ? Math.min(100, Math.max(0, pct)) : 0,
      cost: fxCost ?? FX_OFF_COST,
    },
  };
}

/** Строка raid_enchant_spell → заклинание. Битую строку пропускаем (null). */
export function spellOfRow(row: Record<string, unknown>): EnchantSpell | null {
  try {
    const cost = typeof row.cost === "string" ? (JSON.parse(row.cost) as unknown) : row.cost;
    const fx = typeof row.fx === "string" ? (JSON.parse(row.fx) as unknown) : row.fx;
    const s = normalizeSpell({
      id: row.id,
      name: row.name,
      rarity: row.rarity,
      boostMin: num(row.boost_min),
      boostMax: num(row.boost_max),
      success: num(row.success),
      destroy: row.destroy === true || row.destroy === "t",
      destroyChance: num(row.destroy_chance),
      cost,
      fx,
    });
    return s.id ? s : null;
  } catch {
    return null;
  }
}

/** Новый id заклинания: сервер выдаёт сам (у нового с клиента id = ""). */
export const newSpellId = (): string =>
  `ench_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
