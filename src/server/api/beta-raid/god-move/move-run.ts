// Исполнение переноса по видам: запрос, разбор ответа, журнал сервера, рассылка.
//
// Каждый вид — один запрос (локи, решение и запись одной транзакцией). Ответ
// без строки — ошибка «godmove.failed», а не рапорт о переносе, которого не
// видели. След переноса в журнале сервера — что и сколько строк переехало: на
// случай вопроса «куда делся мой склад / сундук».
import { mcpExec } from "@/server/db/mcpClient";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { ensureTownSchema } from "@/server/api/beta-raid/town-resolve";
import {
  cellKey,
  newCells,
  parseUnit,
  unitParts,
  unitReadSql,
  unitTooMany,
  type UnitAt,
  type UnitKind,
} from "@/server/api/beta-raid/god-move/move-unit";
import {
  moveUnitSql,
  parseUnitRow,
  unitWriteNames,
  type UnitRow,
} from "@/server/api/beta-raid/god-move/move-sql";
import {
  OBJECT_WRITE_NAMES,
  moveObjectSql,
  parseObjectRow,
  type ObjectRow,
} from "@/server/api/beta-raid/god-move/move-object-sql";
import {
  chestWriteNames,
  moveChestSql,
  parseChestRow,
  type ChestRow,
} from "@/server/api/beta-raid/god-move/move-chest-sql";
import {
  BAGS_WRITE_NAMES,
  moveBagsSql,
  parseBagsRow,
  type BagsRow,
} from "@/server/api/beta-raid/god-move/move-bags-sql";
import { movedCounts } from "@/server/api/beta-raid/god-move/move-row";
import { spawnFollowSql } from "@/server/api/beta-raid/mob-spawn/mob-spawn-sql";
import {
  announceBags,
  announceChest,
  announceObject,
  announceUnit,
} from "@/server/api/beta-raid/god-move/move-announce";
import type { GodCell, GodMoveKind, GodMoveReason, GodMoveResult } from "@/lib/godMove";

/** Перенос: карта, вид, откуда, куда и что видел админ (id, хозяин, мешочки). */
export type MoveIn = { mapId: string; kind: GodMoveKind; from: GodCell; to: GodCell; ref: string };

export const refuse = (reason: GodMoveReason): GodMoveResult => ({
  ok: false,
  reason,
  leftovers: [],
});

/**
 * Рассылка после коммита: её сбой перенос не отменяет и админу ошибкой не
 * уходит (повтор ответил бы «уже там») — карта догонит журналом, сбой — в лог.
 */
async function announce(what: string, run: () => Promise<void> | void): Promise<void> {
  try {
    await run();
  } catch (e) {
    console.warn(`[godmove] рассылка (${what}) не ушла:`, (e as Error).message);
  }
}

async function exec<T>(sql: string): Promise<T | undefined> {
  return sqlRow<T>(await mcpExec(sql, { wrapJson: false }));
}

/** Разобранный ответ: нет — ошибка; отказ — как есть; иначе — журнал сервера. */
function settle(
  o: MoveIn,
  res: GodMoveResult | undefined,
  row: Record<string, unknown> | undefined,
  names: readonly string[],
): GodMoveResult {
  if (!res) throw new Error("godmove.failed");
  if (res.ok && !res.already) {
    const at = `${cellKey(o.from)} → ${cellKey(o.to)}`;
    console.info("[godmove]", o.kind, o.mapId, at, movedCounts(row, names));
  }
  return res;
}

/** Здание или декор: клетка или весь блок (move-unit). */
async function runUnit(o: MoveIn, kind: UnitKind): Promise<GodMoveResult> {
  const unit = parseUnit(await mcpExec(unitReadSql(o.mapId, o.from), { wrapJson: true }), o.from);
  if (!unit) return refuse("gone");
  if (unitTooMany(unit)) return refuse("block_many");
  const at: UnitAt = { mapId: o.mapId, from: o.from, to: o.to, kind, ref: o.ref, unit };
  const parts = unitParts(at);
  // Ратуша, склад города и привязка лавок — таблицы города (town-02/03).
  if (parts.building) await ensureTownSchema();
  const row = await exec<UnitRow>(moveUnitSql(at));
  const res = settle(o, parseUnitRow(row), row, unitWriteNames(at));
  if (!res.ok) return res;
  const seen = new Map([...unit.cells, ...newCells(at)].map((c) => [cellKey(c), c]));
  const touched = [...seen.values()];
  await announce(o.kind, () => announceUnit(o.mapId, { cells: res.moved.cells, touched, parts }));
  return res;
}

async function runObject(o: MoveIn): Promise<GodMoveResult> {
  // Моб с точкой возрождения: точка едет с ним той же транзакцией (mob-spawn).
  const row = await exec<ObjectRow>(moveObjectSql(o, spawnFollowSql(o.mapId, o.from, o.to)));
  const res = settle(o, parseObjectRow(row), row, OBJECT_WRITE_NAMES);
  if (res.ok)
    await announce("object", () => announceObject(o.mapId, o.from, o.to, row?.bags_from === true));
  return res;
}

/** Сундук: ref — «magic:<хозяин>» или «plain:<id сундука>». */
async function runChest(o: MoveIn): Promise<GodMoveResult> {
  const m = /^(magic|plain):(.+)$/.exec(o.ref);
  if (!m) return refuse("changed");
  const at = { mapId: o.mapId, from: o.from, to: o.to, magic: m[1] === "magic", ref: m[2] };
  const row = await exec<ChestRow>(moveChestSql(at));
  const res = settle(o, parseChestRow(row), row, chestWriteNames(at));
  if (res.ok) await announce("chest", () => announceChest(o.mapId, o.from, o.to));
  return res;
}

/** Мешочки клетки: ref — id мешочков, что видел админ, через запятую. */
async function runBags(o: MoveIn): Promise<GodMoveResult> {
  const ids = o.ref
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
  const row = await exec<BagsRow>(moveBagsSql({ ...o, ids }));
  const res = settle(o, parseBagsRow(row), row, BAGS_WRITE_NAMES);
  if (res.ok) await announce("bags", () => announceBags(o.mapId, o.from, o.to));
  return res;
}

/** Перенос любого вида. Права, карта и «та же клетка» проверены до вызова. */
export function runMove(o: MoveIn): Promise<GodMoveResult> {
  switch (o.kind) {
    case "building":
    case "decor":
      return runUnit(o, o.kind);
    case "object":
      return runObject(o);
    case "chest":
      return runChest(o);
    case "bags":
      return runBags(o);
  }
}
