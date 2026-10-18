// Скелет органического поселения: центр → форма → въезды → ядро → магистрали.
//
// Владелец, 25.09.2026: «сделай разбор, как создаются города и как они
// выглядят, чтобы был АЛГОРИТМ, а не придуманный рандомный расстановочный
// паттерн». Здесь шаги 0, 2–6 и 15 спецификации
// (docs/town-generation-algorithm.json): поля расстояний, место и радиус,
// форма из ограничений, ворота у дорог карты, площадь или луг, магистрали с
// ценой местности, проверка связности с починкой. Постройки сюда не входят —
// их ставит зонирование поверх скелета, а улицы оно растит по требованию
// (streets.ts: growStreet, connectLoops).
//
// Чисто: ни БД, ни Math.random. Весь жребий — mulberry32(hash(seed, шаг)).
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { coreOf, GREEN_MIN, lensGreen, reservedOf, roundSpot } from "@/lib/raid/zonegen/town/core";
import { buildFields } from "@/lib/raid/zonegen/town/fields";
import { decideForm, measureArea, type TownComposition } from "@/lib/raid/zonegen/town/form";
import { finalGates, planGates } from "@/lib/raid/zonegen/town/gate-order";
import { keyOf, subSeed } from "@/lib/raid/zonegen/town/hex";
import { layPath, RANK_MAIN, repairGates, type RoadNet } from "@/lib/raid/zonegen/town/roads";
import { buildRadius, pickCenter } from "@/lib/raid/zonegen/town/site";
import {
  absorbMapRoads,
  axisCenter,
  layGateTails,
  layMagistrals,
  layPier,
} from "@/lib/raid/zonegen/town/spokes";
import type { TownFields, TownForm, TownInput, TownSkeleton } from "@/lib/raid/zonegen/town/types";
import type { TownKind } from "@/lib/raid/zonegen/settlement-types";

export { compositionOf, type TownComposition } from "@/lib/raid/zonegen/town/form";

/** До 3 попыток с подсидом hash(seed, attempt) (шаг 15). */
const MAX_ATTEMPTS = 3;
/** Площадь городка — минимум 4 проходимых клетки кольца 1 (шаг 5). */
const PLAZA_MIN = 4;
/** Порт — от 12 построек (шаг 3). */
const PORT_MIN = 12;
/** Лагерь — тесный клуб в радиусе 2, что бы ни дала таблица по N (таблица forms). */
const CAMP_RADIUS = 2;

type Attempt = { skeleton: TownSkeleton; ok: boolean; gates: number };

/** Непроходимый декор зоны: при починке через него можно прорезать дорогу. */
function cuttableOf(input: TownInput, fields: TownFields): Set<string> {
  const out = new Set<string>();
  for (const k of input.decorBlocked) {
    if (fields.dEdge.has(k) && !fields.water.has(k) && !input.occupied.has(k)) out.add(k);
  }
  return out;
}

/** Форма по дереву решений: замеры области и план ворот вокруг центра. */
function formAt(
  fields: TownFields,
  comp: TownComposition,
  n: number,
  center: ZoneCell,
  radius: number,
  seed: number,
  plan: ReturnType<typeof planGates>,
  kind: TownKind | undefined,
): TownForm {
  const pair = plan.pair;
  return decideForm({
    kind,
    ...measureArea(fields, center, radius),
    n,
    comp,
    entries: plan.entries,
    opposite: pair !== null,
    through: plan.through !== null,
    roundFits: roundSpot(fields, center, seed) !== null,
    greenFits:
      pair !== null && lensGreen(fields, center, pair[0], pair[1], seed).length >= GREEN_MIN,
  });
}

function attemptOnce(
  input: TownInput,
  fields: TownFields,
  comp: TownComposition,
  n: number,
  seed: number,
): Attempt | null {
  let radius = buildRadius(n);
  // Тяга к воде — у того, кому есть что ставить на берег: верфь в составе
  // (шаг 1). Раньше тянуло всякое поселение от 12 в зоне с водой — и
  // деревню без верфи, если река где-то у края выделения.
  const port = fields.water.size > 0 && (comp.shipyard ?? n >= PORT_MIN);
  const start = pickCenter(fields, input.occupied, { radius, seed, port });
  if (start === null) return null;
  const gatesAt = (r: number) =>
    planGates({ fields, center: start, radius: r, seed, port, occupied: input.occupied });
  let plan = gatesAt(radius);
  const form = formAt(fields, comp, n, start, radius, seed, plan, input.kind);
  if (form === "camp" && radius > CAMP_RADIUS) {
    radius = CAMP_RADIUS;
    plan = gatesAt(radius);
  }
  const wanted = finalGates(form, plan);
  const core = coreOf(form, fields, start, wanted, seed);
  const net: RoadNet = {
    fields,
    roads: new Map(),
    reserved: reservedOf(form, core),
    cuttable: cuttableOf(input, fields),
    seed,
    center: core.center,
    radius,
  };
  // Площадь — слой дороги без построек: кладём первой, спицы сливаются в неё.
  layPath(net, core.plaza.map(keyOf), RANK_MAIN);
  layMagistrals(net, form, wanted, core);
  if (form === "port") layPier(net, core);
  absorbMapRoads(net);
  const center =
    form === "street" && net.roads.size > 0 ? axisCenter(net, core.center) : core.center;
  const gates = repairGates(net, wanted, [center, ...core.plaza, ...core.green]);
  layGateTails(net, gates);
  const plazaOk = (form !== "town" && form !== "port") || core.plaza.length >= PLAZA_MIN;
  return {
    skeleton: {
      form,
      radius,
      center,
      plaza: core.plaza,
      green: core.green,
      gates,
      roads: net.roads,
    },
    ok: plazaOk && gates.length > 0 && gates.length === wanted.length,
    gates: gates.length,
  };
}

/**
 * Скелет поселения на n построек. comp — что в составе (ратуша, храм, таверна
 * решают лагерь/хутор/городок; см. compositionOf). fields можно передать
 * готовыми, если зонирование их уже посчитало. null — в зоне нет суши.
 *
 * Провал попытки (не все ворота связались, площадь не набралась) ведёт к
 * следующей с подсидом; после трёх отдаём лучшую — с большим числом ворот.
 */
export function buildSkeleton(
  input: TownInput,
  comp: TownComposition,
  n: number,
  fields: TownFields = buildFields(input),
): TownSkeleton | null {
  let best: Attempt | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const seed = attempt === 0 ? input.seed >>> 0 : subSeed(input.seed, `attempt:${attempt}`);
    const got = attemptOnce(input, fields, comp, n, seed);
    if (got === null) break;
    if (got.ok) return got.skeleton;
    if (best === null || got.gates > best.gates) best = got;
  }
  return best?.skeleton ?? null;
}
