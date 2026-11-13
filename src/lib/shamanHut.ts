// «Хижина шаманов» (владелец, 28.10.2026): общее для сервера, окна и админки.
//
// Шаман — шаблон босса (raid_boss_template, id SHAMAN_TEMPLATE_ID, миграция
// shaman-02): HP, урон и способности админ правит в редакторе босса, как у
// любого босса. Цена — своя настройка хижины settings.shaman_config:
// { "price": { "gold": 500 } } — один ресурс и сумма; price = null — шаманов
// не продают («Скоро в продаже»), их только видно.
import { TOWN_HALL_COST_MAX } from "@/lib/townHall";

/** id шаблона босса «Шаман» (миграция shaman-02). */
export const SHAMAN_TEMPLATE_ID = "rbt_shaman";
/** Картинка шамана владельца: окно хижины, иконка в замке, шаблон босса. */
export const SHAMAN_ART = "/raid/shaman.webp";
/** Ключ строки в yuplink.settings. */
export const SHAMAN_CONFIG_KEY = "shaman_config";

/** Чем платят за шамана — ресурсы счёта (res_move); золото — по умолчанию. */
export const SHAMAN_CURRENCIES = ["gold", "diamonds", "wood", "stone"] as const;
export type ShamanCurrency = (typeof SHAMAN_CURRENCIES)[number];
export const SHAMAN_PRICE_MAX = TOWN_HALL_COST_MAX;

export type ShamanPrice = { currency: ShamanCurrency; amount: number };
export type ShamanConfig = { price: ShamanPrice | null };

const isCurrency = (v: string): v is ShamanCurrency =>
  (SHAMAN_CURRENCIES as readonly string[]).includes(v);

/**
 * Настройка из settings (строка JSON или объект). Цена — ровно один ресурс с
 * целой суммой 1…потолок; всё остальное (нет строки, битая, ноль) — не продаём.
 */
export function parseShamanConfig(raw: unknown): ShamanConfig {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  const price = v && typeof v === "object" ? (v as Record<string, unknown>).price : null;
  if (!price || typeof price !== "object" || Array.isArray(price)) return { price: null };
  const rows = Object.entries(price as Record<string, unknown>);
  if (rows.length !== 1) return { price: null };
  const [currency, n] = rows[0];
  const amount = Number(n);
  if (!isCurrency(currency) || !Number.isInteger(amount)) return { price: null };
  if (amount < 1 || amount > SHAMAN_PRICE_MAX) return { price: null };
  return { price: { currency, amount } };
}

/** Строка для settings: { price: { <ресурс>: сумма } } или { price: null }. */
export function shamanConfigJson(price: ShamanPrice | null): string {
  return JSON.stringify({ price: price ? { [price.currency]: price.amount } : null });
}
