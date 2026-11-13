// «Замок» шахтёра (lib/mineWard.ts, ПРАВИЛА §8.123): выбранный герой — Шахтёр,
// игрок вплотную к СВОЕЙ шахте → 40 энергии, и 3 часа шахту не захватить.
// Отказы — до энергии; под локом шахты база ещё раз сверяет постройку, хозяина и
// живой замок и только тогда списывает энергию вместе со строкой замка.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { actionGate } from "@/server/rateGate";
import { requireBetaRaid } from "../gate";
import { myMapId, playerCell, requireAdjacent } from "../encounter-where";
import { requireNotVoid } from "../voidGate";
import { loadCellBuilding } from "../building-action";
import { loadMineCell } from "../mine-v2-read";
import { loadSelectedHero } from "../hero-load";
import { accAccountId } from "../../currency/move";
import { isBuilt } from "@/lib/buildingEffect";
import { cellMineConfig } from "@/lib/mineConfig";
import { isMushroomConfig } from "@/lib/mushroomKinds";
import { energyMultOf, scaleEnergy } from "@/lib/raid/island/energy";
import {
  MINE_WARD_ENERGY,
  MINE_WARD_HOURS,
  MINER_ABILITY,
  WARD_ACTIVE,
  WARD_NEED_MINER,
  WARD_NOT_YOURS,
  wardErrorKey,
} from "@/lib/mineWard";
import { mineWardLeft } from "./mine-ward-read";
import { wardPutSql } from "./mine-ward-sql";

export type MineWardPut = { ok: true; leftMs: number; energy: number };

/** Ответ функции базы (jsonb объектом или строкой). */
function putOf(raw: unknown): { placed: boolean; paid: number } {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  const o = (v ?? {}) as { placed?: unknown; paid?: unknown };
  return { placed: o.placed === true, paid: Number(o.paid) || 0 };
}

export const putMineWard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        opId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<MineWardPut> => {
    const wallet = await requireBetaRaid();
    await actionGate("mine-ward", wallet);
    const mapId = await myMapId(wallet);
    // Только лично: вплотную к шахте, удалённо нельзя.
    requireAdjacent(await playerCell(wallet), data.q, data.r);
    await requireNotVoid(wallet, mapId, data.q, data.r);

    const b = await loadCellBuilding(mapId, data.q, data.r);
    if (!b || b.effect !== "mine") throw new Error("Это не шахта");
    if (!isBuilt(b.tier, b.tiers.length)) throw new Error("Шахта ещё не построена");
    // Гриб не захватывают (его забирают в рюкзак) — замку нечего держать.
    if (!cellMineConfig(b.config, b.meta) || isMushroomConfig(b.config)) {
      throw new Error("Это не шахта");
    }
    const account = await accAccountId(wallet);
    if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");
    const cell = await loadMineCell(mapId, data.q, data.r);
    if (cell.view?.broken) throw new Error("braid.mine_broken");
    if (cell.owner !== account) throw new Error(WARD_NOT_YOURS);
    const hero = await loadSelectedHero(wallet).catch(() => null);
    if (hero?.ability !== MINER_ABILITY) throw new Error(WARD_NEED_MINER);
    if ((await mineWardLeft(mapId, data.q, data.r)) > 0) throw new Error(WARD_ACTIVE);

    const energy = scaleEnergy(MINE_WARD_ENERGY, energyMultOf(mapId));
    const sql = wardPutSql({
      op: `mward:${account}:${data.opId}`,
      mapId,
      q: data.q,
      r: data.r,
      account,
      buildingId: b.buildingId,
      energy,
      hours: MINE_WARD_HOURS,
    });
    let put: { placed: boolean; paid: number };
    try {
      const rows = (await mcpExec(sql, { wrapJson: true })) as Array<{ res?: unknown }> | null;
      put = putOf(rows?.[0]?.res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/not_enough_energy/.test(msg)) throw new Error(`braid.need_energy|{"n":${energy}}`);
      throw new Error(wardErrorKey(msg));
    }
    if (!put.placed) throw new Error("chest.busy");
    if (put.paid > 0) {
      const { noteEnergySpend } = await import("../econ/energy-note");
      void noteEnergySpend(account, put.paid, "other");
    }
    return { ok: true, leftMs: await mineWardLeft(mapId, data.q, data.r), energy };
  });
