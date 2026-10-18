// Что перечитать после удара или подбора (useBetaEncounter).
//
// Лёгкое и то, что видно над картой (состояние, энергия, награды), — всегда и
// даже неактивным запросам: во время окна боя они числятся неактивными, и без
// этого эффекты и плашка наград появлялись только после перезагрузки.
//
// Тяжёлое — инвентарь фишек (~300 КБ) и снаряжение героя (~150 КБ) — только
// когда удар их и правда менял, и только у открытых экранов (закрытые помечены
// устаревшими и перечитаются при открытии). Раньше оба уходили после КАЖДОГО
// подбора монетки, даже без открытого экрана: 12 тыс. и 9,5 тыс. запросов в
// сутки, 3,6 и 1,4 ГБ на телефоны (замер 11.10.2026).
import type { AttackResult } from "./useBetaEncounter";

const ALWAYS = [
  ["beta-raid-state"],
  ["beta-encounter-top"],
  ["my-energy"],
  ["yupland-status"],
  // Награда не начисляется молча — она встаёт в очередь над картой.
  ["raid-pending-rewards"],
];

/** Награды, которые ложатся в инвентарь предметов (артефакты, герои, свой товар). */
const ITEM_KINDS = new Set(["item", "artifact", "hero", "custom"]);

type Hit = Pick<AttackResult, "pickup" | "kind" | "rewards" | "chipEffects" | "wiped">;

/** Награда ждёт в «Добыче» (не свой товар, легший в рюкзак). */
const inHarvest = (x: Hit["rewards"][number]) => x.kind !== "custom" || !!x.queued;

export function attackRefreshKeys(r: Hit): { all: string[][]; active: string[][] } {
  const active: string[][] = [];
  // Пак, артефакт, токены встали в «Добычу» — кружок и окно сразу, а не через
  // двухминутный опрос: «победил босса — ничего не произошло» (владелец, 16.10).
  const all = (r.rewards ?? []).some(inHarvest) ? [...ALWAYS, ["beta-raid-harvest"]] : ALWAYS;
  // Фишки меняет только бой: оглушение, яд, разгром отряда. Подбор — никогда.
  if (!r.pickup || (r.chipEffects?.length ?? 0) > 0 || r.wiped) active.push(["my-chip-inventory"]);
  // Предметы и снаряжение — когда взяли артефакт, героя или товар, или был бой.
  const items = r.kind === "artifact" || (r.rewards ?? []).some((x) => ITEM_KINDS.has(x.kind));
  if (!r.pickup || items) active.push(["my-game-items"], ["my-hero-gear"]);
  return { all, active };
}
