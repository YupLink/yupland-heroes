// Правила города — общие на все товары ратуши. Владелец, 03.10.2026: настроек
// у города ровно две, ползунками с шагом 5 (и своё число полем):
//   наценка — от 10 до 50 %, по умолчанию 20;
//   НЗ      — от 5 до 50 % нормы, по умолчанию 10.
// Всё прочее — постоянные формулы (townPricing): ×2 на НЗ, ×1 на норме, ×0,1
// на 20 нормах, норма = 10 дней расхода, голод снимается на сутках еды.
//
// Один файл на сервер и клиент: окно лавки считает цену той же формулой, что и
// сервер списывает. Разбор терпимый: число вне пределов прижимается к краю,
// мусор — к значению по умолчанию (иначе битое поле обнулило бы весь город).

export interface TownRules {
  /** Наценка, когда город ПРОДАЁТ игроку, % к цене кривой. */
  markupPct: number;
  /** Неприкосновенный запас (НЗ): ниже этого город не продаёт, % нормы. */
  reservePct: number;
}

type Bound = { min: number; max: number; step: number; def: number };

/** Пределы ползунков. По ним же прижимает сервер — клиент обойти их не может. */
export const TOWN_RULE_BOUNDS: Record<keyof TownRules, Bound> = {
  markupPct: { min: 10, max: 50, step: 5, def: 20 },
  reservePct: { min: 5, max: 50, step: 5, def: 10 },
};

export const TOWN_RULE_KEYS = Object.keys(TOWN_RULE_BOUNDS) as Array<keyof TownRules>;

export function defaultTownRules(): TownRules {
  const out = {} as TownRules;
  for (const k of TOWN_RULE_KEYS) out[k] = TOWN_RULE_BOUNDS[k].def;
  return out;
}

/** Любое значение → число в пределах ползунка. */
export function clampRule(key: keyof TownRules, raw: unknown): number {
  const b = TOWN_RULE_BOUNDS[key];
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return b.def;
  return Math.min(b.max, Math.max(b.min, n));
}

/** Разбор правил из jsonb/формы: недостающее — по умолчанию, лишнее — к краю. */
export function normalizeTownRules(raw: unknown): TownRules {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as TownRules;
  for (const k of TOWN_RULE_KEYS)
    out[k] = k in src ? clampRule(k, src[k]) : TOWN_RULE_BOUNDS[k].def;
  return out;
}
