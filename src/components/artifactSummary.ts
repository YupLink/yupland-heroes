// Описание артефакта, собранное из его характеристик.
//
// У части артефактов текстовое описание вписано руками («Armor: 5 / Slot: head»),
// у остальных поле пустое, хотя сами характеристики в базе заполнены — и карточка
// выглядела голой. Здесь та же сводка строится из полей, поэтому она есть у
// каждого артефакта и не расходится с реальными статами.
import { metaLabel } from "@/components/heroMeta";
import { fishBonusText } from "@/lib/raid/fishBonus";

export type ArtifactLike = {
  statType?: string | null;
  statAmount?: number | null;
  specialization?: string | null;
  specAmount?: number | null;
  race?: string | null;
  raceAmount?: number | null;
  land?: string | null;
  landAmount?: number | null;
  immunities?: string[] | null;
  slot?: string | null;
  /** Бонус к рыбалке, % к базе шанса. 0 и пусто — строки нет. */
  fishBonusPct?: number | null;
};

const TITLES = {
  spec: { ru: "Специализация", en: "Specialization" },
  race: { ru: "Раса", en: "Race" },
  land: { ru: "Земля", en: "Locality" },
  immunity: { ru: "Иммунитет", en: "Immunity" },
  slot: { ru: "Слот", en: "Slot" },
  fish: { ru: "Рыбалка", en: "Fishing" },
} as const;

const title = (key: keyof typeof TITLES, lang: string) =>
  lang === "en" ? TITLES[key].en : TITLES[key].ru;

/** «Маг (+1 Броня)» — бонус идёт к основной характеристике артефакта. */
function withBonus(
  value: string,
  amount: number | null | undefined,
  statType: string | null | undefined,
  lang: string,
): string {
  const label = metaLabel(value, lang);
  if (!amount) return label;
  const stat = statType ? ` ${metaLabel(statType, lang)}` : "";
  return `${label} (+${amount}${stat})`;
}

export function artifactSummary(it: ArtifactLike, lang: string): string {
  const lines: string[] = [];

  if (it.statType) {
    const amount = it.statAmount == null ? "" : `: ${it.statAmount}`;
    lines.push(`${metaLabel(it.statType, lang)}${amount}`);
  }
  if (it.specialization) {
    lines.push(
      `${title("spec", lang)}: ${withBonus(it.specialization, it.specAmount, it.statType, lang)}`,
    );
  }
  if (it.race) {
    lines.push(`${title("race", lang)}: ${withBonus(it.race, it.raceAmount, it.statType, lang)}`);
  }
  if (it.land) {
    lines.push(`${title("land", lang)}: ${withBonus(it.land, it.landAmount, it.statType, lang)}`);
  }
  if (it.immunities?.length) {
    lines.push(
      `${title("immunity", lang)}: ${it.immunities.map((v) => metaLabel(v, lang)).join(", ")}`,
    );
  }
  if (it.slot) lines.push(`${title("slot", lang)}: ${metaLabel(it.slot, lang)}`);
  // Бонус к рыбалке — в процентах к шансу; нет его — строки нет вовсе.
  const fish = fishBonusText(Number(it.fishBonusPct) || 0, lang === "en" ? "en" : "ru");
  if (fish) lines.push(`${title("fish", lang)}: ${fish}`);

  return lines.join("\n");
}
