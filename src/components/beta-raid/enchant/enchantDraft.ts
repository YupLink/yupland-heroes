// Черновик заклинания в форме админа и сборка того, что уходит в
// saveEnchantSpells. Усиление в форме — ОДНО поле «20», «50-90» или с минусом
// «-20-50» (правило диапазонов); в заклинание ложится парой boostMin / boostMax.
import {
  enchantBoostOk,
  enchantOdds,
  type EnchantCost,
  type EnchantCostOption,
  type EnchantSpell,
  type EnchantSpellView,
} from "@/lib/enchant/enchant";

export type EnchantDraft = Omit<EnchantSpell, "boostMin" | "boostMax"> & { boost: string };

/**
 * «20» → [20, 20]; «50-90» → [50, 90]; «-20-50» → [−20, 50]; «-50--20» →
 * [−50, −20]; «-10» → [−10, −10]. Мусор, ровно 0, «90-50», ниже −99 → null.
 * Границы — enchantBoostOk, та же проверка у сервера.
 */
export function parseBoost(s: string): [number, number] | null {
  const m = s
    .trim()
    .replace(/−/g, "-")
    .match(/^(-?\d{1,4})(?:\s*-\s*(-?\d{1,4}))?$/);
  if (!m) return null;
  const lo = Number(m[1]) || 0;
  const hi = m[2] === undefined ? lo : Number(m[2]) || 0;
  return enchantBoostOk(lo, hi) ? [lo, hi] : null;
}

const boostField = (lo: number, hi: number): string => (lo === hi ? String(lo) : `${lo}-${hi}`);
const bare = (c: EnchantCost): EnchantCost => ({ kind: c.kind, code: c.code, amount: c.amount });

/** Заклинание с сервера → черновик формы (без имён, картинок и запаса). */
export function toDraft(s: EnchantSpellView): EnchantDraft {
  return {
    id: s.id,
    name: s.name,
    rarity: s.rarity,
    boost: boostField(s.boostMin, s.boostMax),
    success: s.success,
    destroy: s.destroy,
    destroyChance: s.destroyChance,
    cost: s.cost.map(bare),
    fx: { on: s.fx.on, pct: s.fx.pct, cost: bare(s.fx.cost) },
  };
}

/** Первая позиция цены по умолчанию — золото, как в прототипе; нет — первое из списка. */
function defaultCost(options: EnchantCostOption[], amount: number): EnchantCost {
  const o = options.find((x) => x.kind === "resource" && x.code === "gold") ?? options[0] ?? null;
  return { kind: o?.kind ?? "resource", code: o?.code ?? "", amount };
}

/** Новое заклинание по «+» — значения прототипа v3; id пустой, выдаст сервер. */
export function newDraft(name: string, options: EnchantCostOption[]): EnchantDraft {
  return {
    id: "",
    name,
    rarity: "common",
    boost: "20",
    success: 80,
    destroy: false,
    destroyChance: 0,
    cost: [defaultCost(options, 100)],
    fx: { on: false, pct: 10, cost: defaultCost(options, 10) },
  };
}

/** Новая позиция цены: первая ещё не взятая из списка. */
export function nextCost(used: EnchantCost[], options: EnchantCostOption[]): EnchantCost {
  const taken = new Set(used.map((c) => `${c.kind}:${c.code}`));
  const o = options.find((x) => !taken.has(`${x.kind}:${x.code}`)) ?? options[0] ?? null;
  return { kind: o?.kind ?? "resource", code: o?.code ?? "", amount: 10 };
}

const costOk = (c: EnchantCost): boolean => !!c.code && Number.isInteger(c.amount) && c.amount >= 1;

/** Черновик → заклинание для сервера; null — в форме ошибка (кнопка серая). */
export function fromDraft(d: EnchantDraft): EnchantSpell | null {
  const boost = parseBoost(d.boost);
  const name = d.name.trim();
  const success = Math.round(d.success);
  if (!boost || !name || success < 0 || success > 100) return null;
  if (d.cost.length === 0 || !d.cost.every(costOk)) return null;
  if (d.fx.on && (!costOk(d.fx.cost) || !(d.fx.pct >= 1 && d.fx.pct <= 100))) return null;
  return {
    id: d.id,
    name,
    rarity: d.rarity,
    boostMin: boost[0],
    boostMax: boost[1],
    success,
    destroy: d.destroy,
    destroyChance: d.destroy ? Math.min(Math.round(d.destroyChance), 100 - success) : 0,
    cost: d.cost.map(bare),
    fx: { on: d.fx.on, pct: d.fx.pct, cost: bare(d.fx.cost) },
  };
}

/** Весь список на сохранение; хоть одно с ошибкой — null. Пустой список — можно. */
export function savePayload(drafts: EnchantDraft[]): EnchantSpell[] | null {
  const out: EnchantSpell[] = [];
  for (const d of drafts) {
    const s = fromDraft(d);
    if (!s) return null;
    out.push(s);
  }
  return out;
}

/** Шансы черновика для полоски (усиление на них не влияет). */
export const draftOdds = (d: EnchantDraft) => enchantOdds({ ...d, boostMin: 0, boostMax: 0 }, 0);

/** Сколько вариантов цены показывать за раз: каталог товаров лавок большой. */
const SHOWN = 60;

/** Поиск позиции цены по имени (без регистра); пусто — весь список. */
export function filterOptions(options: EnchantCostOption[], q: string): EnchantCostOption[] {
  const s = q.trim().toLowerCase();
  const hit = s ? options.filter((o) => o.name.toLowerCase().includes(s)) : options;
  return hit.slice(0, SHOWN);
}
