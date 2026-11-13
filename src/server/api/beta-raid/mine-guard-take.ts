// «Забрать охрану» со своей шахты в рюкзак за энергию (владелец, 22.10.2026;
// lib/mineGuardTake): окно подтверждения показывает цену по запасу службы
// шахты (не v2 — 100) — она и уходит сюда (expect). Босс ложится в рюкзак
// выбранного героя тем же предметом, что куплен в лавке (стопка boss:<шаблон>),
// шахта остаётся без охраны и работает дальше. Забирает только хозяин шахты.
//
// Всё — один оператор (mine-guard-take-sql): энергия до выдачи, повтор того
// же нажатия не задваивает (ключ в raid_backpack_op), ответ потерялся после
// коммита — судит тот же ключ. Цена выросла против показанной — отказ «цена
// изменилась» с новой ценой, без движений.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import { opDone } from "@/server/api/beta-raid/backpack-take-once";
import {
  guardTakeVerdict,
  takeGuardSql,
  type GuardTakeRow,
} from "@/server/api/beta-raid/mine-guard-take-sql";

const input = z.object({
  q: z.number().int(),
  r: z.number().int(),
  /** Цена в энергии, которую игрок видел в окне подтверждения. */
  expect: z.number().int().min(0).max(100_000),
  /** Ключ нажатия: повтор того же нажатия второго босса не выдаст. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

export type GuardTaken = { ok: true; energy: number };

/** Нехватка энергии — понятным ключом с ценой; прочие сбои — как есть. */
const energyError = (e: unknown, need: number): unknown =>
  /not_enough_energy/.test(e instanceof Error ? e.message : String(e))
    ? new Error(`mineplace.no_energy|${JSON.stringify({ need })}`)
    : e;

export const takeMineGuard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<GuardTaken> => {
    const a = await pchestActor("mine-guard-take");
    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    const op = `guardtake:${a.account}:${data.op}`;
    const sql = takeGuardSql({
      mapId: a.mapId,
      q: data.q,
      r: data.r,
      account: a.account,
      wallet: a.wallet,
      heroId: bp.heroId,
      capacity: bp.capacity,
      expect: data.expect,
      op,
    });
    let row: GuardTakeRow | null = null;
    try {
      row = sqlRow<GuardTakeRow>((await mcpExec(sql)) as unknown[]) ?? null;
    } catch (e) {
      // Ответ потерялся после коммита — ключ лёг только вместе с выдачей.
      if (!(await opDone(op).catch(() => false))) throw energyError(e, data.expect);
      row = { was: true } as GuardTakeRow;
    }
    if (!row && (await opDone(op))) row = { was: true } as GuardTakeRow;
    const verdict = guardTakeVerdict(row);
    if (verdict !== "ok") throw new Error(verdict);
    const energy = Number(row?.paid) || 0;
    if (row?.taken && energy > 0) {
      const { noteEnergySpend } = await import("@/server/api/beta-raid/econ/energy-note");
      void noteEnergySpend(a.account, energy, "other");
    }
    // Охраны на шахте больше нет — окно, оверлей охраны и флажки у всех.
    publishRaid({ mapId: a.mapId, type: "built", mine: true, cells: [`${data.q},${data.r}`] });
    return { ok: true, energy };
  });
