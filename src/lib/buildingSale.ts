// Продажа построек (владелец, 05.11.2026): «дать админу программировать, что будет
// в постройках для продажи … игрокам будет выдано только здание под размещение …
// те же настройки, что и для карты … ставить только в том мире, где даём игрокам
// строить». Общие правила сервера и клиента.
//
//  · Постройка с поведением «Продажа построек» (building_shop) — витрина лавки,
//    где товар — постройка вида `building`: ref — шаблон постройки, облик и
//    настройка (building_config: ферма, буст, табличка…) — как у постройки на карте.
//  · Товар берёт ШАБЛОН ПОСТРОЙКИ (шаг 2, «систему с шаблонами — сразу же»): админ
//    настраивает постройку на карте обычным режимом бога и сохраняет клетку в
//    шаблон — с витриной лавки, заклинаниями зачарования, обрядами.
//  · Купил — в рюкзаке стопка `building:<чертёж>`; чертёж — снимок шаблона и цены
//    на момент покупки (правка шаблона админом купленное не меняет).
//  · Поставить — только в мире строителей, в радиусе 3 от героя, на пустую сушу,
//    первым тиром (владелец: «сразу улучшенные — так нельзя»). Свою — разобрать
//    за половину цены.
import type { Lang } from "@/lib/store";

/** Вид товара лавки и приставка стопки рюкзака. */
export const BUILDING_KIND = "building" as const;

/** Поведение постройки-лавки, где продают постройки. */
export const BUILDING_SHOP_EFFECT = "building_shop" as const;

/** Дальность: своя клетка и три круга вокруг героя (как у жилы и динамита). */
export const BUILDING_PLACE_RADIUS = 3;

/**
 * Что в продажу не идёт (находки критика 05.11):
 *  · шахта — свой путь, заготовка у Архитектора (жила, лес и горы, проходы);
 *  · ратуша — заводит город и отбирает у соседних ратуш их клетки;
 *  · портал — сразу становится выходом комнаты и перехватывает прибытия;
 *  · лавка построек — игрок продавал бы постройки сам.
 * Маркет (плавильня) продаётся: витрина едет в шаблоне, установка стирает старую.
 */
export const SALE_BANNED_EFFECTS: readonly string[] = [
  "mine",
  "town_hall",
  "portal",
  "building_shop",
];

/** Разобрал свою — назад половина цены (владелец, 05.11.2026: «забрав 50 % стоимости»). */
export const DISMANTLE_REFUND_PCT = 50;

/** JSON как он есть — настройка постройки (building_config) едет клиенту без потерь. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type JsonObject = { [k: string]: JsonValue };

/** Что лежит в таблицах клетки (витрина, заклинания, обряды): таблица → строки. */
export type CellRows = { [table: string]: JsonObject[] };

/**
 * Что продаётся. Новый товар — ссылка на шаблон постройки (presetId); у товаров
 * первого шага — облик и настройка прямо в товаре (шаблон постройки — ref товара).
 */
