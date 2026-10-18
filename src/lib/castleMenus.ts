export type Lang = "ru" | "en";
export const destinations = [
  "tavern",
  "barracks",
  "treasury",
  "hall",
  "notice",
  "gates",
  "shop",
  "market",
  "glory",
  // Храм и Склад встали на место Таверны и Казны (владелец, 07.10.2026):
  // таверна — у любой таверны в мире, казна — в профиле.
  "temple",
  "warehouse",
] as const;
export type Destination = (typeof destinations)[number];
export type Bindings = Record<string, Destination | "">;
export type SampleState = "ready" | "loading" | "empty" | "error";
export const titles: Record<Destination | "account" | "referrals", [string, string]> = {
  tavern: ["Таверна", "Tavern"],
  barracks: ["Тренировочный лагерь", "Training camp"],
  treasury: ["Казна", "Treasury"],
  hall: ["Ратуша", "Town hall"],
  notice: ["Задание", "Task"],
  gates: ["Выход в мир", "Exit to world"],
  shop: ["Торговый дом", "Trading house"],
  market: ["Рынок", "Market"],
  glory: ["Слава", "Glory"],
  temple: ["Храм", "Temple"],
  warehouse: ["Склад", "Warehouse"],
  account: ["Аккаунт и настройки", "Account and settings"],
  referrals: ["Рефералы", "Referrals"],
};
export function label(key: keyof typeof titles, lang: Lang) {
  return titles[key][lang === "ru" ? 0 : 1];
}
// Pure selector: an arbitrary cell of a merged building resolves to the lead building.
export function buildingAt(
  cells: Record<string, { buildingId: string | null; groupId: string | null }>,
  key: string,
) {
  const cell = cells[key];
  if (!cell) return null;
  if (cell.groupId)
    return Object.values(cells).find((c) => c.groupId === cell.groupId)?.buildingId ?? null;
  return cell.buildingId;
}
