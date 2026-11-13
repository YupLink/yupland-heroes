// Поведения, которые по имени постройки НЕ угадываются — только явным выбором
// админа: турнир, казино, гречка, зачарование артов и героев, продажа построек,
// генератор артефактов (§8.122). Вынесено из buildingEffect.ts (лимит строк).
export const ONLY_EXPLICIT: ReadonlySet<string> = new Set([
  "tournament",
  "casino",
  "buckwheat",
  "enchant",
  "hero_enchant",
  "building_shop",
  "art_gen",
]);
