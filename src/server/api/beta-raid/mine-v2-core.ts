// Шахты v2 (ПРАВИЛА §8.59): починка и смена режима — общее ядро для окна
// шахты на карте (mine-v2.ts: стоять вплотную) и для «Управления шахтами» в
// замке (mine-office: удалённо, только своя). Где стоит игрок, проверяют
// вызывающие; здесь — шахта, цена, деньги, база и рассылка.
//
//  • repairMineAt — починка в любой момент, цена всегда полная (MINE_REPAIR_COST
//    на сервере, клиент цену не передаёт). Своя — запас 100 % и новый режим,
//    охрана остаётся. Сломанная/ничья — забирает тот, кто первым заплатит.
//    Чужую работающую — только боем (raid_mine_capture). own — только своя
//    работающая (удалённо ничью не забирают). opId — ключ повтора.
//  • setMineModeAt — только хозяин, шахта не сломана; накопленное по старому
//    режиму начисляется, остаток запаса пересчитывается расходом нового.
//  • Остров новичка (§8.59 п. 11; флаг клетки И карта острова): цена острова
//    (алмазная — 100 дерева + 100 камня), только «База» (режим не меняется),
//    одна починка на клетку навсегда — выработанную не чинят (braid.mine_spent).
// Вся арифметика и проверки владения — в базе (minev2-03, остров — minev2-30),
// под локом шахты. Начисленное добычи (своя шахта, с неполным часом; поломка
// внутри починки — 0: несобранное прежнего ждёт «Забрать», minecap-01) база
// отдаёт в ответе — его кладём в ачивку «Хозяин шахт» (§8.57), как при сборе;
// запись ачивки отдельная и без ожидания: её сбой деньги не трогает.
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { requireNotVoid } from "@/server/api/beta-raid/voidGate";
import { loadCellBuilding } from "@/server/api/beta-raid/building-action";
import { publishRaid } from "@/server/raidLive";
import { isBuilt } from "@/lib/buildingEffect";
import {
  mineIslandOf,
  mineRepairCost,
  mineV2Of,
  type MineMode,
  type MineV2Resource,
} from "@/lib/mineV2";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { repairSql, setModeSql } from "@/server/api/beta-raid/mine-v2-sql";
import { loadMineCell, mineV2ErrorKey } from "@/server/api/beta-raid/mine-v2-read";
import { bumpAchievement } from "@/server/api/achievements/bump";

// Тот же список, что MINE_MODES (lib/mineV2): z.enum нужен литералами.
export const modeSchema = z.enum(["base", "mid", "max"]);

export const fail = (e: unknown): never => {
  throw new Error(mineV2ErrorKey(e instanceof Error ? e.message : String(e)));
};

/** Построенная шахта v2 на клетке (и шахта ли острова); иначе — понятный отказ. */
export async function requireMineV2(
  mapId: string,
  q: number,
  r: number,
): Promise<{ kind: MineV2Resource; island: boolean }> {
  const b = await loadCellBuilding(mapId, q, r);
  if (!b) throw new Error("Здесь нет постройки");
  if (b.effect !== "mine") throw new Error("Это не шахта");
  if (!isBuilt(b.tier, b.tiers.length)) throw new Error("braid.mine_not_grown");
  const kind = mineV2Of(b.config);
  if (!kind) throw new Error("braid.mine_not_v2");
  return { kind, island: mineIslandOf(b.config) && isIslandMapId(mapId) };
}

/**
 * Хватает ли ресурсов на починку (или улучшение — свой префикс ключа); нет —
 * ключ с числами первого недостающего.
 */
