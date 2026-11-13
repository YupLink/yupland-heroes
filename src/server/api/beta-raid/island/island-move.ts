// Переход между островом и основным миром — тем же переносом, что у портала
// между этажами (portal-ship): позиция пишется вместе с картой, судно остаётся
// у входа, обе карты узнают о переезде живым событием.
//
// На острове у героя «Сумка острова» — бафф Торговли (+5 ячеек рюкзака): у
// коммон-героя ячейка одна, а задание носит доски, бревна, руду, пыльцу и три
// инструмента. Вышел с острова — бафф снят; вещи остаются (рюкзак над
// ёмкостью доливает свои ячейки, новые не берёт — market-backpack). Плюс
// «Рюкзак новичка» — +4 ячейки на 7 дней с первого входа (putNewbieBag).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { publishRaid } from "@/server/raidLive";
import { leaveShipBehind, movePlayerThroughPortal, portalShipContext } from "../portal-ship";
import type { Cell } from "../encounter-where";

/** Торговля «Сумки острова»: +1 ячейка за каждые 10 (backpackCells). */
export const ISLAND_BAG_TRADE = 50;
const BUFF_SOURCE = "island";

export type MapCell = Cell & { mapId: string };

/** Где игрок сейчас (карта пустая — главный мир). */
export async function positionOf(account: string): Promise<MapCell | null> {
  const rows = (await mcpExec(
    `SELECT map_id, q, r FROM yuplink.beta_raid_positions
      WHERE account_id = ${sqlStr(account)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ map_id: string | null; q: number; r: number }>;
  const p = rows?.[0];
  if (!p) return null;
  const { activeBetaMapId } = await import("../encounter-where");
  return { mapId: p.map_id ?? (await activeBetaMapId()), q: Number(p.q), r: Number(p.r) };
}

/** Перенести игрока на клетку другой карты. false — позиция не записалась. */
export async function moveAcross(wallet: string, from: string | null, to: MapCell) {
  const leftShip = from !== to.mapId ? await leaveShipBehind(wallet) : false;
  // Возврат на клетку в море (админ вошёл с корабля) — на судно или на берег.
  const { exitWater } = await portalShipContext(wallet, to.mapId, to);
  const res = await movePlayerThroughPortal(
    wallet,
    to.mapId,
    { q: to.q, r: to.r },
    { ship: null, exitWater },
  );
  if (!res.moved) return false;
  if (from && from !== to.mapId) publishRaid({ mapId: from, type: "moved" });
  if (from && leftShip) publishRaid({ mapId: from, type: "ships" });
  publishRaid({ mapId: to.mapId, type: "moved" });
  return true;
}

/** Повесить «Сумку острова» (одна строка на аккаунт, срок с запасом). */
export async function putIslandBag(account: string): Promise<void> {
  const acc = sqlStr(account);
  await mcpExec(
    `INSERT INTO yuplink.beta_raid_player_effects
       (id, account_id, kind, value, expires_at, source, created_at)
     VALUES (${sqlStr(`eff_isle_${account}`)}, ${acc}, 'buff_trade', ${ISLAND_BAG_TRADE},
             now() + interval '30 days', ${sqlStr(BUFF_SOURCE)}, now())
     ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at;`,
  );
}

/**
 * Рюкзак новичка (владелец, 21.10.2026: «буст на 7 дней со времени входа в
 * игру: +4 ячейки рюкзака — всего 10»): Торговля +40 на 7 дней с первого входа
 * на остров. Раз на аккаунт — повторный вход срок не продлевает; выход с острова
 * его не снимает (источник свой, не «Сумка острова»).
 */
export const NEWBIE_BAG_TRADE = 40;
export const NEWBIE_BAG_DAYS = 7;

export async function putNewbieBag(account: string): Promise<void> {
  await mcpExec(
    `INSERT INTO yuplink.beta_raid_player_effects
       (id, account_id, kind, value, expires_at, source, created_at)
     VALUES (${sqlStr(`eff_newbie_${account}`)}, ${sqlStr(account)}, 'buff_trade', ${NEWBIE_BAG_TRADE},
             now() + interval '${NEWBIE_BAG_DAYS} days', 'newbie', now())
     ON CONFLICT (id) DO NOTHING;`,
  );
}

export async function dropIslandBag(account: string): Promise<void> {
  await mcpExec(
    `DELETE FROM yuplink.beta_raid_player_effects
      WHERE account_id = ${sqlStr(account)} AND source = ${sqlStr(BUFF_SOURCE)};`,
  );
}

/** Клетка выхода в основной мир: у замка мира (у ратуши Юпленда). */
export async function mainWorldStart(): Promise<MapCell> {
  const { activeBetaMapId } = await import("../encounter-where");
  const { startCell } = await import("../castle-door");
  const mapId = await activeBetaMapId();
  return { mapId, ...(await startCell(mapId)) };
}
