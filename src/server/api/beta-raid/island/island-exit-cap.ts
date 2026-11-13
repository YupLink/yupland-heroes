// Потолок выноса с острова (lib/raid/island/exitCap, §8.114): при выходе порталом
// прибавка дерева, камня, золота и алмазов сверх потолка остаётся на острове.
// Снимок «сколько было» пишет создание острова (raid_island.res_base); срез —
// одной командой и один раз (exit_cut), ключ журнала — карта + ресурс.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { EXIT_RES, ISLAND_EXIT_CAP, type ResAmounts } from "@/lib/raid/island/exitCap";

/** Снимок ресурсов аккаунта — для raid_island.res_base при создании острова. */
export const resBaseSql = (account: string): string =>
  `COALESCE((SELECT jsonb_object_agg(resource, amount) FROM yuplink.account_resources
              WHERE account_id = ${sqlStr(account)}
                AND resource IN (${EXIT_RES.map(sqlStr).join(", ")})), '{}'::jsonb)`;

/** Срез на выходе: сверх потолка — в журнал (island_exit_cap), итог — в exit_cut. */
export function exitCapSql(account: string, mapId: string): string {
  const acc = sqlStr(account);
  const caps = EXIT_RES.map((r) => `(${sqlStr(r)}, ${ISLAND_EXIT_CAP[r]})`).join(", ");
  return `WITH i AS (
      SELECT res_base FROM yuplink.raid_island
       WHERE account_id = ${acc} AND map_id = ${sqlStr(mapId)}
         AND res_base IS NOT NULL AND exit_cut IS NULL),
    cut AS (
      SELECT a.resource,
             floor(GREATEST(0, a.amount - COALESCE((i.res_base->>a.resource)::numeric, 0) - cap.v) * 10000) / 10000 AS x
        FROM yuplink.account_resources a
        CROSS JOIN i
        JOIN (VALUES ${caps}) AS cap(r, v) ON cap.r = a.resource
       WHERE a.account_id = ${acc}),
    mv AS (
      SELECT c.resource, c.x,
             yuplink.res_move(${acc}, c.resource, -c.x, 'island_exit_cap',
                              'islandcap:' || ${sqlStr(mapId)} || ':' || c.resource) AS moved
        FROM cut c WHERE c.x > 0)
    UPDATE yuplink.raid_island
       SET exit_cut = COALESCE((SELECT jsonb_object_agg(resource, x) FROM mv), '{}'::jsonb)
     WHERE account_id = ${acc} AND map_id = ${sqlStr(mapId)} AND EXISTS (SELECT 1 FROM i)
    RETURNING exit_cut`;
}

/** Применить потолок; вернуть срезанное (пусто — всё вынесено). Сбой — пусто, выход важнее. */
export async function applyExitCap(account: string, mapId: string): Promise<ResAmounts> {
  try {
    const rows = (await mcpExec(exitCapSql(account, mapId), { wrapJsonCte: true })) as Array<{
      exit_cut: unknown;
    }> | null;
    const raw = rows?.[0]?.exit_cut;
    const obj = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    const out: ResAmounts = {};
    if (obj && typeof obj === "object")
      for (const r of EXIT_RES) {
        const v = Number((obj as Record<string, unknown>)[r]);
        if (Number.isFinite(v) && v > 0) out[r] = v;
      }
    return out;
  } catch (e) {
    console.warn("[island] потолок выноса:", mapId, e instanceof Error ? e.message : e);
    return {};
  }
}
