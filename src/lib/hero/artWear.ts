// Износ артефактов (владелец, 22.10.2026): «по артам и их хп — утверждаю».
//
// Срок службы — сколько боёв артефакт выдержит: Обычный 50, Редкий 100,
// Эпический 250, Легендарный 500 (владелец, 23.10.2026; было 100/125/160/200).
// Одно использование — один БОЙ, а не удар
// (владелец, 23.10.2026: «бой = босс — 500 боёв = 500 боссов, и неважно, сколько
// раз ты их ударил»): бой — одна жизнь цели (босс, моб, охрана шахты/сундука);
// за неё каждый надетый на дерущегося героя артефакт изнашивается один раз.
//
// Износ живёт в САМОМ предмете: user_game_item.wear — сколько процентов уже
// снято (0 — целый, 100 — сломан), как у инструментов raid_hero_backpack.wear.
// Шаг удара = 100 / срок: 2 · 1 · 0,4 · 0,2 — все четыре точные
// десятичные дроби, и numeric в базе доходит до ровно 100 без хвостов.
//
// На нуле артефакт НЕ исчезает: он сломан и лежит у игрока. Пока механика
// поломки не запущена (флаг ремонта, lib/hero/artBroken.ts), он и на герое и
// даёт ВСЁ, как целый (BROKEN_ART_PENALTY ниже): износ списывается и виден
// полосой, но дебафа нет. Запущена — слетает с героя в инвентарь и не надевается.
// SQL удара — server/api/beta-raid/art-wear-hit.ts, та же арифметика.

/**
 * Отнимает ли поломка у артефакта всё — статы, иммунитеты, ремесло (рыбалка,
 * торговля, алхимия), место в «надеть лучшее». ПОКА НЕТ. Владелец, 23.10.2026:
 * «оружие по факту ломается. Оно должно ломаться. Должно. Эффект такой должен
 * быть. Счетчики должны быть. Но никаких дебафов не должно быть, пока мы не
 * ввели ремонт. … Без моего участия не делать.»
 * Включится вместе с ремонтом (кузница, за золото) — только по его слову, этой
 * одной правкой: все места читают флаг через artDisabled.
 */
export const BROKEN_ART_PENALTY: boolean = false;

/** Срок службы по редкости шаблона, боёв. Незнакомая редкость — как обычный. */
export const ART_LIFE = { common: 50, rare: 100, epic: 250, legendary: 500 } as const;

export type ArtRarity = keyof typeof ART_LIFE;

const rarityKey = (rarity: unknown): ArtRarity => {
  const r = String(rarity ?? "")
    .trim()
    .toLowerCase();
  return r in ART_LIFE ? (r as ArtRarity) : "common";
};

/** Сколько боёв живёт артефакт этой редкости. */
export const artLifeOf = (rarity: unknown): number => ART_LIFE[rarityKey(rarity)];

/** Износ из базы числом 0…100: numeric приезжает и строкой, пусто — целый. */
export const artWearOf = (wear: unknown): number => {
  const n = Number(wear);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
};

/** Прочность, %: снято 25 — осталось 75. Сломанный — 0. */
export const artDurability = (wear: unknown): number => 100 - artWearOf(wear);

/** Сломан: прочности не осталось. Даёт ли он что-то — решает artDisabled. */
export const artBroken = (wear: unknown): boolean => artWearOf(wear) >= 100;

/**
 * Артефакт выключен: сломан И штраф за поломку действует. Пока ремонта нет —
 * всегда false. `penalty` — только для тестов поведения «после ремонта».
 */
export const artDisabled = (wear: unknown, penalty = BROKEN_ART_PENALTY): boolean =>
  penalty && artBroken(wear);

/** Полоса красная при 25 % и ниже — как процент у инструментов. */
export const ART_LOW_PCT = 25;

/** Прочность из ответа для полосы: 0…100; пусто или мусор — новый, 100. */
export function shownArtPct(durability: number | null | undefined): number {
  const n = Number(durability ?? 100);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100;
}

/**
 * Удар по артефакту: новый износ. Сломанный не меняется (бить им уже нечем),
 * выше 100 не бывает. Та же формула, что LEAST(100, wear + шаг) в SQL.
 */
export function artHit(wear: unknown, rarity: unknown): number {
  const w = artWearOf(wear);
  if (w >= 100) return 100;
  // Считаем в ударах, а не в процентах: 0,8 и 0,625 в двоичной плавающей
  // точке не точны, и 125 × 0,8 могло бы не дойти до ровно 100.
  const life = artLifeOf(rarity);
  const used = Math.round((w * life) / 100) + 1;
  return Math.min(100, (used * 100) / life);
}

/**
 * Шаг удара в SQL по колонке редкости шаблона — точной десятичной дробью
 * (100.0 / срок), из той же таблицы ART_LIFE: два места с числами разъехаться
 * не могут.
 */
export function artStepSql(rarityCol: string): string {
  const cases = (Object.keys(ART_LIFE) as ArtRarity[])
    .filter((r) => r !== "common")
    .map((r) => `WHEN '${r}' THEN 100.0 / ${ART_LIFE[r]}`)
    .join(" ");
  return `(CASE lower(COALESCE(${rarityCol}, '')) ${cases} ELSE 100.0 / ${ART_LIFE.common} END)`;
}
