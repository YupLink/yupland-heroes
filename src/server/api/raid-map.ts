import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { requireWallet, isAdminWallet } from "../auth";
import { accountIdOf } from "./user-shared";
import type { PgRaidLocation, PgRaidNode, PgChipBoss } from "../db/pg";
import {
  sqlStr,
  parseRewardConfig,
  computeRewardByPlace,
  buildLocationTree,
  travelSteps,
  targetReachable,
  rewardSummary,
} from "./raid-shared";
import { energyOf, currentRaidPos } from "./raid-helpers";
export const getRaidFullMap = createServerFn({ method: "GET" }).handler(
  async () => {
    const wallet = requireWallet();
    const { data: lRows } = await pg.raidLocation
      .raw()
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: true });
    const locs = (lRows ?? []) as PgRaidLocation[];
    if (locs.length === 0)
      return { energy: await energyOf(wallet), current: null, locations: [] };
    const locIds = locs.map((l) => l.id);
    const { data: nRows } = await pg.raidNode
      .raw()
      .select("*")
      .in("location_id", locIds)
      .order("ordinal", { ascending: true });
    const allNodes = (nRows ?? []) as PgRaidNode[];
    const bossIds = allNodes.map((n) => n.boss_id).filter(Boolean) as string[];
    const bosses =
      bossIds.length > 0
        ? (((await pg.chipBoss.raw().select("*").in("id", bossIds)).data ??
            []) as PgChipBoss[])
        : [];
    const bMap = new Map(bosses.map((b) => [b.id, b]));
    const metaByLoc = new Map<string, Map<string, import("./raid-shared").LocTreeMeta>>();
    const nodesByLoc = new Map<string, PgRaidNode[]>();
    for (const l of locs) {
      const ns = allNodes.filter((n) => n.location_id === l.id);
      nodesByLoc.set(l.id, ns);
      metaByLoc.set(l.id, buildLocationTree(ns));
    }
    const deadSet = new Set<string>();
    for (const n of allNodes) {
      const b = n.boss_id ? bMap.get(n.boss_id) : null;
      if (b && Number(b.current_hp) <= 0) deadSet.add(n.id);
    }
    const myAccount = (await accountIdOf(wallet)) ?? "";
    const locIdsSql = locIds.map((id) => sqlStr(id)).join(",") || "''";
    const [chestRows, flAll, hcRows, lbRows, mrRows, curPos] = await Promise.all([
      mcpExec(
        `SELECT co.node_id FROM yuplink.raid_chest_open co
           JOIN yuplink.raid_node rn ON rn.id = co.node_id
           JOIN yuplink.raid_location rl ON rl.id = rn.location_id
          WHERE co.account_id = ${sqlStr(myAccount)} AND co.cycle_no = rl.cycle_no;`,
        { wrapJson: true }
      ) as Promise<Array<{ node_id: string }>>,
      mcpExec(
        `SELECT fork_node_id fnode, target_location_id child FROM yuplink.raid_fork_link;`,
        { wrapJson: true }
      ) as Promise<Array<{ fnode: string; child: string }>>,
      mcpExec(
        `SELECT p.location_id lid,
                COUNT(DISTINCT p.account_id) c
           FROM yuplink.raid_position p
           JOIN yuplink.raid_location l ON l.id = p.location_id
           LEFT JOIN yuplink.users u ON u.wallet = p.wallet
          WHERE l.active = true AND p.cycle_no = l.cycle_no
          GROUP BY p.location_id;`,
        { wrapJson: true }
      ) as Promise<Array<{ lid: string; c: number }>>,
      mcpExec(
        `SELECT location_id, name, total, mine FROM (
           SELECT r.raid_location_id AS location_id,
                  COALESCE(NULLIF(max(u.telegram_username), ''), min(r.wallet)) AS name,
                  SUM(r.damage)::int AS total,
                  bool_or(r.account_id = ${sqlStr(myAccount)}) AS mine,
                  ROW_NUMBER() OVER (PARTITION BY r.raid_location_id ORDER BY SUM(r.damage) DESC) AS rn
             FROM yuplink.chip_boss_run r
             JOIN yuplink.raid_location l ON l.id = r.raid_location_id AND l.cycle_no = r.raid_cycle_no
             LEFT JOIN yuplink.users u ON u.wallet = r.wallet
            WHERE r.raid_location_id IN (${locIdsSql}) AND l.active = true
            GROUP BY r.raid_location_id, r.account_id
         ) x ORDER BY location_id, rn;`,
        { wrapJson: true }
      ) as Promise<Array<{ location_id: string; name: string; total: number; mine: boolean }>>,
      mcpExec(
        `WITH agg AS (
           SELECT r.raid_location_id AS location_id,
                  r.account_id AS grp,
                  SUM(r.damage) AS total,
                  bool_or(r.account_id = ${sqlStr(myAccount)}) AS mine
             FROM yuplink.chip_boss_run r
             JOIN yuplink.raid_location l ON l.id = r.raid_location_id AND l.cycle_no = r.raid_cycle_no
             LEFT JOIN yuplink.users u ON u.wallet = r.wallet
            WHERE r.raid_location_id IN (${locIdsSql}) AND l.active = true
            GROUP BY r.raid_location_id, r.account_id
         )
         SELECT a1.location_id,
                (SELECT COUNT(*) FROM agg a2
                  WHERE a2.location_id = a1.location_id AND a2.total > a1.total) + 1 AS rank
           FROM agg a1 WHERE a1.mine = true;`,
        { wrapJson: true }
      ) as Promise<Array<{ location_id: string; rank: number }>>,
      currentRaidPos(wallet),
    ]);
    const { locId: curLoc, nodeId: curNode } = curPos;
    const openedChest = new Set<string>();
    for (const r of chestRows ?? []) openedChest.add(r.node_id);
    const nodeLoc = new Map(allNodes.map((n) => [n.id, n.location_id]));
    const childGate = new Map<string, boolean>();
    const childParent = new Map<string, string>();
    for (const fl of flAll ?? []) {
      const ploc = nodeLoc.get(fl.fnode);
      if (ploc) childParent.set(fl.child, ploc);
      const pMeta = ploc ? metaByLoc.get(ploc) : null;
      const open = pMeta
        ? targetReachable(fl.fnode, pMeta, deadSet, openedChest)
        : false;
      childGate.set(fl.child, (childGate.get(fl.child) ?? false) || open);
    }
    const hcMap = new Map((hcRows ?? []).map((r) => [r.lid, Number(r.c)]));
    const leadersByLoc = new Map<string, Array<{ name: string; total: number; mine: boolean }>>();
    for (const r of lbRows ?? []) {
      const arr = leadersByLoc.get(r.location_id) ?? [];
      arr.push({ name: r.name, total: Number(r.total), mine: !!r.mine });
      leadersByLoc.set(r.location_id, arr);
    }
    const myRankByLoc = new Map<string, number>();
    for (const r of mrRows ?? []) myRankByLoc.set(r.location_id, Number(r.rank));
    const mapPackIds = new Set<string>();
    for (const b of bosses)
      for (const p of parseRewardConfig(b.reward_tiers).packs)
        if (p.packId && p.toPlace > 0) mapPackIds.add(p.packId);
    for (const l of locs)
      for (const p of parseRewardConfig(l.reward_tiers).packs)
        if (p.packId && p.toPlace > 0) mapPackIds.add(p.packId);
    const mapPackInfo = new Map<string, { name: string; cover: string | null }>();
    if (mapPackIds.size > 0) {
      const { data: pk } = await pg.chipPacks
        .raw()
        .select("id,name,cover_image_url")
        .in("id", [...mapPackIds]);
      for (const p of (pk ?? []) as Array<{
        id: string;
        name: string;
        cover_image_url: string | null;
      }>)
        mapPackInfo.set(p.id, { name: p.name, cover: p.cover_image_url });
    }
    const visibleLocs = locs.filter(
      (l) =>
        ((l as unknown as { in_hub?: boolean }).in_hub ?? true) ||
        childGate.get(l.id) === true ||
        l.id === curLoc
    );
    const visibleIds = new Set(visibleLocs.map((l) => l.id));
    return {
      energy: await energyOf(wallet),
      current: curNode ? { locationId: curLoc, nodeId: curNode } : null,
      isAdmin: isAdminWallet(wallet),
      locations: visibleLocs
        .map((l) => {
        const meta = metaByLoc.get(l.id)!;
        const gatedShut =
          childGate.has(l.id) && !childGate.get(l.id) && l.id !== curLoc;
        const ns = nodesByLoc.get(l.id) ?? [];
        return {
          id: l.id,
          name: l.name,
          imageUrl: l.image_url,
          difficulty:
            (l as unknown as { difficulty?: string | null }).difficulty ?? null,
          headcount: hcMap.get(l.id) ?? 0,
          isCurrent: l.id === curLoc,
          parentLocationId:
            childGate.get(l.id) === true ? childParent.get(l.id) ?? null : null,
          leaders: leadersByLoc.get(l.id) ?? [],
          myRank: myRankByLoc.get(l.id) ?? null,
          rewardByPlace: computeRewardByPlace(
            parseRewardConfig(l.reward_tiers),
            mapPackInfo
          ),
          nodes: ns
            .sort(
              (a, b) => (meta.get(a.id)?.level ?? 0) - (meta.get(b.id)?.level ?? 0)
            )
            .map((n) => {
              const b = n.boss_id ? bMap.get(n.boss_id) ?? null : null;
              const dead = deadSet.has(n.id);
              const isCur = n.id === curNode;
              const isFork = n.node_type === "fork";
              const nodeReachable = targetReachable(
                n.id,
                meta,
                deadSet,
                openedChest
              );
              const damaged =
                !!b && Number(b.current_hp) < Number(b.max_hp);
              const revealed =
                (isFork && nodeReachable) || dead || isCur || damaged;
              return {
                id: n.id,
                branch: n.branch_key,
                level: meta.get(n.id)?.level ?? 0,
                type: n.node_type,
                isFinal: n.is_final,
                dead,
                isCurrent: isCur,
                explored: revealed,
                reachable: gatedShut ? false : nodeReachable,
                ...(() => {
                  const b0 = travelSteps(curLoc, curNode, l.id, n.id, metaByLoc);
                  const surcharge = b0 >= 3;
                  return { steps: b0 > 0 ? b0 + (surcharge ? 1 : 0) : 0, surcharge };
                })(),
                imageUrl: revealed && b ? b.image_url : null,
                maxHp: b ? Number(b.max_hp) : null,
                currentHp: b ? Number(b.current_hp) : null,
                reward: rewardSummary(b, mapPackInfo),
              };
            }),
          forks: ns
            .filter((n) => n.node_type === "fork")
            .map((n) => ({
              forkNodeId: n.id,
              afterBosses: ns.filter(
                (x) =>
                  (x.node_type === "boss" || x.node_type === "final") &&
                  (meta.get(x.id)?.level ?? 0) < (meta.get(n.id)?.level ?? 0)
              ).length,
              children: (flAll ?? [])
                .filter((f) => f.fnode === n.id)
                .map((f) => f.child)
                .filter((cid) => visibleIds.has(cid)),
            }))
            .filter((f) => f.children.length > 0),
        };
      }),
    };
  }
);
