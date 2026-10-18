import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import type { PgChipBoss } from "../db/pg";
import { nanoid } from "nanoid";
import { sqlStr, parseRewardConfig } from "./raid-shared";
import { isExtraFiller } from "./reward-filler";

export async function distributeRaidRewards(
  locationId: string,
  cycleNo: number
): Promise<number> {
  const loc = await pg.raidLocation.findOne({ id: locationId });
  if (!loc) return 0;
  const now = new Date().toISOString();
  const cfg = parseRewardConfig(loc.reward_tiers);
  const lb = (await mcpExec(
    `SELECT r.account_id AS account, SUM(r.damage)::int AS total
       FROM yuplink.chip_boss_run r
      WHERE r.raid_location_id=${sqlStr(locationId)} AND r.raid_cycle_no=${cycleNo}
      GROUP BY r.account_id ORDER BY total DESC;`,
    { wrapJson: true }
  )) as Array<{ account: string; total: number }>;
  if (lb.length === 0) return 0;
  const won = (await mcpExec(
    `INSERT INTO yuplink.raid_reward_distributed (scope_key, cycle_no)
     VALUES (${sqlStr(`loc:${locationId}`)}, ${cycleNo}) ON CONFLICT DO NOTHING RETURNING scope_key;`,
    { wrapJsonCte: true }
  )) as Array<{ scope_key: string }>;
  if (!won || won.length === 0) return 0;
  const splitSum = cfg.split.reduce((a, x) => a + (Number(x) || 0), 0);
  const norm = cfg.split.map((x) => (splitSum > 0 ? (Number(x) || 0) / splitSum : 0));
  const places = Math.min(norm.length, lb.length);
  const recipients = new Set<string>();
  const rec = async (
    account: string, place: number, total: number,
    kind: string, amount: number, packId: string | null
  ) => {
    await pg.raidReward.insert({
      id: `rrw_${nanoid(10)}`, location_id: locationId, cycle_no: cycleNo,
      account_id: account, wallet: null, place, damage: total,
      reward_kind: kind, reward_amount: amount,
      pack_id: packId, claimed_at: null, created_at: now, boss_id: null,
    });
    recipients.add(account);
  };
  for (const fl of cfg.fillers) {
    if (fl.kind === "tickets") continue;
    // Ресурс и свой товар — механика карты (бета-рейд). Недельный турнир
    // локации их не раздаёт: делить слиток железа по процентам мест нечестно,
    // а обещание по местам (computeRewardByPlace) их так же пропускает.
    if (isExtraFiller(fl)) continue;
    if (!(fl.amount > 0)) continue;
    let given = 0;
    for (let i = 0; i < places; i++) {
      let amt = Math.round(fl.amount * norm[i] * 100) / 100;
      if (given + amt > fl.amount)
        amt = Math.max(0, Math.round((fl.amount - given) * 100) / 100);
      given += amt;
      const val = fl.kind === "energy" ? Math.round(amt) : amt;
      if (val <= 0) continue;
      const kind = fl.kind === "token" && fl.token ? fl.token : fl.kind;
      await rec(lb[i].account, i + 1, lb[i].total, kind, val, null);
    }
  }
  for (const pk of cfg.packs) {
    if (!pk.packId || pk.toPlace <= 0) continue;
    const top = Math.min(pk.toPlace, lb.length);
    for (let i = 0; i < top; i++)
      await rec(lb[i].account, i + 1, lb[i].total, "pack", 0, pk.packId);
  }
  for (const it of cfg.items ?? []) {
    if (!it.itemTemplateId || it.toPlace <= 0) continue;
    const top = Math.min(it.toPlace, lb.length);
    for (let i = 0; i < top; i++)
      await rec(lb[i].account, i + 1, lb[i].total, "item", 0, it.itemTemplateId);
  }
  return recipients.size;
}

export async function distributeRaidBossKillRewards(
  boss: PgChipBoss,
  locationId: string,
  cycleNo: number
): Promise<number> {
  const cfg = parseRewardConfig(boss.reward_tiers);
  if (cfg.fillers.length === 0 && cfg.packs.length === 0) return 0;
  const now = new Date().toISOString();
  const lb = (await mcpExec(
    `SELECT r.account_id AS account, SUM(r.damage)::int AS total
       FROM yuplink.chip_boss_run r
      WHERE r.boss_id=${sqlStr(boss.id)} AND r.raid_cycle_no=${cycleNo}
      GROUP BY r.account_id ORDER BY total DESC;`,
    { wrapJson: true }
  )) as Array<{ account: string; total: number }>;
  if (lb.length === 0) return 0;
  const won = (await mcpExec(
    `INSERT INTO yuplink.raid_reward_distributed (scope_key, cycle_no)
     VALUES (${sqlStr(boss.id)}, ${cycleNo}) ON CONFLICT DO NOTHING RETURNING scope_key;`,
    { wrapJsonCte: true }
  )) as Array<{ scope_key: string }>;
  if (!won || won.length === 0) return 0;
  const splitSum = cfg.split.reduce((a, x) => a + (Number(x) || 0), 0);
  const norm = cfg.split.map((x) => (splitSum > 0 ? (Number(x) || 0) / splitSum : 0));
  const places = Math.min(norm.length, lb.length);
  const recipients = new Set<string>();
  const rec = async (
    account: string, place: number, total: number,
    kind: string, amount: number, packId: string | null
  ) => {
    await pg.raidReward.insert({
      id: `rrw_${nanoid(10)}`, location_id: locationId, cycle_no: cycleNo,
      account_id: account, wallet: null, place, damage: total,
      reward_kind: kind, reward_amount: amount,
      pack_id: packId, claimed_at: null, created_at: now, boss_id: boss.id,
    });
    recipients.add(account);
  };
  for (const fl of cfg.fillers) {
    if (fl.kind === "tickets") continue;
    // Ресурс и свой товар — механика карты (бета-рейд). Недельный турнир
    // локации их не раздаёт: делить слиток железа по процентам мест нечестно,
    // а обещание по местам (computeRewardByPlace) их так же пропускает.
    if (isExtraFiller(fl)) continue;
    if (!(fl.amount > 0)) continue;
    let given = 0;
    for (let i = 0; i < places; i++) {
      let amt = Math.round(fl.amount * norm[i] * 100) / 100;
      if (given + amt > fl.amount)
        amt = Math.max(0, Math.round((fl.amount - given) * 100) / 100);
      given += amt;
      const val = fl.kind === "energy" ? Math.round(amt) : amt;
      if (val <= 0) continue;
      const kind = fl.kind === "token" && fl.token ? fl.token : fl.kind;
      await rec(lb[i].account, i + 1, lb[i].total, kind, val, null);
    }
  }
  for (const pk of cfg.packs) {
    if (!pk.packId || pk.toPlace <= 0) continue;
    const top = Math.min(pk.toPlace, lb.length);
    for (let i = 0; i < top; i++)
      await rec(lb[i].account, i + 1, lb[i].total, "pack", 0, pk.packId);
  }
  for (const it of cfg.items ?? []) {
    if (!it.itemTemplateId || it.toPlace <= 0) continue;
    const top = Math.min(it.toPlace, lb.length);
    for (let i = 0; i < top; i++)
      await rec(lb[i].account, i + 1, lb[i].total, "item", 0, it.itemTemplateId);
  }
  return recipients.size;
}
