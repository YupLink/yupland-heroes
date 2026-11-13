// «Управление шахтами»: свои шахты v2 на всех картах — для окна в замке.
//
// Строки — тем же читателем, что «Добыча» (ownedMineRows: накопленное, режим,
// запас службы), по каждой карте, где у аккаунта есть шахта; сверху — клетка,
// название карты (этажа) и уровень (§8.74). Грибы и шахты старого образца
// (DARAI, энергия, пыль, лесопилки с пределом часов) не попадают: режимов и
// починки у них нет.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { ownedMineRows, type MineRow } from "@/server/api/beta-raid/mine-pendings";
import {
  MINE_V2_RESOURCES,
  mineMode,
  mineRepairCost,
  mineStdYield,
  mineV2Of,
  natureNOf,
  type MineV2Resource,
} from "@/lib/mineV2";
import type { MineV2View } from "@/lib/mineExtra";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { officeWho, requireMineOffice } from "./mine-office-own";

export type OfficeMine = MineRow & {
  kind: MineV2Resource;
  /** Уровень шахты (§8.74). */
  level: number;
  /** Название этажа или карты; нет — null. */
  place: string | null;
  /** Запас службы, режим и цена починки — как в окне шахты. */
  view: MineV2View;
};

type OfficeCell = {
  map_id: string;
  q: number | string;
  r: number | string;
  place: string | null;
  level: number | string | null;
  /** Деревьев (гор) рядом (§8.80). */
  nature_n?: number | string | null;
};

/** Клетки шахт v2 аккаунта на всех картах, с названием карты и уровнем. */
export const officeCellsSql = (account: string): string =>
  `SELECT s.map_id, s.q, s.r,
          COALESCE((SELECT f.name FROM yuplink.raid_floor f WHERE f.map_id = s.map_id LIMIT 1),
                   m.name) AS place,
          yuplink.raid_mine_level(c.building_config) AS level,
          c.building_config->>'natureN' AS nature_n
     FROM yuplink.raid_mine_state s
     JOIN yuplink.raid_map_cells c ON c.map_id = s.map_id AND c.q = s.q AND c.r = s.r
     LEFT JOIN yuplink.raid_maps m ON m.id = s.map_id
    WHERE s.owner_account = ${sqlStr(account)} AND s.accrue_from IS NOT NULL
      AND yuplink.raid_mine_v2_std(c.building_config) IS NOT NULL;`;

const cellKey = (mapId: string, q: number, r: number): string => `${mapId}:${q},${r}`;

/** Строка «Добычи» + клетка → строка окна; не шахта v2 — null. */
export function officeMine(row: MineRow, cell: OfficeCell | undefined): OfficeMine | null {
  const kind = mineV2Of({ resource: row.resource });
  if (!cell || !row.v2 || row.mushroom || !kind) return null;
  const level = Math.max(1, Math.floor(Number(cell.level) || 1));
  const flag = row.island === true;
  // Правила острова (цена починки) — флаг клетки вместе с картой острова.
  const island = flag && isIslandMapId(row.mapId);
  const nature = !flag && (kind === "wood" || kind === "stone") ? natureNOf(cell.nature_n) : null;
  const view: MineV2View = {
    ...row.v2,
    stdYield: mineStdYield(kind, flag, level, nature),
    nature,
    mult: mineMode(row.v2.mode).mult,
    repairCost: mineRepairCost(kind, island),
    island,
    stepHours: row.stepHours,
    level,
  };
  return { ...row, kind, level, place: cell.place ?? null, view };
}

const kindOrder = (k: MineV2Resource): number => MINE_V2_RESOURCES.indexOf(k);

/** Карта, вид (дерево → алмазы), клетка. */
export function sortOfficeMines(list: OfficeMine[]): OfficeMine[] {
  return [...list].sort(
    (a, b) =>
      (a.place ?? a.mapId).localeCompare(b.place ?? b.mapId) ||
      a.mapId.localeCompare(b.mapId) ||
      kindOrder(a.kind) - kindOrder(b.kind) ||
      a.q - b.q ||
      a.r - b.r,
  );
}

/** Все свои шахты v2 аккаунта. */
export async function officeMines(account: string): Promise<OfficeMine[]> {
  const cells = ((await mcpExec(officeCellsSql(account), { wrapJson: true })) ??
    []) as OfficeCell[];
  const meta = new Map(cells.map((c) => [cellKey(c.map_id, Number(c.q), Number(c.r)), c]));
  const maps = [...new Set(cells.map((c) => c.map_id))];
  const rows = (await Promise.all(maps.map((id) => ownedMineRows(id, account)))).flat();
  const list = rows
    .map((row) => officeMine(row, meta.get(cellKey(row.mapId, row.q, row.r))))
    .filter((m): m is OfficeMine => m !== null);
  return sortOfficeMines(list);
}

export type MineOfficeView = { mines: OfficeMine[]; serverNow: number };

/** Окно «Управление шахтами»: только у построивших здание. */
export const getMineOfficeMines = createServerFn({ method: "GET" }).handler(
  async (): Promise<MineOfficeView> => {
    const { account } = await officeWho();
    await requireMineOffice(account);
    return { mines: await officeMines(account), serverNow: Date.now() };
  },
);
