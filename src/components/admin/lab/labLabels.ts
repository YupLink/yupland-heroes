// Подписи лаборатории на языке админа: канон-значения (редкость, слот,
// характеристика, раса, специализация, местность) → ru/en.
import { metaLabel } from "@/components/heroMeta";
import { useLang } from "@/lib/i18n";
import { RACE_EN } from "@/lib/craft/craftPrompt";
import type { CraftRace } from "@/lib/craft/craftTable";

export function useLabLabels() {
  const lang = useLang();
  return {
    meta: (v: string) => metaLabel(v, lang),
    race: (r: CraftRace) => (lang === "en" ? RACE_EN[r] : r),
  };
}
