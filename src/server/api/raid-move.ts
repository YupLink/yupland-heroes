import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg, sb } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { requireWallet } from "../auth";
import { nanoid } from "nanoid";
import type { PgRaidNode } from "../db/pg";
import { sqlStr, parseRewardConfig } from "./raid-shared";
import { fillerRef } from "./reward-filler";
import { raidWhere, setRaidCurrent, grantRaidReward } from "./raid-helpers";
import { accountOf } from "./user-shared";
import { noteEnergySpendByWallet } from "./beta-raid/econ/energy-note";

export const raidStepForward = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ locationId: z.string().min(1), fromNodeId: z.string().optional() })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const { node, loc } = await raidWhere(wallet, data.locationId);
    if (data.fromNodeId && node.id !== data.fromNodeId)
      throw new Error("Позиция изменилась — обнови");
    if (node.node_type === "boss" || node.node_type === "final") {
      const b = node.boss_id ? await pg.chipBoss.findOne({ id: node.boss_id }) : null;
      if (!b || Number(b.current_hp) > 0)
        throw new Error("Сначала победи босса узла");
    } else if (node.node_type.startsWith("chest_")) {
      const opened = await pg.raidChestOpen.findOne({
        account_id: await accountOf(wallet),
        node_id: node.id,
        cycle_no: loc.cycle_no,
      });
      if (!opened) throw new Error("Сначала открой сундук");
    }
    if (node.is_final) {
      await pg.raidPosition.update(
        { wallet, location_id: data.locationId },
        { updated_at: new Date().toISOString() }
      );
      return { ok: true, finished: true };
    }
    const { data: nRows } = await pg.raidNode
      .raw()
      .select("*")
      .eq("location_id", data.locationId)
      .eq("branch_key", node.branch_key)
      .order("ordinal", { ascending: true });
    const next = ((nRows ?? []) as PgRaidNode[]).find(
      (n) => n.ordinal > node.ordinal
    );
    if (!next) throw new Error("Дальше некуда");
    const { error: enErr } = await sb.rpc("touch_energy_atomic", {
      p_wallet: wallet,
      p_spend: 1,
    });
    if (enErr) {
      if (String(enErr.message).includes("not_enough_energy"))
        throw new Error("Не хватает энергии на манёвр");
      throw new Error(enErr.message);
    }
    void noteEnergySpendByWallet(wallet, 1, "other");
    await pg.raidPosition.update(
      { wallet, location_id: data.locationId },
      { node_id: next.id, updated_at: new Date().toISOString() }
    );
    await setRaidCurrent(wallet, data.locationId);
    return { ok: true, nodeId: next.id };
  });

export const raidStepBack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ locationId: z.string().min(1), fromNodeId: z.string().min(1) })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const { node } = await raidWhere(wallet, data.locationId);
    if (node.id !== data.fromNodeId)
      throw new Error("Позиция изменилась — обнови");
    const { data: cRows } = await pg.raidNode
      .raw()
      .select("*")
      .eq("location_id", data.locationId)
      .eq("branch_key", node.branch_key)
      .order("ordinal", { ascending: true });
    const chain = (cRows ?? []) as PgRaidNode[];
    const prev = [...chain].reverse().find((n) => n.ordinal < node.ordinal);
    const { error } = await sb.rpc("touch_energy_atomic", {
      p_wallet: wallet,
      p_spend: 1,
    });
    if (error) {
      if (String(error.message).includes("not_enough_energy"))
        throw new Error("Не хватает энергии на манёвр");
      throw new Error(error.message);
    }
    void noteEnergySpendByWallet(wallet, 1, "other");
    const now = new Date().toISOString();
    if (prev) {
      await pg.raidPosition.update(
        { wallet, location_id: data.locationId },
        { node_id: prev.id, updated_at: now }
      );
      await setRaidCurrent(wallet, data.locationId);
      return { ok: true, nodeId: prev.id };
    }
    const parent = (await mcpExec(
      `SELECT fl.fork_node_id fnode, rn.location_id ploc
         FROM yuplink.raid_fork_link fl
         JOIN yuplink.raid_node rn ON rn.id = fl.fork_node_id
        WHERE fl.target_location_id=${sqlStr(data.locationId)}
        ORDER BY fl.ordinal, fl.id LIMIT 1;`,
      { wrapJson: true }
    )) as Array<{ fnode: string; ploc: string }>;
    if (parent?.length) {
      const { fnode, ploc } = parent[0];
      const ploc0 = await pg.raidLocation.findOne({ id: ploc });
      const moveAccount = await accountOf(wallet);
      const existing = await pg.raidPosition.findOne({ account_id: moveAccount, location_id: ploc });
      if (existing) {
        await pg.raidPosition.update(
          { account_id: moveAccount, location_id: ploc },
          { node_id: fnode, cycle_no: ploc0?.cycle_no ?? existing.cycle_no, updated_at: now }
        );
      } else {
        await pg.raidPosition.insert({
          account_id: moveAccount,
          wallet,
          location_id: ploc,
          node_id: fnode,
          cycle_no: ploc0?.cycle_no ?? 1,
          cleared_final_branches: [],
          updated_at: now,
        });
      }
      await pg.raidPosition.delete({ account_id: moveAccount, location_id: data.locationId });
      await setRaidCurrent(wallet, ploc);
      return { ok: true, goToLocation: ploc, nodeId: fnode, atFork: true };
    }
    await pg.raidPosition.delete({ wallet, location_id: data.locationId });
    await setRaidCurrent(wallet, null);
    return { ok: true, toFork: true };
  });

