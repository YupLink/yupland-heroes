// Состав поселения жребием от сида — шаг 1 спецификации
// (docs/town-generation-algorithm.json).
//
// Владелец, 25.09.2026: «нужно, чтобы ты рандомно делал подборки». Пресет с
// вбитым набором давал один и тот же город каждый раз. Здесь состав растёт
// так, как у watabou (Model.hx): службы открываются в каноническом порядке,
// порядок слегка перемешан сидом (⌊len/10⌋ обменов соседей), а число служб
// ограничено размером — 1+⌊(N−1)/3⌋, как районы в Civ VI при 1/4/7 жителях.
// Остаток — жильё. Конкретная модель внутри роли тянется жребием без
// повторов, пока есть из чего (HoMM3 ограничивает повторы объектов).
import type { TownKind } from "@/lib/raid/zonegen/settlement-types";
import {
  canonOrder,
  FREE_OF_LIMIT,
  MIN_N,
  modelCap,
  serviceLimit,
} from "@/lib/raid/zonegen/town/canon";
import { hasRealEffect, isSmelter } from "@/lib/raid/zonegen/town/roles";
import { skinFor } from "@/lib/raid/zonegen/town/theme";
import type { RoleOption, TownPick, TownRole } from "@/lib/raid/zonegen/town/types";

export { canonOrder, modelCap, serviceLimit } from "@/lib/raid/zonegen/town/canon";

/** Жильё — 55–60 % поселения (21/36 ремесленных кварталов у watabou), ±20 % по сиду. */
const HOUSE_SHARE_LO = 0.55;
const HOUSE_SHARE_SPAN = 0.05;
const HOUSE_JITTER = 0.2;

/** Сколько разных домов на фон: восьми хватает, чтобы улица не рябила. */
const HOUSE_VARIETY = 8;

/** Один справочник — один порядок кандидатов: жребий не зависит от порядка строк БД. */
const byNameId = (a: RoleOption, b: RoleOption): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Вес модели в жребии: у шаблона с тирами и настоящим эффектом — больше
 * (у Таверны три тира, у Бара ни одного, и деревне нужна таверна).
 */
const weightOf = (o: RoleOption): number => (1 + o.tiers) * (hasRealEffect(o) ? 2 : 1);

/**
 * У модели с обликом темы вес втрое: «драконий» город тянет Таверну с
 * драконьим обликом, а не Трактир без обликов (одна тема на поселение).
 */
const THEMED = 3;

/** Взвешенный жребий из непустого списка. */
function weighted(list: RoleOption[], rnd: () => number, theme: string | null): RoleOption {
  const w = (o: RoleOption) => weightOf(o) * (skinFor(o, theme) === null ? 1 : THEMED);
  const total = list.reduce((s, o) => s + w(o), 0);
  let x = rnd() * total;
  for (const o of list) {
    x -= w(o);
    if (x < 0) return o;
  }
  return list[list.length - 1];
}

/** Жребий без повторов: сначала невзятые модели, потом повтор до потолка. */
function makeDraw(n: number, rnd: () => number, theme: string | null) {
  const used = new Map<string, number>();
  const cap = modelCap(n);
  return (pool: RoleOption[]): RoleOption | undefined => {
    const fresh = pool.filter((o) => !used.has(o.id));
    const open = fresh.length > 0 ? fresh : pool.filter((o) => (used.get(o.id) ?? 0) < cap);
    if (open.length === 0) return undefined;
    const got = weighted(open, rnd, theme);
    used.set(got.id, (used.get(got.id) ?? 0) + 1);
    return got;
  };
}

/**
 * Роли-«сердца», у которых в справочнике есть и настоящий шаблон, и картинка
 * без механики: «Ратуша» и «Храм» без meta.effect — декорации. Сердцем села
 * ставим настоящую (у неё и облики: группы «Ратуша», «Храм» привязаны к ней).
 */
const REAL_FIRST: readonly TownRole[] = ["town_hall", "temple"];

/** Опции по ролям, отсортированные; у ратуши и храма настоящая бьёт декорацию. */
function poolsOf(options: RoleOption[]): Map<TownRole, RoleOption[]> {
  const pools = new Map<TownRole, RoleOption[]>();
  for (const o of [...options].sort(byNameId)) {
    pools.set(o.role, [...(pools.get(o.role) ?? []), o]);
  }
  for (const role of REAL_FIRST) {
    const real = (pools.get(role) ?? []).filter(hasRealEffect);
    if (real.length > 0) pools.set(role, real);
  }
  return pools;
}

/**
 * В каноне кузница идёт раньше плавильни: первая «forge» — кузница, если
 * она есть в справочнике (деревенской кузнице место у луга, а плавильня
 * стоит только на внешнем кольце города).
 */
function poolFor(pools: Map<TownRole, RoleOption[]>, role: TownRole, picks: TownPick[]) {
  const pool = pools.get(role) ?? [];
  if (role !== "forge" || picks.some((p) => p.role === "forge")) return pool;
  const smithy = pool.filter((o) => !isSmelter(o));
  return smithy.length > 0 ? smithy : pool;
}

const kindOf = (f: { kind?: TownKind }): TownKind => f.kind ?? "auto";

