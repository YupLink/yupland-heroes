// Настройка грядки: что растёт, сколько за час и кто вправе там работать.
//
// Поле — не шахта: захвата нет, энергия не тратится, вместо владельца на нём
// батрачат ГЕРОИ. Поэтому и конфиг свой: награда бывает не только ресурсом со
// счёта, но и товаром из справочника («пшеница»), а вместо цены захвата —
// требования к герою: редкость и уровень.
//
// Хранится в building_config клетки под ключом `field`.
import type { MarketPriceResource } from "./marketItem";

/** Что даёт поле: ресурс на счёт или товар в рюкзак. */
export type FieldReward =
  | { kind: "resource"; resource: MarketPriceResource; token: string | null }
  | { kind: "item"; itemId: string; name: string; image: string | null };

/** Как читать уровень героя: любой, диапазон, «от» или «до». */
export type FieldLevelMode = "any" | "range" | "from" | "to";

/** Редкости, которые пускают на поле. Пусто — любые. */
export type FieldRarity = "rare" | "epic" | "legendary";

export interface FieldConfig {
  reward: FieldReward;
  /** Сколько единиц в час даёт ПОЛЕ целиком — делится между работниками. */
  yield: number;
  rarities: FieldRarity[];
  levelMode: FieldLevelMode;
  /** Границы уровня. Для «от» берётся from, для «до» — to, для диапазона обе. */
  levelFrom: number;
  levelTo: number;
  /** Максимум героев-работников на поле. 0 — без ограничения. */
  maxHeroes: number;
}

/** Максимум героев из конфига: целое ≥ 0 (0 — без лимита). */
const maxHeroesOf = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const RARITIES: readonly FieldRarity[] = ["rare", "epic", "legendary"];
const MODES: readonly FieldLevelMode[] = ["any", "range", "from", "to"];

const int = (v: unknown, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function parseReward(raw: unknown): FieldReward | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (o.kind === "item") {
    const itemId = typeof o.itemId === "string" ? o.itemId.trim() : "";
    if (!itemId) return null;
    return {
      kind: "item",
      itemId,
      name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : "Товар",
      image: typeof o.image === "string" && o.image.trim() ? o.image.trim() : null,
    };
  }
  const resource = typeof o.resource === "string" ? (o.resource as MarketPriceResource) : null;
  if (!resource) return null;
  return {
    kind: "resource",
    resource,
    token: typeof o.token === "string" && o.token.trim() ? o.token.trim() : null,
  };
}

/** Разбор конфига поля. Мусор или отсутствие награды — поле не настроено. */
export function parseFieldConfig(raw: unknown): FieldConfig | null {
  const o = ((raw as { field?: unknown } | null)?.field ?? {}) as Record<string, unknown>;
  const reward = parseReward(o.reward);
  if (!reward) return null;
  const y = Number(o.yield);
  if (!Number.isFinite(y) || y <= 0) return null;
  const rarities = Array.isArray(o.rarities)
    ? (o.rarities.filter((x) => RARITIES.includes(x as FieldRarity)) as FieldRarity[])
    : [];
  const levelMode = MODES.includes(o.levelMode as FieldLevelMode)
    ? (o.levelMode as FieldLevelMode)
    : "any";
  return {
    reward,
    yield: Math.round(y * 1e4) / 1e4,
    rarities,
    levelMode,
    levelFrom: int(o.levelFrom, 1),
    levelTo: int(o.levelTo, 100),
    maxHeroes: maxHeroesOf(o.maxHeroes),
  };
}

/**
 * Черновик для формы админа: читает то же, что parseFieldConfig, но НЕ
 * отбрасывает недозаполненное. Выбрал «свой товар», а сам товар ещё не назвал —
 * форма обязана остаться на товаре, а не прыгнуть обратно на дерево.
 */
