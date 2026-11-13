import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Способность босса «Снятие иммунитетов» (владелец, 22.10.2026): карточка цели,
// итог боя и значок над героем. Отдельный файл — braid.ts у потолка строк.
export const dict: Record<string, Entry> = {
  "braid.ab_strip_immune": { ru: "Снятие иммунитетов", en: "Strip immunities" },
  "braid.eff_strip_immune": {
    ru: "Иммунитеты героя не действуют",
    en: "Hero immunities don't work",
  },
  "braid.strip_badge": { ru: "{n} мин", en: "{n} min" },
  "braid.sum_strip": {
    ru: "Иммунитеты героя сняты на {n} мин",
    en: "Hero immunities stripped for {n} min",
  },
};
