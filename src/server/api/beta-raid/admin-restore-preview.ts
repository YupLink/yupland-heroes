// Что именно вернётся на карту — счёт перед нажатием «Восстановить».
//
// Раньше строка вида «Сундуки · в них 1 740 000 Darai · 100» не отвечала на
// главный вопрос: сколько из этой сотни платят Darai, сколько USDT, а сколько
// вообще не стоят денег. Теперь каждый вид разбит по валюте, и группы не
// пересекаются: объект попадает ровно в одну (только Darai, только USDT, обе
// сразу, без монет) — поэтому числа складываются в итог.
//
// Считается ровно тем же фильтром, что и сама кнопка (restore-reward-sql):
// обещание и результат обязаны совпадать.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { activeBetaMapId } from "./encounter-where";
import { godMapId } from "./god-map";
import { bossLevelSql } from "./bossLevelFilter";
import { BOSS_TEMPLATE_JOIN, resourceFilterSql, resourceSumSql } from "./restore-reward-sql";
import { POS_MAP_SQL } from "./pos-map-sql";

/** Вид объекта в отчёте — те же четыре галочки, что в панели админа. */
export type PreviewKind = "boss" | "chests" | "coins" | "artifacts";
/** Чем платит объект. Группы взаимоисключающие. */
export type ResourceGroup = "darai" | "usdt" | "both" | "none";

export type GroupCount = { count: number; darai: number; usdt: number };
export type PreviewRow = { total: number; groups: Partial<Record<ResourceGroup, GroupCount>> };

export type RestorePreview = {
  rows: Record<PreviewKind, PreviewRow>;
  /** Стоят под игроками — такие не поднимаем никогда. */
  skippedUnderPlayers: number;
  /** Не поднимем из-за снятой галочки валюты. */
  blocked: GroupCount;
};

const KINDS: PreviewKind[] = ["boss", "chests", "coins", "artifacts"];

const emptyRow = (): PreviewRow => ({ total: 0, groups: {} });

/**
 * Вид объекта прямо в SQL. Монетка и сундук в базе — один вид (chest) и
 * различаются запасом HP: у монетки он равен 1, выбивать нечего.
 */
const KIND_CASE = `CASE
    WHEN c.object_id LIKE 'boss:%' THEN 'boss'
    WHEN t.kind = 'chest' AND COALESCE((t.meta->>'maxHp')::numeric, 10000) > 1 THEN 'chests'
    WHEN t.kind = 'chest' THEN 'coins'
    WHEN t.kind = 'artifact' THEN 'artifacts'
    ELSE 'other' END`;

