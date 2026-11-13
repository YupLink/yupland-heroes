import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Ломбард героев (владелец, 22.10.2026): скупка «Любой … герой» и наценка
// перепродажи. Отдельный файл — braid-market.ts упёрся в лимит ≤250 строк.
export const dict: Record<string, Entry> = {
  // Псевдо-шаблон hero_any_*: подпись позиции на языке игрока, как у art_any.
  "market.hero_any.common": { ru: "любой обычный герой", en: "any common hero" },
  "market.hero_any.rare": { ru: "любой редкий герой", en: "any rare hero" },
  "market.hero_any.epic": { ru: "любой эпический герой", en: "any epic hero" },
  "market.hero_any.legendary": { ru: "любой легендарный герой", en: "any legendary hero" },
  // Пикер «кого сдать»: короткие подписи — для кнопки на плитке 3-в-ряд.
  "market.hero_pick": { ru: "Какого героя сдать", en: "Which hero to give" },
  "market.hero_pick_short": { ru: "Выбрать героя", en: "Pick hero" },
  "market.hero_pick_none": { ru: "Свободных героев нет", en: "No spare heroes" },
  "market.hero_pick_none_short": { ru: "Некого сдать", en: "No one spare" },
  "market.hero_pick_error": {
    ru: "Не удалось получить список героев",
    en: "Could not load the hero list",
  },
  "market.hero_level": { ru: "ур. {n}", en: "lvl {n}" },
  // Отмечено несколько копий — подпись выбора на кнопке плитки.
  "market.hero_pick_n": { ru: "Героев: {n}", en: "Heroes: {n}" },
  // То же у артефактов ломбарда: отмечено несколько групп (§8.73 п. 6).
  "market.art_pick_n": { ru: "Артефактов: {n}", en: "Artifacts: {n}" },
  // Отказы сервера (hero-pawn-take).
  "market.hero_pick_need": { ru: "Выбери, какого героя сдать", en: "Pick which hero to give" },
  "market.hero_none": { ru: "Такого героя у тебя нет", en: "You don't have that hero" },
  "market.hero_rarity_wrong": {
    ru: "У этого героя другая редкость",
    en: "That hero is of a different rarity",
  },
  "market.hero_unique": {
    ru: "Уникального героя ломбард не принимает",
    en: "The pawnshop doesn't take unique heroes",
  },
  "market.hero_busy": {
    ru: "Герой занят: основной, на грядке, отдыхает, рыбачит или с грибом DARAI в рюкзаке",
    en: "That hero is busy: main hero, on a field, resting, fishing or carrying a DARAI mushroom",
  },
  // Наценка ломбарда в редакторе маркета (админ): у артефактов и героев своя.
  "market.pawn_markup.art": { ru: "Наценка ломбарда, ×", en: "Pawn markup, ×" },
  "market.pawn_markup.hero": { ru: "Наценка ломбарда на героев, ×", en: "Pawn hero markup, ×" },
  "market.pawn_markup_hint.art": {
    ru: "Сданный «любой артефакт» продаётся здесь же по цене выплаты × наценка",
    en: "A pawned “any artifact” is resold here at payout × markup",
  },
  "market.pawn_markup_hint.hero": {
    ru: "Сданный «любой герой» продаётся здесь же по цене выплаты × наценка",
    en: "A pawned “any hero” is resold here at payout × markup",
  },
  "market.pawn_markup_save": { ru: "Сохранить", en: "Save" },
  // Окно после сдачи героя (§8.73 п. 4): рюкзак — мешочком на клетку основного.
  "pawndrop.title": { ru: "Вещи героя выпали", en: "The hero's items dropped" },
  "pawndrop.cell": { ru: "Мешочек на клетке ({q}, {r})", en: "Bag at cell ({q}, {r})" },
  "pawndrop.arts": {
    ru: "Надетые артефакты сняты — в инвентаре: {n}",
    en: "Equipped artifacts taken off — in your inventory: {n}",
  },
  "market.pawn_markup_saved.art": { ru: "Наценка ломбарда ×{n}", en: "Pawn markup ×{n}" },
  "market.pawn_markup_saved.hero": {
    ru: "Наценка ломбарда на героев ×{n}",
    en: "Pawn hero markup ×{n}",
  },
};
