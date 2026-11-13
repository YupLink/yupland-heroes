// Шаблон города острова (владелец, 31.10.2026): Ангелина рисует город на своём
// острове новичка и сохраняет раскладку — дальше генератор ставит её вместо
// выращенного случайно города («лажа»). Хранится РАСПОЛОЖЕНИЕ ПО ТИПУ: местность,
// дорога, декор и постройка-функция (id шаблона постройки), без облика. Облик
// подбирается при генерации — один набор расы на весь город («только
// однотипное — как и сейчас, иначе бардак»), так визуал можно менять, не трогая
// шаблон. Клетки — относительно ратуши (якорь), круг TEMPLATE_RADIUS.
// Чистые функции: те же шаблон, мир и место — тот же город.
import { hashCell, keyOf } from "@/lib/raid/zonegen/town/hex";
import { terrainAt, type World } from "@/lib/raid/worldgen/field";
import { inBounds, type Bounds, type Cell } from "@/lib/raid/worldgen/geo";
import { raceTownFor, skinAt } from "@/lib/raid/worldgen/collections";
import { townName } from "@/lib/raid/worldgen/hall";
import { configAt, type BuiltTown, type TownCatalog } from "@/lib/raid/worldgen/town";
import type { TownSite } from "@/lib/raid/worldgen/sites";
import type { WorldCell } from "@/lib/raid/worldgen/spec";
import type { ZoneStructure } from "@/lib/raid/zonegen/settlement-types";

/** Радиус шаблона вокруг ратуши: город с площадью и окраиной. */
export const TEMPLATE_RADIUS = 6;

/** Клетка шаблона: смещение от ратуши и слои (null — пусто). */
export type TemplateCell = {
  q: number;
  r: number;
  /** Местность. */
  t: string | null;
  /** Дорога. */
  rd: string | null;
  /** Декор. */
  d: string | null;
  /** Постройка — функция (шаблон), без облика. */
  b: string | null;
  /** Блок (объединение клеток): номер блока в шаблоне; нет — клетка сама по себе. */
  g?: number | null;
  /** Масштаб картинки блока, %. */
  s?: number | null;
};

export type TownTemplate = { id: string; name: string; cells: TemplateCell[] };

/** Шаблон для места: по сиду города среди включённых; нет — null. */
export function pickTemplate(list: readonly TownTemplate[], seed: number): TownTemplate | null {
  if (list.length === 0) return null;
  return list[hashCell(seed ^ 0x3c6ef372, 1, 2) % list.length];
}

/**
 * Постройки, которым место в городе: те же, что ставит выращенный город (роль
 * есть). Шахты, поля, порталы и таблички без своей настройки не работают —
 * в шаблон и на остров дизайнера не идут.
 */
export const townBuildingIds = (cat: Pick<TownCatalog, "options">): Set<string> =>
  new Set(cat.options.map((o) => o.id));

/** Ратуша шаблона — по функции постройки (meta.effect = town_hall). */
export function hasTownHall(
  tpl: TownTemplate,
  cat: Pick<TownCatalog, "byId" | "options">,
): boolean {
  const ok = townBuildingIds(cat);
  return tpl.cells.some(
    (c) => c.b !== null && ok.has(c.b) && cat.byId.get(c.b)?.effect === "town_hall",
  );
}

/** Клетка шаблона на карте: блок — уже с id блока этой карты. */
export type FootCell = TemplateCell & { gid: string | null };

export type PlacedTemplate = {
  town: BuiltTown;
  /** Клетки шаблона на карте: «q,r» → слои. */
  footprint: Map<string, FootCell>;
};

/**
 * Город по шаблону на месте site: ратуша шаблона встаёт на место, облики — из
 * набора одной расы (по земле под местом, как у выращенного города).
 */
export function templateTown(
  w: World,
  site: TownSite,
  cat: TownCatalog,
  bounds: Bounds,
  tpl: TownTemplate,
): PlacedTemplate {
  const ground = terrainAt(w, site.q, site.r);
  const race = raceTownFor(cat.races, site.seed, ground);
  const own = new Map((race?.options ?? []).map((o) => [o.id, o]));
  const role = new Map(cat.options.map((o) => [o.id, o.role]));
  const footprint = new Map<string, FootCell>();
  const structures: ZoneStructure[] = [];
  let hall: Cell | null = null;
  const markets: Cell[] = [];
  const configs = new Map<string, Record<string, unknown>>();
  for (const c of tpl.cells) {
    const q = site.q + c.q;
    const r = site.r + c.r;
    if (!inBounds(bounds, q, r)) continue;
    // Постройка не для города (удалили, шахта…) — клетка пустая.
    const b = c.b !== null && role.has(c.b) ? c.b : null;
    const gid = c.g == null ? null : `tpl_${site.seed}_${c.g}`;
    footprint.set(keyOf({ q, r }), { ...c, q, r, b, gid });
    if (b !== null) {
      const skin = race ? skinAt(own.get(b), site.seed, q, r) : null;
      structures.push({ q, r, buildingId: b, buildingSkinId: skin });
      const effect = cat.byId.get(b)?.effect ?? null;
      // Храм — настройка одного из храмов образца, как у выращенного города.
      const cfg = configAt(w, effect, q, r);
      if (cfg) configs.set(keyOf({ q, r }), cfg);
      if (effect === "town_hall" && hall === null) hall = { q, r };
      // Казарма и оружейная — рынки по механике, но не лавки ратуши (как в buildTown).
      else if (role.get(b) === "market") markets.push({ q, r });
    } else if (c.rd !== null) structures.push({ q, r, roadId: c.rd });
  }
  const town: BuiltTown = {
    site,
    name: townName(site.seed),
    race: race?.race ?? null,
    structures,
    center: { q: site.q, r: site.r },
    hall,
    markets,
    buildings: structures.filter((s) => typeof s.buildingId === "string").length,
    configs,
  };
  return { town, footprint };
}

/**
 * Основа клетки под шаблоном (до правок города): местность шаблона (нет —
 * своя, а вода — суша острова), дорога и декор шаблона, ни постройки, ни
 * объекта. Постройки с обликами и дороги положат правки города поверх.
 */
export function templateBase(
  cell: WorldCell,
  tc: FootCell,
  land: string,
  isWater: boolean,
): WorldCell {
  return {
    ...cell,
    terrainId: tc.t ?? (isWater ? land : cell.terrainId),
    roadId: tc.rd,
    decorationId: tc.d,
    buildingId: null,
    buildingSkinId: null,
    buildingConfig: null,
    tier: null,
    objectId: null,
    objectConfig: null,
    groupId: tc.gid,
    iconScale: tc.gid === null ? null : (tc.s ?? null),
    mode: "built",
  };
}

/** После правок города: у пустых клеток шаблона — ровно его декор (улица не трогает). */
export function templateDecor(cell: WorldCell, tc: TemplateCell): WorldCell {
  if (cell.buildingId !== null || cell.roadId !== null) return cell;
  return { ...cell, decorationId: tc.d };
}