const sql = (mapId: string, levels: string, ok: string) => `
SELECT kind, grp, count(*)::int AS n,
       COALESCE(SUM(darai), 0) AS darai, COALESCE(SUM(usdt), 0) AS usdt
  FROM (
    SELECT ${KIND_CASE} AS kind,
           CASE WHEN rw.darai > 0 AND rw.usdt > 0 THEN 'both'
                WHEN rw.darai > 0 THEN 'darai'
                WHEN rw.usdt > 0 THEN 'usdt'
                ELSE 'none' END AS grp,
           rw.darai, rw.usdt, allow.ok, busy.taken,
           -- Босса поднимаем только павшего: подранок — это чужой начатый бой.
           (c.object_id NOT LIKE 'boss:%' OR h.killed_at IS NOT NULL) AS boss_dead,
           (c.object_id NOT LIKE 'boss:%' OR TRUE${levels}) AS level_ok
      FROM yuplink.beta_raid_object_hp h
      JOIN yuplink.raid_map_cells c ON c.map_id = h.map_id AND c.q = h.q AND c.r = h.r
      LEFT JOIN yuplink.mystic_item_template t
             ON t.id = CASE WHEN c.object_id LIKE '%:%'
                            THEN split_part(c.object_id, ':', 2) ELSE c.object_id END
      ${BOSS_TEMPLATE_JOIN("c")}
      CROSS JOIN LATERAL (
        SELECT EXISTS (SELECT 1 FROM yuplink.beta_raid_positions p
                        WHERE p.q = h.q AND p.r = h.r
                          AND ${POS_MAP_SQL("p")} = h.map_id) AS taken) busy
      CROSS JOIN LATERAL (SELECT (${ok}) AS ok) allow
      CROSS JOIN LATERAL (
        SELECT ${resourceSumSql("c", "darai")} AS darai,
               ${resourceSumSql("c", "usdt")}  AS usdt) rw
     WHERE h.map_id = '${mapId}' AND h.cycle_no = 0
       AND (h.killed_at IS NOT NULL OR h.current_hp < h.max_hp)) s
 WHERE NOT taken AND boss_dead AND level_ok AND ok
 GROUP BY kind, grp
UNION ALL
SELECT '_blocked' AS kind, 'x' AS grp, count(*)::int,
       COALESCE(SUM(darai), 0), COALESCE(SUM(usdt), 0)
  FROM (
    SELECT rw.darai, rw.usdt, allow.ok, busy.taken
      FROM yuplink.beta_raid_object_hp h
      JOIN yuplink.raid_map_cells c ON c.map_id = h.map_id AND c.q = h.q AND c.r = h.r
      LEFT JOIN yuplink.mystic_item_template t
             ON t.id = CASE WHEN c.object_id LIKE '%:%'
                            THEN split_part(c.object_id, ':', 2) ELSE c.object_id END
      ${BOSS_TEMPLATE_JOIN("c")}
      CROSS JOIN LATERAL (
        SELECT EXISTS (SELECT 1 FROM yuplink.beta_raid_positions p
                        WHERE p.q = h.q AND p.r = h.r
                          AND ${POS_MAP_SQL("p")} = h.map_id) AS taken) busy
      CROSS JOIN LATERAL (SELECT (${ok}) AS ok) allow
      CROSS JOIN LATERAL (
        SELECT ${resourceSumSql("c", "darai")} AS darai,
               ${resourceSumSql("c", "usdt")}  AS usdt) rw
     WHERE h.map_id = '${mapId}' AND h.cycle_no = 0
       AND (h.killed_at IS NOT NULL OR h.current_hp < h.max_hp)) b
 WHERE NOT taken AND NOT ok
UNION ALL
SELECT '_underplayers', 'x', count(*)::int, 0, 0
  FROM yuplink.beta_raid_object_hp h
  JOIN yuplink.beta_raid_positions p
    ON p.q = h.q AND p.r = h.r AND ${POS_MAP_SQL("p")} = h.map_id
 WHERE h.map_id = '${mapId}' AND h.cycle_no = 0
   AND (h.killed_at IS NOT NULL OR h.current_hp < h.max_hp);`;

export type PreviewOpts = {
  bossLevelFrom?: number;
  bossLevelTo?: number;
  withDarai: boolean;
  withUsdt: boolean;
};

/** Сам подсчёт — без серверного обвеса, чтобы его можно было прогнать руками. */
export async function restorePreviewData(
  data: PreviewOpts,
  /** Карта режима бога; руками без сессии — главный мир. */
  map?: string,
): Promise<RestorePreview> {
  {
    const mapId = map ?? (await activeBetaMapId());
    const levels = bossLevelSql(data.bossLevelFrom, data.bossLevelTo);
    const ok = resourceFilterSql("c", { darai: data.withDarai, usdt: data.withUsdt });

    const raw = (await mcpExec(sql(mapId, levels, ok), { wrapJson: true })) as Array<{
      kind: string;
      grp: string;
      n: number;
      darai: number;
      usdt: number;
    }>;

    const rows = Object.fromEntries(KINDS.map((k) => [k, emptyRow()])) as Record<
      PreviewKind,
      PreviewRow
    >;
    let skippedUnderPlayers = 0;
    const blocked: GroupCount = { count: 0, darai: 0, usdt: 0 };

    for (const r of raw ?? []) {
      const n = Number(r.n) || 0;
      const darai = Number(r.darai) || 0;
      const usdt = Number(r.usdt) || 0;
      if (r.kind === "_underplayers") {
        skippedUnderPlayers = n;
        continue;
      }
      if (r.kind === "_blocked") {
        blocked.count = n;
        blocked.darai = darai;
        blocked.usdt = usdt;
        continue;
      }
      if (!KINDS.includes(r.kind as PreviewKind)) continue; // 'other' в отчёт не идёт
      const row = rows[r.kind as PreviewKind];
      row.total += n;
      row.groups[r.grp as ResourceGroup] = { count: n, darai, usdt };
    }

    return { rows, skippedUnderPlayers, blocked };
  }
}

export const adminRaidRestorePreview = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        bossLevelFrom: z.number().int().min(1).max(100).optional(),
        bossLevelTo: z.number().int().min(1).max(100).optional(),
        withDarai: z.boolean().optional().default(true),
        withUsdt: z.boolean().optional().default(true),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<RestorePreview> => {
    requireAdmin();
    return restorePreviewData(data, await godMapId());
  });
