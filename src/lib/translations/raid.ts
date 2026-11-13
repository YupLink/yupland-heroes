import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: Рейд
// Часть src/lib/translations.ts — разбита на субдомены.
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {
  // ────────── рейд-локации ──────────
  "raid.title": { ru: "Рейд", en: "Raid" },
  "raid.pick_week_location": {
    ru: "Выбери локацию на эту неделю",
    en: "Pick a location for this week",
  },
  "raid.no_locations": {
    ru: "Нет активных локаций. Создай их в админке (Рейд-локации).",
    en: "No active locations. Create them in the admin panel (Raid locations).",
  },
  "raid.no_active_locations": { ru: "Нет активных локаций.", en: "No active locations." },
  "raid.back": { ru: "Назад", en: "Back" },
  "raid.forward": { ru: "Вперёд", en: "Forward" },
  "raid.map": { ru: "Карта", en: "Map" },
  "raid.full_map": { ru: "Вся карта", en: "Full map" },
  "raid.close": { ru: "Закрыть", en: "Close" },
  "raid.close_map": { ru: "Закрыть карту", en: "Close map" },
  "raid.unexplored": { ru: "Не разведано", en: "Unexplored" },
  "raid.you_here": { ru: "ты тут", en: "you're here" },
  "raid.you_are_here": { ru: "ты здесь", en: "you are here" },
  "raid.here_btn": { ru: "Ты здесь", en: "You are here" },
  "raid.fork_leads_to": { ru: "развилка ведёт в:", en: "fork leads to:" },
  "raid.fork_choose": { ru: "Развилка — выбери локацию", en: "Fork — choose a location" },
  "raid.fork_branch_here": {
    ru: "Развилка — здесь ветвление на локации",
    en: "Fork — the location branches here",
  },
  "raid.no_paths": { ru: "Пути пока не настроены.", en: "Paths aren't set up yet." },
  "raid.on_location": { ru: "На локации: {n}", en: "On location: {n}" },
  "raid.go": { ru: "Перейти", en: "Go" },
  "raid.traveling": { ru: "Переход…", en: "Traveling…" },
  "raid.alive_boss_ahead": { ru: "Впереди живой босс", en: "A live boss is ahead" },
  "raid.low_energy": { ru: "Мало энергии (нужно {n})", en: "Low energy (need {n})" },
  "raid.travel_spent": { ru: "Переход · −{n}⚡", en: "Travel · −{n}⚡" },
  "raid.already_here": { ru: "Ты уже здесь", en: "You're already here" },
  "raid.fork_suffix": { ru: " · развилка", en: " · fork" },
  "raid.final_suffix": { ru: " · финал", en: " · final" },
  "raid.defeated": { ru: "повержен", en: "defeated" },
  "raid.defeated_check": { ru: "Повержен ✓", en: "Defeated ✓" },
  "raid.hp_pct": { ru: "{n}% HP", en: "{n}% HP" },
  "raid.top_n": { ru: "· топ-{n}", en: "· top {n}" },
  "raid.up_to_place": { ru: "· до места {n}", en: "· up to place {n}" },
  "raid.boss": { ru: "Босс", en: "Boss" },
  "raid.boss_hp": { ru: "HP босса", en: "Boss HP" },
  "raid.boss_rewards": { ru: "Награды за босса", en: "Boss rewards" },
  "raid.by_place": { ru: "· по местам", en: "· by place" },
  "raid.pool_split_top": {
    ru: "Фонд делится на топ-{n} по урону",
    en: "Pool splits between top {n} by damage",
  },
  "raid.tournament": { ru: "Турнир", en: "Tournament" },
  "raid.nobody_fought_boss": {
    ru: "Пока никто не бил этого босса.",
    en: "Nobody has fought this boss yet.",
  },
  "raid.you_suffix": { ru: " · ты", en: " · you" },
  "raid.defeated_bosses": { ru: "Побеждённые", en: "Defeated" },
  "raid.defeated_empty": {
    ru: "Здесь появятся побеждённые боссы локации — твои места и награды.",
    en: "Defeated location bosses will appear here — your places and rewards.",
  },
  "raid.not_fought": { ru: "не бил", en: "not fought" },
  "raid.no_reward": { ru: "награды нет", en: "no rewards" },
  "raid.chest": { ru: "Сундук", en: "Chest" },
  "raid.chest_op": { ru: "OP-сундук", en: "OP chest" },
  "raid.opening": { ru: "Открываю…", en: "Opening…" },
  "raid.open_chest": { ru: "Открыть сундук", en: "Open chest" },
  "raid.already_opened": { ru: "Уже открыт", en: "Already opened" },
  "raid.chest_pack": { ru: "Сундук: пак!", en: "Chest: a pack!" },
  "raid.chest_reward": { ru: "Сундук: +{amount} {kind}", en: "Chest: +{amount} {kind}" },
  "raid.build_squad": { ru: "Собери отряд", en: "Build a squad" },
  "raid.attack": { ru: "Атаковать", en: "Attack" },
  "raid.fighting": { ru: "Бой…", en: "Fighting…" },
  "raid.fight_error": { ru: "Ошибка боя", en: "Fight error" },
  "raid.boss_defeated_excl": { ru: "Босс повержен!", en: "Boss defeated!" },
  "raid.fight_over": { ru: "Бой окончен", en: "Fight over" },
  "raid.go_forward_hint": {
    ru: "Иди вперёд — дальше по цепочке",
    en: "Move forward — onward down the chain",
  },
  "raid.damage_dealt": { ru: "Нанесённый урон", en: "Damage dealt" },
  "raid.ok": { ru: "Ок", en: "OK" },
  "raid.claiming": { ru: "Забираю…", en: "Claiming…" },
  "raid.claim_reward": { ru: "Забрать награду ({n})", en: "Claim reward ({n})" },
  "raid.claimed_n": { ru: "Забрано наград: {n}", en: "Rewards claimed: {n}" },
  "raid.diff_newbie": { ru: "Новичок", en: "Newbie" },
  "raid.diff_medium": { ru: "Средне", en: "Medium" },
  "raid.diff_hard": { ru: "Сложно", en: "Hard" },
  "raid.loc_tournament": { ru: "Лидеры локации", en: "Location leaders" },
  "raid.place_gets": { ru: "Место {n}", en: "Place {n}" },
  "raid.you_label": { ru: "ты", en: "you" },
  // Награда осталась в очереди: вид известен, а ссылки на предмет/ресурс в
  // строке нет (старая запись или снятый из справочника товар).
  "raid.reward_bad_ref": {
    ru: "Одну награду выдать не удалось — она осталась в очереди",
    en: "One reward could not be delivered — it stays in the queue",
  },
  "raid.no_damage_yet": {
    ru: "Пока никто не бил в этой локации.",
    en: "Nobody has fought in this location yet.",
  },

  // ── восстановлено после декомпозиции (потерялись при разбиении) ──
  "raid.loc_tournament_hint": {
    ru: "Суммарный урон по всей локации · награды в конце недели",
    en: "Total damage across the whole location · rewards at week's end",
  },
};
