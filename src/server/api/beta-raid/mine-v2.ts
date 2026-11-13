// Шахты v2 (ПРАВИЛА §8.59): починка и смена режима из окна шахты на карте.
//
//  • repairMine — игрок вплотную к шахте, как при захвате. Дальше — общее ядро
//    (mine-v2-core.ts: цена, деньги, база, рассылка), то же, что у удалённой
//    починки в «Управлении шахтами» замка.
//  • setMineMode — без требования стоять рядом и с любого открытого этажа
//    (переключатель в «Добыче» шлёт карту шахты), как и сбор.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { actionGate } from "@/server/rateGate";
import { myMapId, playerCell, requireAdjacent } from "@/server/api/beta-raid/encounter-where";
import { accAccountId } from "@/server/api/currency/move";
import {
  modeSchema,
  repairMineAt,
  setMineModeAt,
  type RepairResult,
} from "@/server/api/beta-raid/mine-v2-core";

// Прежние имена — для mine-upgrade, разборки и тестов.
export { fail, requireMineV2, requireRepairFunds } from "@/server/api/beta-raid/mine-v2-core";

export async function who(): Promise<{ wallet: string; account: string; mapId: string }> {
  const wallet = await requireBetaRaid();
  const account = await accAccountId(wallet);
  if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");
  return { wallet, account, mapId: await myMapId(wallet) };
}

export const repairMine = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        mode: modeSchema,
        opId: z.string().min(8).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<RepairResult> => {
    const { wallet, account, mapId } = await who();
    await actionGate("mine-repair", wallet);
    requireAdjacent(await playerCell(wallet), data.q, data.r);
    return repairMineAt({ wallet, account, mapId, ...data });
  });

/**
 * Карта шахты для смены режима: своя (где стоит игрок) или открытый этаж —
 * «Добыча» показывает шахты со всех этажей (как и сбор). Чужой адрес — отказ;
 * хозяина всё равно проверяет база.
 */
async function modeMapId(here: string, want: string | undefined): Promise<string> {
  if (!want || want === here) return here;
  const { floorMaps } = await import("@/server/api/beta-raid/floors");
  if ((await floorMaps(here)).some((f) => f.id === want)) return want;
  throw new Error("braid.mine_not_owner");
}

export const setMineMode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        mode: modeSchema,
        // Карта шахты из «Добычи» (другой этаж); нет — где стоит игрок.
        mapId: z.string().min(1).max(128).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { wallet, account, mapId: here } = await who();
    await actionGate("mine-mode", wallet);
    const mapId = await modeMapId(here, data.mapId);
    return setMineModeAt({ account, mapId, q: data.q, r: data.r, mode: data.mode });
  });
