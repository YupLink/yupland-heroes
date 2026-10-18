// Мои шахты с накопленной добычей — для плашки сбора над картой рейда.
// Отдаём секундомер (captured_at) + claimed_hours + выход, клиент считает
// накопление сам (живо тикает, как накопление лайков в стейке). Доступно всем:
// у кого нет своих захваченных шахт — вернётся пусто.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { getCurrentWallet } from "../../auth";
import { myMapId } from "./encounter-where";
import { accAccountId } from "../currency/move";
import type { MineResource } from "@/lib/buildingEffect";

export type MineRow = {
  /** Карта шахты: в «Добыче» шахты со всех этажей сразу. */
  mapId: string;
  /** Название ДРУГОГО этажа (не того, где стоит игрок); свой — null. */
  floor?: string | null;
  q: number;
  r: number;
  resource: MineResource;
  token: string | null;
  yield: number;
  claimedHours: number;
  capturedAt: number;
  /** Предел часов добычи (лесопилка острова — неделя); null — без предела. */
  maxHours: number | null;
};

/** Настроенные шахты, которыми владеет аккаунт на карте (для клейма/показа). */
export async function ownedMineRows(mapId: string, account: string): Promise<MineRow[]> {
  const rows = (await mcpExec(
    `SELECT s.q, s.r, s.claimed_hours,
            extract(epoch from s.captured_at)*1000 AS cap,
            c.building_config->>'resource' AS resource,
            c.building_config->>'token'    AS token,
            (c.building_config->>'yield')::numeric AS yield,
            (c.building_config->>'maxHours')::numeric AS max_hours
       FROM yuplink.raid_mine_state s
       JOIN yuplink.raid_map_cells c ON c.map_id=s.map_id AND c.q=s.q AND c.r=s.r
      WHERE s.map_id=${sqlStr(mapId)} AND s.owner_account=${sqlStr(account)}
        AND (c.building_config->>'resource') IS NOT NULL
        AND COALESCE((c.building_config->>'yield')::numeric,0) > 0;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{
    q: number;
    r: number;
    claimed_hours: number;
    cap: number;
    resource: string;
    token: string | null;
    yield: number;
    max_hours: number | null;
  }>;
  return (rows ?? []).map((x) => ({
    mapId,
    q: Number(x.q),
    r: Number(x.r),
    resource: x.resource as MineResource,
    token: x.token ?? null,
    yield: Number(x.yield) || 0,
    claimedHours: Number(x.claimed_hours) || 0,
    capturedAt: Number(x.cap) || 0,
    maxHours: Number(x.max_hours) > 0 ? Number(x.max_hours) : null,
  }));
}

export const getMyMinePendings = createServerFn({ method: "GET" }).handler(
  async (): Promise<MineRow[]> => {
    const wallet = getCurrentWallet();
    if (!wallet) return [];
    const account = await accAccountId(wallet).catch(() => null);
    if (!account) return [];
    const mapId = await myMapId(wallet).catch(() => null);
    if (!mapId) return [];
    return ownedMineRows(mapId, account);
  },
);
