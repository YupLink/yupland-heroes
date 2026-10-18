// Правки поверх простых клеток: дома и улицы городов, дороги сети, декор у
// улиц (городской — или снятый). Всё — из сети (network.networkNear), то есть
// из мира, а не из того, что уже записано на карте.
import { DIRS, keyOf } from "@/lib/raid/zonegen/town/hex";
import { takenOf } from "@/lib/raid/worldgen/links";
import type { Network } from "@/lib/raid/worldgen/network";
import type { BuiltTown } from "@/lib/raid/worldgen/town";
import type { WorldCell } from "@/lib/raid/worldgen/spec";
import type { ZoneStructure } from "@/lib/raid/zonegen/settlement-types";

export type Edit =
  | {
      kind: "building";
      id: string;
      skin: string | null;
      tier: number | null;
      config?: Record<string, unknown> | null;
    }
  | { kind: "road"; id: string }
  | { kind: "decor"; id: string }
  | { kind: "clear" };

/** Что важнее на одной клетке: дом и дорога — декора, декор — простого «снять». */
const RANK: Record<Edit["kind"], number> = { clear: 0, decor: 1, road: 2, building: 2 };

function editOf(s: ZoneStructure): Edit | null {
  if (typeof s.buildingId === "string") {
    return {
      kind: "building",
      id: s.buildingId,
      skin: s.buildingSkinId ?? null,
      tier: s.tier ?? null,
    };
  }
  if (typeof s.roadId === "string") return { kind: "road", id: s.roadId };
  return s.decorationId === null ? { kind: "clear" } : null;
}

/**
 * Правка на клетку: под домом и дорогой ни декора, ни объекта; «clear» снимает
 * декор; городской декор встаёт на место объекта (объект — только без декора).
 */
export function applyEdit(cell: WorldCell, e: Edit): WorldCell {
  if (e.kind === "clear") return { ...cell, decorationId: null };
  if (e.kind === "decor")
    return { ...cell, decorationId: e.id, objectId: null, objectConfig: null };
  const out: WorldCell = { ...cell, decorationId: null, objectId: null, objectConfig: null };
  if (e.kind === "road") return { ...out, roadId: e.id };
  return {
    ...out,
    buildingId: e.id,
    buildingSkinId: e.skin,
    tier: e.tier,
    buildingConfig: e.config ?? null,
  };
}

/** Городской декор у улицы: id или null (тогда клетку просто расчищаем). */
export type TownDecor = (town: BuiltTown, q: number, r: number) => string | null;

/**
 * Правки сети: дома и улицы всех городов, у улиц — городской декор или
 * расчистка («у дороги лесной декор вредит», шаг 15 роста), дороги между
 * узлами — только по свободной от города земле. У дорог сети декор по бокам
 * остаётся: лес у дороги — лес.
 */
export function editsOf(
  net: Network,
  roadId: string | null,
  townDecor: TownDecor = () => null,
): Map<string, Edit> {
  const edits = new Map<string, Edit>();
  const put = (k: string, e: Edit) => {
    const was = edits.get(k);
    if (was === undefined || RANK[e.kind] > RANK[was.kind]) edits.set(k, e);
  };
  for (const t of net.towns) {
    for (const s of t.structures) {
      const e = editOf(s);
      if (e !== null) {
        const config = e.kind === "building" ? t.configs.get(keyOf(s)) : undefined;
        put(keyOf(s), e.kind === "building" && config ? { ...e, config } : e);
      }
      if (typeof s.roadId !== "string") continue;
      for (const [dq, dr] of DIRS) {
        const c = { q: s.q + dq, r: s.r + dr };
        const id = townDecor(t, c.q, c.r);
        put(keyOf(c), id === null ? { kind: "clear" } : { kind: "decor", id });
      }
    }
  }
  if (roadId === null) return edits;
  const taken = takenOf(net.towns);
  for (const path of net.roads) {
    for (const k of path) if (!taken.has(k)) put(k, { kind: "road", id: roadId });
  }
  return edits;
}
