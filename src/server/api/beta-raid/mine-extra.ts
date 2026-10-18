// Шахта в окне постройки: что добывает, чья сейчас, сколько накопилось.
// Вынесено из building-extra.ts без изменения логики — тот держится в лимите
// ≤250 строк и зовёт mineExtra() отсюда.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { BuildingExtra } from "@/lib/buildingEffect";

/**
 * Шахта: что добывает, чья сейчас, сколько накопилось — для окна покупателя.
 * Открыта всем игрокам (захват/добыча); настройку правит только админ.
 */
export async function mineExtra(opts: {
  built: boolean;
  wallet: string;
  mapId: string;
  q: number;
  r: number;
  meta?: unknown;
  cellConfig?: unknown;
}): Promise<BuildingExtra> {
  const { built, wallet, mapId, q, r } = opts;
  // Шахта открыта всем игрокам: захват/добыча доступны любому (настройка — админ).
  const { cellMineConfig } = await import("@/lib/mineConfig");
  const cfg = cellMineConfig(opts.cellConfig, opts.meta);
  if (!cfg) {
    return {
      kind: "mine",
      resource: "gold",
      token: null,
      yieldAmount: 0,
      captureCost: 0,
      mine: "free",
      capturedAt: null,
      claimedHours: 0,
      pending: 0,
      guardian: null,
      can: false,
      reasonKey: built ? "braid.mine_not_set" : "braid.mine_not_grown",
    };
  }
  // Пендинг-модель без крона: секундомер (captured_at) + claimed_hours отдаём
  // клиенту, он сам считает часы. pending — снимок на момент ответа.
  const rows = (await mcpExec(
    `SELECT owner_account, claimed_hours,
            extract(epoch from captured_at)*1000 AS cap,
            yuplink.raid_mine_pending(map_id, q, r) AS pending
       FROM yuplink.raid_mine_state WHERE map_id=${sqlStr(mapId)} AND q=${q} AND r=${r};`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{
    owner_account: string;
    claimed_hours: number;
    cap: number;
    pending: number;
  }>;
  const st = rows?.[0] ?? null;
  const { accAccountId } = await import("../currency/move");
  const myAcc = await accAccountId(wallet).catch(() => null);
  const mine: "own" | "enemy" | "free" = !st
    ? "free"
    : st.owner_account === myAcc
      ? "own"
      : "enemy";
  // Живой охранник: чужому/свободную не захватить, пока не победит его.
  const { loadGuardRow, guardViewIfAlive } = await import("./mine-guard");
  const guardian = guardViewIfAlive(await loadGuardRow(mapId, q, r));
  const guarded = !!guardian;
  return {
    kind: "mine",
    resource: cfg.resource,
    token: cfg.token,
    yieldAmount: cfg.yield,
    captureCost: cfg.captureCost,
    mine,
    capturedAt: st ? Number(st.cap) : null,
    claimedHours: st ? Number(st.claimed_hours) : 0,
    maxHours: cfg.maxHours ?? null,
    pending: st && mine === "own" ? Number(st.pending) : 0,
    guardian,
    can: built && mine !== "own" && !guarded,
    reasonKey: !built
      ? "braid.mine_not_grown"
      : mine === "own"
        ? "braid.mine_yours"
        : guarded
          ? "braid.mine_guarded"
          : null,
  };
}
