// Постройка клетки → метка карты мира (владелец, 05.10.2026: «по каждому зданию
// (поведение здания) нужно показать и дать возможность отфильтровать. Поля тоже.
// Склады тоже. Порталы — тоже»).
//
// У каждого поведения постройки (cellBuildingEffect) — свой вид метки; у
// постройки без поведения — один общий вид «прочие». Чистые функции без базы:
// выборка клеток — world-map-marks, упаковка — world-map-pack.
import { cellBuildingEffect, type BuildingEffect } from "@/lib/buildingEffect";
import type { WorldMarkKind } from "@/lib/raid/worldMapCodec";
import type { WorldMark } from "./world-map-pack";

/** Строка выборки построек (world-map-marks): эффект клетки и шаблона, имя. */
export type BuildingRow = {
  q: number | string;
  r: number | string;
  group_id: string | null;
  cell_effect: string | null;
  /** Есть ли у шаблона ключ effect вообще (пустой = «ничего», имя не смотрим). */
  has_effect: unknown;
  meta_effect: string | null;
  name: string | null;
};

/**
 * Вид метки на каждое поведение. Полный список: новое поведение без своего
 * вида не соберётся (tsc), а не уйдёт молча в «прочие».
 */
const KIND_OF: Record<NonNullable<BuildingEffect>, WorldMarkKind> = {
  mine: "mine",
  market: "shop",
  town_hall: "town",
  field: "field",
  warehouse: "warehouse",
  portal: "portal",
  tavern: "tavern",
  watchtower: "watchtower",
  shipyard: "shipyard",
  university: "university",
  museum: "museum",
  chambers: "chambers",
  tournament: "tournament",
  boost: "boost",
  spellbook: "spellbook",
  oblivion: "oblivion",
  leveltree: "leveltree",
  sign: "sign",
  // Своей метки у казино пока нет: на карте мира оно в «прочих».
  casino: "other",
};

/** Вид метки по эффекту постройки; без поведения — «прочие». */
export function markKindOf(effect: BuildingEffect): WorldMarkKind {
  return effect ? KIND_OF[effect] : "other";
}

/**
 * Постройка клетки → метка. Эффект решает тот же cellBuildingEffect, что окно
 * постройки: эффект клетки, потом шаблона, потом имя. Поэтому ратуша,
 * назначенная только клетке (её нет в реестре raid_town), тоже город.
 * null — только кривые координаты.
 */
export function buildingMark(row: BuildingRow): WorldMark | null {
  const flag = row.has_effect;
  // Булево из базы бывает и строкой (разбор моста) — читаем терпимо.
  const hasEffect = flag === true || flag === "t" || flag === "true";
  const effect = cellBuildingEffect(
    row.cell_effect ? { effect: row.cell_effect } : null,
    hasEffect ? { effect: row.meta_effect } : {},
    row.name,
  );
  const q = Number(row.q);
  const r = Number(row.r);
  if (!Number.isInteger(q) || !Number.isInteger(r)) return null;
  return { kind: markKindOf(effect), q, r, group: row.group_id || null };
}
