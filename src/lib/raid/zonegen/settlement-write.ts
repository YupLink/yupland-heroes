// Запись плана на клетки: копилка правок, дворы, улицы.
//
// Отдельным файлом из-за потолка в 250 строк: settlement-layout.ts — план,
// settlement-place.ts — геометрия, здесь — что ложится на клетку, а в
// settlement.ts остаётся порядок и отчёт.
import { ZONE_MAX_CELLS } from "@/lib/raid/zonegen/recipe";
import { cellKey, type PlacedBuilding } from "@/lib/raid/zonegen/settlement-place";
import type { SettlementReport, ZoneStructure } from "@/lib/raid/zonegen/settlement-types";

export type Sink = {
  at: Map<string, ZoneStructure>;
  /** Правка клетки; null — упёрлись в потолок клеток за вызов. */
  edit: (q: number, r: number) => ZoneStructure | null;
};

/** Копилка клеточных правок: на клетку — одна запись, всего не больше зоны. */
export function makeSink(): Sink {
  const at = new Map<string, ZoneStructure>();
  return {
    at,
    edit(q: number, r: number): ZoneStructure | null {
      const k = cellKey(q, r);
      const has = at.get(k);
      if (has !== undefined) return has;
      if (at.size >= ZONE_MAX_CELLS) return null;
      const made: ZoneStructure = { q, r };
      at.set(k, made);
      return made;
    },
  };
}

/** Записать дворы: тир — «достроена», и только у шаблонов, где тиры вообще есть. */
export function writeBuildings(
  sink: Sink,
  placed: PlacedBuilding[],
  built: boolean,
  report: SettlementReport,
): void {
  for (const p of placed) {
    const cell = sink.edit(p.q, p.r);
    if (cell === null) return;
    cell.buildingId = p.option.id;
    // Ставим дом — стираем ёлку: иначе постройка встаёт поверх декора, и на
    // карте получается дом в кустах (владелец, 24.09: «спавнится на объекты»).
    cell.decorationId = null;
    if (p.option.tiers > 0) cell.tier = built ? Math.max(0, p.option.tiers - 1) : 0;
    const name = p.option.name === "" ? p.option.id : p.option.name;
    report.byBuilding[name] = (report.byBuilding[name] ?? 0) + 1;
    report.buildings++;
  }
}

/**
 * Улицы на клетки. Под домом дороги не пишем — запись затёрла бы дом, — а
 * уже положенные этим прогоном пропускаем: сосед цепляется к ним даром.
 *
 * Декор под улицей гасим по той же причине, что и под домом: местность с
 * ёлками генератор посчитал раньше, чем провёл улицу, и без этого посреди
 * мостовой остаётся дерево.
 */
export function writeRoads(sink: Sink, keys: string[], roadId: string, laid: Set<string>): void {
  for (const k of keys) {
    if (laid.has(k)) continue;
    const i = k.indexOf(",");
    const cell = sink.edit(Number(k.slice(0, i)), Number(k.slice(i + 1)));
    if (cell === null || cell.buildingId !== undefined) continue;
    cell.roadId = roadId;
    cell.decorationId = null;
    laid.add(k);
  }
}
