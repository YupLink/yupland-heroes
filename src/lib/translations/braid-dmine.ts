import type { Lang } from "@/lib/store";
type Entry = Record<Lang, string>;

// Грибы DARAI / золотой / алмазный (lib/daraiMine, lib/mushroomKinds) и «Забрать
// охрану» со своей шахты (lib/mineGuardTake): кнопки, окна и отказы сервера
// (dmine.*, mineguard.*).
export const dict: Record<string, Entry> = {
  "dmine.item": { ru: "Гриб DARAI", en: "DARAI Mushroom" },
  "dmine.item.gold": { ru: "Золотой гриб", en: "Gold Mushroom" },
  "dmine.item.diamonds": { ru: "Алмазный гриб", en: "Diamond Mushroom" },
  "dmine.take_btn": { ru: "Забрать в рюкзак · ⚡{n}", en: "Take to backpack · ⚡{n}" },
  "dmine.take_free": { ru: "Забрать в рюкзак", en: "Take to backpack" },
  "dmine.taken_toast": { ru: "Гриб в рюкзаке", en: "The mushroom is in your backpack" },
  "dmine.place_title": { ru: "Посадить гриб", en: "Plant the mushroom" },
  "dmine.place_cost": { ru: "Посадить · ⚡{n}", en: "Plant · ⚡{n}" },
  "dmine.placed_toast": { ru: "Гриб растёт", en: "The mushroom is growing" },
  "dmine.placed_n": { ru: "Посажено грибов: {n}", en: "Mushrooms planted: {n}" },
  "dmine.hand_on_map": {
    ru: "Гриб в руке — открой карту и тапай по клеткам рядом с героем",
    en: "Mushroom in hand — open the map and tap cells next to the hero",
  },
  "dmine.left": { ru: "Выпадет через {t}", en: "Drops out in {t}" },
  // Защита на час (lib/mushroomRipe): предложение после посадки, созревание.
  "dmine.protect_title": {
    ru: "Защита на час — {n} энергии",
    en: "One-hour protection — {n} energy",
  },
  "dmine.protect_yes": { ru: "Защитить", en: "Protect" },
  "dmine.protect_no": { ru: "Не надо", en: "No thanks" },
  "dmine.protected_toast": {
    ru: "Гриб защищён на час",
    en: "The mushroom is protected for an hour",
  },
  "dmine.ripe_in": { ru: "Созреет через {t}", en: "Ripe in {t}" },
  "dmine.unripe": { ru: "Гриб ещё не созрел", en: "The mushroom isn't ripe yet" },
  "dmine.protect_late": {
    ru: "Защиту берут только в первый час после посадки",
    en: "Protection is only available in the first hour after planting",
  },
  // Отказы сервера
  "dmine.gone": { ru: "Гриба здесь уже нет", en: "The mushroom is no longer here" },
  "dmine.not_darai": {
    ru: "Забрать в рюкзак можно только гриб",
    en: "Only a mushroom can be taken to the backpack",
  },
  "dmine.own": {
    ru: "Свой гриб не поднять — только другой игрок",
    en: "You can't pick up your own mushroom — only another player can",
  },
  "dmine.once": {
    ru: "Этот гриб ты уже поднимал: снова — когда его поднимет и посадит другой игрок",
    en: "You've already picked up this mushroom: again only after another player picks it up and plants it",
  },
  "dmine.no_guard": {
    ru: "На гриб охрану не ставят",
    en: "A mushroom can't have a guard",
  },
  "dmine.capture_is_take": {
    ru: "Гриб не захватывают — его забирают в рюкзак",
    en: "A mushroom isn't captured — take it to your backpack",
  },
  "dmine.no_upgrade": {
    ru: "Гриб не улучшают",
    en: "A mushroom can't be upgraded",
  },
  "dmine.expired": {
    ru: "Час вышел — гриб встанет сам рядом с героем",
    en: "Time is up — the mushroom plants itself next to your hero",
  },
  // Охрана, снятая с DARAI-шахты, — подарком (minebag-02): вид и подпись.
  "gifts.kind.boss": { ru: "Босс", en: "Boss" },
  "dmine.guard_gift_note": {
    ru: "Охрана DARAI-шахты вернулась",
    en: "Your DARAI mine guard is back",
  },
  // «Съесть» (§8.85): награда — в окне гриба из рюкзака.
  "dmine.eat": { ru: "Съесть · {reward}", en: "Eat · {reward}" },
  "dmine.eat_confirm": {
    ru: "Съесть гриб за ⚡{n}? Получишь {reward}",
    en: "Eat the mushroom for ⚡{n}? You get {reward}",
  },
  "dmine.eaten_toast": { ru: "Гриб съеден: +{reward}", en: "Mushroom eaten: +{reward}" },
  "dmine.eat_reward.diamonds": { ru: "{n} алмазов", en: "{n} diamonds" },
  "dmine.eat_reward.gold": { ru: "{n} золота", en: "{n} gold" },
  "dmine.eat_reward.darai": { ru: "{n} DARAI", en: "{n} DARAI" },
  "dmine.no_item": {
    ru: "Гриба в рюкзаке уже нет",
    en: "The mushroom is no longer in your backpack",
  },
  "dmine.island": {
    ru: "На острове гриб не посадить",
    en: "You can't plant a mushroom on the island",
  },
  "dmine.stays": {
    ru: "Гриб можно только посадить",
    en: "The mushroom can only be planted",
  },
  // Охрана шахты → рюкзак
  "mineguard.take_btn": { ru: "Забрать в рюкзак · ⚡{n}", en: "Take to backpack · ⚡{n}" },
  "mineguard.confirm_title": { ru: "Забрать охрану?", en: "Take the guard?" },
  "mineguard.confirm_text": {
    ru: "{name} уйдёт в рюкзак за ⚡{n}. Шахта продолжит работать без охраны.",
    en: "{name} goes to your backpack for ⚡{n}. The mine keeps working without a guard.",
  },
  "mineguard.confirm_btn": { ru: "Забрать · ⚡{n}", en: "Take · ⚡{n}" },
  "mineguard.taken_toast": { ru: "Охрана в рюкзаке", en: "The guard is in your backpack" },
  "mineguard.not_owner": {
    ru: "Забрать охрану может только хозяин шахты",
    en: "Only the mine owner can take the guard",
  },
  "mineguard.none": { ru: "Охраны на шахте уже нет", en: "The mine has no guard anymore" },
  "mineguard.price_changed": {
    ru: "Цена изменилась: теперь ⚡{need}",
    en: "The price has changed: now ⚡{need}",
  },
};
