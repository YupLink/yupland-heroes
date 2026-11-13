// Архитектор замка (ПРАВИЛА §8.59.7, владелец 19.10.2026). Общие правила для
// сервера и окна; SQL (migrations/minev2-10-architect.sql) повторяет потолок
// уровня — менять вместе.
//  · 4 уровня, строится и улучшается в Ратуше замка ресурсами. Уровни открывают
//    заготовки шахт: 1 — дерево, 2 — + камень, 3 — + золото, 4 — + алмазы.
//  · Изготавливаются все четыре вида (цены золотой и алмазной утвердил
//    владелец 21.10.2026).
//  · Выбранный герой со специализацией «Строитель» делает доступные заготовки
//    без Архитектора.
//  · Цены уровней и заготовок задаёт админ (настройка architect_config, правка —
//    в окне Архитектора и в админке «Шахты»): четыре ресурса и, по желанию,
//    товары (castleArchitectGoods). Ниже — значения по умолчанию и разбор.
import { BLUEPRINT_RESOURCES, type BlueprintResource } from "@/lib/mineBlueprint";
import { parseGoods, type ArchitectGood } from "@/lib/castleArchitectGoods";

export const ARCHITECT_MAX_LEVEL = 4;
export const ARCHITECT_CONFIG_KEY = "architect_config";

export const ARCHITECT_RES = ["wood", "stone", "gold", "diamonds"] as const;
export type ArchitectRes = (typeof ARCHITECT_RES)[number];
/** Цена: четыре ресурса и товары (нет товаров — поля нет, цена как раньше). */
export type ArchitectCost = Record<ArchitectRes, number> & { goods?: ArchitectGood[] };

/** С какого уровня Архитектора делается заготовка вида. */
export const BLUEPRINT_LEVEL: Record<BlueprintResource, number> = {
  wood: 1,
  stone: 2,
  gold: 3,
  diamonds: 4,
};

/** Что изготавливается сейчас — все четыре вида (владелец, 21.10.2026). */
export const ARCHITECT_CRAFTABLE: readonly BlueprintResource[] = BLUEPRINT_RESOURCES;

export type ArchitectConfig = {
  /** Цена шага N → N+1 (индекс — текущий уровень; 0 — постройка). */
  levels: ArchitectCost[];
  /** Цена одной заготовки по виду шахты. */
  blueprints: Record<BlueprintResource, ArchitectCost>;
};

/**
 * По умолчанию (≈ в золоте по курсу лавок 19.10: 10 дерева = 1 камень = 1 золото,
 * 1 алмаз ≈ 100 золота). Постройка — дешевле банка (≈3,3k против ≈13k): открывает
 * только лесопилки; 4-й уровень (алмазные шахты) — ≈56k, порядка 3–4 недель
 * алмазной шахты. Заготовка дерева/камня ≈230 — полторы недели чистой добычи
 * в базовом режиме (148 за неделю). Золотая и алмазная — утверждены владельцем
 * 21.10.2026: 1 000 дерева + 100 камня + 300 золота + 2 алмаза и 30 000 + 3 000
 * + 15 000 + 250.
 */
export const DEFAULT_ARCHITECT_CONFIG: ArchitectConfig = {
  levels: [
    { wood: 1_000, stone: 250, gold: 2_000, diamonds: 10 },
    { wood: 2_500, stone: 600, gold: 5_000, diamonds: 25 },
    { wood: 6_000, stone: 1_500, gold: 15_000, diamonds: 60 },
    { wood: 12_000, stone: 3_000, gold: 40_000, diamonds: 120 },
  ],
  blueprints: {
    wood: { wood: 300, stone: 50, gold: 150, diamonds: 0 },
    stone: { wood: 500, stone: 30, gold: 150, diamonds: 0 },
    gold: { wood: 1_000, stone: 100, gold: 300, diamonds: 2 },
    diamonds: { wood: 30_000, stone: 3_000, gold: 15_000, diamonds: 250 },
  },
};

/** Потолок одной цифры цены — защита от опечатки в админке. */
export const ARCHITECT_COST_MAX = 100_000_000;

const amount = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= ARCHITECT_COST_MAX ? Math.floor(n) : fallback;
};

function parseCost(raw: unknown, fallback: ArchitectCost): ArchitectCost {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const res = {
    wood: amount(o.wood, fallback.wood),
    stone: amount(o.stone, fallback.stone),
    gold: amount(o.gold, fallback.gold),
    diamonds: amount(o.diamonds, fallback.diamonds),
  };
  // Поле товаров есть — оно и цена (пустое — без товаров); нет — как по умолчанию.
  const goods = "goods" in o ? parseGoods(o.goods) : (fallback.goods ?? []);
  return goods.length ? { ...res, goods } : res;
}

/**
 * Настройка из settings (строка JSON или объект). Чего нет или что не число —
 * берётся по умолчанию, по каждой цифре отдельно: битая строка не обнуляет цены.
 */
export function parseArchitectConfig(raw: unknown): ArchitectConfig {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const levels = Array.isArray(o.levels) ? o.levels : [];
  const bp = o.blueprints && typeof o.blueprints === "object" ? o.blueprints : {};
  const d = DEFAULT_ARCHITECT_CONFIG;
  return {
    levels: d.levels.map((def, i) => parseCost(levels[i], def)),
    blueprints: Object.fromEntries(
      BLUEPRINT_RESOURCES.map((k) => [
        k,
        parseCost((bp as Record<string, unknown>)[k], d.blueprints[k]),
      ]),
    ) as Record<BlueprintResource, ArchitectCost>,
  };
}

const lvl = (level: number): number =>
  Math.min(ARCHITECT_MAX_LEVEL, Math.max(0, Math.floor(Number(level) || 0)));

/** Цена следующего уровня; null — уже потолок. */
export function architectLevelCost(cfg: ArchitectConfig, level: number): ArchitectCost | null {
  const l = lvl(level);
  return l >= ARCHITECT_MAX_LEVEL ? null : (cfg.levels[l] ?? null);
}

/** Почему заготовку не сделать: «скоро» (вид ещё закрыт), «нужен уровень», null — можно. */
export type CraftProblem = "soon" | "level" | null;

export function craftProblem(
  kind: BlueprintResource,
  level: number,
  builder: boolean,
): CraftProblem {
  if (!ARCHITECT_CRAFTABLE.includes(kind)) return "soon";
  if (builder) return null;
  return lvl(level) >= BLUEPRINT_LEVEL[kind] ? null : "level";
}

/** Хватает ли ресурсов на цену (товары — goodsOk, castleArchitectGoods). */
export function canAfford(cost: ArchitectCost, have: Partial<Record<string, number>>): boolean {
  return ARCHITECT_RES.every((r) => (Number(have[r]) || 0) >= cost[r]);
}
