// Интерес клетки для роли — шаг 9 и таблица zoning спецификации
// (docs/town-generation-algorithm.json).
//
// Формула Emilien 2012: I = 0 при любом вето, иначе max(0, Σwᵢfᵢ). Вето — это
// жёсткие правила соседства из реальных городов: ратуша посреди Рынка
// (Краков, Вроцлав), храм по диагонали к площади (бастиды), таверна у ворот
// (Смитфилд, GateWard у watabou), склад у въезда и причала (Любек, Брюгген),
// верфь на краю у воды (Арсенал), два одинаковых рынка не соприкасаются
// (watabou), вонючее ремесло — к краю и к воде (кожевни Нёрдлингена).
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { dPlaza, frontsMain, touchesGreen, touchesPlaza } from "@/lib/raid/zonegen/town/value";
import {
  builtAround,
  craftSector,
  dCenter,
  dGate,
  dist,
  dWater,
  edgeOf,
  fValue,
  hallOf,
  nearest,
  nearestAny,
  nearestIndustry,
  sameModelAround,
  waterAround,
  type ZoneCtx,
} from "@/lib/raid/zonegen/town/zoning-ctx";
import type { TownRole } from "@/lib/raid/zonegen/town/types";

/** Вето: клетка этой роли не подходит ни при каком раскладе. */
const VETO = -1;

/** Культурный квартал: соседство с ним прибавляет университету и музею (Civ VI). */
const CULTURE: readonly TownRole[] = ["temple", "university", "museum", "chambers"];
/**
 * Тихие роли, от которых ремесло держат на ≥ 3 (кузница — не у храма). Покои
 * — «покои знати» только в городе; в деревне это просто дом владельца
 * (группа обликов «Дом»), и деревенская кузница у луга рядом с ним — норма.
 */
const QUIET: readonly TownRole[] = ["temple", "museum", "university", "chambers"];
const QUIET_VILLAGE: readonly TownRole[] = ["temple", "museum", "university"];
/** Правило пары «ремесло ≥ 3 от тихих» держится с обеих сторон (шаг 9). */
const CRAFT_GAP = 3;

/**
 * Где дома стоят вплотную (λ0 = 1): город и порт вдоль улиц, лагерь у
 * костра, Rundling (дворы кольцом вплотную), Straßendorf (шаг 1 клетка).
 * В кучевой, луговой деревне и хуторе между дворами — клетка-двор (λ0 = 2).
 */
const CLOSE_FORMS: ReadonlySet<string> = new Set(["town", "port", "camp", "round", "street"]);

const isTown = (ctx: ZoneCtx): boolean =>
  ctx.skeleton.form === "town" || ctx.skeleton.form === "port";

const rb = (ctx: ZoneCtx): number => Math.max(1, ctx.skeleton.radius);
const yes = (b: boolean): number => (b ? 1 : 0);

/** Храм: гекс-расстояние 2 от ратуши — касается площади «углом», не на оси. */
function temple(c: ZoneCell, ctx: ZoneCtx): number {
  if (nearestIndustry(c, ctx) < CRAFT_GAP) return VETO;
  const hall = hallOf(ctx);
  const main = frontsMain(c, ctx.index) ? 0.5 : 0;
  if (hall !== undefined) return dist(c, hall) === 2 ? 1 + 0.3 * fValue(c, ctx) - main : VETO;
  const d = dCenter(c, ctx);
  // Rundling: церковь вне кольца дворов, в 2–3 клетках от него.
  if (ctx.skeleton.form === "round") return d >= 3 && d <= 5 ? 1 - Math.abs(d - 4) * 0.3 : VETO;
  if (ctx.skeleton.form === "green") return 0.5 + yes(touchesGreen(c, ctx.index));
  return 1.2 - d / rb(ctx) + 0.3 * fValue(c, ctx) - main;
}

/** Рынок №1 — у площади на магистрали; №2+ — вдоль улиц ядра, одинаковые не рядом. */
function market(c: ZoneCell, ctx: ZoneCtx): number {
  if (sameModelAround(c, ctx)) return VETO;
  const main = yes(frontsMain(c, ctx.index));
  if (ctx.nth === 0) {
    // Рынок №1 — служба ядра: не дальше 3 от ратуши (Civ VI, шаг 9).
    const hall = hallOf(ctx);
    if (hall !== undefined && dist(c, hall) > 3) return VETO;
    if (ctx.skeleton.plaza.length === 0) return 1.2 - dCenter(c, ctx) / rb(ctx) + 0.5 * main;
    return 0.5 + fValue(c, ctx) + 0.8 * yes(touchesPlaza(c, ctx.index)) + 0.6 * main;
  }
  // Разные лавки держатся вместе: торговые ряды (Shambles в Йорке).
  const rows = builtAround(c, ctx, ["market"]) > 0 ? 0.3 : 0;
  const far = dPlaza(c, ctx.skeleton) > rb(ctx) / 2 ? 0.5 : 0;
  return 0.3 + fValue(c, ctx) + 0.5 * main + rows - far;
}

