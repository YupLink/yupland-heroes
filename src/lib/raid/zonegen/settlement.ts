// Поселения: расставить ГОТОВЫЕ постройки из справочника поверх местности.
//
// Владелец, 22.09.2026: «сейчас генерация = чисто рандом — нету ни логики ни
// системы; нужно чтобы была возможность генерировать и города из уже имеющихся
// предзагруженных моделек построек». Новые картинки генератор не рисует — он
// раскладывает то, что уже заведено в справочнике.
//
// Владелец, 24.09.2026: «хаотично раскидывает элементы, причём друг на друга».
// Поэтому порядок теперь такой: центр → ПЛАН (площадь, улицы, участки) →
// дворы по участкам → улицы из плана. Планировку задаёт рецепт
// (ring/cross/grid), а прежнее пятно осталось планировкой free.
//
// Всё чисто: ни БД, ни Math.random. Жребий крутится от сида рецепта, поэтому
// превью админа и запись на карту дают одно и то же поселение клетка в клетку.
import { makeNoise, mulberry32 } from "@/lib/raid/zonegen/noise";
import type { ZoneCell, ZoneRecipe } from "@/lib/raid/zonegen/recipe";
import { freeLayout, planLayout, type LayoutPlan } from "@/lib/raid/zonegen/settlement-layout";
import {
  blobRadius,
  cellKey,
  growBlob,
  pickCenters,
  placeBuildings,
  type CellTest,
  type PlacedBuilding,
} from "@/lib/raid/zonegen/settlement-place";
import {
  expandRequired,
  fillSlots,
  resolveSlots,
  slotCapacity,
} from "@/lib/raid/zonegen/settlement-slots";
import { connectBuildings } from "@/lib/raid/zonegen/settlement-roads";
import { makeSink, writeBuildings, writeRoads } from "@/lib/raid/zonegen/settlement-write";
import type {
  BuildingOption,
  SettlementRecipe,
  SettlementReport,
  ZoneStructure,
} from "@/lib/raid/zonegen/settlement-types";

/** Свой поток жребия: правка построек не должна двигать пятна местности. */
const SETTLE_SEED_XOR = 0x5bf03635;
/** Порт считается «у воды», если вода в двух шагах: причал влезет. */
const WATER_REACH = 2;
/** Потолок плотности для пятна: плотнее «через одну клетку» гекс не даёт. */
const MAX_DENSITY = 1 / 3;

export type PlanSettlementsInput = {
  /** Клетки зоны — за их пределы поселение не выходит. */
  cells: ZoneCell[];
  /** Ключи клеток, которые генератор красит (всё, что не занято). */
  free: Set<string>;
  /** Занятые клетки: объект, постройка, купол, игрок, беглец, судно. */
  occupied: Set<string>;
  /** Дороги, которые уже лежат в зоне. */
  roads: Set<string>;
  /** Что ляжет на клетку по рецепту: ключ → terrainId. */
  terrainOf: Map<string, string>;
  isWater: (terrainId: string) => boolean;
  recipe: ZoneRecipe & { settlement: SettlementRecipe };
  /** Справочник построек: только то, что реально есть на карте. */
  options: BuildingOption[];
};

export type PlanSettlementsResult = { structures: ZoneStructure[]; report: SettlementReport };

const emptyReport = (): SettlementReport => ({
  places: 0,
  buildings: 0,
  roadCells: 0,
  byBuilding: {},
  shortfall: 0,
});

/** Клетки в двух шагах от воды: порт ставим только сюда. */
function shoreKeys(cells: ZoneCell[], isWaterCell: CellTest): Set<string> {
  const out = new Set<string>();
  for (const c of cells) {
    if (!isWaterCell(cellKey(c.q, c.r))) continue;
    for (let dq = -WATER_REACH; dq <= WATER_REACH; dq++) {
      const lo = Math.max(-WATER_REACH, -dq - WATER_REACH);
      const hi = Math.min(WATER_REACH, -dq + WATER_REACH);
      for (let dr = lo; dr <= hi; dr++) out.add(cellKey(c.q + dq, c.r + dr));
    }
  }
  return out;
}

/**
 * Бюджет поселения. У пятна потолок — треть клеток: между дворами всегда
 * пустая клетка, плотнее гексовая сетка не набивается. У планировки зазор
 * задают улицы, и потолок ей ставят сами участки — их и так меньше половины.
 */
const budgetOf = (s: SettlementRecipe, cells: number): number =>
  Math.round(cells * Math.min(s.density, s.layout === "free" ? MAX_DENSITY : 1));

