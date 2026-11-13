import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Отказы шахт v2 (ПРАВИЛА §8.59): поломка, починка, смена режима. Сервер
// бросает ключом (mine-v2.ts, mine-v2-read.ts), humanError переводит. Тексты
// окна шахты — отдельно, здесь только причины отказа.
export const dict: Record<string, Entry> = {
  "braid.mine_broken": {
    ru: "Шахта сломана — забрать её можно только починкой",
    en: "The mine is broken — only a repair can claim it",
  },
  "braid.mine_owned": {
    ru: "Шахта работает у другого игрока — её можно только отбить",
    en: "Another player's mine is running — you can only seize it",
  },
  "braid.mine_not_v2": {
    ru: "Эту шахту не чинят и режим у неё не меняется",
    en: "This mine can't be repaired or switched to another mode",
  },
  "braid.mine_repair_no_res": {
    ru: "Не хватает ресурсов на починку",
    en: "Not enough resources for the repair",
  },
  "braid.mine_short_wood": {
    ru: "Не хватает дерева на починку: нужно {n}, у тебя {have}",
    en: "Not enough wood for the repair: need {n}, you have {have}",
  },
  "braid.mine_short_stone": {
    ru: "Не хватает камня на починку: нужно {n}, у тебя {have}",
    en: "Not enough stone for the repair: need {n}, you have {have}",
  },
  "braid.mine_short_gold": {
    ru: "Не хватает золота на починку: нужно {n}, у тебя {have}",
    en: "Not enough gold for the repair: need {n}, you have {have}",
  },
  "braid.mine_short_diamonds": {
    ru: "Не хватает алмазов на починку: нужно {n}, у тебя {have}",
    en: "Not enough diamonds for the repair: need {n}, you have {have}",
  },
  // Остров новичка (§8.59 п. 11).
  "braid.mine_spent": {
    ru: "Шахта истощена — её больше не чинят",
    en: "The mine is exhausted — it can't be repaired again",
  },
  "braid.mine_island_mode": {
    ru: "На острове шахта работает только в режиме «Бережно»",
    en: "On the island a mine only runs in Steady mode",
  },
  // Разобрать (§8.70): только сломанную или ничью шахту v2, не на острове.
  "braid.mine_working": {
    ru: "Шахта работает — разобрать можно только сломанную",
    en: "The mine is running — only a broken one can be dismantled",
  },
  "braid.mine_no_dismantle": {
    ru: "Эту шахту не разбирают",
    en: "This mine can't be dismantled",
  },
  "braid.mine_gone": { ru: "Шахты здесь уже нет", en: "The mine is gone" },
  "braid.mine_island_no_guard": {
    ru: "На острове шахту не охраняют",
    en: "Island mines can't be guarded",
  },
};
