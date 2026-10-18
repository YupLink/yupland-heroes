// Откуда берутся очки каждой категории турнира — в одном месте.
//
// Пути (слово владельца 03.10.2026):
//  • живые — хук прямо в месте события (рубка, шаг): noteTournament;
//  • журнальные — фоновая подтяжка из журналов: урон и убийства боссов из
//    beta_raid_object_run, дерево и камень из res_ledger (только добыча, не
//    покупки); дерево и камень ещё получают живые очки — брёвна от топора и
//    добытое киркой (decor-interact → tour-hooks);
//  • прибыль — «Золото»: только прибыль с продаж за золото по журналу сделок
//    (goldProfit.ts, tour-profit.ts);
//  • снимок — фарм: раз в сутки от старта, 1 балл = 1 шахта во владении;
//  • своё — турнир рыбаков (12.10.2026): улов — живой хук в выдаче улова
//    (fishing-note), продажа рыбы (своей и купленной в плюс) и выпитые свои
//    зелья — штучный учёт по журналу сделок (pieceFlow.ts, tour-own.ts).
//
// Списки видов res_ledger — константы ниже: поменять, что считается «добычей»,
// можно одной строкой, и сервер, и тесты увидят это сразу.
import type { TourMetric } from "@/lib/tournament/types";

export type TourSource = "live" | "run" | "res" | "trade" | "farm" | "own";

/** Категория → путь, которым приходят её очки. */
export const TOUR_SOURCE: Record<TourMetric, TourSource> = {
  damage: "run",
  boss_kills: "run",
  gold: "trade",
  wood: "res",
  stone: "res",
  chop: "live",
  steps: "live",
  step_energy: "live",
  farm: "farm",
  fish_catch: "live",
  fish_sell: "own",
  potion_drink: "own",
};

/** Ресурс res_ledger для ресурсных категорий. */
export const TOUR_RESOURCE: Partial<Record<TourMetric, string>> = {
  wood: "wood",
  stone: "stone",
};

/**
 * Виды res_ledger, которые считаются ДОХОДОМ ресурса (добыча): моб, награда,
 * шахта, грядка. Всё остальное — покупки и перекладывания (market_buy,
 * market_sell, town-*, gift, wh_take, portal*, *refund, transfer*, призы
 * турниров) — не считается.
 */
export const TOUR_INCOME_KINDS: readonly string[] = ["mob", "reward", "mine", "field"];

/**
 * Префиксы ref, которые не считаются даже внутри видов дохода: 'mystic:' —
 * открытие купленного мистического пака (вид reward, но это покупка).
 */
export const TOUR_INCOME_SKIP_REFS: readonly string[] = ["mystic:"];

/** Строка журнала ресурсов — доход для турнира? Зеркало SQL-условия (тесты). */
export function isTourIncome(kind: string, ref: string | null, delta: number): boolean {
  if (!(delta > 0) || !TOUR_INCOME_KINDS.includes(kind)) return false;
  const r = ref ?? "";
  return !TOUR_INCOME_SKIP_REFS.some((p) => r.startsWith(p));
}

/**
 * «Срубил дерево» — рубка декора топором. Признака «топор» у товара в базе нет
 * (проверено 03.10: у декора с инструментом только «Каменный Топор» и
 * «Каменная Кирка»), поэтому узнаём по имени инструмента.
 */
export const isAxeTool = (name: string | null | undefined): boolean =>
  /топор|axe/i.test(String(name ?? ""));

/** Кирка — её камни идут в «Камень» (владелец, 03.10.2026). */
export const isPickTool = (name: string | null | undefined): boolean =>
  /кирк|pick/i.test(String(name ?? ""));

/**
 * Что из выданного рубкой — дерево и камень (владелец: «брёвна от топора»,
 * «камни от кирки»). Топор даёт и бананы, шишки, монетки с дерева Изобилия —
 * это не дерево; кирка — песок, пыльцу, слитки золота — это не камни. По имени
 * товара: брёвна — «Бревна/Брёвна …», камни — «камень», «руда».
 */
export const isLogItem = (name: string | null | undefined): boolean =>
  /бр[её]вн|\blogs?\b/i.test(String(name ?? ""));
export const isStoneItem = (name: string | null | undefined): boolean =>
  /камен|камн|руд[аы]|\bstones?\b|\bores?\b|\brocks?\b/i.test(String(name ?? ""));

export const TOUR_DAY_MS = 24 * 60 * 60 * 1000;

/** Час и минута суточного снимка фарма, UTC (владелец, 04.10.2026: «в 23:59 по UTC»). */
export const TOUR_FARM_SNAP_UTC = { h: 23, m: 59 };

/**
 * Сколько суточных снимков фарма уже положено. Снимок — каждый день в 23:59
 * UTC, если этот момент внутри турнира: [старт, конец]. В последний день
 * сначала снимок, потом конец — неделя с ПН 00:00 до ВС 23:59 даёт ровно 7.
 * Финиш делает последнюю подтяжку до подведения итогов, так что снимок в
 * момент конца не теряется. days — не используется (сутки считаются по часам).
 */
export function farmSnapshotsDue(o: {
  startedMs: number;
  endsMs: number;
  nowMs: number;
  days?: number;
}): number {
  const until = Math.min(o.nowMs, o.endsMs);
  if (!Number.isFinite(o.startedMs) || !Number.isFinite(until)) return 0;
  const d = new Date(o.startedMs);
  let first = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    TOUR_FARM_SNAP_UTC.h,
    TOUR_FARM_SNAP_UTC.m,
  );
  if (first < o.startedMs) first += TOUR_DAY_MS;
  if (until < first) return 0;
  return Math.floor((until - first) / TOUR_DAY_MS) + 1;
}