export const raidSwitchBranch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ locationId: z.string().min(1), branch: z.enum(["A", "B"]) })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const { node } = await raidWhere(wallet, data.locationId);
    if (node.node_type !== "fork")
      throw new Error("Сменить ветку можно только на развилке");
    const { data: nRows } = await pg.raidNode
      .raw()
      .select("*")
      .eq("location_id", data.locationId)
      .eq("branch_key", data.branch)
      .order("ordinal", { ascending: true })
      .limit(1);
    const first = ((nRows ?? []) as PgRaidNode[])[0];
    if (!first) throw new Error("Ветка пуста");
    await pg.raidPosition.update(
      { wallet, location_id: data.locationId },
      { node_id: first.id, updated_at: new Date().toISOString() }
    );
    return { ok: true, nodeId: first.id };
  });

export const openRaidChest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ locationId: z.string().min(1), nodeId: z.string().min(1) })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const { node, loc } = await raidWhere(wallet, data.locationId);
    if (node.id !== data.nodeId || !node.node_type.startsWith("chest_"))
      throw new Error("Здесь нет сундука");
    const cfg = parseRewardConfig(node.chest_config);
    const fl = cfg.fillers.find((f) => f.amount > 0) ?? null;
    const pk = cfg.packs.find((p) => p.packId) ?? null;
    const kind = pk ? "pack" : fl ? (fl.kind === "token" && fl.token ? fl.token : fl.kind) : "likes";
    const amount = pk ? 0 : fl ? fl.amount : 0;
    // У ресурса и своего товара «ссылка вида» живёт в той же колонке, что и
    // пак: без неё выдача не знает, что зачислять, и сундук падал бы с
    // отказом вместо награды.
    const packId = pk?.packId ?? (fl ? fillerRef(fl) : null);
    const chestAccount = await accountOf(wallet);
    const ins = (await mcpExec(
      // Ключ открытия — игрок, а не адрес: иначе один и тот же сундук
      // открывался дважды с двух кошельков одного человека.
      `INSERT INTO yuplink.raid_chest_open
         (id, account_id, wallet, node_id, cycle_no, reward_kind, reward_amount, pack_id, created_at)
       VALUES (${sqlStr(`rco_${nanoid(10)}`)}, ${sqlStr(chestAccount)}, ${sqlStr(wallet)}, ${sqlStr(
         node.id
       )}, ${loc.cycle_no}, ${sqlStr(kind)}, ${amount}, ${
         packId ? sqlStr(packId) : "NULL"
       }, now())
       ON CONFLICT (account_id, node_id, cycle_no) DO NOTHING RETURNING id;`,
      { wrapJsonCte: true }
    )) as Array<{ id: string }>;
    if (!ins || ins.length === 0)
      throw new Error("Сундук уже открыт");
    try {
      // Ключ начисления включает игрока: без него билеты за сундук получал
      // только первый во всей игре, кто его открыл (леджер идемпотентен по ref).
      await grantRaidReward(
        wallet, kind, amount, packId, `chest:${node.id}:c${loc.cycle_no}:${chestAccount}`,
      );
    } catch (e) {
      await mcpExec(
        `DELETE FROM yuplink.raid_chest_open WHERE account_id=${sqlStr(
          chestAccount
        )} AND node_id=${sqlStr(node.id)} AND cycle_no=${loc.cycle_no};`
      );
      throw e;
    }
    return { ok: true, reward: { kind, amount, packId } };
  });