export async function requireRepairFunds(
  account: string,
  cost: Partial<Record<MineV2Resource, number>>,
  prefix = "braid.mine_short_",
): Promise<void> {
  const rows = (await mcpExec(
    `SELECT resource, amount FROM yuplink.account_resources WHERE account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  ).catch(() => null)) as Array<{ resource: string; amount: number | string }> | null;
  // Не прочитали — пусть решает база (res_move не уйдёт в минус).
  if (!rows) return;
  const have = new Map(rows.map((x) => [x.resource, Number(x.amount) || 0]));
  for (const [res, need] of Object.entries(cost)) {
    const got = have.get(res) ?? 0;
    if ((need ?? 0) > got) {
      throw new Error(
        `${prefix}${res}|${JSON.stringify({ n: need, have: Math.floor(got) })}`,
      );
    }
  }
}

export type MineAt = { account: string; mapId: string; q: number; r: number; mode: MineMode };
export type RepairResult = { ok: true; captured: boolean; applied: boolean };

/** Починка шахты на клетке (место игрока уже проверено вызывающим). */
export async function repairMineAt(
  o: MineAt & { wallet: string; opId: string; own?: boolean },
): Promise<RepairResult> {
  const { wallet, account, mapId, q, r } = o;
  await requireNotVoid(wallet, mapId, q, r);
  const { kind, island } = await requireMineV2(mapId, q, r);
  const cost = mineRepairCost(kind, island);
  // Остров: режим не выбирают — всегда «База».
  const mode = island ? "base" : o.mode;

  // Чужая работающая — отказ до проверки денег (база всё равно проверит).
  const cell = await loadMineCell(mapId, q, r);
  if (cell.owner && cell.owner !== account) throw new Error("braid.mine_owned");
  // Удалённо — только своя работающая: сломанная уже ничья.
  if (o.own && cell.owner !== account) throw new Error("braid.mine_not_owner");
  // Остров: клетку уже чинили. Ничья — выработана, отказ до денег. Своя
  // работающая — только повтор того же нажатия: решает база (тот же op —
  // прежний ответ, иначе mine_spent), деньги первое нажатие уже списало.
  const spent = island && cell.view?.spent === true;
  if (spent && cell.owner !== account) throw new Error("braid.mine_spent");
  if (!spent) await requireRepairFunds(account, cost);

  const rows = (await mcpExec(
    repairSql({
      mapId,
      q,
      r,
      account,
      wallet,
      mode,
      cost,
      // Ключ повтора — в пределах аккаунта: чужой одинаковый opId не мешает.
      op: `rep:${account}:${o.opId}`,
    }),
    { wrapJson: true },
  ).catch(fail)) as Array<{
    captured: boolean;
    applied: boolean;
    credited: number | string | null;
    credited_to: string | null;
  }>;
  const row = rows?.[0];
  bumpAchievement(row?.credited_to, "minelord", Number(row?.credited ?? 0));
  // Забрал ничью — сменился владелец: флажок перекрасить всем (owner).
  publishRaid({
    mapId,
    type: "built",
    mine: true,
    owner: row?.captured === true,
    cells: [`${q},${r}`],
  });
  return { ok: true as const, captured: row?.captured === true, applied: row?.applied === true };
}

/**
 * Смена режима своей шахты на карте mapId (карту уже проверил вызывающий).
 * Хозяина проверяет база под локом; own — ещё и заранее (удалённо: «Шахта уже
 * не твоя» вместо попытки).
 */
export async function setMineModeAt(o: MineAt & { own?: boolean }): Promise<{ ok: true }> {
  const { account, mapId, q, r, mode } = o;
  if ((await requireMineV2(mapId, q, r)).island) throw new Error("braid.mine_island_mode");
  if (o.own && (await loadMineCell(mapId, q, r)).owner !== account) {
    throw new Error("braid.mine_not_owner");
  }
  const rows = (await mcpExec(setModeSql({ mapId, q, r, account, mode }), {
    wrapJson: true,
  }).catch(fail)) as Array<{ changed: boolean; credited: number | string | null }>;
  bumpAchievement(account, "minelord", Number(rows?.[0]?.credited ?? 0));
  if (rows?.[0]?.changed === true) {
    publishRaid({ mapId, type: "built", mine: true, cells: [`${q},${r}`] });
  }
  return { ok: true as const };
}