/** Таверна №1 — внутри ворот в 1–2 клетках; следующие — по покрытию D = 5. */
function tavern(c: ZoneCell, ctx: ZoneCtx): number {
  const g = dGate(c, ctx);
  const main = yes(frontsMain(c, ctx.index));
  if (ctx.nth === 0) {
    if (ctx.skeleton.gates.length === 0) return 0.5 + fValue(c, ctx);
    if (g > 2) return VETO;
    return 1 + 0.5 * yes(g <= 1) + 0.5 * main + 0.2 * fValue(c, ctx);
  }
  if (nearest(c, ctx, ["tavern"]) < 5) return VETO;
  return 0.5 + 0.5 * yes(g <= 2) + 0.2 * fValue(c, ctx);
}

/** Склад — на магистрали в 1–3 от ворот; в порту — первая полоса у воды. */
function warehouse(c: ZoneCell, ctx: ZoneCtx): number {
  if (ctx.skeleton.form === "port" && dWater(c, ctx) <= 1)
    return 1.5 + 0.5 * yes(nearest(c, ctx, ["shipyard"]) <= 2);
  if (ctx.skeleton.gates.length === 0) return 0.5 + 0.5 * (1 - dCenter(c, ctx) / rb(ctx));
  const g = dGate(c, ctx);
  if (g > 3) return VETO;
  return 1 + 0.5 * yes(frontsMain(c, ctx.index)) + 0.3 * (1 - (g - 1) / 3);
}

/**
 * Верфь — суша с ≥ 2 соседями-водой, на краю, ≥ 4 от площади (Арсенал). У
 * малого порта (Rb = 4) центр стоит в ≤ 3 от воды (шаг 3, Любек), и кольцо
 * «≥ 4 от площади» лежит уже за краем застройки — там отступ Rb − 1.
 */
function shipyard(c: ZoneCell, ctx: ZoneCtx): number {
  const w = waterAround(c, ctx);
  if (w < 2 || dPlaza(c, ctx.skeleton) < Math.min(4, rb(ctx) - 1)) return VETO;
  return 1 + 0.2 * (w - 2) + 0.3 * yes(edgeOf(c, ctx) <= 1);
}

/** Казарма — у края или у ворот, не вплотную к ратуше (Civ VI, watabou). */
function barracks(c: ZoneCell, ctx: ZoneCtx): number {
  const hall = hallOf(ctx);
  if (hall !== undefined && dist(c, hall) < 2) return VETO;
  const e = edgeOf(c, ctx);
  const edge = e <= 1 ? 1 : e <= 2 ? 0.5 : 0;
  const gate = dGate(c, ctx) <= 2 ? 1 : 0;
  const core = dCenter(c, ctx) <= rb(ctx) / 3 ? 0.3 : 0;
  return 0.3 + 0.8 * Math.max(edge, gate) - core + 0.3 * craftSector(c, ctx);
}

/** Оружейная — сосед казармы; без казармы — служба ядра ≤ 3 от ратуши. */
function armory(c: ZoneCell, ctx: ZoneCtx): number {
  const hall = hallOf(ctx);
  const near = nearest(c, ctx, ["barracks"]);
  if (Number.isFinite(near)) {
    if (near > 2) return VETO;
    return 1 + 0.5 * yes(near === 1) + 0.3 * yes(hall !== undefined && dist(c, hall) <= 3);
  }
  if (hall !== undefined && dist(c, hall) > 3) return VETO;
  return 0.5 + fValue(c, ctx);
}

/**
 * Кузница — в городе у края и к воде, в деревне у луга или центрального
 * перекрёстка (Angerdorf). Плавильня — всегда внешнее кольцо, ≥ 4 от площади.
 * От храма, музея, университета и покоев — не ближе 3.
 */
function forge(c: ZoneCell, ctx: ZoneCtx): number {
  if (nearest(c, ctx, isTown(ctx) ? QUIET : QUIET_VILLAGE) < CRAFT_GAP) return VETO;
  const wet = 0.5 * yes(dWater(c, ctx) <= 2);
  const sector = 0.3 * craftSector(c, ctx);
  if (ctx.smelter) {
    // «≥ 4 от площади» — про город; у деревни площади нет, там хватает края.
    const plaza = ctx.skeleton.plaza.length > 0 && dPlaza(c, ctx.skeleton) < 4;
    if (edgeOf(c, ctx) > 1 || plaza) return VETO;
    return 0.8 + wet + sector;
  }
  if (isTown(ctx)) {
    const e = edgeOf(c, ctx);
    if (e > 2) return VETO;
    return 0.8 + wet + 0.3 * yes(e <= 1) + sector;
  }
  const green = 0.5 * yes(touchesGreen(c, ctx.index));
  return 1.2 - dCenter(c, ctx) / rb(ctx) + green + 0.3 * fValue(c, ctx);
}