export type ComposeFlags = {
  /** Ратуша в составе: решает вызывающий (форма town/port или N > 20). */
  hall: boolean;
  /** Хотя бы одна лавка — сразу за ратушей (город мира без неё не торгует). */
  shop?: boolean;
  theme: string | null;
  /** Соль для выбора облика среди нескольких одной темы. */
  salt?: number;
  /** Заказ шаблона: правит канон служб (canon.ts). */
  kind?: TownKind;
};

/**
 * Случайная подборка на N построек. Порядок выхода: ратуша, службы по канону,
 * лавки сверх лимита, дома. Где встанет каждая — решает зонирование.
 */
export function composeRandom(
  n: number,
  options: RoleOption[],
  hasWater: boolean,
  rnd: () => number,
  flags: ComposeFlags = { hall: false, theme: null },
): TownPick[] {
  const total = Math.max(0, Math.floor(n));
  const pools = poolsOf(options);
  const draw = makeDraw(total, rnd, flags.theme);
  const picks: TownPick[] = [];
  const add = (role: TownRole, option: RoleOption | undefined): boolean => {
    if (option === undefined) return false;
    picks.push({ role, option, skinId: skinFor(option, flags.theme, flags.salt) });
    return true;
  };
  if (total === 0) return picks;
  if (flags.hall) add("town_hall", draw(pools.get("town_hall") ?? []));
  if (flags.shop && kindOf(flags) !== "hamlet") add("market", draw(pools.get("market") ?? []));

  // Жильё считаем заранее: без него службы съели бы всё поселение.
  const housing = [...(pools.get("house") ?? []), ...(pools.get("chambers") ?? [])];
  const homePool = [...housing, ...(pools.get("market") ?? [])];
  const share = (HOUSE_SHARE_LO + HOUSE_SHARE_SPAN * rnd()) * (1 + HOUSE_JITTER * (2 * rnd() - 1));
  const homes = homePool.length === 0 ? 0 : Math.round(total * share);
  const slots = Math.max(0, total - picks.length - homes);

  const limit = serviceLimit(total);
  let counted = 0;
  let services = 0;
  const kind = flags.kind ?? "auto";
  for (const role of canonOrder(hasWater, rnd, kind)) {
    if (services >= slots) break;
    if ((MIN_N[role] ?? 0) > total) continue;
    const free = FREE_OF_LIMIT.has(role);
    if (!free && counted >= limit) continue;
    if (!add(role, draw(poolFor(pools, role, picks)))) continue;
    services++;
    if (!free) counted++;
  }
  // Сверх лимита — лавки (правило покрытия, шаг 10); кончились — в жильё.
  // У хутора лавок нет вовсе: рынок — центральная функция (Кристаллер).
  let rest = total - picks.length - homes;
  const shops = kind === "hamlet" ? [] : (pools.get("market") ?? []);
  while (rest > 0 && add("market", draw(shops))) rest--;
  addHomes(homes + rest, housing, homePool, draw, rnd, add);
  return picks;
}

/**
 * Фон: сперва выбираем до восьми разных домов (сначала настоящие дома и
 * покои, лавками добиваем), потом раскладываем по ним жильё без повторов,
 * пока есть из чего, и с повтором до потолка модели.
 */
function addHomes(
  count: number,
  housing: RoleOption[],
  homePool: RoleOption[],
  draw: (pool: RoleOption[]) => RoleOption | undefined,
  rnd: () => number,
  add: (role: TownRole, option: RoleOption | undefined) => boolean,
): void {
  if (count <= 0 || homePool.length === 0) return;
  const variety = Math.max(HOUSE_VARIETY, Math.ceil(count / 2));
  const chosen: RoleOption[] = [];
  const left = [...housing];
  const shops = homePool.filter((o) => !housing.includes(o));
  while (chosen.length < variety && (left.length > 0 || shops.length > 0)) {
    const from = left.length > 0 ? left : shops;
    const at = Math.floor(rnd() * from.length);
    chosen.push(from.splice(at, 1)[0]);
  }
  for (let i = 0; i < count; i++) {
    // Покои — это «Дом» владельца (группа обликов «Дом»): в городе они
    // остаются покоями знати и тянутся к ядру; прочее — простые дома.
    const got = draw(chosen) ?? draw(homePool);
    if (got === undefined) return;
    add(got.role === "chambers" ? "chambers" : "house", got);
  }
}

/**
 * Ручной состав (автоподбор выключен): точные штуки — как заказано, фон
 * добивает до n построек по кругу. Роль у точных строк — своя (таверна
 * встанет у ворот), у фона — «дом».
 */
export function manualCompose(
  manual: Array<{ buildingId: string; count: number; fill?: boolean }>,
  options: RoleOption[],
  n = 0,
  theme: string | null = null,
  salt = 0,
): TownPick[] {
  const byId = new Map(options.map((o) => [o.id, o]));
  const picks: TownPick[] = [];
  const fill: RoleOption[] = [];
  for (const row of manual) {
    const option = byId.get(row.buildingId);
    if (option === undefined) continue;
    const skinId = skinFor(option, theme, salt);
    for (let i = 0; i < row.count; i++) picks.push({ role: option.role, option, skinId });
    if (row.fill === true) fill.push(option);
  }
  for (let i = 0; fill.length > 0 && picks.length < n; i++) {
    const option = fill[i % fill.length];
    picks.push({ role: "house", option, skinId: skinFor(option, theme, salt) });
  }
  return picks;
}
