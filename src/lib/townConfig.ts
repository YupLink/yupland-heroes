// Настройки города: жители, общие правила и товары, которыми «водится» город.
// Один файл на сервер и клиент — иначе форма админа и торговля разъедутся, и
// новый товар не открылся бы у игрока, пока не выкатим клиент.
//
// Формат кладётся в raid_town.config (jsonb). Схема терпимая: старые записи
// (норма на весь город, без правил) читаются и приводятся к новому виду.
//
// Устройство (владелец, 03.10.2026): ратуша — пульт админа; торгуют ЛАВКИ,
// привязанные к ней галочкой (04.10), по ценам и складу ратуши; чего нет в
// ратуше, в лавках города не видно. Товар ратуши город и продаёт, и покупает — всегда. У товара задаются
// только цена при норме (×1), норма в день на жителя (расход) и производство;
// норма склада = 10 дней расхода. Не хватило еды на сутки — голод.
import { isUsdt, USDT_BANNED_MSG } from "@/lib/usdtBanned";
import { z } from "zod";
import type { MarketKind, MarketPriceResource } from "./marketItem";
import { defaultTownRules, normalizeTownRules, type TownRules } from "./townRules";

export type { TownRules } from "./townRules";

/**
 * Что делает ГОРОД по этому товару. Ориентация та же, что у market side:
 *   buy  — город принимает у игрока (игрок продаёт), stock растёт;
 *   sell — город продаёт игроку, stock падает;
 *   both — обе стороны включены.
 * Не путать с operation игрока: игрок ПРОДАЁТ, когда город BUY.
 */
export type TownOp = "buy" | "sell" | "both";

/** Один товар города. id стабильный — по нему привязан склад в raid_town_stock. */
export interface TownGood {
  id: string;
  kind: MarketKind;
  /** Для resource — 'stone'/'wood'/'diamonds'/'token'/…; для прочих — id шаблона. */
  refId: string | null;
  /** Для kind='resource' && refId='token' — символ токена. Иначе null. */
  token: string | null;
  operation: TownOp;
  /** Цена при норме (×1) — средняя: вокруг неё цена шагает вверх и вниз. */
  marketPrice: number;
  /** Норма в день на жителя: сколько один житель съедает за сутки. Больше нуля — еда. */
  consumePerResident: number;
  /** Сколько город производит за сутки (пока не голодает). */
  producePerDay: number;
}

export interface TownConfig {
  /** Название города («Город Вихоток»): по нему ратушу узнают в списках и в окне. */
  name: string;
  residents: number;
  rules: TownRules;
  goods: TownGood[];
}

const MARKET_KIND_ENUM = z.enum(["resource", "pack", "hero", "art", "boss", "custom"]);
const OP_ENUM = z.enum(["buy", "sell", "both"]);

const goodSchema = z.object({
  id: z.string().min(1),
  kind: MARKET_KIND_ENUM,
  refId: z.string().nullable(),
  token: z.string().nullable(),
  operation: OP_ENUM,
  marketPrice: z.number().min(0),
  /** Старые форматы нормы (на город, на жителя, ×дней) — читаем молча, не храним. */
  normDays: z.number().min(0).nullable().optional(),
  normPerResident: z.number().min(0).optional(),
  norm: z.number().min(0).optional(),
  consumePerResident: z.number().min(0),
  producePerDay: z.number().min(0),
  // USDT товаром ратуши — живые деньги из воздуха: продал одному, купил другой (§8.49а).
}).refine((g) => !isUsdt(g.token) && !(g.kind !== "resource" && isUsdt(g.refId)), USDT_BANNED_MSG);

export const townConfigSchema = z.object({
  name: z.string().max(200).optional(),
  residents: z.number().int().min(0).default(0),
  rules: z.record(z.string(), z.unknown()).optional(),
  goods: z.array(goodSchema).default([]),
});

type RawGood = z.infer<typeof goodSchema>;

