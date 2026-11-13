// Список вкладок панели «$ Экономика». Вынесен из EconomyPanel, чтобы тот
// остался ≤250 строк, когда вкладок стало восемь.
//
// Четыре старые вкладки — «сводка» (один запрос getEconomyOverview на всех,
// подписи по-русски и не переводятся — так решено). Четыре новые — отчёты
// «как на ладони» с окном EconRange, каждая со своим запросом и подписью
// через словарь econ.*.
import type { EconomyPeriod } from "@/server/api/beta-raid/admin-economy-types";

export type EconomyTab =
  | "goods"
  | "players"
  | "towns"
  | "prices"
  | "delta"
  | "resource"
  | "trades"
  | "loopholes"
  | "news"
  | "refs"
  | "chain"
  | "treasure";

/** label — готовая русская подпись сводки; labelKey — ключ словаря econ.*. */
export type EconomyTabDef = { key: EconomyTab } & ({ label: string } | { labelKey: string });

export const ECONOMY_TABS: EconomyTabDef[] = [
  { key: "goods", label: "Товары" },
  { key: "players", label: "Игроки" },
  { key: "towns", label: "Города" },
  { key: "prices", label: "Дёшево / Дорого" },
  { key: "delta", labelKey: "econ.tab.delta" },
  { key: "resource", labelKey: "econ.tab.resource" },
  { key: "trades", labelKey: "econ.tab.trades" },
  { key: "loopholes", labelKey: "econ.tab.loopholes" },
  { key: "news", labelKey: "econ.tab.news" },
  { key: "refs", labelKey: "econ.tab.refs" },
  { key: "chain", labelKey: "econ.tab.chain" },
  { key: "treasure", labelKey: "econ.tab.treasure" },
];

const OVERVIEW_TABS: ReadonlySet<EconomyTab> = new Set(["goods", "players", "towns", "prices"]);

/** Вкладка сводки — питается от getEconomyOverview({ period }). */
export function isOverviewTab(tab: EconomyTab): boolean {
  return OVERVIEW_TABS.has(tab);
}

export function tabLabel(def: EconomyTabDef, t: (key: string) => string): string {
  return "labelKey" in def ? t(def.labelKey) : def.label;
}

/** Пресеты периода — подписи старые, русские, как и вся сводка. */
export const ECONOMY_PERIODS: Array<{ key: EconomyPeriod; label: string }> = [
  { key: "24h", label: "24 ч" },
  { key: "7d", label: "7 дн" },
  { key: "30d", label: "30 дн" },
];

export function periodLabel(p: EconomyPeriod): string {
  return ECONOMY_PERIODS.find((x) => x.key === p)?.label ?? p;
}
