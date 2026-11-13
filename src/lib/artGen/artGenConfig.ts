// Постройка «ГЕНЕРАТОР АРТЕФАКТОВ» (владелец, 08.11.2026; ПРАВИЛА §8.122):
// игрок заказывает артефакт — редкость и слова, — платит цену ЭТОЙ редкости;
// готовый арт массовый (может выпасть другим), за отдельную цену его можно
// сделать уникальным, пока его копия никому не выпала.
//
// Настройка — как у «Забвения»: building_config.artGen клетки, а нет своей —
// meta.artGen шаблона. Цены — строки «ресурс + сколько» (PortalPrice, берутся
// все разом). Нет цены редкости — эту редкость не заказать; нет цены
// уникальности — сделать уникальным нельзя.
import type { PortalPrice } from "../portal";
import { CRAFT_RARITIES, type CraftRarity } from "../craft/craftTable";

export const ART_GEN_EFFECT = "art_gen" as const;

export type ArtGenPrices = Record<CraftRarity, PortalPrice[]>;

export type ArtGenConfig = {
  /** Цена заказа по редкости. */
  prices: ArtGenPrices;
  /** Цена «Сделать уникальным». */
  unique: PortalPrice[];
};

/** Что окно постройки узнаёт о генераторе (сервер → окно). */
export type ArtGenExtra = {
  kind: "art_gen";
  prices: ArtGenPrices;
  unique: PortalPrice[];
  can: boolean;
  reasonKey: string | null;
};

/**
 * Чем можно платить: ресурсы счёта, билеты (золотом), лайки, энергия, токены.
 * Товара рюкзака нет нарочно: цена возвращается, когда заказ не вышел, — часто
 * через часы и в другом процессе, и вернуть вид товара в опустевшую ячейку
 * нечем (снимок оплаты живёт в памяти процесса, resource-refund).
 */
export const ART_GEN_RESOURCES = [
  "gold",
  "stone",
  "wood",
  "diamonds",
  "likes",
  "tickets",
  "energy",
  "token",
] as const;
const RES = new Set<string>(ART_GEN_RESOURCES);

const pricesOf = (raw: unknown): PortalPrice[] =>
  Array.isArray(raw)
    ? (raw as PortalPrice[]).filter((p) => p && typeof p === "object").map((p) => ({ ...p }))
    : [];

const paid = (list: PortalPrice[]): PortalPrice[] =>
  list.filter((p) => (Number(p.amount) || 0) > 0 && RES.has(String(p.resource)));

const section = (raw: unknown): Record<string, unknown> | null => {
  const s = (raw as { artGen?: unknown } | null)?.artGen;
  return s && typeof s === "object" ? (s as Record<string, unknown>) : null;
};

const emptyPrices = (): ArtGenPrices =>
  Object.fromEntries(CRAFT_RARITIES.map((r) => [r, []])) as unknown as ArtGenPrices;

function read(o: Record<string, unknown> | null, keep: (l: PortalPrice[]) => PortalPrice[]) {
  const prices = emptyPrices();
  const raw = (o?.prices ?? {}) as Record<string, unknown>;
  for (const r of CRAFT_RARITIES) prices[r] = keep(pricesOf(raw[r]));
  return { prices, unique: keep(pricesOf(o?.unique)) };
}

/** Настройка как есть — для формы админа: пустые строки цены не выбрасываем. */
export const artGenConfigDraft = (cellConfig: unknown): ArtGenConfig =>
  read(section(cellConfig), (l) => l);

/** Рабочая настройка ЭТОЙ клетки, а нет своей — шаблона; строки без суммы отброшены. */
export const artGenConfigOf = (cellConfig: unknown, meta: unknown): ArtGenConfig =>
  read(section(cellConfig) ?? section(meta), paid);

/** Есть ли что заказать: хоть одна редкость с ценой. */
export const artGenOpen = (cfg: ArtGenConfig): boolean =>
  CRAFT_RARITIES.some((r) => cfg.prices[r].length > 0);
