// Органический рост поселения — оркестр шагов спецификации
// (docs/town-generation-algorithm.json).
//
// Владелец, 25.09.2026: «нужно, чтобы ты рандомно делал подборки; чтобы
// предустановки расставлялись автоматически и работали как следует; сделать
// разбор, как создаются города, — чтобы был АЛГОРИТМ, а не придуманный
// рандомный расстановочный паттерн». Поэтому здесь нет трафарета: состав
// тянется жребием по канону (шаг 1), скелет — центр, въезды, магистрали —
// выводится из местности (шаги 2–6), службы встают по одной туда, где им
// велят правила соседства реальных городов (шаг 9), а дома заполняют лоты с
// плотностью, падающей от центра (шаг 11), и выходят в предместье (шаг 13).
//
// Случайность задаёт только состав и ничьи; всё идёт от одного сида, поэтому
// превью и запись на карту дают один и тот же город клетка в клетку.
import { composeRandom, manualCompose } from "@/lib/raid/zonegen/town/compose";
import { buildFields, dist } from "@/lib/raid/zonegen/town/fields";
import { disk, keyOf, rngFor } from "@/lib/raid/zonegen/town/hex";
import { placeHouses } from "@/lib/raid/zonegen/town/place-houses";
import { placeServices, queueOf, retryServices } from "@/lib/raid/zonegen/town/place-services";
import { SUBURB_REACH, type TownState } from "@/lib/raid/zonegen/town/place-state";
import { emptyReport, writeTown } from "@/lib/raid/zonegen/town/place-write";
import { buildSkeleton, compositionOf } from "@/lib/raid/zonegen/town/skeleton";
import { buildRadius, pickCenter } from "@/lib/raid/zonegen/town/site";
import { pickTheme } from "@/lib/raid/zonegen/town/theme";
import { raceOfTheme, scopeByRace } from "@/lib/raid/assetTags";
import type {
  TownFields,
  TownInput,
  TownPick,
  TownResult,
  TownSkeleton,
} from "@/lib/raid/zonegen/town/types";
import { roadIndex } from "@/lib/raid/zonegen/town/value";

/** Число построек по рецепту — 3–40; снизу держим 1, чтобы тесты могли меньше. */
const N_MIN = 1;
const N_MAX = 40;
/** Ратуша — у города (N > 20) и у порта (вода и N ≥ 12): форма town/port (шаг 3). */
const HALL_N = 20;
const PORT_N = 12;
/**
 * «Есть вода» для состава: верфь, если вода не дальше Rb + 2 от места. Верфи
 * нужен лот с двумя соседями-водой в пределах Rb + 1 (краевые роли), значит
 * до воды от центра ≤ Rb + 2; дальше верфь не встанет и уйдёт в недобор.
 */
const WATER_NEAR = 2;

/** Роли, которых нет в «фоне»: их недобор и есть недобор (report.shortfall). */
const required = (picks: TownPick[]): number =>
  picks.filter((p) => p.role !== "house" && p.role !== "chambers").length;

/**
 * Вода у МЕСТА, а не где-то в зоне. Раньше хватало любой клетки у воды в
 * выделении: на поле 30×30 с рекой у южного края каждая деревня от 12 дворов
 * получала ратушу и верфь, верфь до реки не дотягивалась (недобор 1 при
 * любом N), а ратуша делала из деревни городок. Место считаем так же, как
 * первая попытка скелета (тот же pickCenter, тот же сид, без тяги к воде).
 */
function nearWater(input: TownInput, zone: TownFields, n: number): boolean {
  if (zone.water.size === 0) return false;
  const radius = buildRadius(n);
  const site = pickCenter(zone, input.occupied, { radius, seed: input.seed >>> 0, port: false });
  return site !== null && dist(zone.dWater, keyOf(site)) <= radius + WATER_NEAR;
}

/**
 * Заказ → вода и ратуша. Порт — верфь всегда (центр потом сам встанет у
 * воды, site.ts), ратуша с 12. Деревня, хутор и лагерь — без верфи: с ней
 * деревня от 12 дворов стала бы портом (шаг 3), а заказывали деревню.
 */
function orderOf(input: TownInput, zone: TownFields, n: number) {
  const kind = input.kind ?? "auto";
  const localWet = kind === "auto" || kind === "town" ? nearWater(input, zone, n) : false;
  const wet = kind === "port" ? zone.water.size > 0 : localWet;
  const hall =
    input.hall === true ||
    kind === "town" ||
    (kind === "port" && n >= PORT_N) ||
    (kind === "auto" && (n > HALL_N || (wet && n >= PORT_N)));
  return { kind, wet, hall };
}

/**
 * Суша для лотов и улиц — окрестность города (Rb + предместье): на выделении
 * в полкарты перебирать тысячи клеток ради каждого дома незачем.
 */
function localFields(zone: TownFields, sk: TownSkeleton): TownFields {
  const land = new Set<string>();
  for (const c of disk(sk.center, sk.radius + SUBURB_REACH + 1)) {
    const k = keyOf(c);
    if (zone.land.has(k)) land.add(k);
  }
  return { ...zone, land };
}

/** Состав: автоподбор от сида или ручной список админа. */
function composeFor(input: TownInput, n: number, zone: TownFields, theme: string | null) {
  if (input.manual !== null)
    return manualCompose(input.manual, input.options, n, theme, input.seed);
  const { kind, wet, hall } = orderOf(input, zone, n);
  return composeRandom(n, input.options, wet, rngFor(input.seed, "compose"), {
    hall,
    shop: input.shop === true,
    theme,
    salt: input.seed,
    kind,
  });
}

export function placeTown(input: TownInput): TownResult {
  const zone = buildFields(input);
  const n = Math.min(N_MAX, Math.max(N_MIN, Math.round(input.buildings)));
  const theme = pickTheme(input.options, input.theme, rngFor(input.seed, "theme"));
  // Расовые постройки и облики — только в город своей расы (метки, 25.09).
  const scoped = { ...input, options: scopeByRace(input.options, raceOfTheme(theme)) };
  const picks = composeFor(scoped, n, zone, theme);
  const nothing = (shortfall: number): TownResult => ({
    structures: [],
    report: { ...emptyReport(), shortfall, theme },
    skeleton: null,
    placed: [],
  });
  if (picks.length === 0) return nothing(0);

  const skeleton = buildSkeleton(
    input,
    compositionOf(picks.map((p) => p.role)),
    picks.length,
    zone,
  );
  if (skeleton === null) return nothing(required(picks));

  // Дорога карты, которую скелет не вобрал, — не лот: на дороге не строят.
  const occupied = new Set([...input.occupied, ...input.mapRoads]);
  const fields = localFields(zone, skeleton);
  const state: TownState = {
    skeleton,
    fields,
    index: roadIndex(skeleton),
    seed: input.seed,
    rnd: rngFor(input.seed, "place"),
    placed: [],
    at: new Map(),
    occupied,
    entrances: new Set(),
    houses: new Set(),
    terrainOf: input.terrainOf,
  };
  const { failed, homes } = placeServices(state, queueOf(picks));
  placeHouses(state, homes);
  const shortfall = retryServices(state, failed);
  const out = writeTown(state, { input, zone, theme, shortfall });
  const placed = state.placed.map(({ q, r, role }) => ({ q, r, role }));
  return { ...out, skeleton, placed };
}
