import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: турниры глазами игрока — категории (tour.metric.*, их же берёт
// админка) и окно постройки «Турнир»: плашки, запись, вкладки «Участники /
// Условия / Призы», таблица.
export const dict: Record<string, Entry> = {
  // ── категории ──
  "tour.metric.damage": { ru: "Урон по боссам", en: "Boss damage" },
  "tour.metric.gold": { ru: "Золото", en: "Gold" },
  "tour.metric.wood": { ru: "Дерево", en: "Wood" },
  "tour.metric.stone": { ru: "Камень", en: "Stone" },
  "tour.metric.chop": { ru: "Срубленные деревья", en: "Trees chopped" },
  "tour.metric.boss_kills": { ru: "Убийства боссов", en: "Boss kills" },
  "tour.metric.steps": { ru: "Шаги", en: "Steps" },
  "tour.metric.step_energy": { ru: "Энергия на шаги", en: "Energy spent on steps" },
  "tour.metric.farm": { ru: "Шахты во владении", en: "Mines held" },
  "tour.metric.fish_catch": { ru: "Улов", en: "Catch" },
  "tour.metric.fish_sell": { ru: "Продажа рыбы", en: "Fish sold" },
  "tour.metric.potion_drink": { ru: "Зелья скорости", en: "Speed potions" },

  // ── окно постройки ──
  "tour.open": { ru: "Турниры", en: "Tournaments" },
  "tour.title": { ru: "Турниры", en: "Tournaments" },
  "tour.active": { ru: "Идут", en: "Live" },
  "tour.past": { ru: "Прошлые", en: "Past" },
  "tour.none": { ru: "Сейчас турниров нет", en: "No tournaments right now" },
  "tour.left_dh": { ru: "осталось {d} д {h} ч", en: "{d}d {h}h left" },
  "tour.left_hm": { ru: "осталось {h} ч {m} мин", en: "{h}h {m}m left" },
  "tour.left_m": { ru: "осталось {m} мин", en: "{m}m left" },
  "tour.finishing": { ru: "Подводим итоги", en: "Tallying results" },
  "tour.ended": { ru: "Завершён {date}", en: "Ended {date}" },
  "tour.players": { ru: "Участников: {n}", en: "Players: {n}" },
  "tour.my_place": { ru: "Моё место: {n}", en: "My place: {n}" },
  "tour.no_prizes": { ru: "Без призов", en: "No prizes" },
  "tour.soon": { ru: "Скоро", en: "Coming soon" },
  "tour.starts": { ru: "старт {at} UTC", en: "starts {at} UTC" },
  "tour.ends": { ru: "конец {at} UTC", en: "ends {at} UTC" },

  // ── запись: цена у каждого турнира своя ({price} — entryPrice.tourEntryPriceLabel) ──
  "tour.join": { ru: "Записаться · {price}", en: "Join · {price}" },
  "tour.join_free": { ru: "Записаться", en: "Join" },
  "tour.joined": { ru: "Вы участвуете", en: "You're in" },
  // Хвост строки «✓ Вы участвуете · место 4 · 1 830 очков» (n очков — уже с разрядами).
  "tour.place_n": { ru: "место {n}", en: "place {n}" },
  "tour.points_one": { ru: "{n} очко", en: "{n} point" },
  "tour.points_few": { ru: "{n} очка", en: "{n} points" },
  "tour.points_many": { ru: "{n} очков", en: "{n} points" },
  "tour.no_points": { ru: "очков пока нет", en: "no points yet" },
  "tour.joined_paid": {
    ru: "Вы записаны на турнир · −{price}",
    en: "You've joined the tournament · −{price}",
  },
  "tour.joined_free": { ru: "Вы записаны на турнир", en: "You've joined the tournament" },
  "tour.err.no_fee": { ru: "Не хватает на запись", en: "Not enough to pay the entry fee" },
  // Прежний ключ (запись за 5 золота одним SQL) — на случай старого сервера во время выката.
  "tour.err.no_gold": { ru: "Не хватает золота на запись", en: "Not enough gold to join" },
  "tour.err.busy": {
    ru: "Запись уже оформляется — попробуйте чуть позже",
    en: "Your entry is already being processed — try again shortly",
  },
  "tour.err.not_open": {
    ru: "На этот турнир сейчас не записаться",
    en: "This tournament isn't open for entry",
  },

  // ── раскрытая плашка: вкладки и таблица ──
  "tour.tab.players": { ru: "Участники", en: "Players" },
  "tour.tab.rules": { ru: "Условия", en: "Rules" },
  "tour.tab.prizes": { ru: "Призы", en: "Prizes" },
  "tour.table_empty": { ru: "Пока никто не набрал очков", en: "No one has scored yet" },
  "tour.more": { ru: "Ещё {n}", en: "{n} more" },
  "tour.you": { ru: "ты", en: "you" },
  "tour.retry": { ru: "Повторить", en: "Retry" },
  "tour.art.legendary": { ru: "Легендарный артефакт", en: "Legendary artifact" },
  "tour.art.epic": { ru: "Эпический артефакт", en: "Epic artifact" },
  "tour.art.rare": { ru: "Редкий артефакт", en: "Rare artifact" },
  "tour.art.common": { ru: "Обычный артефакт", en: "Common artifact" },
};
