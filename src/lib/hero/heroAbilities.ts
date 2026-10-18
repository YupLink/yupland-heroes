// Способность героя (владелец, 16.10.2026) — третья метка шаблона героя рядом с
// расой и специализацией. Хранится в meta.ability шаблона (как флаг «уникальный»),
// выбирается только из списка. Что способность даёт — владелец скажет позже: пока
// это метка без действия. Новая способность — строкой в список.

export const HERO_ABILITIES = [
  { id: "rancher", ru: "Животновод", en: "Rancher" },
  { id: "fisher", ru: "Рыбак", en: "Fisherman" },
  { id: "casino_owner", ru: "Владелец казино", en: "Casino owner" },
  { id: "diplomat", ru: "Дипломат", en: "Diplomat" },
  { id: "treasure_hunter", ru: "Искатель кладов", en: "Treasure hunter" },
  { id: "market_owner", ru: "Владелец рынков", en: "Market owner" },
  { id: "farmer", ru: "Фермер", en: "Farmer" },
  { id: "killer", ru: "Киллер", en: "Hitman" },
] as const;

export type HeroAbility = (typeof HERO_ABILITIES)[number]["id"];

export const HERO_ABILITY_IDS: readonly string[] = HERO_ABILITIES.map((a) => a.id);

export const isHeroAbility = (v: unknown): v is HeroAbility =>
  typeof v === "string" && HERO_ABILITY_IDS.includes(v);

/** Способность из meta шаблона; нет или чужое слово — null. */
export function heroAbilityOf(meta: unknown): HeroAbility | null {
  const v = (meta as { ability?: unknown } | null)?.ability;
  return isHeroAbility(v) ? v : null;
}

export function heroAbilityLabel(id: string | null | undefined, lang: string): string {
  const a = HERO_ABILITIES.find((x) => x.id === id);
  if (!a) return "";
  return lang === "en" ? a.en : a.ru;
}

export const HERO_ABILITY_ERROR = "Способность героя — только из списка";

/** Сервер: meta.ability либо нет, либо из списка. */
export function assertHeroAbility(meta: unknown): void {
  const v = (meta as { ability?: unknown } | null)?.ability;
  if (v === undefined || v === null || v === "") return;
  if (!isHeroAbility(v)) throw new Error(HERO_ABILITY_ERROR);
}
