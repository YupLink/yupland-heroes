// Улучшение шахты v2 (владелец, 23.10.2026; ПРАВИЛА §8.74): «улучшить может только
// строитель — добыча меняется от уровня … внешний вид не меняется».
//
//  • Только хозяин работающей шахты мира (не остров), выбранный герой — Строитель.
//  • Цена шага — lib/mineLevels (сервер, клиент цену не передаёт); база сверяет
//    уровень, по которому цена посчитана: двойной тап на 1→2 не спишет цену 2→3.
//  • opId — ключ повтора: второе нажатие (или ретрай моста после коммита) ничего
//    не спишет и не упрётся в проверки следующего уровня (ключ смотрим первым). Накопленное по старому уровню база начисляет сразу (как смена
//    режима) — его кладём в ачивку «Хозяин шахт».
//  • Вид клетки не меняется — дельту карты не шлём; полосы и окна у других
//    перечитываются по событию шахты (mineLifeTouched).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { actionGate } from "@/server/rateGate";
import { publishRaid } from "@/server/raidLive";
import { BUILDER_SPEC } from "@/lib/buildingEffect";
import { mineUpgradeCost } from "@/lib/mineLevels";
import { requireMineV2, requireRepairFunds, who } from "@/server/api/beta-raid/mine-v2";
import { loadMineCell, mineV2ErrorKey } from "@/server/api/beta-raid/mine-v2-read";
import { sqlStr } from "@/server/api/raid-shared";
import { upgradeSql } from "@/server/api/beta-raid/mine-v2-sql";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { bumpAchievement } from "@/server/api/achievements/bump";

/** Отказ базы → ключ; нехватка в самом списании — «на улучшение», а не «на починку». */
const fail = (e: unknown): never => {
  const msg = e instanceof Error ? e.message : String(e);
  throw new Error(/res_move: в минус/.test(msg) ? "braid.mine_up_no_res" : mineV2ErrorKey(msg));
};

/** Уровень, до которого уже улучшили этим ключом; нет ключа — null. */
async function replayLevel(op: string): Promise<number | null> {
  const rows = (await mcpExec(
    `SELECT (o.detail->>'to')::int AS lvl FROM yuplink.raid_mine_op o WHERE o.op = ${sqlStr(op)};`,
    { wrapJson: true },
  ).catch(() => null)) as Array<{ lvl: number | null }> | null;
  return rows?.[0] ? Number(rows[0].lvl) || 1 : null;
}

export const upgradeMine = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        opId: z.string().min(8).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; level: number; applied: boolean }> => {
    const { wallet, account, mapId } = await who();
    await actionGate("mine-upgrade", wallet);
    // Ключ повтора — в пределах аккаунта: чужой одинаковый opId не мешает.
    const op = `up:${account}:${data.opId}`;
    // Повтор после потерянного ответа: уровень уже вырос — не отказывать по новой цене.
    const done = await replayLevel(op);
    if (done !== null) return { ok: true as const, level: done, applied: false };
    const { kind, island } = await requireMineV2(mapId, data.q, data.r);
    if (island) throw new Error("braid.mine_island_level");
    const cell = await loadMineCell(mapId, data.q, data.r);
    if (!cell.view || cell.view.broken) throw new Error("braid.mine_broken");
    if (cell.owner !== account) throw new Error("braid.mine_not_owner");
    const bag = await resolveBackpack(wallet).catch(() => null);
    if (bag?.spec !== BUILDER_SPEC) throw new Error("braid.mine_need_builder");
    const level = cell.view.level ?? 1;
    const cost = mineUpgradeCost(kind, level);
    if (!cost) throw new Error("braid.mine_level_max");
    await requireRepairFunds(account, cost, "braid.mine_up_short_");

    const rows = (await mcpExec(
      upgradeSql({
        op,
        mapId,
        q: data.q,
        r: data.r,
        account,
        level,
        cost,
      }),
      { wrapJson: true },
    ).catch(fail)) as Array<{
      applied: boolean;
      new_level: number | string;
      credited: number | string | null;
    }>;
    const row = rows?.[0];
    bumpAchievement(account, "minelord", Number(row?.credited ?? 0));
    if (row?.applied === true) {
      publishRaid({ mapId, type: "built", mine: true, cells: [`${data.q},${data.r}`] });
    }
    return {
      ok: true as const,
      level: Number(row?.new_level) || level + 1,
      applied: row?.applied === true,
    };
  });