/** Университет и музей — dPlaza 2–4, подальше от ремесла, в противоположном секторе. */
function culture(c: ZoneCell, ctx: ZoneCtx, role: TownRole): number {
  const d = dPlaza(c, ctx.skeleton);
  if (d < 2 || d > 4) return VETO;
  if (nearest(c, ctx, ["forge", "arena", "barracks"]) < 3) return VETO;
  const twin: TownRole = role === "museum" ? "university" : "museum";
  if (nearest(c, ctx, [twin]) < 2) return VETO;
  const quarter = 0.25 * builtAround(c, ctx, CULTURE);
  const main = 0.3 * yes(frontsMain(c, ctx.index));
  return 0.8 + quarter - main + 0.5 * (1 - craftSector(c, ctx));
}

/** Арена — край у ворот, с входом с магистрали, ≥ 3 от храма (амфитеатры за стеной). */
function arena(c: ZoneCell, ctx: ZoneCtx): number {
  if (edgeOf(c, ctx) > 2 || nearest(c, ctx, ["temple"]) < 3) return VETO;
  if (ctx.skeleton.gates.length > 0 && dGate(c, ctx) > 3) return VETO;
  return 1 + 0.5 * yes(frontsMain(c, ctx.index)) + 0.3 * craftSector(c, ctx);
}

/** Вышка — только край, следующая не ближе 5 к другим (Settlers II, GDMC). */
function watchtower(c: ZoneCell, ctx: ZoneCtx): number {
  if (edgeOf(c, ctx) > 1) return VETO;
  const other = nearest(c, ctx, ["watchtower"]);
  if (other < 5) return VETO;
  const spread = Number.isFinite(other) ? Math.min(other, 10) / 10 : 0.5;
  return 0.8 + 0.3 * yes(dGate(c, ctx) <= 2) + 0.2 * spread;
}

/** Покои знати — ядро, dPlaza 1–3; в городе ≥ 3 от кузницы и арены (её правило, вторая сторона). */
function chambers(c: ZoneCell, ctx: ZoneCtx): number {
  if (nearestIndustry(c, ctx) < (isTown(ctx) ? CRAFT_GAP : 2)) return VETO;
  const d = dPlaza(c, ctx.skeleton);
  const core = d <= 3 ? 1 : Math.max(0, 1 - (d - 3) / rb(ctx));
  return 0.3 + core + 0.3 * yes(nearest(c, ctx, ["temple"]) <= 1);
}

/**
 * Простой дом (шаг 11): смежный рост ≤ 2 от стоящих (Endless Legend), без
 * глухих блоков (≥ 5 соседей), λ0 по форме (CLOSE_FORMS), подальше от
 * кузницы, казармы и арены (Civ appeal −1), поближе к храму и рынку.
 */
function house(c: ZoneCell, ctx: ZoneCtx): number {
  if (ctx.placed.length > 0 && nearestAny(c, ctx) > 2) return VETO;
  const around = builtAround(c, ctx);
  if (around >= 5) return VETO;
  const homes = builtAround(c, ctx, ["house", "chambers"]);
  if (!CLOSE_FORMS.has(ctx.skeleton.form) && homes > 0) return VETO;
  const company = homes >= 1 && homes <= 3 ? 1 : homes === 0 ? -0.5 : 0;
  const noisy = builtAround(c, ctx, ["forge", "barracks", "arena"]) > 0 ? 1 : 0;
  const good = nearest(c, ctx, ["temple", "market"]) <= 3 ? 0.3 : 0;
  return 1.5 - (0.5 * dCenter(c, ctx)) / rb(ctx) + 0.5 * company - noisy + good;
}

/** Ратуша — центр; если центр занят, лот у площади поближе к нему. */
function townHall(c: ZoneCell, ctx: ZoneCtx): number {
  if (hallOf(ctx) !== undefined) return VETO;
  return 2 - dCenter(c, ctx) / rb(ctx) + 0.5 * yes(touchesPlaza(c, ctx.index));
}

/** Интерес Emilien: 0 при любом вето, иначе max(0, Σwᵢfᵢ). */
export function interest(role: TownRole, cell: ZoneCell, ctx: ZoneCtx): number {
  if (ctx.terrainOk && !ctx.terrainOk(cell)) return 0;
  let score: number;
  if (role === "town_hall") score = townHall(cell, ctx);
  else if (role === "temple") score = temple(cell, ctx);
  else if (role === "market") score = market(cell, ctx);
  else if (role === "tavern") score = tavern(cell, ctx);
  else if (role === "warehouse") score = warehouse(cell, ctx);
  else if (role === "shipyard") score = shipyard(cell, ctx);
  else if (role === "barracks") score = barracks(cell, ctx);
  else if (role === "armory") score = armory(cell, ctx);
  else if (role === "forge") score = forge(cell, ctx);
  else if (role === "university" || role === "museum") score = culture(cell, ctx, role);
  else if (role === "arena") score = arena(cell, ctx);
  else if (role === "watchtower") score = watchtower(cell, ctx);
  else if (role === "chambers") score = chambers(cell, ctx);
  else score = house(cell, ctx);
  return score === VETO ? 0 : Math.max(0, score);
}
