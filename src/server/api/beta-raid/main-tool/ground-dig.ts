// «Копать» где угодно (владелец, 29.09.2026; ПРАВИЛА §8.24): с лопатой в руках
// можно копать любую клетку, где можно стоять, — вплотную (своя или соседняя).
// Пока лопата на пустой земле ничего не находит («клады потом»): 2 энергии и
// износ лопаты, ответ «ничего не нашлось».
//
// Порядок как у «Закопать» мешочка (bag-dig): проверки → 2 энергии (§8.23,
// bag-dig-pay) → износ лопаты в руках (ключ удара от ключа нажатия: повтор его
// второй раз не снимет) → ключ нажатия 'done'. Ключ не записался — «забор»
// ключа ('failed' под локом): не записалось — энергия и износ назад; повтор
// нажатия отвечает прежним исходом и второй раз не платит.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { bagActor, requireBagNear } from "@/server/api/beta-raid/loot-bag/bag-actor";
import { NEED_SHOVEL, chargeShovel } from "@/server/api/beta-raid/loot-bag/bag-shovel";
import { payDig } from "@/server/api/beta-raid/loot-bag/bag-dig-pay";
import { markDigHole } from "@/server/api/beta-raid/main-tool/dig-hole";
import { publishRaid } from "@/server/raidLive";
import {
  CANT_DIG,
  groundCellSql,
  groundFenceSql,
  groundMarkSql,
} from "@/server/api/beta-raid/main-tool/ground-dig-sql";

const input = z.object({
  q: z.number().int(),
  r: z.number().int(),
  /** Ключ нажатия: повтор того же нажатия не копает второй раз. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

/** Ответ: сколько нашлось (пока всегда 0 — «ничего не нашлось»). */
export type GroundDig = { ok: true; found: number };

/** Прежний исход нажатия (ответ потерялся) — свежим чтением ключа. */
async function opState(op: string): Promise<string | null> {
  const rows = (await mcpExec(
    `SELECT state FROM yuplink.raid_loot_bag_op WHERE op = ${sqlStr(op)};`,
    { wrapJson: true },
  )) as Array<{ state: string }>;
  return rows?.[0]?.state ?? null;
}

/** Можно ли копать клетку: нет строки или ok = false — нельзя. */
async function requireDiggable(mapId: string, q: number, r: number): Promise<void> {
  const rows = (await mcpExec(groundCellSql({ mapId, q, r }), { wrapJson: true })) as Array<{
    ok: boolean;
  }>;
  if (rows?.[0]?.ok !== true) throw new Error(CANT_DIG);
}

export const digGround = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<GroundDig> => {
    const a = await bagActor("ground-dig");
    const op = `gdig:${a.account}:${data.op}`;
    // Повтор нажатия, чей ответ потерялся: тот же исход, без второго списания.
    const prior = await opState(op);
    if (prior === "done") return { ok: true as const, found: 0 };
    if (prior) throw new Error("bag.drop_failed");
    await requireBagNear(a, data.q, data.r);
    await requireDiggable(a.mapId, data.q, data.r);
    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error(NEED_SHOVEL);
    const pay = await payDig(a.wallet);
    const tool = await chargeShovel(a.wallet, bp.heroId, op).catch(async (e: unknown) => {
      await pay.refund();
      throw e;
    });
    const at = { op, account: a.account, mapId: a.mapId, q: data.q, r: data.r };
    let row: { state: string | null; mine?: boolean | null } | undefined;
    try {
      row = sqlRow((await mcpExec(groundMarkSql({ ...at, nonce: nanoid(12) }))) as unknown[]);
    } catch (e) {
      // «Забор» не ответил — исход неизвестен: бросаем, износ и энергия остаются.
      const fence = sqlRow<{ state: string }>((await mcpExec(groundFenceSql(at))) as unknown[]);
      if (fence?.state !== "done") {
        await Promise.all([tool.back(), pay.refund()]);
        throw e;
      }
      row = { state: "done", mine: true };
    }
    if (row?.state !== "done") {
      await Promise.all([tool.back(), pay.refund()]);
      throw new Error("bag.drop_failed");
    }
    // Ключ записал параллельный дубль того же нажатия — наша плата лишняя
    // (износ у них общий: ключ удара от нажатия).
    if (row.mine === false) await pay.refund();
    await tool.done();
    // Ямка на час (владелец, 02.10) — у всех, кто рядом, без F5.
    await markDigHole(at);
    publishRaid({ mapId: a.mapId, type: "bags", cells: [`${data.q},${data.r}`] });
    return { ok: true as const, found: 0 };
  });
