import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Рецепт лавки (владелец, 04.11.2026; ПРАВИЛА §8.104): платишь — получаешь
// один исход по шансам. Окно «Можно получить» и окно «Выпало».
export const dict: Record<string, Entry> = {
  "recipe.none": { ru: "Ничего", en: "Nothing" },
  "recipe.can_get": { ru: "Можно получить", en: "You can get" },
  "recipe.result_title": { ru: "Выпало", en: "You got" },
};
