// Ачивка для экрана: редкость, сколько до следующей, что даёт и лестница всех
// шести. Числа — из той же функции, что считает прибавки герою на сервере.
import {
  ACH_TRACKS,
  MAX_STEP,
  rarityOf,
  stepOf,
  stepTarget,
  trackBonus,
  RARITIES,
  type AchStat,
  type AchTrackId,
  type Rarity,
} from "@/lib/achievements/tracks";
import { STAT_LABELS, type HeroStatKey } from "@/lib/heroStats";

export type AchTrackView = {
  id: AchTrackId;
  count: number;
  step: number;
  rarity: Rarity | null;
  /** Порог прошлой и следующей ступени — для полоски прогресса. */
  from: number;
  target: number | null;
  pct: number;
  /** Что даёт взятая редкость и какой характеристике. */
  bonus: number;
  stat: AchStat;
  /** Все шесть редкостей: сколько надо, что даёт и взята ли. */
  ladder: { rarity: Rarity; target: number; bonus: number; done: boolean }[];
};

export function achTrackView(id: AchTrackId, count: number): AchTrackView {
  const step = stepOf(id, count);
  const rarity = rarityOf(step);
  const from = step > 0 ? stepTarget(id, step) : 0;
  const target = step < MAX_STEP ? stepTarget(id, step + 1) : null;
  const pct = target == null ? 100 : Math.round(((count - from) / (target - from)) * 100);
  return {
    id,
    count,
    step,
    rarity,
    from,
    target,
    pct: Math.min(100, Math.max(0, pct)),
    bonus: trackBonus(step),
    stat: ACH_TRACKS[id].stat,
    ladder: RARITIES.map((r, i) => ({
      rarity: r,
      target: stepTarget(id, i + 1),
      bonus: trackBonus(i + 1),
      done: step > i,
    })),
  };
}

/** Подпись характеристики: шесть боевых — из героя, торговля и алхимия — свои. */
export function achStatLabel(stat: AchStat, lang: "ru" | "en", t: (k: string) => string): string {
  if (stat === "trade" || stat === "alchemy") return t(`ach.stat.${stat}`);
  return STAT_LABELS[stat as HeroStatKey][lang];
}