/** Золото — валюта города, а не его товар: торговать им самим с собой нельзя. */
export function isCurrencyGood(g: Pick<TownGood, "kind" | "refId">): boolean {
  return g.kind === "resource" && (g.refId ?? "gold") === "gold";
}

function normalizeGood(g: RawGood): TownGood {
  return {
    id: g.id,
    kind: g.kind,
    refId: g.refId,
    token: g.token,
    // Товар ратуши город и продаёт, и покупает — всегда (владелец, 03.10.2026).
    operation: "both",
    marketPrice: g.marketPrice,
    consumePerResident: g.consumePerResident,
    producePerDay: g.producePerDay,
  };
}

/** Сколько знаков в названии города: строка списка и шапка окна, не абзац. */
export const TOWN_NAME_MAX = 40;

/** Название как его хранить: пробелы схлопнуты, края обрезаны, длина в пределе. */
export function cleanTownName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, TOWN_NAME_MAX).trim();
}

function normalize(parsed: z.infer<typeof townConfigSchema>): TownConfig {
  return {
    name: cleanTownName(parsed.name),
    residents: parsed.residents,
    rules: normalizeTownRules(parsed.rules),
    goods: parsed.goods.map((g) => normalizeGood(g)).filter((g) => !isCurrencyGood(g)),
  };
}

/** Пустая конфигурация — стартовый снимок для только что подтянутой ратуши. */
export function emptyTownConfig(): TownConfig {
  return { name: "", residents: 0, rules: defaultTownRules(), goods: [] };
}

/** Валидация «извне» (форма админа / jsonb из базы). Кидает при мусоре. */
export function parseTownConfig(raw: unknown): TownConfig {
  return normalize(townConfigSchema.parse(raw ?? {}));
}

/** Мягкий разбор: битую jsonb молча возвращаем пустой, чтобы окно не падало. */
export function safeParseTownConfig(raw: unknown): TownConfig {
  const r = townConfigSchema.safeParse(raw ?? {});
  return r.success ? normalize(r.data) : emptyTownConfig();
}

/** Норма склада — столько дней расхода (владелец: «норма = расход в день ×10»). */
export const NORM_DAYS = 10;

/**
 * Норма города по товару: 10 дней расхода (жители × норма в день на жителя —
 * поэтому норма следует за жителями сама). Товар, который город не ест, а только
 * производит (лесопилка), — 10 дней производства: иначе норма была бы в штуку,
 * цена сразу падала бы до ×0,1, а производство упиралось бы в 20 штук.
 */
export function cityNorm(
  g: Pick<TownGood, "consumePerResident"> & Partial<Pick<TownGood, "producePerDay">>,
  residents: number,
): number {
  const perDay = dailyNeed(g, residents) || Math.max(0, g.producePerDay ?? 0);
  return Math.max(1, perDay * NORM_DAYS);
}

/** Сколько город съедает за сутки. */
export function dailyNeed(g: Pick<TownGood, "consumePerResident">, residents: number): number {
  return Math.max(0, g.consumePerResident) * Math.max(0, residents);
}

/** Товар «на содержание жителей»: его едят. Нехватка такого — голод. */
export function isUpkeep(g: Pick<TownGood, "consumePerResident">): boolean {
  return g.consumePerResident > 0;
}

/** Черновик нового товара для админ-формы. */
export function emptyTownGood(): TownGood {
  return {
    id: newGoodId(),
    kind: "resource",
    refId: "wood",
    token: null,
    operation: "both",
    marketPrice: 1,
    consumePerResident: 0.1,
    producePerDay: 0,
  };
}

/** Короткий id для нового товара. Локально уникален — этого хватает для UI. */
export function newGoodId(): string {
  return `tg_${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Ресурс/токен пары для интеграции со spend/credit в market-money. */
export function goodAsPriceResource(g: TownGood): {
  res: MarketPriceResource;
  token: string | null;
} {
  if (g.kind === "resource") {
    return {
      res: (g.refId ?? "gold") as MarketPriceResource,
      token: g.refId === "token" ? g.token : null,
    };
  }
  return { res: g.kind as MarketPriceResource, token: g.refId };
}
