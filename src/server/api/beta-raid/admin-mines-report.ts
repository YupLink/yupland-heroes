// Админ-сводка по шахтам: сколько добывается всего и какого сырья.
//
// Игроки просили «сводный отчёт о работе шахт — сколько и какого типа сырья
// добывается всего». Владелец 14.09 подтвердил. Считаем только ВЛАДЕЕМЫЕ
// шахты: свободные (без raid_mine_state) не капают.
//
// yield/resource/token живут в building_config клетки — парсим их же
// парсером, что и mine-action. Итог — Map<name, {perHour, count}>.
import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "../../auth";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { activeBetaMapId } from "./encounter-where";
import { cellMineConfig } from "@/lib/mineConfig";

type Row = {
  q: number;
  r: number;
  building_config: unknown;
  template_meta: unknown;
  owner_account: string | null;
  claimed_hours: number | string | null;
  guarded: boolean;
};

export type MinesReport = {
  totalCells: number;
  ownedCells: number;
  guardedCells: number;
  totalPerHour: number;
  byResource: Array<{
    name: string;
    count: number;
    perHour: number;
    ownedCount: number;
    ownedPerHour: number;
  }>;
};

const MINE_SQL = `(t.name ILIKE '%шахт%' OR t.meta->>'effect' = 'mine')`;

export const getMinesReport = createServerFn({ method: "GET" }).handler(
  async (): Promise<MinesReport> => {
    requireAdmin();
    const mapId = await activeBetaMapId();

    // Клетки-шахты (по шаблону) + их состояние захвата и охрана.
    const rows = (await mcpExec(
      `SELECT c.q, c.r, c.building_config, t.meta AS template_meta,
              s.owner_account, s.claimed_hours,
              EXISTS(
                SELECT 1 FROM yuplink.raid_mine_guard g
                 WHERE g.map_id = c.map_id AND g.q = c.q AND g.r = c.r
              ) AS guarded
         FROM yuplink.raid_map_cells c
         JOIN yuplink.mystic_item_template t ON t.id = c.building_id
         LEFT JOIN yuplink.raid_mine_state s
           ON s.map_id = c.map_id AND s.q = c.q AND s.r = c.r
        WHERE c.map_id = ${sqlStr(mapId)} AND ${MINE_SQL};`,
      { wrapJson: true },
    ).catch(() => [])) as Row[];

    const perKind = new Map<
      string,
      { count: number; perHour: number; ownedCount: number; ownedPerHour: number }
    >();
    let ownedCells = 0;
    let guardedCells = 0;
    let totalPerHour = 0;

    for (const r of rows ?? []) {
      const cfg = cellMineConfig(r.building_config, r.template_meta);
      if (!cfg || !(cfg.yield > 0)) continue;
      const name = cfg.resource === "token" ? (cfg.token ?? "token") : cfg.resource;
      const owned = !!r.owner_account;
      if (owned) ownedCells += 1;
      if (r.guarded) guardedCells += 1;

      const entry = perKind.get(name) ?? {
        count: 0,
        perHour: 0,
        ownedCount: 0,
        ownedPerHour: 0,
      };
      entry.count += 1;
      entry.perHour += cfg.yield;
      if (owned) {
        entry.ownedCount += 1;
        entry.ownedPerHour += cfg.yield;
        totalPerHour += cfg.yield;
      }
      perKind.set(name, entry);
    }

    const byResource = [...perKind.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.ownedPerHour - a.ownedPerHour || b.perHour - a.perHour);

    return {
      totalCells: rows.length,
      ownedCells,
      guardedCells,
      totalPerHour,
      byResource,
    };
  },
);
