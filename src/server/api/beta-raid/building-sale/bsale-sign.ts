// «Подписать табличку» хозяином постройки мира строителей (bsale-own). Текст —
// в настройке клетки, как у таблички админа. Модуль зовёт клиент — серверное
// подгружается внутри обработчика.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SIGN_TEXT_MAX } from "@/lib/buildingSale";

/** Подписать свою табличку. Текст — в настройке клетки, как у таблички админа. */
export const setOwnSignText = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        text: z.string().max(SIGN_TEXT_MAX),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { mcpExec } = await import("@/server/db/mcpClient");
    const { sqlStr } = await import("@/server/api/raid-shared");
    const { requireOwnNear } = await import("./bsale-own");
    const { sqlRow } = await import("@/server/api/beta-raid/chest/chest-row");
    const { pchestActor } = await import("@/server/api/beta-raid/plain-chest/pchest-row");
    const a = await pchestActor("bsale-sign");
    const own = await requireOwnNear(a, data.q, data.r);
    if (own.effect !== "sign") throw new Error("bsale.not_sign");
    const m = sqlStr(a.mapId);
    const res = await mcpExec(
      `WITH c AS (
         UPDATE yuplink.raid_map_cells c
            SET building_config = jsonb_set(COALESCE(c.building_config, '{}'::jsonb), '{text}',
                                            to_jsonb(${sqlStr(data.text)}::text)),
                saved_at = now()
          WHERE c.map_id = ${m} AND c.q = ${data.q} AND c.r = ${data.r}
            AND c.building_id = ${sqlStr(own.buildingId)}
         RETURNING 1
       ),
       seq AS (
         UPDATE yuplink.raid_maps mp SET edit_seq = COALESCE(mp.edit_seq, 0) + 1
           FROM c WHERE mp.id = ${m}
         RETURNING 1
       )
       SELECT row_to_json(_t.*) AS _row FROM (SELECT count(*)::int AS n FROM c) _t;`,
    );
    // Постройку успели разобрать или заменить — надпись не легла.
    if (!(Number(sqlRow<{ n: number }>(res as unknown[])?.n) > 0)) throw new Error("bsale.busy");
    const { publishRaid } = await import("@/server/raidLive");
    publishRaid({ mapId: a.mapId, type: "built", cells: [`${data.q},${data.r}`] });
    return { ok: true };
  });