export type BuildingGood = {
  skinId: string | null;
  config: JsonObject | null;
  presetId?: string | null;
  /** Таблицы клетки шаблона — только на покупке (снимок для чертежа), в товаре их нет. */
  cells?: CellRows | null;
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Колонка товара (jsonb) → облик и настройка; мусор — пусто. */
export function parseBuildingGood(raw: unknown): BuildingGood {
  const v = typeof raw === "string" ? safeJson(raw) : raw;
  const o = isObj(v) ? v : {};
  const skin = typeof o.skinId === "string" && o.skinId.trim() ? o.skinId.trim() : null;
  const preset = typeof o.presetId === "string" && o.presetId.trim() ? o.presetId.trim() : null;
  const good: BuildingGood = {
    skinId: skin,
    config: isObj(o.config) ? (o.config as JsonObject) : null,
  };
  if (preset) good.presetId = preset;
  return good;
}

/** Строка цены, как в lib/marketPrices: ресурс, токен/предмет, сколько. */
export type RefundLine = { resource: string; token: string | null; amount: number };

/** Что видит хозяин в окне постройки: сколько вернёт разбор и можно ли подписать. */
export type OwnOffer = { refund: RefundLine[]; sign: boolean; text: string };

/** Длина надписи хозяйской таблички. */
export const SIGN_TEXT_MAX = 500;

/** Целыми выдаются все, кроме токенов (у них дробь — как у цены). */
const WHOLE = (resource: string): boolean => resource !== "token";

/**
 * Что вернуть за разбор: половина каждой строки цены. Целые ресурсы — вниз до
 * целого (1 алмаз → 0); «любой артефакт/герой» не возвращается (непонятно, какой).
 */
export function dismantleRefund(price: readonly RefundLine[] | null | undefined): RefundLine[] {
  const out: RefundLine[] = [];
  for (const l of price ?? []) {
    if (!l || typeof l.resource !== "string" || !(Number(l.amount) > 0)) continue;
    if (typeof l.token === "string" && l.token.includes("_any_")) continue;
    const half = (Number(l.amount) * DISMANTLE_REFUND_PCT) / 100;
    const amount = WHOLE(l.resource) ? Math.floor(half) : Math.round(half * 1e6) / 1e6;
    if (amount > 0) out.push({ resource: l.resource, token: l.token ?? null, amount });
  }
  return out;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** JSON с ключами по алфавиту: одна настройка — один чертёж, как ни сложены ключи. */
export function canonJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonJson).join(",")}]`;
  if (isObj(v)) {
    const keys = Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonJson(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Ключ стопки рюкзака: building:<чертёж>. */
export const buildingStackKey = (blueprintId: string): string => `${BUILDING_KIND}:${blueprintId}`;

/** Чертёж из ключа стопки; не постройка — null. */
export function blueprintOfStack(stackKey: string | null | undefined): string | null {
  const key = typeof stackKey === "string" ? stackKey : "";
  if (!key.startsWith(`${BUILDING_KIND}:`)) return null;
  const id = key.slice(BUILDING_KIND.length + 1);
  return /^bp_[0-9a-f]{16,64}$/.test(id) ? id : null;
}

export const isBuildingStackKey = (stackKey: string | null | undefined): boolean =>
  blueprintOfStack(stackKey) !== null;

/**
 * Почему постройка не встанет — ключ словаря, в порядке проверки. Тот же порядок
 * у подсветки круга и у отказа установки (bsale-place-sql).
 */
export const BUILDING_REFUSALS = [
  "bsale.no_cell",
  "bsale.void",
  "bsale.water",
  "bsale.castle",
  "bsale.road",
  "bsale.built",
  "bsale.decor",
  "bsale.object",
  "bsale.runner",
  "bsale.chest",
  "bsale.bag",
  "bsale.vein",
  "bsale.hero",
  "bsale.spawn",
  "bsale.near_mine",
] as const;
export type BuildingRefusal = (typeof BUILDING_REFUSALS)[number];

export type BuildingFacts = Record<BuildingRefusal, boolean>;

/** Признаки → первая причина отказа; null — можно. Клетки нет — no_cell. */
export function buildingFactsReason(
  facts: Partial<BuildingFacts> | null | undefined,
): BuildingRefusal | null {
  if (!facts) return "bsale.no_cell";
  return BUILDING_REFUSALS.find((k) => facts[k] === true) ?? null;
}

/** Шестиугольное расстояние в осевых координатах. */
export function placeDist(a: { q: number; r: number }, b: { q: number; r: number }): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Причина для клетки круга окна: дальность, потом признаки клетки. */
export function buildingCellReason(o: {
  dq: number;
  dr: number;
  facts: Partial<BuildingFacts> | null;
}): string | null {
  if (placeDist({ q: 0, r: 0 }, { q: o.dq, r: o.dr }) > BUILDING_PLACE_RADIUS) return "bsale.far";
  return buildingFactsReason(o.facts);
}

/** Подпись поведения «Продажа построек» в списке поведений админа. */
export const BUILDING_SHOP_LABEL: Record<Lang, string> = {
  ru: "Продажа построек",
  en: "Building shop",
};
