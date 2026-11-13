import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: PvP
// Часть src/lib/translations.ts — разбита на субдомены.
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {
  // ────────── pvp ──────────
  "pvp.title": { ru: "PvP — бои фишек", en: "PvP — Chip Battles" },
  "pvp.tab_all": { ru: "Все", en: "All" },
  "pvp.tab_mine": { ru: "Мои", en: "Mine" },
  "pvp.tab_history": { ru: "История", en: "History" },
  "pvp.refresh": { ru: "Обновить", en: "Refresh" },
  "pvp.empty_open": {
    ru: "Пока никто не бросил вызов. Создай первый!",
    en: "No one has thrown down a challenge yet. Be the first!",
  },
  "pvp.you_suffix": { ru: " · ты", en: " · you" },
  "pvp.waiting_opponent": { ru: "Ждёт соперника", en: "Waiting for opponent" },
  "pvp.accepting_bets": { ru: "Принимаю ставки", en: "Accepting bets" },
  "pvp.accept": { ru: "Принять", en: "Accept" },
  "pvp.create_banner": {
    ru: "Создай игру и сделай свою ставку!",
    en: "Create a game and place your bet!",
  },
  "pvp.pick_chips": { ru: "выбери фишки", en: "pick chips" },
  "pvp.challenge_withdrawn": { ru: "Вызов отозван", en: "Challenge withdrawn" },
  "pvp.empty_mine": { ru: "Ты ещё не создавал ставок.", en: "You haven't created any bets yet." },
  "pvp.withdraw": { ru: "Отозвать", en: "Withdraw" },
  "pvp.withdraw_confirm": { ru: "Отозвать вызов?", en: "Withdraw challenge?" },
  "pvp.empty_history": { ru: "Ещё не дрался.", en: "No battles yet." },
  "pvp.outcome_win": { ru: "Победа", en: "Win" },
  "pvp.outcome_loss": { ru: "Поражение", en: "Loss" },
  "pvp.outcome_draw": { ru: "Ничья", en: "Draw" },
  "pvp.draws_short": { ru: "(нич. {n})", en: "({n} draws)" },
  "pvp.you": { ru: "ты", en: "you" },
  "pvp.power_label": { ru: "сила", en: "power" },
  "pvp.draw": { ru: "ничья", en: "draw" },
  "pvp.win": { ru: "победа", en: "win" },
  "pvp.loss": { ru: "поражение", en: "loss" },
  "pvp.bet_created": { ru: "Ставка создана", en: "Bet created" },
  "pvp.make_bet": { ru: "Сделай ставку", en: "Place your bet" },
  "pvp.bet_lock_hint": {
    ru: "Выбранные фишки залочатся пока соперник не примет вызов.",
    en: "The selected chips will be locked until an opponent accepts the challenge.",
  },
  "pvp.no_chips_for_bet": { ru: "Нет фишек для ставки.", en: "No chips to bet." },
  "pvp.create_bet": { ru: "Создать ставку ({n})", en: "Create bet ({n})" },
  "pvp.battle_played": { ru: "Бой отыгран", en: "Battle played" },
  "pvp.done": { ru: "Готово", en: "Done" },
  "pvp.accept_challenge": { ru: "Принять вызов", en: "Accept challenge" },
  "pvp.opponent_lineup": { ru: "Состав соперника", en: "Opponent's lineup" },
  "pvp.pairing_hint": {
    ru: "Пары будут составлены по уровням: 3★ против 3★, 1★ против 1★ и т.д.",
    en: "Pairs are matched by level: 3★ vs 3★, 1★ vs 1★, and so on.",
  },
  "pvp.no_chips": { ru: "Нет фишек.", en: "No chips." },
  "pvp.your_lineup": { ru: "Твой состав", en: "Your lineup" },
  "pvp.go_battle": { ru: "В бой", en: "Fight" },
  "pvp.lineup_mismatch": { ru: "Состав не совпадает", en: "Lineup doesn't match" },
  "pvp.draws_abbr": { ru: "нич.", en: "draws" },
  "pvp.result_summary": {
    ru: "Ты забрал {won} фишку · отдал {lost}",
    en: "You took {won} chip(s) · lost {lost}",
  },
  "pvp.pair_label": { ru: "Пара {n}", en: "Pair {n}" },
  "pvp.yours": { ru: "твоя", en: "yours" },
  "pvp.loss_abbr": { ru: "пораж.", en: "loss" },
  "pvp.opponent": { ru: "соперник", en: "opponent" },
  "pvp.chip_won": { ru: "→ фишка соперника твоя", en: "→ opponent's chip is yours" },
  "pvp.chip_lost": { ru: "→ твоя фишка ушла сопернику", en: "→ your chip went to the opponent" },
  "pvp.power_by_level": { ru: "Сила по уровню", en: "Power by level" },
  "pvp.power_range": { ru: "сила {min}–{max}", en: "power {min}–{max}" },
  "pvp.rules_warning": {
    ru: "В PvP можно выиграть или проиграть фишки. Будь осторожен!",
    en: "In PvP you can win or lose chips. Be careful!",
  },
  "pvp.ok": { ru: "ОК", en: "OK" },
};