export function fieldConfigDraft(raw: unknown): FieldConfig {
  const o = ((raw as { field?: unknown } | null)?.field ?? {}) as Record<string, unknown>;
  const base = emptyFieldConfig();
  const rw = (o.reward ?? {}) as Record<string, unknown>;
  const reward: FieldReward =
    rw.kind === "item"
      ? {
          kind: "item",
          itemId: typeof rw.itemId === "string" ? rw.itemId : "",
          name: typeof rw.name === "string" && rw.name.trim() ? rw.name.trim() : "Товар",
          image: typeof rw.image === "string" && rw.image.trim() ? rw.image.trim() : null,
        }
      : {
          kind: "resource",
          resource:
            typeof rw.resource === "string"
              ? (rw.resource as FieldReward extends { resource: infer R } ? R : never)
              : base.reward.kind === "resource"
                ? base.reward.resource
                : "wood",
          token: typeof rw.token === "string" && rw.token.trim() ? rw.token.trim() : null,
        };
  const y = Number(o.yield);
  const rarities = Array.isArray(o.rarities)
    ? (o.rarities.filter((x) => RARITIES.includes(x as FieldRarity)) as FieldRarity[])
    : [];
  return {
    reward,
    yield: Number.isFinite(y) && y > 0 ? y : 0,
    rarities,
    levelMode: MODES.includes(o.levelMode as FieldLevelMode)
      ? (o.levelMode as FieldLevelMode)
      : "any",
    levelFrom: int(o.levelFrom, 1),
    levelTo: int(o.levelTo, 100),
    maxHeroes: maxHeroesOf(o.maxHeroes),
  };
}

/** Пустой конфиг для формы админа. */
export function emptyFieldConfig(): FieldConfig {
  return {
    reward: { kind: "resource", resource: "wood", token: null },
    yield: 1,
    rarities: [],
    levelMode: "any",
    levelFrom: 1,
    levelTo: 100,
    maxHeroes: 0,
  };
}

/**
 * Разбор поля уровня: пусто — любой, «10» — граница по переключателю,
 * «1-10» — диапазон (переключатель тогда не при чём).
 */
export function parseLevelInput(
  raw: string,
  dir: "from" | "to",
): { levelMode: FieldLevelMode; levelFrom: number; levelTo: number } {
  const text = String(raw ?? "").trim();
  if (!text) return { levelMode: "any", levelFrom: 1, levelTo: 100 };
  const range = /^(\d+)\s*[-\u2013\u2014]\s*(\d+)$/.exec(text);
  if (range) {
    const a = Math.max(1, Number(range[1]));
    const b = Math.max(1, Number(range[2]));
    return { levelMode: "range", levelFrom: Math.min(a, b), levelTo: Math.max(a, b) };
  }
  const one = /^(\d+)$/.exec(text);
  if (!one) return { levelMode: "any", levelFrom: 1, levelTo: 100 };
  const n = Math.max(1, Number(one[1]));
  return dir === "to"
    ? { levelMode: "to", levelFrom: 1, levelTo: n }
    : { levelMode: "from", levelFrom: n, levelTo: 100 };
}

/** Обратно в строку поля: «», «10» или «1-10». */
export function levelInputText(cfg: {
  levelMode: FieldLevelMode;
  levelFrom: number;
  levelTo: number;
}): string {
  if (cfg.levelMode === "any") return "";
  if (cfg.levelMode === "range") return `${cfg.levelFrom}-${cfg.levelTo}`;
  return String(cfg.levelMode === "to" ? cfg.levelTo : cfg.levelFrom);
}

/** Проходит ли герой по требованиям поля. */
export function heroFitsField(cfg: FieldConfig, hero: { rarity: string; level: number }): boolean {
  if (cfg.rarities.length > 0 && !cfg.rarities.includes(hero.rarity as FieldRarity)) return false;
  const lvl = Math.max(1, Math.floor(hero.level));
  if (cfg.levelMode === "from") return lvl >= cfg.levelFrom;
  if (cfg.levelMode === "to") return lvl <= cfg.levelTo;
  if (cfg.levelMode === "range") return lvl >= cfg.levelFrom && lvl <= cfg.levelTo;
  return true;
}

/**
 * Условие приёма одной строкой: «редкие и эпические герои до 20 уровня».
 * Ключи словаря собирает интерфейс — здесь только части фразы.
 */
export function fieldRequirementParts(cfg: FieldConfig): {
  rarities: FieldRarity[];
  level: { mode: FieldLevelMode; from: number; to: number };
} {
  return {
    rarities: cfg.rarities,
    level: { mode: cfg.levelMode, from: cfg.levelFrom, to: cfg.levelTo },
  };
}
