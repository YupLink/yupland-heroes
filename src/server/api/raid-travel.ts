import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg, sb } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { requireWallet } from "../auth";
import type { PgRaidNode, PgChipBoss } from "../db/pg";
import {
  sqlStr,
  buildLocationTree,
  travelSteps,
  targetReachable,
} from "./raid-shared";
import { currentRaidPos, setRaidCurrent } from "./raid-helpers";
import { accountOf } from "./user-shared";
import { noteEnergySpendByWallet } from "./beta-raid/econ/energy-note";

async function forkChildGateOpen(
  wallet: string,
  childLocationId: string
): Promise<boolean | null> {
  const links = (await mcpExec(
    `SELECT fl.fork_node_id fnode, rn.location_id ploc
       FROM yuplink.raid_fork_link fl
       JOIN yuplink.raid_node rn ON rn.id = fl.fork_node_id
      WHERE fl.target_location_id=${sqlStr(childLocationId)};`,
    { wrapJson: true }
  )) as Array<{ fnode: string; ploc: string }>;
  if (!links || links.length === 0) return null;
  for (const lk of links) {
    const ploc = await pg.raidLocation.findOne({ id: lk.ploc });
    if (!ploc) continue;
    const { data: pn } = await pg.raidNode
      .raw()
      .select("*")
      .eq("location_id", lk.ploc);
    const pNodes = (pn ?? []) as PgRaidNode[];
    const pMeta = buildLocationTree(pNodes);
    const pbIds = pNodes.map((n) => n.boss_id).filter(Boolean) as string[];
    const pb =
      pbIds.length > 0
        ? (((await pg.chipBoss.raw().select("id,current_hp").in("id", pbIds))
            .data ?? []) as Array<{ id: string; current_hp: number }>)
        : [];
    const hpById = new Map(pb.map((b) => [b.id, Number(b.current_hp)]));
    const pDead = new Set<string>();
    for (const n of pNodes)
      if (n.boss_id && (hpById.get(n.boss_id) ?? 1) <= 0) pDead.add(n.id);
    const pChest = new Set<string>();
    const pcr = (await mcpExec(
      `SELECT node_id FROM yuplink.raid_chest_open
        WHERE wallet=${sqlStr(wallet)} AND cycle_no=${ploc.cycle_no};`,
      { wrapJson: true }
    )) as Array<{ node_id: string }>;
    for (const r of pcr ?? []) pChest.add(r.node_id);
    if (targetReachable(lk.fnode, pMeta, pDead, pChest)) return true;
  }
  return false;
}

export const raidTravel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ targetNodeId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const target = await pg.raidNode.findOne({ id: data.targetNodeId });
    if (!target) throw new Error("Узел не найден");
    if (target.node_type === "fork")
      throw new Error("На развилку перейти нельзя — выбери ветку");
    const toLoc = await pg.raidLocation.findOne({ id: target.location_id });
    if (!toLoc || !toLoc.active) throw new Error("Локация недоступна");

    const gate = await forkChildGateOpen(wallet, toLoc.id);
    if (gate === false)
      throw new Error("Сначала дойди до развилки в предыдущей локации");

    const { data: nRows } = await pg.raidNode
      .raw()
      .select("*")
      .eq("location_id", toLoc.id);
    const toNodes = (nRows ?? []) as PgRaidNode[];
    const meta = buildLocationTree(toNodes);
    const bIds = toNodes.map((n) => n.boss_id).filter(Boolean) as string[];
    const bosses =
      bIds.length > 0
        ? (((await pg.chipBoss.raw().select("*").in("id", bIds)).data ??
            []) as PgChipBoss[])
        : [];
    const bMap = new Map(bosses.map((b) => [b.id, b]));
    const deadSet = new Set<string>();
    for (const n of toNodes) {
      const b = n.boss_id ? bMap.get(n.boss_id) : null;
      if (b && Number(b.current_hp) <= 0) deadSet.add(n.id);
    }
    const openedChest = new Set<string>();
    const chestRows = (await mcpExec(
      `SELECT node_id FROM yuplink.raid_chest_open
        WHERE wallet=${sqlStr(wallet)} AND cycle_no=${toLoc.cycle_no};`,
      { wrapJson: true }
    )) as Array<{ node_id: string }>;
    for (const r of chestRows ?? []) openedChest.add(r.node_id);
    if (!targetReachable(data.targetNodeId, meta, deadSet, openedChest))
      throw new Error("Туда пока не пройти — впереди живой босс");

    const { locId: curLoc, nodeId: curNode } = await currentRaidPos(wallet);

    const metaByLoc = new Map<string, Map<string, import("./raid-shared").LocTreeMeta>>();
    metaByLoc.set(toLoc.id, meta);
    if (curLoc && curLoc !== toLoc.id) {
      const { data: fRows } = await pg.raidNode
        .raw()
        .select("*")
        .eq("location_id", curLoc);
      metaByLoc.set(curLoc, buildLocationTree((fRows ?? []) as PgRaidNode[]));
    }
    const baseCost = travelSteps(curLoc, curNode, toLoc.id, data.targetNodeId, metaByLoc);
    if (baseCost <= 0) {
      await setRaidCurrent(wallet, toLoc.id);
      return { ok: true, nodeId: data.targetNodeId, locationId: toLoc.id, spent: 0 };
    }
    const cost = baseCost >= 3 ? baseCost + 1 : baseCost;

    const { error } = await sb.rpc("touch_energy_atomic", {
      p_wallet: wallet,
      p_spend: cost,
    });
    if (error) {
      if (String(error.message).includes("not_enough_energy"))
        throw new Error("Не хватает энергии на переход");
      throw new Error(error.message);
    }
    void noteEnergySpendByWallet(wallet, cost, "other");
    const now = new Date().toISOString();
    const travelAccount = await accountOf(wallet);
    const existing = await pg.raidPosition.findOne({
      account_id: travelAccount,
      location_id: toLoc.id,
    });
    if (existing) {
      await pg.raidPosition.update(
        { account_id: travelAccount, location_id: toLoc.id },
        { node_id: data.targetNodeId, cycle_no: toLoc.cycle_no, updated_at: now }
      );
    } else {
      await pg.raidPosition.insert({
        account_id: travelAccount,
        wallet,
        location_id: toLoc.id,
        node_id: data.targetNodeId,
        cycle_no: toLoc.cycle_no,
        cleared_final_branches: [],
        updated_at: now,
      });
    }
    await setRaidCurrent(wallet, toLoc.id);
    return { ok: true, nodeId: data.targetNodeId, locationId: toLoc.id, spent: cost };
  });
