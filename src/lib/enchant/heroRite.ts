// Зачарование героев (владелец, 29.10.2026: «то же, что зачаровальня для
// артов, но для героев … задавать необходимое к-во … уровень героям не
// передаётся — просто будет новый герой»). Правила обряда одним чистым модулем —
// его читают окно постройки и сервер; бросок делает только сервер.
//
// Обряд: N своих героев одной редкости → с шансом успеха один НОВЫЙ герой
// следующей редкости (случайный шаблон этого яруса, как свежий — уровень 0).
// Успех — уходят все N. Неудача — пропадает от loseMin до loseMax из них
// (случайно, какие — тоже случайно), остальные возвращаются. Числа — у админа.
//
// Легендарный → уникальный (владелец, 29.10.2026: «уник = лег+ — тот же герой,
// но с большим пределом уровней»): при успехе уником становится герой из ПЕРВОЙ
// ячейки — тот же, с уровнем и прокачкой; остальные уходят. Уже уникальных в
// обряд не кладут.
import type { EnchantCost, EnchantCostView } from "./enchant";

export type HeroRiteRarity = "rare" | "epic" | "legendary";
export type HeroRiteTarget = "epic" | "legendary" | "unique";
export const HERO_RITE_RARITIES: readonly HeroRiteRarity[] = ["rare", "epic", "legendary"];
export const HERO_RITE_NEXT: Record<HeroRiteRarity, HeroRiteTarget> = {
  rare: "epic",
  epic: "legendary",
  legendary: "unique",
};

/** Обряд, где первый герой сам становится уником (а не выходит новый). */
export const riteKeepsFirst = (rarity: HeroRiteRarity): boolean =>
  HERO_RITE_NEXT[rarity] === "unique";

/** Сколько героев кладут в обряд: от 2 до 10 — выбор из списка у админа. */
export const HERO_RITE_NEED_MIN = 2;
export const HERO_RITE_NEED_MAX = 10;
export const HERO_RITE_NEEDS: readonly number[] = Array.from(
  { length: HERO_RITE_NEED_MAX - HERO_RITE_NEED_MIN + 1 },
  (_, i) => HERO_RITE_NEED_MIN + i,
);

export type HeroRite = {
  id: string;
  name: string;
  /** Редкость героев, которых кладут; выйдет — следующая (HERO_RITE_NEXT). */
  rarity: HeroRiteRarity;
  need: number;
  success: number; // 0..100
  /** Сколько из положенных пропадёт при неудаче: случайно от min до max. */
  loseMin: number;
  loseMax: number;
  cost: EnchantCost[]; // ≥ 1
};

export type HeroRiteView = Omit<HeroRite, "cost"> & { cost: EnchantCostView[] };

/** Свой герой в окне обряда (копия: у копий одного шаблона разные уровни). */
export type RiteHero = {
  itemId: string;
  templateId: string;
  name: string;
  imageUrl: string | null;
  rarity: string;
  level: number;
};

export type HeroRiteOutcome = "ok" | "none" | "gone";
export type HeroRiteResult = {
  outcome: HeroRiteOutcome;
  /** Новый герой — только при успехе. */
  hero?: Omit<RiteHero, "level">;
  /** Ушедшие герои: при успехе — все положенные, при неудаче — пропавшие. */
  lost: Array<Pick<RiteHero, "itemId" | "name" | "imageUrl">>;
};

const isInt = (v: number) => Number.isInteger(v);

/** «Пропадёт при неудаче» годится: целые, 0 ≤ min ≤ max ≤ need. */
export function riteLoseOk(min: number, max: number, need: number): boolean {
  return isInt(min) && isInt(max) && min >= 0 && min <= max && max <= need;
}

/** Одно поле «1-2» / «1» / «0» (правило диапазонов) → пара; мусор и > need → null. */
export function parseLose(s: string, need: number): [number, number] | null {
  const m = s.trim().match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = m[2] === undefined ? lo : Number(m[2]);
  return riteLoseOk(lo, hi, need) ? [lo, hi] : null;
}

/** Пара → текст поля и подписи: «1», «1–2». */
export const loseText = (min: number, max: number, dash = "–"): string =>
  min === max ? String(min) : `${min}${dash}${max}`;

/** Шансы для полоски: неудача красная, только если при ней кто-то может пропасть. */
export function riteOdds(r: Pick<HeroRite, "success" | "loseMax">): {
  success: number;
  none: number;
  destroy: number;
} {
  const success = Math.min(100, Math.max(0, Number(r.success) || 0));
  const fail = 100 - success;
  return r.loseMax > 0 ? { success, none: 0, destroy: fail } : { success, none: fail, destroy: 0 };
}

/** Целое в [min, max) — secureRandomInt на сервере, подмена в тестах. */
export type Rnd = (min: number, max: number) => number;

const SCALE = 1_000_000;

/**
 * Бросок обряда: успех — все уходят; неудача — сколько пропадёт (loseMin…loseMax)
 * и какие именно из положенных (индексы). Повторов индексов нет.
 */
export function rollRite(
  r: Pick<HeroRite, "success" | "loseMin" | "loseMax">,
  count: number,
  rnd: Rnd,
): { ok: boolean; lost: number[] } {
  const all = Array.from({ length: count }, (_, i) => i);
  if ((rnd(0, SCALE) * 100) / SCALE < Math.min(100, Math.max(0, r.success)))
    return { ok: true, lost: all };
  const lo = Math.min(Math.max(0, r.loseMin), count);
  const hi = Math.min(Math.max(lo, r.loseMax), count);
  const k = rnd(lo, hi + 1);
  // Частичная перетасовка Фишера — Йейтса: первые k — пропавшие.
  for (let i = 0; i < k; i += 1) {
    const j = rnd(i, count);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return { ok: false, lost: all.slice(0, k).sort((a, b) => a - b) };
}
