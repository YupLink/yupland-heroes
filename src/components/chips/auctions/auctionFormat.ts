// Подписи аукциона, общие для игрока и админа: сколько осталось, вид приза,
// редкость и строка «что это за герой / артефакт».
import { heroAbilityLabel } from "@/lib/hero/heroAbilities";
import { STAT_LABELS } from "@/lib/heroStats";
import { RARITY_LABEL } from "@/components/heroes/heroLabels";
import { fishBonusText } from "@/lib/raid/fishBonus";

/** Число с разрядами: «10 000» по-русски, «10,000» по-английски. */
export function fmtNum(n: number, en: boolean): string {
  return Number(n).toLocaleString(en ? "en-US" : "ru-RU");
}

/** Хвост названия лота: « ×10 000»; одна штука — пусто. */
export function qtyText(qty: number, en: boolean): string {
  return qty > 1 ? ` ×${fmtNum(qty, en)}` : "";
}

/** Сколько осталось до конца лота: «2д 4ч», «3ч 15м», «12:07». */
export function timeLeft(endAt: string, now: number, en: boolean): string {
  const ms = Date.parse(endAt) - now;
  if (ms <= 0) return en ? "ended" : "завершён";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (d > 0) return `${d}${en ? "d" : "д"} ${h}${en ? "h" : "ч"}`;
  if (h > 0) return `${h}${en ? "h" : "ч"} ${m}${en ? "m" : "м"}`;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

export const KIND_RU: Record<string, string> = {
  box: "Бокс",
  pack: "Пак",
  hero: "Герой",
  artifact: "Артефакт",
  resource: "Ресурс",
  custom: "Товар",
};
export const KIND_EN: Record<string, string> = {
  box: "Box",
  pack: "Pack",
  hero: "Hero",
  artifact: "Artifact",
  resource: "Resource",
  custom: "Goods",
};

export type PrizeInfo = {
  rarity: string | null;
  race: string | null;
  spec: string | null;
  /** Способность героя (§8.52); нет — null. */
  ability?: string | null;
  level: number | null;
  slot: string | null;
  statType: string | null;
  statAmount: number | null;
  /** Артефакт: прибавка к той же характеристике при расе/классе/земле героя. */
  raceAmount?: number | null;
  specAmount?: number | null;
  land?: string | null;
  landAmount?: number | null;
  immunities?: string[] | null;
  /** Бонус к рыбалке, % к шансу поимки. 0 — нет, строки нет. */
  fishBonusPct?: number | null;
};

const RARITY_EN: Record<string, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};
/** Характеристика артефакта хранится по-английски (Attack, Armor…). */
const STAT_RU: Record<string, string> = {
  ...Object.fromEntries(Object.values(STAT_LABELS).map((l) => [l.en, l.ru])),
  Trade: "Торговля",
};

export function rarityLabel(rarity: string | null | undefined, en: boolean): string | null {
  if (!rarity) return null;
  return (en ? RARITY_EN : RARITY_LABEL)[rarity] ?? rarity;
}

/** Герой: «Кабан · Путешественник». Артефакт: «Шея · +15 Торговля».
 *  Редкость — отдельной плашкой (RarityChip), здесь её нет. «Уровень» шаблона
 *  героя — это звёзды, они и есть редкость; «ур. 5» путало (15.10.2026). */
export function prizeInfoText(
  kind: string,
  info: PrizeInfo | null | undefined,
  en: boolean,
): string {
  if (!info) return "";
  if (kind === "hero")
    return [info.race, info.spec, heroAbilityLabel(info.ability, en ? "en" : "ru")]
      .filter(Boolean)
      .join(" · ");
  if (kind === "artifact") {
    const stat =
      info.statType && info.statAmount
        ? `+${info.statAmount} ${en ? info.statType : (STAT_RU[info.statType] ?? info.statType)}`
        : null;
    // Бонус к рыбалке — коротко, рядом со статом; нет его — пусто.
    const fish = fishBonusText(Number(info.fishBonusPct) || 0, en ? "en" : "ru");
    const fishPart = fish ? `${en ? "Fishing" : "Рыбалка"} ${fish}` : null;
    return [info.slot, stat, fishPart].filter(Boolean).join(" · ");
  }
  return "";
}
