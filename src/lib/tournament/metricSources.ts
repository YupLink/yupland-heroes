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
//  • снимок — фарм: раз в сутки за минуту до конца по UTC, 1 балл = 1 шахта
//    во владении;
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

/**
 * Снимок фарма — каждый день за минуту до конца турнира, по UTC (владелец,
 * 07.11.2026: «конец турнира в 10 ютц — снимки каждый день в 9:59 по ютц,
 * пока турнир не закончится»; до того — в 23:59 UTC).
 */
export const TOUR_FARM_SNAP_LEAD_MS = 60_000;

/**
 * Назначенный конец — от него время снимков. Тот же выбор, что у старта
 * (tour-start.startSql): end_at, если он позже начала, иначе начало + N
 * дней. «Остановить» сдвигает ends_at, но не время снимков.
 */
export function farmPlanEndMs(o: {
  startedMs: number;
  endAtMs: number | null;
  days: number;
}): number {
  if (o.endAtMs != null && o.endAtMs > o.startedMs) return o.endAtMs;
  return o.startedMs + Math.max(0, Number(o.days) || 0) * TOUR_DAY_MS;
}

/**
 * Сколько суточных снимков фарма уже положено. Снимок — каждый день в
 * (назначенный конец − 1 мин) по UTC, если этот момент внутри турнира:
 * [старт, конец]. Последний — за минуту до конца; турнир с 18:00 по 10:00
 * через трое суток даёт 3 снимка (09:59). Финиш делает последнюю подтяжку до
 * подведения итогов, так что снимок перед концом не теряется. Остановили
 * раньше — только наступившие до остановки.
 */
export function farmSnapshotsDue(o: {
  startedMs: number;
  endsMs: number;
  nowMs: number;
  /** Назначенный конец (farmPlanEndMs); нет — ends_at. */
  planEndMs?: number;
}): number {
  const last = (o.planEndMs ?? o.endsMs) - TOUR_FARM_SNAP_LEAD_MS;
  const until = Math.min(o.nowMs, o.endsMs, last);
  if (!Number.isFinite(o.startedMs) || !Number.isFinite(until) || last < o.startedMs) return 0;
  const first = last - Math.floor((last - o.startedMs) / TOUR_DAY_MS) * TOUR_DAY_MS;
  if (until < first) return 0;
  return Math.floor((until - first) / TOUR_DAY_MS) + 1;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * Время снимка «09:59» (UTC) для условий на плашке. Конец турнира = end_at,
 * если он позже начала, иначе начало + N дней — то же время суток, что у
 * начала. Нет ни начала, ни конца — null.
 */
export function farmSnapClock(t: {
  startedAt: string | null;
  startAt: string | null;
  endAt: string | null;
}): string | null {
  const ms = (v: string | null) => (v ? Date.parse(v) : NaN);
  const base = ms(t.startedAt ?? t.startAt);
  const end = ms(t.endAt);
  const plan = Number.isFinite(end) && !(end <= base) ? end : base;
  if (!Number.isFinite(plan)) return null;
  const d = new Date(plan - TOUR_FARM_SNAP_LEAD_MS);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}
