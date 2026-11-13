import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { requireWallet } from "../auth";
import { getSisterWallets } from "./user";
import { sqlStr, parseRewardConfig, computeRewardByPlace } from "./raid-shared";
import { raidWhere } from "./raid-helpers";
import { raidOwner } from "./beta-raid/owner";
import { liveRewardSql } from "./raid-reward-live";
import { customNameSql } from "@/server/api/player-name/player-name-sql";

export const getRaidLeaderboard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        locationId: z.string().min(1),
        limit: z.number().int().min(1).max(2000).default(20),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const me = requireWallet();
    const meAcc = await raidOwner(me);
    const loc = await pg.raidLocation.findOne({ id: data.locationId });
    if (!loc) return { rows: [] };
    const rows = (await mcpExec(
      `SELECT min(r.wallet) AS wallet,
              COALESCE(${customNameSql("r.account_id")}, '@' || NULLIF(max(u.telegram_username), ''), min(r.wallet)) AS name,
              SUM(r.damage)::int AS total,
              bool_or(r.account_id = ${sqlStr(meAcc)}) AS mine
         FROM yuplink.chip_boss_run r
         LEFT JOIN yuplink.users u ON u.wallet = r.wallet
        WHERE r.raid_location_id=${sqlStr(data.locationId)} AND r.raid_cycle_no=${
          loc.cycle_no
        }
        GROUP BY r.account_id
        ORDER BY total DESC LIMIT ${Math.floor(data.limit)};`,
      { wrapJson: true }
    )) as Array<{ wallet: string; name: string; total: number; mine: boolean }>;
    // Telegram-номер (кошелёк tg<id>) наружу — меткой (publicWallet, аудит 11.11.2026).
    const { publicRows } = await import("../publicWallet");
    return {
      rows: (await publicRows(rows)).map((r) => ({
        wallet: r.wallet,
        name: r.name,
        total: Number(r.total),
        mine: !!r.mine,
      })),
    };
  });

