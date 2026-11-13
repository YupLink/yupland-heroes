// Вход в работу креатора и выход из работ (строка профиля, creator-api).
//
// Вход — на старт работы (places.spawn, «Старт героя» режима бога); откуда
// пришёл — запоминаем, но только если пришёл НЕ из другой работы: переход
// между работами не затирает дорогу домой. Выход — туда, откуда пришёл
// (карты нет — к замку основного мира). Как у демо-острова (demo-island).
import { mcpExec } from "@/server/db/mcpClient";
import { isCreatorMapId } from "@/lib/raid/creator/ids";
import type { Cell } from "@/lib/raid/worldgen/geo";
import {
  mainWorldStart,
  moveAcross,
  positionOf,
  type MapCell,
} from "../beta-raid/island/island-move";
import { backSql, saveBackSql, touchWorkSql } from "./creator-sql";
import type { WorkRef } from "./creator-store";

export type CreatorMove = { map: string; at: Cell };

async function loadBack(account: string): Promise<MapCell | null> {
  const rows = (await mcpExec(backSql(account), { wrapJson: true }).catch(() => [])) as Array<{
    map_id: string;
    q: number | string;
    r: number | string;
  }>;
  const b = rows?.[0];
  if (!b?.map_id) return null;
  return { mapId: b.map_id, q: Number(b.q), r: Number(b.r) };
}

/** В работу: уже там — на месте; иначе на старт, дорогу домой — запомнить. */
export async function enterWork(
  wallet: string,
  account: string,
  work: WorkRef,
): Promise<CreatorMove> {
  const here = await positionOf(account);
  if (here?.mapId === work.mapId) return { map: work.mapId, at: { q: here.q, r: here.r } };
  if (here && !isCreatorMapId(here.mapId))
    await mcpExec(saveBackSql(account, here), { wrapJson: false });
  const { ensureIslandHero } = await import("../beta-raid/island/island-hero");
  await ensureIslandHero(wallet, account);
  const to: MapCell = { mapId: work.mapId, ...work.spawn };
  if (!(await moveAcross(wallet, here?.mapId ?? null, to))) throw new Error("island.move_failed");
  await mcpExec(touchWorkSql(work.mapId), { wrapJson: false }).catch(() => {});
  return { map: work.mapId, at: work.spawn };
}

/** Из работ — туда, откуда пришёл. Не в работе — null. */
export async function leaveWorks(wallet: string, account: string): Promise<CreatorMove | null> {
  const here = await positionOf(account);
  if (!here || !isCreatorMapId(here.mapId)) return null;
  const { mapExists } = await import("../beta-raid/island/demo-island");
  const back = await loadBack(account);
  const to =
    back && !isCreatorMapId(back.mapId) && (await mapExists(back.mapId))
      ? back
      : await mainWorldStart();
  if (!(await moveAcross(wallet, here.mapId, to))) throw new Error("island.move_failed");
  return { map: to.mapId, at: { q: to.q, r: to.r } };
}

/** Стоит ли сейчас в работе креатора. */
export async function onCreatorWork(account: string): Promise<boolean> {
  const here = await positionOf(account).catch(() => null);
  return isCreatorMapId(here?.mapId);
}
