// Черновик цен Архитектора в руках админа: строки цен (постройка, уровни 2–4,
// четыре заготовки), правка цифр и строк товаров, сборка к сохранению. Общее
// для окна Архитектора («Изменить цены») и карточки админки «Шахты».
import {
  ARCHITECT_COST_MAX,
  DEFAULT_ARCHITECT_CONFIG,
  type ArchitectConfig,
  type ArchitectCost,
  type ArchitectRes,
} from "@/lib/castleArchitect";
import {
  ARCHITECT_GOOD_QTY_MAX,
  isGoodKey,
  type ArchitectGood,
} from "@/lib/castleArchitectGoods";
import { BLUEPRINT_RESOURCES, blueprintLabel } from "@/lib/mineBlueprint";

/** Кэш настройки у админа (getArchitectAdmin). */
export const ARCHITECT_ADMIN_KEY = ["admin-architect"] as const;

export type PriceRow = {
  id: string;
  label: (ru: boolean) => string;
  cost: (c: ArchitectConfig) => ArchitectCost;
};

export const PRICE_ROWS: PriceRow[] = [
  ...DEFAULT_ARCHITECT_CONFIG.levels.map((_, i) => ({
    id: `l${i}`,
    label: (ru: boolean) =>
      i === 0
        ? ru
          ? "Постройка (ур. 1)"
          : "Build (Lv 1)"
        : ru
          ? `Ур. ${i} → ${i + 1}`
          : `Lv ${i} → ${i + 1}`,
    cost: (c: ArchitectConfig) => c.levels[i],
  })),
  ...BLUEPRINT_RESOURCES.map((k) => ({
    id: k,
    label: (ru: boolean) =>
      ru ? `Заготовка: ${blueprintLabel(k, true)}` : `${blueprintLabel(k, false)} blueprint`,
    cost: (c: ArchitectConfig) => c.blueprints[k],
  })),
];

/** Заменить цену строки rowId. */
export function patchPrice(c: ArchitectConfig, rowId: string, cost: ArchitectCost): ArchitectConfig {
  const lvl = /^l(\d)$/.exec(rowId);
  if (lvl) return { ...c, levels: c.levels.map((x, i) => (i === Number(lvl[1]) ? cost : x)) };
  return { ...c, blueprints: { ...c.blueprints, [rowId]: cost } };
}

/** Цифра из поля ввода: только цифры, пусто — 0, не выше потолка. */
export const digits = (raw: string, max: number): number =>
  Math.min(max, Number(raw.replace(/[^\d]/g, "").slice(0, 9)) || 0);

export const setRes = (cost: ArchitectCost, res: ArchitectRes, raw: string): ArchitectCost => ({
  ...cost,
  [res]: digits(raw, ARCHITECT_COST_MAX),
});

/** Новая строка товара — пока без товара (выбирается из списка). */
export const addGood = (cost: ArchitectCost): ArchitectCost => ({
  ...cost,
  goods: [...(cost.goods ?? []), { key: "", name: "", qty: 1 }],
});

export const setGood = (
  cost: ArchitectCost,
  i: number,
  patch: Partial<ArchitectGood>,
): ArchitectCost => ({
  ...cost,
  goods: (cost.goods ?? []).map((g, j) => (j === i ? { ...g, ...patch } : g)),
});

export const setGoodQty = (cost: ArchitectCost, i: number, raw: string): ArchitectCost =>
  setGood(cost, i, { qty: Math.max(1, digits(raw, ARCHITECT_GOOD_QTY_MAX)) });

export const removeGood = (cost: ArchitectCost, i: number): ArchitectCost => ({
  ...cost,
  goods: (cost.goods ?? []).filter((_, j) => j !== i),
});

/** К сохранению: строки без выбранного товара выпадают, поле goods есть всегда. */
export function toSave(c: ArchitectConfig): ArchitectConfig {
  const clean = (cost: ArchitectCost): ArchitectCost => ({
    ...cost,
    goods: (cost.goods ?? []).filter((g) => isGoodKey(g.key) && g.qty >= 1),
  });
  return {
    levels: c.levels.map(clean),
    blueprints: {
      wood: clean(c.blueprints.wood),
      stone: clean(c.blueprints.stone),
      gold: clean(c.blueprints.gold),
      diamonds: clean(c.blueprints.diamonds),
    },
  };
}
