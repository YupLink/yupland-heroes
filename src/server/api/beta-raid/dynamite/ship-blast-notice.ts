// Окно «Ваш корабль подорвали — вас телепортировало в город» (владелец, 26.10.2026;
// §8.75а). Пишет перенос экипажа (dynamite-crew-home), когда игрока отнесли; окно
// висит, пока игрок не нажмёт «Понятно» — и после перезахода тоже.
// Таблица ship_blast_notice — migrations/dynamite-06-ship-notice.sql.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { getCurrentWallet } from "@/server/auth";
import { sqlStr } from "@/server/api/raid-shared";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";

/** Запись «отнесли»: id от ключа броска и аккаунта — повтор не задвоит. */
export function noteShipBlastSql(
  op: string,
  account: string,
  mapId: string,
  at: { q: number; r: number },
): string {
  return `INSERT INTO yuplink.ship_blast_notice (id, account_id, map_id, q, r)
       VALUES ('sbn_' || md5(${sqlStr(`${op}:${account}`)}), ${sqlStr(account)}, ${sqlStr(mapId)},
               ${Math.trunc(at.q)}, ${Math.trunc(at.r)})
       ON CONFLICT (id) DO NOTHING`;
}

/** Непоказанные окна аккаунта (сколько угодно взрывов — одно окно). */
export function unseenSql(account: string): string {
  return `SELECT id FROM yuplink.ship_blast_notice
      WHERE account_id = ${sqlStr(account)} AND shown_at IS NULL
      ORDER BY created_at LIMIT 20`;
}

/** «Понятно»: пометить свои непоказанные. */
export function markSeenSql(account: string, ids: string[]): string | null {
  const list = [...new Set(ids.filter(Boolean))];
  if (list.length === 0) return null;
  return `UPDATE yuplink.ship_blast_notice SET shown_at = now()
      WHERE account_id = ${sqlStr(account)} AND shown_at IS NULL
        AND id IN (${list.map(sqlStr).join(",")})`;
}

export async function noteShipBlast(
  op: string,
  account: string,
  mapId: string,
  at: { q: number; r: number },
): Promise<void> {
  await mcpExec(noteShipBlastSql(op, account, mapId, at));
}

export const getShipBlastNotice = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ ids: string[] }> => {
    const wallet = getCurrentWallet();
    if (!wallet) return { ids: [] };
    const rows = (await mcpExec(unseenSql(await raidOwner(wallet)), { wrapJson: true })) as Array<{
      id: string;
    }> | null;
    return { ids: (rows ?? []).map((r) => String(r.id)) };
  },
);

export const markShipBlastSeen = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().min(1).max(80)).min(1).max(20) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const wallet = await requireBetaRaid();
    const sql = markSeenSql(await raidOwner(wallet), data.ids);
    if (sql) await mcpExec(sql);
    return { ok: true };
  });
