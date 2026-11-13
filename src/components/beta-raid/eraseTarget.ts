// Что снимает ластик режима бога (владелец, 07.11.2026: «в ластике должно быть
// несколько режимов — и возможность стирать сам тип местности»).
//
//  · top — по одному слою за тап, сверху вниз: объект → декор → постройка →
//    дорога (как было: один тап не уносит всё разом — жалоба владельца);
//  · object / decor / building / road — только этот слой, остальное не трогает;
//  · terrain — клетку целиком: местность и всё, что на ней (без земли объект
//    стал бы невидимой преградой). Только в мире креатора: на живой карте
//    клетка без земли пропала бы у игроков (map-base её не отдаёт).
// В блоке декор и постройка — одни на весь блок и стоят на своих клетках:
// ластик по любой клетке блока стирает их там (held).
import type { CellPatch } from "./patchMapCache";

export type EraseTarget = "top" | "object" | "decor" | "building" | "road" | "terrain";

export const ERASE_TARGETS: readonly EraseTarget[] = [
  "top",
  "object",
  "decor",
  "building",
  "road",
  "terrain",
];

type Before = {
  terrainId: string | null;
  roadId: string | null;
  decorationId: string | null;
  objectId: string | null;
  buildingId: string | null;
  groupId?: string | null;
};
type Cell = { q: number; r: number };
type Held = (f: "buildingId" | "decorationId") => Cell | null;

/** Правка ластика для клетки q,r; null — снимать нечего. */
export function erasePatch(
  before: Before,
  target: EraseTarget,
  q: number,
  r: number,
  held: Held,
): CellPatch | null {
  const decor = before.decorationId ? { q, r } : held("decorationId");
  const bld = before.buildingId ? { q, r } : held("buildingId");
  const object = before.objectId ? { q, r, objectId: null } : null;
  const decorP = decor ? { ...decor, decorationId: null } : null;
  const bldP = bld ? { ...bld, buildingId: null } : null;
  // Дорога — не местность, лежит поверх; земля под ней остаётся нетронутой.
  const road = before.roadId ? { q, r, roadId: null } : null;
  switch (target) {
    case "object":
      return object;
    case "decor":
      return decorP;
    case "building":
      return bldP;
    case "road":
      return road;
    case "terrain": {
      const any =
        before.terrainId ||
        before.objectId ||
        before.decorationId ||
        before.buildingId ||
        before.roadId;
      if (!any && !before.groupId) return null;
      return {
        q,
        r,
        terrainId: null,
        roadId: null,
        objectId: null,
        decorationId: null,
        buildingId: null,
        ...(before.groupId ? { groupId: null } : {}),
      };
    }
    default:
      return object ?? decorP ?? bldP ?? road;
  }
}
