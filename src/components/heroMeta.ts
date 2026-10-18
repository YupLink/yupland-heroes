// Мета героев: расы, специализации, авто-редкость из уровня (звёзд).
// Общий модуль для конструктора (админ) и инвентаря (юзер).

export const RACES = [
  "Пчела",
  "Кабан",
  "ДраКошка",
  "Юпик",
  "Единорог",
  "Дракон",
] as const;

export const SPECIALIZATIONS = [
  "Маг",
  "Воин",
  "Торговец",
  "Ассасин",
  "Путешественник",
  "Строитель",
] as const;

// ── Артефакты ──
// Слоты — точный список владельца (куда надевается артефакт).
export const ARTIFACT_SLOTS = [
  "Голова",
  "Шея",
  "Тело",
  "Правая рука",
  "Левая рука",
  "Руки",
  "Ноги",
  "Карманы",
] as const;
// Земли — «мы строим от земли»: локации игры (боссы не важны). Mystical —
// легаси-значение существующих артов, оставлено для совместимости.
export const LANDS = [
  "Mystical",
  "Горы",
  "Болото",
  "Адские земли",
  "Пустыня",
  "Лес",
  "Зимний лес",
  "Сказочный лес",
  "Магический лес",
  "Безумный мир",
  "Небеса",
  "Земля удачи",
  "Порт",
  "Земли юпиков",
] as const;
// Характеристики — канон англ. Дубли (Strength=Attack, Damage=Attack, Agility=Speed)
// убраны (жалоба Ярослава 08.08). METAlabels для старых сохранённых значений
// остаются ниже — не ломаем ретро-данные.
export const ARTIFACT_STATS = [
  "Attack",
  "Armor",
  "Intellect",
  "Speed",
  "Health",
  "Luck",
  // Торговля и Алхимия — НЕбоевые статы: в бой/радар не идут, но растят рюкзак
  // и сумку зелий героя (см. lib/hero/heroExtraStats.ts). Артефакт с ними
  // действует на любого героя, бонусы расы/спеки — как у боевых.
  "Trade",
  "Alchemy",
] as const;
// Иммунитеты — защита от ЭФФЕКТОВ БОССОВ (список эффектов см. BOSS_EFFECTS).
export const IMMUNITIES = [
  "Яд",
  "Оглушение",
  "Замедление",
  "Выжигание энергии",
] as const;

// Эффекты-способности боссов (для конструктора босса и иммунитетов артефактов).
export const BOSS_EFFECTS = [
  "Яд",
  "Оглушение",
  "Удар по всем",
  "Замедление",
  "Выжигание энергии",
] as const;

