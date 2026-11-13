// «Закопать» пустую ямку (владелец, 31.10.2026; ПРАВИЛА §8.24 п. 6б): лопатой в
// руках, вплотную. На ямке «Копать» нет — только закопать её, и выходит кучка
// (бугорок, hole-bury-sql). Цена как у «Закопать» мешочек: 2 энергии (§8.23) и
// износ лопаты. Порядок как у «Копать»: проверки → энергия → износ → запись
// одним оператором; не легла — энергия и износ назад; ответ потерян — «забор».
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { publishRaid } from "@/server/raidLive";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { bagActor, requireBagNear } from "@/server/api/beta-raid/loot-bag/bag-actor";
import { NEED_SHOVEL, chargeShovel } from "@/server/api/beta-raid/loot-bag/bag-shovel";
import { payDig } from "@/server/api/beta-raid/loot-bag/bag-dig-pay";
import { groundCellSql } from "@/server/api/beta-raid/main-tool/ground-dig-sql";
import {
  holeBuryFenceSql,
  holeBurySql,
  type HoleBuryRow,
} from "@/server/api/beta-raid/main-tool/hole-bury-sql";

/** Отказ «здесь нет ямки» — ключом словаря. */
export const NO_HOLE = "dig.no_hole";

const input = z.object({
  q: z.number().int(),
  r: z.number().int(),
  /** Ключ нажатия: повтор того же нажатия не закапывает второй раз. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

async function opState(op: string): Promise<string | null> {
  const rows = (await mcpExec(
    `SELECT state FROM yuplink.raid_loot_bag_op WHERE op = ${sqlStr(op)};`,
    { wrapJson: true },
  )) as Array<{ state: string }>;
  return rows?.[0]?.state ?? null;
}

export const buryHole = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const a = await bagActor("hole-bury");
    const op = `hbury:${a.account}:${data.op}`;
    const prior = await opState(op);
    if (prior === "done") return { ok: true as const };
    if (prior) throw new Error("bag.drop_failed");
    await requireBagNear(a, data.q, data.r);
    // Ямка на земле, где можно стоять, и на клетке больше ничего — до денег.
    const cell = (await mcpExec(groundCellSql({ mapId: a.mapId, q: data.q, r: data.r }), {
      wrapJson: true,
    })) as Array<{ ok: boolean; hole: boolean }>;
    if (cell?.[0]?.ok !== true || cell[0].hole !== true) throw new Error(NO_HOLE);
    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error(NEED_SHOVEL);
    const pay = await payDig(a.wallet, a.mapId);
    const tool = await chargeShovel(a.wallet, bp.heroId, op).catch(async (e: unknown) => {
      await pay.refund();
      throw e;
    });
    const at = { mapId: a.mapId, q: data.q, r: data.r, op, account: a.account };
    const nonce = nanoid(12);
    let row: HoleBuryRow | undefined;
    try {
      row = sqlRow<HoleBuryRow>((await mcpExec(holeBurySql({ ...at, nonce }))) as unknown[]);
      if (!row) throw new Error("bag.drop_failed");
    } catch (e) {
      const fence = sqlRow<{ state: string; nonce: string | null }>(
        (await mcpExec(holeBuryFenceSql(at))) as unknown[],
      );
      if (fence?.state !== "done") {
        await Promise.all([tool.back(), pay.refund()]);
        throw e;
      }
      row = { state: "done", mine: fence.nonce === nonce };
    }
    if (row.state !== "done") {
      await Promise.all([tool.back(), pay.refund()]);
      throw new Error(NO_HOLE);
    }
    if (row.mine === false) await pay.refund();
    await tool.done();
    // Кучка вместо ямки — у всех, кто рядом, без F5.
    publishRaid({ mapId: a.mapId, type: "bags", cells: [`${data.q},${data.r}`] });
    return { ok: true as const };
  });
