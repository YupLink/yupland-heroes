// Запись выросшего поселения на клетки и отчёт.
//
// Постройка едет одним патчем: шаблон, тир (достроена — последний), облик
// темы и снятый декор (дом в кустах — жалоба владельца 24.09). Дороги — по
// скелету (площадь — тоже слой дороги, шаг 5), кроме уже лежащих дорог карты,
// воды и клеток вне выделения.
import { keyOf, parseKey } from "@/lib/raid/zonegen/town/hex";
import type { TownState } from "@/lib/raid/zonegen/town/place-state";
import type { SettlementReport, ZoneStructure } from "@/lib/raid/zonegen/settlement-types";
import type { TownFields, TownInput } from "@/lib/raid/zonegen/town/types";

export type WriteArgs = {
  input: TownInput;
  /** Поля ВСЕЙ зоны: клетки вне выделения не пишем. */
  zone: TownFields;
  theme: string | null;
  shortfall: number;
};

/** Копилка правок: на клетку одна запись, порядок вставки детерминирован. */
function makeSink() {
  const at = new Map<string, ZoneStructure>();
  const edit = (k: string): ZoneStructure => {
    const has = at.get(k);
    if (has !== undefined) return has;
    const c = parseKey(k);
    const made: ZoneStructure = { q: c.q, r: c.r };
    at.set(k, made);
    return made;
  };
  return { at, edit };
}

export function emptyReport(): SettlementReport {
  return { places: 0, buildings: 0, roadCells: 0, byBuilding: {}, shortfall: 0 };
}

/** Записать постройки и дороги; собрать отчёт. */
export function writeTown(
  state: TownState,
  args: WriteArgs,
): { structures: ZoneStructure[]; report: SettlementReport } {
  const { input, zone } = args;
  const sink = makeSink();
  const report = emptyReport();
  report.shortfall = args.shortfall;
  report.form = state.skeleton.form;
  report.theme = args.theme;
  report.gates = state.skeleton.gates.length;

  for (const [k, pick] of state.at) {
    const cell = sink.edit(k);
    const o = pick.option;
    cell.buildingId = o.id;
    cell.decorationId = null;
    if (o.tiers > 0) cell.tier = input.built ? Math.max(0, o.tiers - 1) : 0;
    if (pick.skinId !== null) cell.buildingSkinId = pick.skinId;
    const name = o.name === "" ? o.id : o.name;
    report.byBuilding[name] = (report.byBuilding[name] ?? 0) + 1;
    report.buildings++;
  }
  report.places = report.buildings > 0 ? 1 : 0;

  if (input.roadId !== null) {
    const keys = [...state.skeleton.roads.keys(), ...state.skeleton.plaza.map(keyOf)];
    for (const k of keys) {
      if (!zone.dEdge.has(k) || zone.water.has(k) || input.mapRoads.has(k)) continue;
      if (state.at.has(k) || input.occupied.has(k)) continue;
      const cell = sink.edit(k);
      if (cell.roadId === input.roadId) continue;
      cell.roadId = input.roadId;
      cell.decorationId = null;
      report.roadCells++;
    }
  }
  return { structures: [...sink.at.values()], report };
}