export const getRaidTournament = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ locationId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    const me = requireWallet();
    const meAcc = await raidOwner(me);
    const loc = await pg.raidLocation.findOne({ id: data.locationId });
    if (!loc) return { current: null, defeated: [] };
    const cycle = loc.cycle_no;

    const bossBoard = async (bossId: string, limit: number) => {
      const rows = (await mcpExec(
        `SELECT min(r.wallet) AS wallet,
                COALESCE(${customNameSql("r.account_id")}, '@' || NULLIF(max(u.telegram_username), ''), min(r.wallet)) AS name,
                SUM(r.damage)::int AS total, bool_or(r.account_id = ${sqlStr(meAcc)}) AS mine
           FROM yuplink.chip_boss_run r LEFT JOIN yuplink.users u ON u.wallet=r.wallet
          WHERE r.boss_id=${sqlStr(bossId)} AND r.raid_cycle_no=${cycle}
          GROUP BY r.account_id ORDER BY total DESC LIMIT ${limit};`,
        { wrapJson: true }
      )) as Array<{ wallet: string; name: string; total: number; mine: boolean }>;
      const { publicRows } = await import("../publicWallet");
      return (await publicRows(rows)).map((r) => ({
        name: r.name,
        total: Number(r.total),
        mine: !!r.mine,
      }));
    };
    const myRankFor = async (bossId: string): Promise<number | null> => {
      const md = (await mcpExec(
        `SELECT COALESCE(SUM(damage),0)::int t FROM yuplink.chip_boss_run
          WHERE boss_id=${sqlStr(bossId)} AND raid_cycle_no=${cycle} AND account_id=${sqlStr(meAcc)};`,
        { wrapJson: true }
      )) as Array<{ t: number }>;
      const myDamage = Number(md?.[0]?.t ?? 0);
      if (myDamage <= 0) return null;
      const ah = (await mcpExec(
        `SELECT COUNT(*)::int AS ahead FROM (
           SELECT r.account_id g, SUM(r.damage) tot
             FROM yuplink.chip_boss_run r
            WHERE r.boss_id=${sqlStr(bossId)} AND r.raid_cycle_no=${cycle}
            GROUP BY g HAVING SUM(r.damage) > ${myDamage}) x;`,
        { wrapJson: true }
      )) as Array<{ ahead: number }>;
      return Number(ah?.[0]?.ahead ?? 0) + 1;
    };
    const myRewardFor = async (bossId: string) => {
      const rows = (await mcpExec(
        `SELECT reward_kind, SUM(reward_amount)::float AS amt,
                COUNT(*) FILTER (WHERE reward_kind='pack')::int AS packs
           FROM yuplink.raid_reward
          WHERE boss_id=${sqlStr(bossId)} AND cycle_no=${cycle} AND account_id=${sqlStr(meAcc)}
            AND (claimed_at IS NOT NULL OR ${liveRewardSql()})
          GROUP BY reward_kind;`,
        { wrapJson: true }
      )) as Array<{ reward_kind: string; amt: number; packs: number }>;
      let packs = 0;
      const parts: Array<{ kind: string; amount: number }> = [];
      for (const r of rows) {
        if (r.reward_kind === "pack") packs += Number(r.packs || 0);
        else parts.push({ kind: r.reward_kind, amount: Number(r.amt || 0) });
      }
      return { parts, packs };
    };

    const { node } = await raidWhere(me, data.locationId);
    let current: {
      name: string;
      imageUrl: string | null;
      maxHp: number;
      currentHp: number;
      rows: Array<{ name: string; total: number; mine: boolean }>;
      myRank: number | null;
    } | null = null;
    if ((node.node_type === "boss" || node.node_type === "final") && node.boss_id) {
      const b = await pg.chipBoss.findOne({ id: node.boss_id });
      if (b)
        current = {
          name: b.name,
          imageUrl: b.image_url,
          maxHp: Number(b.max_hp),
          currentHp: Number(b.current_hp),
          rows: await bossBoard(b.id, 5000),
          myRank: await myRankFor(b.id),
        };
    }

    const curBossId = node.boss_id ?? "";
    const dead = (await mcpExec(
      `SELECT b.id, b.name, b.image_url, b.max_hp FROM yuplink.chip_boss b
         JOIN yuplink.raid_node n ON n.id=b.raid_node_id
        WHERE n.location_id=${sqlStr(data.locationId)} AND b.current_hp<=0
          AND b.id <> ${sqlStr(curBossId)}
        ORDER BY n.branch_key, n.ordinal;`,
      { wrapJson: true }
    )) as Array<{ id: string; name: string; image_url: string | null; max_hp: number }>;
    const defeated: Array<{
      name: string;
      imageUrl: string | null;
      maxHp: number;
      myRank: number | null;
      reward: { parts: Array<{ kind: string; amount: number }>; packs: number };
    }> = [];
    for (const d of dead) {
      defeated.push({
        name: d.name,
        imageUrl: d.image_url,
        maxHp: Number(d.max_hp),
        myRank: await myRankFor(d.id),
        reward: await myRewardFor(d.id),
      });
    }

    const locCfg = parseRewardConfig(loc.reward_tiers);
    const curBoss =
      node.boss_id ? await pg.chipBoss.findOne({ id: node.boss_id }) : null;
    const curCfg = curBoss ? parseRewardConfig(curBoss.reward_tiers) : null;
    const packIds = new Set<string>();
    for (const p of locCfg.packs) if (p.packId) packIds.add(p.packId);
    if (curCfg) for (const p of curCfg.packs) if (p.packId) packIds.add(p.packId);
    const packName = new Map<string, { name: string; cover: string | null }>();
    if (packIds.size > 0) {
      const { data: pk } = await pg.chipPacks
        .raw()
        .select("id,name,cover_image_url")
        .in("id", [...packIds]);
      for (const p of (pk ?? []) as Array<{
        id: string;
        name: string;
        cover_image_url: string | null;
      }>)
        packName.set(p.id, { name: p.name, cover: p.cover_image_url });
    }

    const locRows = (await mcpExec(
      `SELECT COALESCE(${customNameSql("r.account_id")}, '@' || NULLIF(max(u.telegram_username), ''), min(r.wallet)) AS name,
              SUM(r.damage)::int AS total, bool_or(r.account_id = ${sqlStr(meAcc)}) AS mine
         FROM yuplink.chip_boss_run r LEFT JOIN yuplink.users u ON u.wallet=r.wallet
        WHERE r.raid_location_id=${sqlStr(data.locationId)} AND r.raid_cycle_no=${cycle}
        GROUP BY r.account_id ORDER BY total DESC LIMIT 2000;`,
      { wrapJson: true }
    )) as Array<{ name: string; total: number; mine: boolean }>;
    const locMyRows = (await mcpExec(
      `SELECT COALESCE(SUM(damage),0)::int t FROM yuplink.chip_boss_run
        WHERE raid_location_id=${sqlStr(data.locationId)} AND raid_cycle_no=${cycle}
          AND account_id=${sqlStr(meAcc)};`,
      { wrapJson: true }
    )) as Array<{ t: number }>;
    const locMyDamage = Number(locMyRows?.[0]?.t ?? 0);
    let locMyRank: number | null = null;
    if (locMyDamage > 0) {
      const ah = (await mcpExec(
        `SELECT COUNT(*)::int AS ahead FROM (
           SELECT r.account_id g, SUM(r.damage) tot
             FROM yuplink.chip_boss_run r
            WHERE r.raid_location_id=${sqlStr(data.locationId)} AND r.raid_cycle_no=${cycle}
            GROUP BY g HAVING SUM(r.damage) > ${locMyDamage}) x;`,
        { wrapJson: true }
      )) as Array<{ ahead: number }>;
      locMyRank = Number(ah?.[0]?.ahead ?? 0) + 1;
    }

    return {
      current: current
        ? {
            ...current,
            rewardByPlace: curCfg ? computeRewardByPlace(curCfg, packName) : [],
          }
        : null,
      defeated,
      location: {
        rows: locRows.map((r) => ({
          name: r.name,
          total: Number(r.total),
          mine: !!r.mine,
        })),
        myRank: locMyRank,
        myDamage: locMyDamage,
        rewardByPlace: computeRewardByPlace(locCfg, packName),
      },
    };
  });