// ── Локализация значений (админ видит RU, юзер — по языку) ──
// Канон-значение хранится в БД как есть (races/spec/slots — RU,
// stats/rarity — EN, lands — RU/легаси-Mystical). metaLabel переводит
// канон в подпись на нужном языке; неизвестное значение отдаётся как есть.
const META_LABELS: Record<string, { ru: string; en: string }> = {
  // редкость
  common: { ru: "Обычный", en: "Common" },
  uncommon: { ru: "Необычный", en: "Uncommon" },
  rare: { ru: "Редкий", en: "Rare" },
  epic: { ru: "Эпический", en: "Epic" },
  legendary: { ru: "Легендарный", en: "Legendary" },
  // характеристики
  Attack: { ru: "Атака", en: "Attack" },
  Armor: { ru: "Броня", en: "Armor" },
  Intellect: { ru: "Интеллект", en: "Intellect" },
  Speed: { ru: "Скорость", en: "Speed" },
  Strength: { ru: "Сила", en: "Strength" },
  Health: { ru: "Здоровье", en: "Health" },
  Damage: { ru: "Урон", en: "Damage" },
  Agility: { ru: "Ловкость", en: "Agility" },
  Luck: { ru: "Удача", en: "Luck" },
  Trade: { ru: "Торговля", en: "Trade" },
  Alchemy: { ru: "Алхимия", en: "Alchemy" },
  // расы
  Пчелы: { ru: "Пчела", en: "Bees" },
  Кабаны: { ru: "Кабан", en: "Boars" },
  "ДраКошка": { ru: "ДраКошка", en: "Dragon Cats" },
  Юпик: { ru: "Юпик", en: "Yupik" },
  Единорог: { ru: "Единорог", en: "Unicorn" },
  Драконы: { ru: "Дракон", en: "Dragons" },
  // специализации
  Маг: { ru: "Маг", en: "Mage" },
  Воин: { ru: "Воин", en: "Warrior" },
  Торговец: { ru: "Торговец", en: "Merchant" },
  Ассасин: { ru: "Ассасин", en: "Assassin" },
  Путешественник: { ru: "Путешественник", en: "Traveler" },
  Строитель: { ru: "Строитель", en: "Builder" },
  // слоты
  Голова: { ru: "Голова", en: "Head" },
  Шея: { ru: "Шея", en: "Neck" },
  Тело: { ru: "Тело", en: "Body" },
  "Правая рука": { ru: "Правая рука", en: "Right hand" },
  "Левая рука": { ru: "Левая рука", en: "Left hand" },
  Руки: { ru: "Руки", en: "Hands" },
  Ноги: { ru: "Ноги", en: "Legs" },
  Карманы: { ru: "Карманы", en: "Pockets" },
  // земли (локации)
  Mystical: { ru: "Мистическая", en: "Mystical" },
  Горы: { ru: "Горы", en: "Mountains" },
  Болото: { ru: "Болото", en: "Swamp" },
  "Адские земли": { ru: "Адские земли", en: "Hell Lands" },
  Пустыня: { ru: "Пустыня", en: "Desert" },
  Лес: { ru: "Лес", en: "Forest" },
  "Зимний лес": { ru: "Зимний лес", en: "Winter Forest" },
  "Сказочный лес": { ru: "Сказочный лес", en: "Fairytale Forest" },
  "Магический лес": { ru: "Магический лес", en: "Magic Forest" },
  "Безумный мир": { ru: "Безумный мир", en: "Mad World" },
  Небеса: { ru: "Небеса", en: "Heavens" },
  "Земля удачи": { ru: "Земля удачи", en: "Land of Luck" },
  Порт: { ru: "Порт", en: "Port" },
  "Земли юпиков": { ru: "Земли юпиков", en: "Yupik Lands" },
  // иммунитеты / эффекты боссов
  Яд: { ru: "Яд", en: "Poison" },
  Оглушение: { ru: "Оглушение", en: "Stun" },
  Замедление: { ru: "Замедление", en: "Slow" },
  "Выжигание энергии": { ru: "Выжигание энергии", en: "Energy Burn" },
  "Удар по всем": { ru: "Удар по всем", en: "AoE Strike" },
};

/** Локализованная подпись канон-значения. Неизвестное — как есть. */
export function metaLabel(
  value: string | null | undefined,
  lang: string
): string {
  if (!value) return "";
  const e = META_LABELS[value];
  if (!e) return value;
  return lang === "en" ? e.en : e.ru;
}

/**
 * Убирает хвост «(+N …)» из названия — характеристика уже показана иконкой на
 * карточке, в названии дублировать не нужно. «Mystical book (+2 Intellect)» →
 * «Mystical book». Если после чистки пусто — возвращаем исходное.
 */
export function stripStatSuffix(name: string | null | undefined): string {
  if (!name) return "";
  const cleaned = name.replace(/\s*\(\s*\+?\s*\d+[^)]*\)\s*$/u, "").trim();
  return cleaned || name;
}

// Редкость героя выводится из уровня (звёзд), а не задаётся руками. Тиры
// объединены (по решению владельца): 1–2 = common (серый), 3–3.5 = rare
// (синий), 4–4.5 = epic (фиолет), 5 = leg (золото). Без «+»-вариантов.
// Common — стартовый герой; из фишек не создаётся (convertRuleForChipLevel
// вернёт null для <3), поэтому в дормант из чипа он не попадает.
export function heroRarity(level: number | null | undefined): {
  label: string;
  color: string;
} {
  const lv = level ?? 0;
  if (lv >= 5) return { label: "leg", color: "#f5c451" };
  if (lv >= 4) return { label: "epic", color: "#b46bff" };
  if (lv >= 3) return { label: "rare", color: "#5b9bff" };
  return { label: "common", color: "#9ca3af" };
}
