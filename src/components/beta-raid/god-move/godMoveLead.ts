// Откуда везём: ведущая клетка и все клетки, которые перенос трогает.
//
// Здание и декор в блоке едут блоком — от клетки, где они стоят (у блока она
// одна: «Объединить» второго здания и декора не допускает), где бы админ ни
// тапнул: окно постройки блока открывается с любой его клетки (blockInspectCell),
// а вектор переноса — цель − ведущая. Остальное едет с одной своей клетки.
import { readCellDetails, type MapLike } from "@/components/beta-raid/patchMapCache";
import { blockLayerHolder, membersOfGroup, parseKey } from "@/components/beta-raid/mergeSelect";
import type { GodCell, GodMoveKind } from "@/lib/godMove";

type From = GodCell & { kind: GodMoveKind; block?: boolean };

/** Ведущая клетка: у здания и декора в блоке — та, где они стоят; block — едет весь. */
export function leadOf<F extends From>(map: MapLike, f: F): F {
  if (f.kind !== "building" && f.kind !== "decor") return f;
  const gid = readCellDetails(map, f.q, f.r).groupId;
  if (!gid) return f;
  const lead = blockLayerHolder(map, gid, f.kind === "building" ? "buildingId" : "decorationId");
  return { ...f, ...(lead ?? {}), block: true };
}

/** Клетки, которые перенос трогает: у блока — все его, иначе — ведущая. */
export function unitCells(map: MapLike, f: From): GodCell[] {
  const gid = f.block ? readCellDetails(map, f.q, f.r).groupId : null;
  if (!gid || !map?.packed) return [{ q: f.q, r: f.r }];
  return membersOfGroup(map.packed, gid).map((k) => {
    const [q, r] = parseKey(k);
    return { q, r };
  });
}

/** Те же клетки после переноса ведущей на `to`. */
export function unitTargets(map: MapLike, f: From, to: GodCell): GodCell[] {
  return unitCells(map, f).map((c) => ({ q: c.q + to.q - f.q, r: c.r + to.r - f.r }));
}