/**
 * Клетки улиц. У планировки улицы уже начерчены — берём их из плана; у пятна
 * плана нет, и дороги считаются связыванием дворов по месту. Чужую дорогу
 * зоны не перекладываем: она уже лежит.
 */
function streetKeys(
  plan: LayoutPlan,
  placed: PlacedBuilding[],
  blob: ZoneCell[],
  roads: Set<string>,
  laid: Set<string>,
  spot: boolean,
): string[] {
  if (!spot) return plan.streets.map((c) => cellKey(c.q, c.r)).filter((k) => !roads.has(k));
  return connectBuildings({
    blob,
    buildings: placed.map((p) => ({ q: p.q, r: p.r })),
    // Свои же улицы идут в «уже есть»: соседнее поселение не перекладывает их
    // заново и цепляется к ним даром, как к дороге зоны.
    roads: laid.size > 0 ? new Set([...roads, ...laid]) : roads,
  });
}

export function planSettlements(input: PlanSettlementsInput): PlanSettlementsResult {
  const s = input.recipe.settlement;
  const report = emptyReport();
  if (!s.enabled) return { structures: [], report };

  const isWaterCell: CellTest = (k) => {
    const t = input.terrainOf.get(k);
    return t !== undefined && input.isWater(t);
  };
  // В план попадают все свободные сухие клетки (в том числе с дорогой — иначе
  // улица разрезала бы деревню надвое), а строить на дороге нельзя.
  const inZone: CellTest = (k) => input.free.has(k) && !input.occupied.has(k) && !isWaterCell(k);
  const canBuild: CellTest = (k) => inZone(k) && !input.roads.has(k);

  const seed = (input.recipe.seed ^ SETTLE_SEED_XOR) >>> 0;
  const rnd = mulberry32(seed);
  const noise = makeNoise(seed);
  const shore = shoreKeys(input.cells, isWaterCell);
  const centers = pickCenters({
    cells: input.cells,
    canBuild,
    nearWater: (k) => shore.has(k),
    count: s.count,
    size: s.size,
    noise,
    port: s.preset === "port",
  });

  const slots = resolveSlots(s, input.options);
  const required = expandRequired(slots);
  const fill = fillSlots(slots);
  const capacity = slotCapacity(slots);
  const radius = blobRadius(s.size);
  const spot = s.layout === "free";
  const sink = makeSink();
  const roadCells = new Set<string>();
  // Дворы (а при зазоре и их соседи), занятые ЭТИМ прогоном: поселения стоят
  // вплотную краями, и без общей памяти второе ставило дом на чужой двор.
  const blocked = new Set<string>();

  for (const center of centers) {
    // Пятно растим только для free: планировке клякса не нужна, а дороге free
    // нужна вся — улица ищет путь и по клеткам без построек.
    const blob = spot ? growBlob(center, radius, inZone, noise) : [];
    const plan = spot
      ? freeLayout(blob, canBuild, center)
      : planLayout({ center, size: s.size, layout: s.layout, inZone, free: canBuild, rnd, noise });
    const area = spot ? blob : [...plan.plaza, ...plan.streets, ...plan.lots];
    if (area.length === 0) continue;
    // Улица соседнего поселения легла раньше — на ней не строим.
    const vacant = (c: ZoneCell) => !roadCells.has(cellKey(c.q, c.r));
    const want = Math.min(budgetOf(s, area.length), capacity);
    const placed = placeBuildings({
      spots: plan.lots.filter(vacant),
      center,
      want,
      required,
      fill,
      rnd,
      blocked,
      hallSpots: plan.plaza.filter(vacant),
      spacing: spot,
    });
    // Недобор — только про ОБЯЗАТЕЛЬНЫЕ: места под них не нашлось. Фон —
    // «сколько влезет», и жаловаться на него нельзя: кромка всегда съедает
    // пару позиций, и на ровно застроенной деревне горела строка «не влезло».
    const needRequired = Math.min(required.length, want);
    const gotRequired = Math.min(placed.length, needRequired);
    report.shortfall +=
      Math.max(0, required.length - want) + Math.max(0, needRequired - gotRequired);
    if (placed.length === 0) continue;
    report.places++;
    writeBuildings(sink, placed, s.built, report);
    if (s.roadId !== null)
      writeRoads(
        sink,
        streetKeys(plan, placed, blob, input.roads, roadCells, spot),
        s.roadId,
        roadCells,
      );
  }
  report.roadCells = roadCells.size;
  return { structures: [...sink.at.values()], report };
}
