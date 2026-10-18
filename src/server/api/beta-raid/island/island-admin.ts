// Тест острова админом: войти (создать, если нет), выйти назад, сбросить.
// Новичку этих кнопок нет: его вход на остров — первая клетка, выход — портал.
import { createIsland, dropIsland } from "./island-create";
import { isLive, loadIsland, saveBack } from "./island-row";
import { ensureIslandHero } from "./island-hero";
import {
  dropIslandBag,
  mainWorldStart,
  moveAcross,
  positionOf,
  putIslandBag,
  type MapCell,
} from "./island-move";

export type IslandMoveResult = { ok: true; map: string };

export async function enterIsland(wallet: string, account: string): Promise<IslandMoveResult> {
  // Нет острова или его карту снесли после выхода — новый остров.
  const had = await loadIsland(account);
  const row = isLive(had) ? had : await createIsland(account, wallet);
  const here = await positionOf(account);
  if (here?.mapId === row.mapId) return { ok: true, map: row.mapId };
  // Возврат — туда, где стоял; на чужом острове (старый, снесённый) — к замку.
  if (here) await saveBack(account, here);
  await ensureIslandHero(wallet, account);
  await putIslandBag(account);
  const spawn: MapCell = { mapId: row.mapId, ...row.places.spawn };
  if (!(await moveAcross(wallet, here?.mapId ?? null, spawn))) {
    await dropIslandBag(account);
    throw new Error("island.move_failed");
  }
  return { ok: true, map: row.mapId };
}

/** Куда вернуть с острова: откуда пришёл, иначе к замку основного мира. */
async function backOf(account: string): Promise<MapCell> {
  const row = await loadIsland(account);
  return row?.back ?? (await mainWorldStart());
}

export async function leaveIsland(wallet: string, account: string): Promise<IslandMoveResult> {
  const row = await loadIsland(account);
  const here = await positionOf(account);
  if (!isLive(row) || here?.mapId !== row.mapId) {
    await dropIslandBag(account);
    return { ok: true, map: here?.mapId ?? (await mainWorldStart()).mapId };
  }
  const to = await backOf(account);
  if (!(await moveAcross(wallet, row.mapId, to))) throw new Error("island.move_failed");
  await dropIslandBag(account);
  return { ok: true, map: to.mapId };
}

/** Сброс: уйти с острова, снести его и войти на новый (точка возврата — та же). */
export async function resetIsland(wallet: string, account: string): Promise<IslandMoveResult> {
  const row = await loadIsland(account);
  if (isLive(row)) {
    // Оставленное на острове уходит вместе с ним (dropIslandSql).
    await leaveIsland(wallet, account);
    await dropIsland(row.mapId);
  }
  return enterIsland(wallet, account);
}
