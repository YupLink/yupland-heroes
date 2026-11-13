import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Долг за дыру грядки (владелец, 13.11.2026; ПРАВИЛА §8.129).
export const dict: Record<string, Entry> = {
  "debt.withdrawClosed": {
    ru: "Вывод закрыт, пока не отдан долг",
    en: "Withdrawals are closed until the debt is paid",
  },
  "debt.goldSwapClosed": {
    ru: "Пока есть долг, золото на монеты менять нельзя — только монеты на золото",
    en: "While you have a debt, gold can't be swapped for coins — only coins for gold",
  },
  "debt.none": { ru: "Долга нет", en: "No debt" },
  "debt.notEnoughGold": { ru: "Не хватает золота", en: "Not enough gold" },
};
