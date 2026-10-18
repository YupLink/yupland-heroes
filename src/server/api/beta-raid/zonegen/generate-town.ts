// Органический рост на сервере: собрать входы placeTown и сверить выход.
//
// Владелец, 25.09.2026: «чтобы был АЛГОРИТМ, а не придуманный рандомный
// расстановочный паттерн». Сам рост — чистая математика в lib/raid/zonegen/town
// (docs/town-generation-algorithm.json); здесь только то, что знает сервер:
// какая клетка вода, где дороги карты за краем выделения, что в справочнике.
//
// Декор. Спецификация (шаг 15) велит «декор у дороги вредит»: дом в кустах и
// ёлка посреди мостовой — ровно те жалобы 24.09. Поэтому декор, который
// генератор зоны только что посчитал, дому НЕ помеха (decorBlocked пуст):
// дом и улица встают с decorationId: null, а у новых улиц декор снимается и с
// соседних клеток. Иначе в лесной зоне с плотным декором город не влезал бы
// вовсе — лес здесь только что нарисован жребием, а не посажен админом.
import { DIRS, keyOf, subSeed } from "@/lib/raid/zonegen/town/hex";
import { placeTown } from "@/lib/raid/zonegen/town/place";
import { toRoleOptions } from "@/lib/raid/zonegen/town/roles";
import type { RoleOption } from "@/lib/raid/zonegen/town/types";
import { ZONE_MAX_CELLS, type ZonePatch } from "@/lib/raid/zonegen/recipe";
import { isWaterName } from "@/lib/shipRules";
import type {
  BuildingOption,
  SettlementRecipe,
  SettlementReport,
  SettlementSlot,
  ZoneStructure,
} from "@/lib/raid/zonegen/settlement-types";
import type { TownContext } from "./town-context";
import { splitZone } from "./town-split";

/** Свой поток жребия, как у planSettlements: правка города не двигает пятна местности. */
const SETTLE_SEED_XOR = 0x5bf03635;
const key = keyOf;

/**
 * Справочник глазами роста. Автоподбор берёт только то, чему роль нашлась
 * (roleOf отбрасывает шахты, поля, порталы, таблички — без building_config
 * они «не настроены», ПРАВИЛА §8.14). Ручной состав — явный выбор админа:
 * такую постройку ставим фоном («house»), раз он сам её вписал.
 */
export function townOptions(
  buildings: BuildingOption[],
  manual: SettlementSlot[] | null,
): RoleOption[] {
  const out: RoleOption[] = toRoleOptions(buildings);
  if (manual === null) return out;
  const have = new Set(out.map((o) => o.id));
  const wanted = new Set(
    manual.filter((s) => s.count > 0 || s.fill === true).map((s) => s.buildingId),
  );
  for (const b of buildings)
    if (wanted.has(b.id) && !have.has(b.id)) out.push({ ...b, role: "house" });
  return out;
}

/**
 * «Ставим только то, что есть» (ПРАВИЛА §8.14.1) — и для выхода роста тоже.
 * Чужой шаблон — отказ с именем: это ошибка роста, и пятна без картинки на
 * карте хуже честного отказа. Облик чужой группы — снимаем: дом встанет в
 * базовом виде, а не в картинке другой постройки (карта рисует по skin).
 */
export function verifyTownStructures(
  structures: ZoneStructure[],
  buildings: BuildingOption[],
): { structures: ZoneStructure[]; strippedSkins: number } {
  const byId = new Map(buildings.map((b) => [b.id, b]));
  const missing = new Set<string>();
  let strippedSkins = 0;
  const out = structures.map((src) => {
    const s: ZoneStructure = { ...src };
    const owner = typeof s.buildingId === "string" ? byId.get(s.buildingId) : undefined;
    if (typeof s.buildingId === "string" && owner === undefined) missing.add(s.buildingId);
    if (typeof s.buildingSkinId === "string") {
      if (!(owner?.skins ?? []).some((k) => k.id === s.buildingSkinId)) {
        delete s.buildingSkinId;
        strippedSkins++;
      }
    }
    // Под домом и улицей декора нет (шаг 15, «обязательно свободно»).
    if (typeof s.buildingId === "string" || typeof s.roadId === "string") s.decorationId = null;
    return s;
  });
  if (missing.size > 0) {
    throw new Error(
      `Город поставил постройки, которых нет в справочнике: ${[...missing].join(", ")}`,
    );
  }
  return { structures: out, strippedSkins };
}

/** Декор у новой улицы снимаем: «декора у дороги нет» (шаг 15, зонирование дворов). */
export function clearDecorAlongRoads(
  patches: ZonePatch[],
  structures: ZoneStructure[],
): ZoneStructure[] {
  const decor = new Set(patches.filter((p) => p.decorationId !== null).map(key));
  const taken = new Set(structures.map(key));
  const extra: ZoneStructure[] = [];
  for (const s of structures) {
    if (typeof s.roadId !== "string") continue;
    for (const [dq, dr] of DIRS) {
      const c = { q: s.q + dq, r: s.r + dr };
      const k = key(c);
      if (!decor.has(k) || taken.has(k)) continue;
      taken.add(k);
      extra.push({ ...c, decorationId: null });
    }
  }
  return extra;
}

