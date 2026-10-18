// Перенос прошёл — что окно админа правит в кэше сразу и что перечитывает.
//
// Ответ сервера рисуем сразу (клетки карты здания, блока и декора; объект —
// с прежней клетки на новую), а следом перечитываются слои, привязанные к
// клеткам: окна построек и их бейджи, сундуки с охраной, мешочки и бугорки,
// состав клеток в окне. Перезагрузка страницы не нужна; у остальных — рассылка
// сервера (move-announce). Повтор («уже там») ничего не правит — только
// перечитывает: первый ответ мог потеряться.
import type { QueryClient } from "@tanstack/react-query";
import { invalidateRaidMap } from "@/lib/query";
import {
  cellPatches,
  godMoveParts,
  type GodCell,
  type GodMoveKind,
  type GodMoveResult,
} from "@/lib/godMove";
import {
  applyCellPatches,
  type CellPatch,
  type MapLike,
} from "@/components/beta-raid/patchMapCache";
import { MAP_KEY } from "@/components/beta-raid/useMapProgressive";
import { invalidateChests } from "@/components/beta-raid/chest/chestLive";
import { invalidateBags } from "@/components/beta-raid/loot-bag/lootBagLive";

/** Состав земли клетки в окне админа (сундук, мешочки) — god-move/useCellGround. */
export const GROUND_KEY = "admin-cell-ground";

/** Слои карты, привязанные к клеткам построек: после переезда — перечитать. */
const OVERLAY_KEYS = [
  "beta-raid-mine-guards",
  "beta-raid-mine-flags",
  "beta-raid-harvest",
  "beta-raid-field-slots",
  "beta-raid-warehouse-badges",
  "beta-raid-tower-used",
  "beta-raid-spell-pillars",
  "beta-raid-door-tolls",
  "my-warehouses",
] as const;

type Moved = Extract<GodMoveResult, { ok: true }>["moved"];

/** Что переносили: вид, ведущая клетка и блок ли это. */
export type MoveWhat = GodCell & { kind: GodMoveKind; block?: boolean };

function patchesOf(what: MoveWhat, to: GodCell, moved: Moved): CellPatch[] {
  if (moved.object) {
    return [
      { q: what.q, r: what.r, objectId: null, runner: false },
      { q: to.q, r: to.r, objectId: moved.object.id, runner: false, alive: moved.object.alive },
    ];
  }
  return cellPatches(moved.cells, godMoveParts(what.kind, !!what.block));
}

const refetch = (qc: QueryClient, key: string) =>
  void qc.invalidateQueries({ queryKey: [key], refetchType: "all" });

export function applyGodMove(
  qc: QueryClient,
  what: MoveWhat,
  to: GodCell,
  res: Extract<GodMoveResult, { ok: true }>,
): void {
  const patches = res.already ? [] : patchesOf(what, to, res.moved);
  if (patches.length > 0)
    qc.setQueryData(MAP_KEY, (old: MapLike) => applyCellPatches(old, patches));
  refetch(qc, GROUND_KEY);
  switch (what.kind) {
    case "building":
    case "decor":
      invalidateRaidMap(qc, what.kind === "building" || what.block ? OVERLAY_KEYS : []);
      // Декор закрывает и открывает мешочки и бугорки под собой (§8.19).
      if (what.kind === "decor" || what.block) invalidateBags(qc);
      return;
    case "object":
      invalidateRaidMap(qc);
      invalidateBags(qc);
      return;
    case "chest":
      invalidateChests(qc);
      invalidateBags(qc);
      refetch(qc, "beta-raid-mine-guards");
      return;
    case "bags":
      invalidateBags(qc);
      return;
  }
}
