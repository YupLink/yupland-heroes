import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Ачивки (§8.57): восемь занятий, шесть редкостей, ветеран портала.
export const dict: Record<string, Entry> = {
  "ach.title": { ru: "Ачивки", en: "Achievements" },
  "ach.column": { ru: "Ачивки", en: "Achiev." },
  "ach.gives": { ru: "+{n} {stat}", en: "+{n} {stat}" },
  "ach.stat.trade": { ru: "Торговля", en: "Trade" },
  "ach.stat.alchemy": { ru: "Алхимия", en: "Alchemy" },
  "ach.back": { ru: "Профиль", en: "Profile" },
  "ach.loading": { ru: "Загрузка ачивок…", en: "Loading achievements…" },
  "ach.load_error": { ru: "Не удалось загрузить ачивки.", en: "Could not load achievements." },
  "ach.retry": { ru: "Повторить", en: "Retry" },
  "ach.done": { ru: "Готово", en: "Done" },
  "island.tab_ach": { ru: "Ачивки", en: "Achievements" },
  // Подсказки ачивок на острове — где взять инструмент и куда идти.
  "island.ach.lumber": {
    ru: "Руби дубы. Без топора — руками (⚡10 и 30 сытости); топор — в кузнице за доску.",
    en: "Chop oaks. No axe — by hand (⚡10 and 30 satiety); an axe is in the forge for a plank.",
  },
  "island.ach.miner": {
    ru: "Кирка — в кузнице (бревно + руда), руда — с боссов. Кристаллы отрастают за час.",
    en: "Pickaxe — in the forge (log + ore); ore drops from bosses. Crystals regrow in an hour.",
  },
  "island.ach.hunter": {
    ru: "Бей боссов: «В бой» → «Атаковать». Простые возрождаются через 20 минут. Каждый даёт лайки на корабль.",
    en: "Fight bosses: «Fight» → «Attack». Plain ones respawn in 20 minutes. Each gives likes for the ship.",
  },
  "island.ach.digger": {
    ru: "Лопата — в кузнице. Бугорки на острове — клады: подойди и «Выкопать».",
    en: "Shovel — in the forge. Mounds on the island are treasure: walk up and «Dig».",
  },
  "island.ach.fisher": {
    ru: "Удочка — в кузнице за 2 бревна. Встань у воды → «Рыбалка».",
    en: "A rod — in the forge for 2 logs. Stand by the water → «Fishing».",
  },
  "island.ach.sailor": {
    ru: "Верфь у берега: построй корабль (500 лайков, герою-Строителю — 50) — лайки дают боссы острова. Сядь и плыви по мелководью.",
    en: "A shipyard by the shore: build a ship (500 likes, 50 for a Builder hero) — island bosses give likes. Board it and sail the shallows.",
  },
  "island.ach.explorer": {
    ru: "Ходи по острову — каждая пройденная клетка в счёт.",
    en: "Walk around the island — every cell you pass counts.",
  },
  "island.ach.minelord": {
    ru: "Захвати лесопилку (10 энергии): 1 дерево в час, не дольше недели. Собирай в «Добыче».",
    en: "Capture the sawmill (10 energy): 1 wood per hour, for up to a week. Collect it in «Harvest».",
  },
  "island.tab_guide": { ru: "Обучение", en: "Tutorial" },
  "ach.none": { ru: "Не начато", en: "Not started" },
  "ach.next": { ru: "до следующей: {n}/{target}", en: "to next: {n}/{target}" },
  "ach.maxed": { ru: "Мифическая взята", en: "Mythic reached" },

  "ach.track.lumber": { ru: "Дровосек", en: "Lumberjack" },
  "ach.track.lumber.how": {
    ru: "Руби деревья: топором или руками.",
    en: "Chop trees: with an axe or by hand.",
  },
  "ach.track.miner": { ru: "Рудокоп", en: "Miner" },
  "ach.track.miner.how": {
    ru: "Добывай киркой: кристаллы, камни, горы.",
    en: "Mine with a pickaxe: crystals, stones, mountains.",
  },
  "ach.track.hunter": { ru: "Охотник", en: "Hunter" },
  "ach.track.hunter.how": {
    ru: "Побеждай боссов — засчитывается всем, кто бил.",
    en: "Defeat bosses — counts for everyone who fought.",
  },
  "ach.track.digger": { ru: "Кладоискатель", en: "Treasure hunter" },
  "ach.track.digger.how": {
    ru: "Выкапывай клады лопатой (свои закопанные не в счёт).",
    en: "Dig up treasure with a shovel (your own buried ones don't count).",
  },
  "ach.track.fisher": { ru: "Рыбак", en: "Fisher" },
  "ach.track.fisher.how": {
    ru: "Лови рыбу удочкой у воды.",
    en: "Catch fish with a rod by the water.",
  },
  "ach.track.sailor": { ru: "Мореплаватель", en: "Sailor" },
  "ach.track.sailor.how": {
    ru: "Плавай на корабле: клетка воды — 1, клетка моря — 2.",
    en: "Sail a ship: a water cell counts 1, a sea cell counts 2.",
  },
  "ach.track.explorer": { ru: "Исследователь", en: "Explorer" },
  "ach.track.explorer.how": {
    ru: "Ходи пешком — каждая пройденная клетка.",
    en: "Walk — every cell you pass.",
  },
  "ach.track.minelord": { ru: "Хозяин шахт", en: "Mine lord" },
  "ach.track.minelord.how": {
    ru: "Собирай добычу своих шахт.",
    en: "Collect the yield of your mines.",
  },

  "ach.rarity.common": { ru: "Обычная", en: "Common" },
  "ach.rarity.uncommon": { ru: "Необычная", en: "Uncommon" },
  "ach.rarity.rare": { ru: "Редкая", en: "Rare" },
  "ach.rarity.epic": { ru: "Эпическая", en: "Epic" },
  "ach.rarity.legendary": { ru: "Легендарная", en: "Legendary" },
  "ach.rarity.mythic": { ru: "Мифическая", en: "Mythic" },

  "ach.veteran": { ru: "Ветеран портала", en: "Portal veteran" },
  "ach.veteran.how": {
    ru: "Старые ачивки портала перенесены в игру. По сумме их очков — редкость.",
    en: "Your old portal achievements moved into the game. Their points set the rarity.",
  },
  "ach.veteran.points": { ru: "{n} очков", en: "{n} points" },
  "ach.veteran.next": { ru: "следующая редкость — с {n} очков", en: "next rarity at {n} points" },
  "ach.veteran.none": {
    ru: "Ачивок портала у аккаунта нет.",
    en: "This account has no portal achievements.",
  },
  "ach.portal_list": { ru: "Старые ачивки портала", en: "Old portal achievements" },
  "ach.portal_badge": { ru: "из портала", en: "from portal" },
  "ach.toast": {
    ru: "Ачивка «{name}»: {rarity}",
    en: "Achievement «{name}»: {rarity}",
  },

  "ach.gate": {
    ru: "Портал откроется, когда все 8 ачивок возьмут «Обычную»",
    en: "The portal opens when all 8 achievements reach «Common»",
  },
  "ach.gate_left": { ru: "Готово {n} из 8", en: "{n} of 8 done" },
  "island.portal_gate": {
    ru: "Сначала ачивки: все 8 — «Обычная». Готово {n} из 8.",
    en: "Achievements first: all 8 at «Common». {n} of 8 done.",
  },
};
