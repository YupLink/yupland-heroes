// Запрос к нейросети и имя артефакта: форма, слова игрока, редкость,
// выпавшие раса / специализация / местность. Стиль — как у нынешних
// артефактов: пиксель-арт, один предмет, без фона; фон белый, его снимает
// обработка, она же кладёт тёмную обводку.
import { metaLabel } from "@/components/heroMeta";
import type { CraftForm } from "./craftForms";
import type { CraftRoll } from "./craftRoll";
import type { CraftLand, CraftRace, CraftRarity, CraftSpec } from "./craftTable";

// Редкость — цвет и сложность (владелец 28.10: «каммон — серый, рар — синий,
// эпик — фиолетовый, лег — золотой; чем реже, тем изощрённее, но не
// перебарщивай»). Коротко: SanaSprint на длинном запросе падает.
const RARITY_LOOK: Record<CraftRarity, string> = {
  common: "grey colors, plain simple design, worn iron and leather",
  rare: "blue colors, fine detailed design, steel with blue sapphires",
  epic: "purple colors, intricate design, glowing violet amethysts",
  legendary: "gold colors, ornate masterwork design, radiant gems and runes",
};

// Мотивы рас — как выглядят герои этих рас в игре (сверено с портретами 28.10).
// Украшением, а не зверем: «boar style» модель рисовала целым кабаном рядом с
// мечом. Цвет рога единорога не задан — его задают слова игрока.
const RACE_LOOK: Record<CraftRace, string> = {
  Пчела: "decorated with black-yellow stripes, small antennae and pink bee wings",
  Кабан: "decorated with ivory boar tusks and dark bristly fur trim",
  ДраКошка: "decorated with grey cat ears, small horns and blue scales",
  Юпик: "decorated with dark fur, tiny curved horns and green gem eyes",
  Единорог: "decorated with a spiral unicorn horn and pale blonde mane tassels",
  Дракон: "decorated with green dragon scales, horns and claws",
};

const SPEC_LOOK: Record<CraftSpec, string> = {
  Маг: "mage: runes, magic crystal",
  Воин: "warrior: battle-worn, spikes",
  Торговец: "merchant: gold coins, fine trim",
  Ассасин: "assassin: dark, sleek, sharp",
  Путешественник: "traveler: leather straps, compass",
  Строитель: "builder: hammer, rivets",
};

const LAND_LOOK: Record<CraftLand, string> = {
  Горы: "mountain stone",
  Болото: "swamp moss",
  "Адские земли": "lava and obsidian",
  Пустыня: "desert sandstone",
  Лес: "forest leaves and wood",
  "Зимний лес": "frost and ice",
  "Сказочный лес": "fairytale flowers",
  "Магический лес": "glowing forest vines",
  "Безумный мир": "surreal twisted shapes",
  Небеса: "celestial feathers and clouds",
  "Земля удачи": "four-leaf clovers",
  Порт: "anchor and sea shells",
  "Земли юпиков": "dark fur and tiny horns",
};

const STYLE = "thick dark outline, centered, plain white background, no shadow, no text";
/** Предмет, а не существо — кроме фамильяра и статуэтки. */
const OBJECT_ONLY = "object only, no animals, no characters";

/** words — описание вида словами игрока (lookWords: без «хочу на героя» и без
 *  уже учтённых предмета, расы, специализации) — сразу за предметом, чтобы
 *  нейросеть его не потеряла. Русский она понимает («наручи из коры с листьями»). */
export function craftPrompt(
  form: CraftForm,
  rarity: CraftRarity,
  roll: CraftRoll,
  words = "",
): string {
  return [
    `pixel art RPG item icon of a single ${form.draw}${form.diagonal ? " placed diagonally" : ""}`,
    words || null,
    RARITY_LOOK[rarity],
    roll.race && RACE_LOOK[roll.race],
    roll.spec && SPEC_LOOK[roll.spec],
    roll.land && LAND_LOOK[roll.land],
    STYLE,
    form.creature ? null : OBJECT_ONLY,
  ]
    .filter(Boolean)
    .join(", ");
}

const RARITY_WORD: Record<CraftRarity, string> = {
  common: "Worn",
  rare: "Fine",
  epic: "Enchanted",
  legendary: "Ancient",
};

export const RACE_EN: Record<CraftRace, string> = {
  Пчела: "Bee",
  Кабан: "Boar",
  ДраКошка: "Dragon Cat",
  Юпик: "Yupik",
  Единорог: "Unicorn",
  Дракон: "Dragon",
};

/** Имя по-английски — как у всех артефактов в базе («Clover of Good Luck»). */
export function craftName(form: CraftForm, rarity: CraftRarity, roll: CraftRoll): string {
  const of = roll.land
    ? metaLabel(roll.land, "en")
    : roll.race
      ? RACE_EN[roll.race]
      : roll.spec
        ? metaLabel(roll.spec, "en")
        : null;
  const base = `${RARITY_WORD[rarity]} ${form.en}`;
  return of ? `${base} of the ${of}` : base;
}