/** Правки двух городов на одной клетке: дом и улица не смешиваются, снятие декора дополняет. */
function mergeInto(a: ZoneStructure, b: ZoneStructure): void {
  const hasBuilding = typeof a.buildingId === "string";
  const hasRoad = typeof a.roadId === "string";
  if (!hasBuilding && !hasRoad && typeof b.buildingId === "string") {
    a.buildingId = b.buildingId;
    if (b.buildingSkinId !== undefined) a.buildingSkinId = b.buildingSkinId;
    if (b.tier !== undefined) a.tier = b.tier;
  }
  if (!hasBuilding && !hasRoad && typeof b.roadId === "string") a.roadId = b.roadId;
  if (b.decorationId === null) a.decorationId = null;
}

/** Отчёт по всем поселениям зоны: суммы, форма и тема — первого (главного). */
export function mergeReports(list: SettlementReport[]): SettlementReport {
  const out: SettlementReport = {
    places: 0,
    buildings: 0,
    roadCells: 0,
    byBuilding: {},
    shortfall: 0,
  };
  for (const r of list) {
    out.places += r.places;
    out.buildings += r.buildings;
    out.roadCells += r.roadCells;
    out.shortfall += r.shortfall;
    for (const [name, n] of Object.entries(r.byBuilding)) {
      out.byBuilding[name] = (out.byBuilding[name] ?? 0) + n;
    }
    if (out.form === undefined && r.form !== undefined) out.form = r.form;
    if (out.theme === undefined && r.theme !== undefined) out.theme = r.theme;
    if (r.gates !== undefined) out.gates = (out.gates ?? 0) + r.gates;
  }
  return out;
}

export type OrganicArgs = {
  settlement: SettlementRecipe;
  seed: number;
  patches: ZonePatch[];
  occupied: Set<string>;
  context: TownContext;
  terrainNames: Record<string, string>;
  buildings: BuildingOption[];
};

/**
 * Вырастить поселения зоны. Каждое следующее видит дома прошлых занятыми, а их
 * улицы — дорогами карты: соседний городок цепляется к ним, а не тянет свою
 * параллельно (шаг 6: «уже проложенная дорога стоит 0.2»).
 */
export function planOrganicTowns(args: OrganicArgs): {
  structures: ZoneStructure[];
  report: SettlementReport;
} {
  const s = args.settlement;
  // Клетку с патчем решает НОВАЯ местность, а не то, что лежит в базе: зона
  // над океаном, залитая травой, — суша. Раньше вода из базы оставалась водой
  // поверх свежей травы, и на острове в 94 клетки не вставал ни один дом
  // (прод, 25.09). Вода из базы важна только ВОКРУГ зоны — для порта и въездов.
  const water = new Set(args.context.water);
  for (const p of args.patches) {
    if (isWaterName(args.terrainNames[p.terrainId])) water.add(key(p));
    else water.delete(key(p));
  }
  const manual = s.auto ? null : s.slots;
  const terrainOf = new Map(args.patches.map((p) => [key(p), p.terrainId]));
  const options = townOptions(args.buildings, manual);
  const base = (args.seed ^ SETTLE_SEED_XOR) >>> 0;
  const cells = args.patches.map((p) => ({ q: p.q, r: p.r }));
  const parts = splitZone({
    cells,
    isLand: (k) => !water.has(k) && !args.occupied.has(k),
    count: s.count,
    buildings: s.buildings,
    seed: base,
  });

  const at = new Map<string, ZoneStructure>();
  const occupied = new Set(args.occupied);
  const mapRoads = new Set(args.context.mapRoads);
  const reports: SettlementReport[] = [];
  parts.forEach((part, i) => {
    const res = placeTown({
      cells: part,
      occupied,
      water,
      decorBlocked: new Set(),
      mapRoads,
      // Свой подсид на поселение: второй город не повторяет первый (шаг 0).
      seed: i === 0 ? base : subSeed(base, `town${i}`),
      buildings: s.buildings,
      theme: s.theme,
      kind: s.kind,
      options,
      manual,
      roadId: s.roadId,
      built: s.built,
      terrainOf,
    });
    reports.push(res.report);
    for (const st of res.structures) {
      const k = key(st);
      const was = at.get(k);
      if (was === undefined) at.set(k, { ...st });
      else mergeInto(was, st);
      if (typeof st.buildingId === "string") occupied.add(k);
      if (typeof st.roadId === "string") mapRoads.add(k);
    }
  });

  const { structures, strippedSkins } = verifyTownStructures([...at.values()], args.buildings);
  if (strippedSkins > 0) {
    console.warn(`[zonegen] снято обликов чужих шаблонов: ${strippedSkins}`);
  }
  // Сначала город, потом расчистка декора: потолок режет хвост, а не дома.
  const all = [...structures, ...clearDecorAlongRoads(args.patches, structures)];
  return { structures: all.slice(0, ZONE_MAX_CELLS), report: mergeReports(reports) };
}
