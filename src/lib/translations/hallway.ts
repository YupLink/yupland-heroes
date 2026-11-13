import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: Прихожая
// Часть src/lib/translations.ts — разбита на субдомены.
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {
  // ────────── прихожая (онбординг) ──────────
  "hallway.connect_wallet": { ru: "Подключи кошелёк", en: "Connect your wallet" },
  "hallway.toast_pool_empty": {
    ru: "Тап-пул пуст — копится сам",
    en: "Tap pool empty — it refills itself",
  },
  "hallway.toast_marathon_day": { ru: "Марафон · день {day}", en: "Marathon · day {day}" },
  "hallway.toast_release": {
    ru: "Выпуск! {count} фишек с тобой — игра открыта",
    en: "Released! {count} chips are yours — the game is open",
  },
  "hallway.load_error": { ru: "Не удалось загрузить прихожую", en: "Couldn't load the Hallway" },
  "hallway.retry": { ru: "Повторить", en: "Retry" },
  "hallway.title": { ru: "Прихожая", en: "Hallway" },
  "hallway.subtitle": { ru: "Собери 10 фишек → игра + босс", en: "Collect 10 chips → game + boss" },
  "hallway.help_aria": { ru: "Как это работает", en: "How it works" },
  "hallway.window_hours": { ru: "окно {h} ч", en: "window {h}h" },
  "hallway.awareness_label": { ru: "осознанности", en: "awareness" },
  "hallway.taps_count": { ru: "тапы {cur}/{max}", en: "taps {cur}/{max}" },
  "hallway.regen_per_min": { ru: "+{n}/мин", en: "+{n}/min" },
  "hallway.chest_open": { ru: "Открыть сундук", en: "Open chest" },
  "hallway.chest_desc_unlocked": {
    ru: "осознанность · EXP · фишка (25%)",
    en: "awareness · EXP · chip (25%)",
  },
  "hallway.chest_desc_locked": {
    ru: "фишки с L{lvl} · сейчас осознанность/EXP",
    en: "chips from L{lvl} · now awareness/EXP",
  },
  "hallway.chips": { ru: "Фишки", en: "Chips" },
  "hallway.chips_summary": {
    ru: "{count} всего · топ-{top}/10 работают",
    en: "{count} total · top {top}/10 active",
  },
  "hallway.chips_empty_short": {
    ru: "Пусто — выбивай из сундуков (с L{lvl})",
    en: "Empty — drop them from chests (from L{lvl})",
  },
  "hallway.marathon": { ru: "Марафон", en: "Marathon" },
  "hallway.marathon_day": { ru: "день {day}/30", en: "day {day}/30" },
  "hallway.marathon_day_title": { ru: "День {day}", en: "Day {day}" },
  "hallway.legend_awareness": { ru: "осознанность", en: "awareness" },
  "hallway.legend_exp": { ru: "опыт", en: "experience" },
  "hallway.legend_chest": { ru: "сундук", en: "chest" },
  "hallway.legend_chip": { ru: "фишка", en: "chip" },
  "hallway.marathon_claim": { ru: "Забрать награду дня", en: "Claim daily reward" },
  "hallway.marathon_claimed": { ru: "Уже забрано сегодня", en: "Already claimed today" },
  "hallway.release_card_intro": {
    ru: "🎉 Собрал 10 фишек! ",
    en: "🎉 You've collected 10 chips! ",
  },
  "hallway.release_word": { ru: "Выпустись", en: "Release" },
  "hallway.release_card_rest": {
    ru: " в игру — твои 10 сильнейших фишек станут игровыми (ими валишь босса, характеристики вдвое меньше обычных).",
    en: " into the game — your 10 strongest chips become playable (use them to fight the boss; their stats are half of regular ones).",
  },
  "hallway.release_cta": {
    ru: "Выпуск в игру · получи 10 фишек",
    en: "Release into the game · get 10 chips",
  },
  "hallway.exchange_later": {
    ru: "Обменять фишки на золото сможешь потом, уже в игре.",
    en: "You can swap chips for gold later, in the game.",
  },
  "hallway.inventory_title": { ru: "Инвентарь фишек", en: "Chip inventory" },
  "hallway.chips_summary_top10": {
    ru: "{count} всего · топ-10 работают",
    en: "{count} total · top 10 active",
  },
  "hallway.chests_count": { ru: "Сундуки — {count} шт", en: "Chests — {count} pcs" },
  "hallway.chests_desc": {
    ru: "Открывай по одному — внутри осознанность, опыт или фишка",
    en: "Open one at a time — inside is awareness, experience or a chip",
  },
  "hallway.open": { ru: "Открыть", en: "Open" },
  "hallway.chips_empty_full": {
    ru: "Пусто — выбивай фишки из сундуков (с L{lvl}) и марафона",
    en: "Empty — drop chips from chests (from L{lvl}) and the marathon",
  },
  "hallway.inventory_goal": {
    ru: "Собери 10 сильнейших фишек → выпуск в игру (фишки станут твоими).",
    en: "Collect 10 strongest chips → release into the game (the chips become yours).",
  },
  "hallway.shop": { ru: "Магазин", en: "Shop" },
  "hallway.nav_home": { ru: "Главная", en: "Home" },
  "hallway.nav_shop": { ru: "Магазин", en: "Shop" },
  "hallway.nav_inventory": { ru: "Инвентарь", en: "Inventory" },
  "hallway.reward_chip": { ru: "Фишка {star}!", en: "Chip {star}!" },
  "hallway.reward_premium_exp": { ru: "Премиум +{amount} EXP", en: "Premium +{amount} EXP" },
  "hallway.reward_awareness": { ru: "+{amount} осознанности", en: "+{amount} awareness" },
  "hallway.ok": { ru: "Ок", en: "OK" },
  "hallway.collected_10": { ru: "Собрал 10 фишек!", en: "You collected 10 chips!" },
  "hallway.release_prompt_rest1": { ru: " в игру — твои ", en: " into the game — your " },
  "hallway.release_prompt_strongest": { ru: "10 сильнейших фишек", en: "10 strongest chips" },
  "hallway.release_prompt_rest2": {
    ru: " станут игровыми (ими валишь босса, характеристики вдвое меньше обычных).",
    en: " become playable (use them to fight the boss; their stats are half of regular ones).",
  },
  "hallway.release_prompt_or": { ru: "Или", en: "Or" },
  "hallway.release_prompt_stay1": { ru: " останься и фарми ", en: " stay and farm " },
  "hallway.release_prompt_stay2": { ru: " для преимущества.", en: " for an edge." },
  "hallway.stay_and_farm": { ru: "Остаться и добывать дальше", en: "Stay and keep farming" },
  "hallway.confirm_release_title": { ru: "Выпуск в игру", en: "Release into the game" },
  "hallway.confirm_release_these": { ru: "Эти ", en: "These " },
  "hallway.confirm_release_count": { ru: "{count} фишек", en: "{count} chips" },
  "hallway.confirm_release_rest": {
    ru: " станут игровыми — ими валишь босса (характеристики вдвое меньше обычных). Добыча прихожи выключится навсегда, откроется игра и босс.",
    en: " become playable — use them to fight the boss (their stats are half of regular ones). Hallway farming shuts off for good; the game and boss open up.",
  },
  "hallway.will_transfer": { ru: "Перейдут в игру:", en: "Carried into the game:" },
  "hallway.cancel": { ru: "Отмена", en: "Cancel" },
  "hallway.enter_game": { ru: "Перейти в игру", en: "Enter the game" },
  "hallway.tutorial_tap_title": { ru: "Тапай юпика", en: "Tap the Yupik" },
  "hallway.tutorial_tap_text": {
    ru: "Каждый тап даёт осознанность. Сила тапа = звёзды твоей сильнейшей фишки. Пул тапов ограничен и восстанавливается сам.",
    en: "Every tap gives awareness. Tap power = the stars of your strongest chip. The tap pool is limited and refills on its own.",
  },
  "hallway.tutorial_level_title": { ru: "Расти в уровнях", en: "Level up" },
  "hallway.tutorial_level_text": {
    ru: "Осознанность копится в опыт, ты повышаешь уровень. Чем выше уровень — тем шире окно сбора и больше открывается.",
    en: "Awareness builds into experience and raises your level. The higher your level, the wider your collection window and the more unlocks.",
  },
  "hallway.tutorial_chest_title": { ru: "Открывай сундук", en: "Open chests" },
  "hallway.tutorial_chest_text": {
    ru: "Трать осознанность на сундук. Внутри — опыт, кэшбэк, а с 5 уровня начинают падать тренировочные фишки.",
    en: "Spend awareness on a chest. Inside: experience, cashback, and from level 5 training chips start dropping.",
  },
  "hallway.tutorial_marathon_title": { ru: "Марафон 30 дней", en: "30-day marathon" },
  "hallway.tutorial_marathon_text": {
    ru: "Заходи каждый день за наградой — она растёт к концу недели. Пропустишь день — прогресс марафона сбросится на начало.",
    en: "Come back every day for a reward — it grows toward the end of the week. Miss a day and the marathon resets to the start.",
  },
  "hallway.tutorial_goal_title": { ru: "Собери 10 фишек → игра", en: "Collect 10 chips → game" },
  "hallway.tutorial_goal_text": {
    ru: "Твоя цель — собрать 10 тренировочных фишек, тогда ты сможешь перейти к битве с боссом за реальные награды. Твои тренировочные фишки можно будет обменять на золото.",
    en: "Your goal is to collect 10 training chips, then you can move on to the boss fight for real rewards. Your training chips can later be swapped for gold.",
  },
  "hallway.tour_step_counter": { ru: "Шаг {n} из {total}", en: "Step {n} of {total}" },
  "hallway.tour_skip_aria": { ru: "Пропустить", en: "Skip" },
  "hallway.tour_next_aria": { ru: "Далее", en: "Next" },
  "hallway.back": { ru: "Назад", en: "Back" },
  "hallway.tour_done": { ru: "Понятно, погнали", en: "Got it, let's go" },
  "hallway.tour_next": { ru: "Далее", en: "Next" },
  "hallway.toast_payment_ok": {
    ru: "Оплата прошла — начисляем фишки…",
    en: "Payment received — crediting chips…",
  },
  "hallway.toast_payment_failed": { ru: "Оплата не прошла", en: "Payment failed" },
  "hallway.toast_stars_only_tg": {
    ru: "Оплата звёздами — только в приложении Telegram (обнови до свежей версии)",
    en: "Star payments work only in the Telegram app (update to the latest version)",
  },
  "hallway.toast_stars_unavailable": {
    ru: "Оплата звёздами недоступна в этом Telegram",
    en: "Star payments aren't available in this Telegram",
  },
  "hallway.shop_coming_soon": {
    ru: "Магазин скоро — покупка фишек за ⭐ появится здесь.",
    en: "Shop coming soon — buying chips for ⭐ will appear here.",
  },
  "hallway.offer_random": { ru: "· случайные", en: "· random" },
  "hallway.offer_count": { ru: "· {count} шт", en: "· {count} pcs" },
  "hallway.soon": { ru: "Скоро", en: "Soon" },
  "hallway.reveal_title": { ru: "Ты получил!", en: "You got!" },
  "hallway.reveal_count": { ru: "{count} тренировочных фишек", en: "{count} training chips" },
  "hallway.claim": { ru: "Забрать", en: "Claim" },
};
