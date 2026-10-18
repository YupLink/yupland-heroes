import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg, sb } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { requireWallet } from "../auth";
import { getSisterWallets } from "./user";
import type { PgRaidLocation, PgRaidNode } from "../db/pg";
import { sqlStr, buildLocationTree, targetReachable } from "./raid-shared";
import { accountOf } from "./user-shared";
import { noteEnergySpendByWallet } from "./beta-raid/econ/energy-note";
import {
  firstNode,
  setRaidCurrent,
  advanceToFrontier,
  energyOf,
} from "./raid-helpers";

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

export const getRaidLocations = createServerFn({ method: "GET" }).handler(
  async () => {
    const wallet = requireWallet();
    const { data } = await pg.raidLocation
      .raw()
      .select("*")
      .eq("active", true)
      .eq("in_hub", true)
      .order("created_at", { ascending: true });
    const locs = (data ?? []) as PgRaidLocation[];
    // Резюм и вход обязаны спрашивать один ключ — аккаунт. Раньше список
    // возвращал локацию, найденную по адресам-сёстрам, а сам вход требовал
    // строку ровно этого адреса: экран показывал «продолжить», а сервер
    // отвечал «сначала выбери локацию».
    const navAccount = await accountOf(wallet);
    let resumeLocationId: string | null = null;
    const rcRows = (await mcpExec(
      `SELECT location_id FROM yuplink.raid_current
        WHERE account_id = ${sqlStr(navAccount)} ORDER BY updated_at DESC LIMIT 1;`,
      { wrapJson: true }
    )) as Array<{ location_id: string | null }>;
    const hasPointer = !!rcRows && rcRows.length > 0;
    const ptrLoc = hasPointer ? rcRows[0].location_id : undefined;
    const explicitHub = hasPointer && ptrLoc == null;
    if (hasPointer && ptrLoc) {
      const active = await pg.raidLocation.findOne({ id: ptrLoc });
      if (active?.active) resumeLocationId = ptrLoc;
    }
    if (resumeLocationId == null && !explicitHub) {
      const rows = (await mcpExec(
        `SELECT p.location_id FROM yuplink.raid_position p
           JOIN yuplink.raid_location l ON l.id = p.location_id
          WHERE p.account_id = ${sqlStr(navAccount)} AND l.active = true AND p.cycle_no = l.cycle_no
          ORDER BY p.updated_at DESC LIMIT 1;`,
        { wrapJson: true }
      )) as Array<{ location_id: string }>;
      resumeLocationId = rows?.[0]?.location_id ?? null;
    }
    return {
      resumeLocationId,
      locations: locs.map((l) => ({
        id: l.id,
        name: l.name,
        imageUrl: l.image_url,
        difficulty:
          (l as unknown as { difficulty?: string | null }).difficulty ?? null,
      })),
    };
  }
);

export const chooseRaidLocation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ locationId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const loc = await pg.raidLocation.findOne({ id: data.locationId });
    if (!loc || !loc.active) throw new Error("Локация недоступна");
    const start = await firstNode(data.locationId);
    if (!start) throw new Error("В локации ещё нет узлов");
    const now = new Date().toISOString();
    const navAccount = await accountOf(wallet);
    const existing = await pg.raidPosition.findOne({
      account_id: navAccount,
      location_id: data.locationId,
    });
    if (existing) {
      if (existing.cycle_no !== loc.cycle_no) {
        await pg.raidPosition.update(
          { account_id: navAccount, location_id: data.locationId },
          {
            node_id: start.id,
            cycle_no: loc.cycle_no,
            cleared_final_branches: [],
            updated_at: now,
          }
        );
      }
    } else {
      if (!(loc.in_hub ?? true)) {
        const gate = await forkChildGateOpen(wallet, data.locationId);
        if (gate === false)
          throw new Error("Туда — только через развилку в предыдущей локации");
      }
      const { error: enErr } = await sb.rpc("touch_energy_atomic", {
        p_wallet: wallet,
        p_spend: 1,
      });
      if (enErr) {
        if (String(enErr.message).includes("not_enough_energy"))
          throw new Error("Не хватает энергии на вход в локацию");
        throw new Error(enErr.message);
      }
      void noteEnergySpendByWallet(wallet, 1, "other");
      await pg.raidPosition.insert({
        account_id: navAccount,
        wallet,
        location_id: data.locationId,
        node_id: start.id,
        cycle_no: loc.cycle_no,
        cleared_final_branches: [],
        updated_at: now,
      });
    }
    const cur = await pg.raidNode.findOne({
      id: (await pg.raidPosition.findOne({ account_id: navAccount, location_id: data.locationId }))!
        .node_id,
    });
    if (cur) await advanceToFrontier(wallet, loc, cur);
    await setRaidCurrent(wallet, data.locationId);
    return { ok: true };
  });

export const raidSetCurrent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ locationId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    await setRaidCurrent(wallet, data.locationId);
    return { ok: true };
  });
