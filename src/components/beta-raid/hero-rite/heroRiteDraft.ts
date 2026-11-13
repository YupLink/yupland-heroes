// Черновик обряда в форме админа и сборка того, что уходит в saveHeroRites.
// «Пропадёт при неудаче» — ОДНО поле «1» / «1-2» (правило диапазонов); в обряд
// ложится парой loseMin / loseMax.
import {
  parseLose,
  loseText,
  riteOdds,
  type HeroRite,
  type HeroRiteView,
} from "@/lib/enchant/heroRite";
import type { EnchantCost, EnchantCostOption } from "@/lib/enchant/enchant";
import { nextCost } from "@/components/beta-raid/enchant/enchantDraft";

export type RiteDraft = Omit<HeroRite, "loseMin" | "loseMax"> & { lose: string };

const bare = (c: EnchantCost): EnchantCost => ({ kind: c.kind, code: c.code, amount: c.amount });

/** Обряд с сервера → черновик формы (без имён, картинок и запаса). */
export function toRiteDraft(s: HeroRiteView): RiteDraft {
  return {
    id: s.id,
    name: s.name,
    rarity: s.rarity,
    need: s.need,
    success: s.success,
    lose: loseText(s.loseMin, s.loseMax, "-"),
    cost: s.cost.map(bare),
  };
}

/** Новый обряд по «+»: значения формы до правки админа; id пустой, выдаст сервер. */
export function newRiteDraft(name: string, options: EnchantCostOption[]): RiteDraft {
  return {
    id: "",
    name,
    rarity: "rare",
    need: 3,
    success: 50,
    lose: "1",
    cost: [{ ...nextCost([], options), amount: 100 }],
  };
}

const costOk = (c: EnchantCost): boolean => !!c.code && Number.isInteger(c.amount) && c.amount >= 1;

/** Черновик → обряд для сервера; null — в форме ошибка (кнопка серая). */
export function fromRiteDraft(d: RiteDraft): HeroRite | null {
  const lose = parseLose(d.lose, d.need);
  const name = d.name.trim();
  const success = Math.round(d.success);
  if (!lose || !name || success < 0 || success > 100) return null;
  if (d.cost.length === 0 || !d.cost.every(costOk)) return null;
  return {
    id: d.id,
    name,
    rarity: d.rarity,
    need: d.need,
    success,
    loseMin: lose[0],
    loseMax: lose[1],
    cost: d.cost.map(bare),
  };
}

/** Весь список на сохранение; хоть один с ошибкой — null. Пустой список — можно. */
export function riteSavePayload(drafts: RiteDraft[]): HeroRite[] | null {
  const out: HeroRite[] = [];
  for (const d of drafts) {
    const s = fromRiteDraft(d);
    if (!s) return null;
    out.push(s);
  }
  return out;
}

/** Шансы черновика для полоски; «пропадёт» с ошибкой — как «никто». */
export const riteDraftOdds = (d: RiteDraft) =>
  riteOdds({ success: d.success, loseMax: parseLose(d.lose, d.need)?.[1] ?? 0 });
