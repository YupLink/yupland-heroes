import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { requireWallet } from "../auth";
import { accountIdOf } from "./user-shared";
import type { PgRaidNode, PgChipBoss } from "../db/pg";
import { sqlStr, parseRewardConfig } from "./raid-shared";
import { liveRewardSql } from "./raid-reward-live";
import { decorateRewardConfig, type RewardView } from "./beta-raid/encounter-reward-view";
import { raidWhere, energyOf } from "./raid-helpers";

export const getRaidState = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ locationId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const w = await raidWhere(wallet, data.locationId);
    const { pos, loc } = w;
    const node = w.node;
    const { data: nRows } = await pg.raidNode
      .raw()
      .select("*")
      .eq("location_id", data.locationId)
      .order("ordinal", { ascending: true });
    const nodes = (nRows ?? []) as PgRaidNode[];
    const bossIds = nodes.map((n) => n.boss_id).filter(Boolean) as string[];
    const bosses =
      bossIds.length > 0
        ? (((await pg.chipBoss.raw().select("*").in("id", bossIds)).data ?? []) as PgChipBoss[])
        : [];
    const bMap = new Map(bosses.map((b) => [b.id, b]));

    const curBoss = node.boss_id ? bMap.get(node.boss_id) : null;
    // Названия/картинки паков И предметов подставляет общий декоратор —
    // раньше здесь грузились только паки, и предметы «до места N» игрок
    // в окне босса не видел, хотя раздача их выдаёт (raid-distribute).
    let curReward: RewardView | null = null;
    if (curBoss) {
      curReward = await decorateRewardConfig(parseRewardConfig(curBoss.reward_tiers));
    }

    // Свой урон и чужие суммы считаем ОДНИМ ключом — аккаунтом; иначе место в
    // таблице не сходится со своей же строкой.
    const myAccount = (await accountIdOf(wallet)) ?? "";
    const myRows = (await mcpExec(
      `SELECT COALESCE(SUM(damage),0)::int t FROM yuplink.chip_boss_run
        WHERE raid_location_id=${sqlStr(data.locationId)} AND raid_cycle_no=${
          loc.cycle_no
        } AND account_id = ${sqlStr(myAccount)};`,
      { wrapJson: true },
    )) as Array<{ t: number }>;
    const myDamage = Number(myRows?.[0]?.t ?? 0);

    let myRank: number | null = null;
    if (myDamage > 0) {
      const rankRows = (await mcpExec(
        `SELECT COUNT(*)::int AS ahead FROM (
           SELECT r.account_id g, SUM(r.damage) tot
             FROM yuplink.chip_boss_run r
             LEFT JOIN yuplink.users u ON u.wallet = r.wallet
            WHERE r.raid_location_id=${sqlStr(data.locationId)} AND r.raid_cycle_no=${loc.cycle_no}
            GROUP BY g HAVING SUM(r.damage) > ${myDamage}
         ) x;`,
        { wrapJson: true },
      )) as Array<{ ahead: number }>;
      myRank = Number(rankRows?.[0]?.ahead ?? 0) + 1;
    }

    const rwRows = (await mcpExec(
      `SELECT count(*)::int c FROM yuplink.raid_reward
        WHERE account_id = ${sqlStr(myAccount)} AND claimed_at IS NULL AND ${liveRewardSql()};`,
      { wrapJson: true },
    )) as Array<{ c: number }>;
    const myRewards = Number(rwRows?.[0]?.c ?? 0);

    const b = node.boss_id ? bMap.get(node.boss_id) : null;
    const nodeCleared =
      node.node_type === "boss" || node.node_type === "final"
        ? !!b && Number(b.current_hp) <= 0
        : node.node_type === "fork"
          ? false
          : true;
    const chestOpened = node.node_type.startsWith("chest_")
      ? !!(await pg.raidChestOpen.findOne({
          account_id: myAccount,
          node_id: node.id,
          cycle_no: loc.cycle_no,
        }))
      : false;
    const branchNodes = nodes
      .filter((n) => n.branch_key === node.branch_key)
      .sort((a, c) => a.ordinal - c.ordinal);
    const hasNextInBranch = branchNodes.some((n) => n.ordinal > node.ordinal);

    let forkLinks: Array<{ locationId: string; name: string; imageUrl: string | null }> = [];
    if (node.node_type === "fork") {
      const flRows = (await mcpExec(
        `SELECT fl.target_location_id t, l.name, l.image_url img
           FROM yuplink.raid_fork_link fl
           JOIN yuplink.raid_location l ON l.id = fl.target_location_id
          WHERE fl.fork_node_id=${sqlStr(node.id)} AND l.active = true
          ORDER BY fl.ordinal;`,
        { wrapJson: true },
      )) as Array<{ t: string; name: string; img: string | null }>;
      forkLinks = (flRows ?? []).map((r) => ({
        locationId: r.t,
        name: r.name,
        imageUrl: r.img,
      }));
    }

    return {
      location: {
        id: loc.id,
        name: loc.name,
        imageUrl: loc.image_url,
        difficulty: (loc as unknown as { difficulty?: string | null }).difficulty ?? null,
        rewardConfig: parseRewardConfig(loc.reward_tiers),
      },
      cycleNo: loc.cycle_no,
      myRank,
      myRewards,
      position: {
        nodeId: node.id,
        branch: node.branch_key,
        ordinal: node.ordinal,
        type: node.node_type,
        isFinal: node.is_final,
        chestOpened,
        clearedBranches: pos.cleared_final_branches ?? [],
      },
      nav: {
        canForward:
          node.node_type === "fork"
            ? hasNextInBranch
            : node.is_final
              ? false
              : (node.node_type.startsWith("chest_") ? chestOpened : nodeCleared) &&
                hasNextInBranch,
        canBack: true,
        atFork: node.node_type === "fork",
        canOpenChest: node.node_type.startsWith("chest_") && !chestOpened,
      },
      forkLinks,
      forkImageUrl:
        node.node_type === "fork"
          ? ((node as unknown as { image_url?: string | null }).image_url ?? null)
          : null,
      energy: await energyOf(wallet),
      myDamage,
      nodes: nodes.map((n) => {
        const nb = n.boss_id ? bMap.get(n.boss_id) : null;
        return {
          id: n.id,
          branch: n.branch_key,
          ordinal: n.ordinal,
          type: n.node_type,
          isFinal: n.is_final,
          current: n.id === node.id,
          boss: nb
            ? {
                name: nb.name,
                imageUrl: nb.image_url,
                backgroundUrl:
                  (nb as unknown as { background_url?: string | null }).background_url ?? null,
                removeWhite: (nb as unknown as { remove_white?: boolean }).remove_white ?? false,
                badgeLabel: (nb as unknown as { badge_label?: string | null }).badge_label ?? null,
                rewardConfig: n.id === node.id ? curReward : null,
                maxHp: Number(nb.max_hp),
                currentHp: Number(nb.current_hp),
              }
            : null,
        };
      }),
    };
  });
