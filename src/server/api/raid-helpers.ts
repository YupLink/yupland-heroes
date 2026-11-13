import { pg, sb } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { nanoid } from "nanoid";
import type {
  PgRaidLocation,
  PgRaidNode,
  PgRaidPosition,
} from "../db/pg";
import { sqlStr } from "./raid-shared";
import { accountOf } from "./user-shared";
import { creditEnergy } from "./energy-credit";
import type { StackOrigin } from "@/server/api/beta-raid/stack-origin";

export async function firstNode(locationId: string): Promise<PgRaidNode | null> {
  const { data } = await pg.raidNode
    .raw()
    .select("*")
    .eq("location_id", locationId)
    .order("ordinal", { ascending: true })
    .limit(50);
  const nodes = (data ?? []) as PgRaidNode[];
  if (nodes.length === 0) return null;
  const root = nodes.filter((n) => n.branch_key === "root");
  const pool = root.length ? root : nodes.filter((n) => n.branch_key === "A");
  const chain = (pool.length ? pool : nodes).sort(
    (a, b) => a.ordinal - b.ordinal
  );
  return chain[0] ?? null;
}

export async function setRaidCurrent(
  wallet: string,
  locationId: string | null
): Promise<void> {
  // Указатель «где я» — один на игрока. Раньше строка была на каждый адрес, и
  // карта показывала локацию того адреса, что обновился последним.
  const account = await accountOf(wallet);
  await mcpExec(
    `INSERT INTO yuplink.raid_current (account_id, wallet, location_id, updated_at)
     VALUES (${sqlStr(account)}, ${sqlStr(wallet)},
             ${locationId ? sqlStr(locationId) : "NULL"}, now())
     ON CONFLICT (account_id) DO UPDATE
       SET location_id=EXCLUDED.location_id, wallet=EXCLUDED.wallet, updated_at=now();`
  );
}

export async function raidWhere(
  wallet: string,
  locationId: string
): Promise<{ pos: PgRaidPosition; node: PgRaidNode; loc: PgRaidLocation }> {
  const loc = await pg.raidLocation.findOne({ id: locationId });
  if (!loc) throw new Error("Локация не найдена");
  const account = await accountOf(wallet);
  let pos = await pg.raidPosition.findOne({
    account_id: account,
    location_id: locationId,
  });
  if (!pos) throw new Error("Сначала выбери локацию");
  if (pos.cycle_no !== loc.cycle_no) {
    const start = await firstNode(locationId);
    if (!start) throw new Error("В локации нет узлов");
    await pg.raidPosition.update(
      { account_id: account, location_id: locationId },
      {
        node_id: start.id,
        cycle_no: loc.cycle_no,
        cleared_final_branches: [],
        updated_at: new Date().toISOString(),
      }
    );
    pos = (await pg.raidPosition.findOne({
      account_id: account,
      location_id: locationId,
    })) as PgRaidPosition;
  }
  const node = await pg.raidNode.findOne({ id: pos.node_id });
  if (!node) throw new Error("Узел не найден");
  return { pos, node, loc };
}

export async function currentRaidPos(
  wallet: string
): Promise<{ locId: string | null; nodeId: string | null }> {
  const account = await accountOf(wallet);
  const rc = (await mcpExec(
    `SELECT rc.location_id AS ptr, l.active AS active,
            (SELECT p.node_id FROM yuplink.raid_position p
               WHERE p.account_id = ${sqlStr(account)} AND p.location_id = rc.location_id
               ORDER BY p.updated_at DESC LIMIT 1) AS node
       FROM yuplink.raid_current rc
       LEFT JOIN yuplink.raid_location l ON l.id = rc.location_id
      WHERE rc.account_id = ${sqlStr(account)}
      ORDER BY rc.updated_at DESC LIMIT 1;`,
    { wrapJson: true }
  )) as Array<{ ptr: string | null; active: boolean | null; node: string | null }>;
  if (rc && rc.length > 0) {
    const r = rc[0];
    if (r.ptr == null) return { locId: null, nodeId: null };
    if (r.active === true || String(r.active) === "t")
      return { locId: r.ptr, nodeId: r.node ?? null };
  }
  const pr = (await mcpExec(
    `SELECT p.location_id, p.node_id FROM yuplink.raid_position p
       JOIN yuplink.raid_location l ON l.id = p.location_id
      WHERE p.account_id = ${sqlStr(account)} AND l.active = true AND p.cycle_no = l.cycle_no
      ORDER BY p.updated_at DESC LIMIT 1;`,
    { wrapJson: true }
  )) as Array<{ location_id: string; node_id: string }>;
  return { locId: pr?.[0]?.location_id ?? null, nodeId: pr?.[0]?.node_id ?? null };
}

export async function advanceToFrontier(
  wallet: string,
  loc: PgRaidLocation,
  node: PgRaidNode
): Promise<PgRaidNode> {
  if (node.node_type === "boss" || node.node_type === "final") {
    const b0 = node.boss_id
      ? await pg.chipBoss.findOne({ id: node.boss_id })
      : null;
    if (b0 && Number(b0.current_hp) > 0) return node;
  } else {
    return node;
  }
  const { data: nRows } = await pg.raidNode
    .raw()
    .select("*")
    .eq("location_id", loc.id);
  const nodes = (nRows ?? []) as PgRaidNode[];
  const bossIds = nodes.map((n) => n.boss_id).filter(Boolean) as string[];
  const bosses =
    bossIds.length > 0
      ? (((await pg.chipBoss.raw().select("id,current_hp").in("id", bossIds))
          .data ?? []) as Array<{ id: string; current_hp: number }>)
      : [];
  const hpById = new Map(bosses.map((b) => [b.id, Number(b.current_hp)]));
  let cur = node;
  for (let guard = 0; guard < 50; guard++) {
    if (cur.node_type !== "boss" && cur.node_type !== "final") break;
    const hp = cur.boss_id ? (hpById.get(cur.boss_id) ?? 0) : 0;
    if (hp > 0) break;
    const next = nodes
      .filter((n) => n.branch_key === cur.branch_key && n.ordinal > cur.ordinal)
      .sort((a, c) => a.ordinal - c.ordinal)[0];
    if (!next) break;
    cur = next;
  }
  if (cur.id !== node.id) {
    await pg.raidPosition.update(
      { wallet, location_id: loc.id },
      { node_id: cur.id, updated_at: new Date().toISOString() }
    );
  }
  return cur;
}

export async function energyOf(wallet: string): Promise<number> {
  try {
    const { data } = await sb.rpc("compute_energy", { p_wallet: wallet });
    const row = (data as Array<{ energy_now: number }> | null)?.[0];
    return row ? Number(row.energy_now) : 0;
  } catch {
    return 0;
  }
}

export async function grantRaidReward(
  wallet: string,
  kind: string,
  amount: number,
  packId: string | null,
  ref: string,
  /** Происхождение (ПРАВИЛА §8.18): свой товар ляжет в рюкзак с этой меткой (для сундука). */
  opts?: { origin?: StackOrigin | null }
): Promise<void> {
  const now = new Date().toISOString();
  if (kind === "pack" && packId) {
    const { grantPackToUser } = await import("./packs");
    await grantPackToUser({
      wallet,
      packId,
      source: "drop",
      sourceRef: ref,
    });
  } else if (kind === "likes") {
    const { likeAccountId, addLikes } = await import("../likesAccount");
    await addLikes(await likeAccountId(wallet), amount, "lifetime_granted", `raid:${ref}`);
  } else if (kind === "energy") {
    // Награда (сундук, приз рейда) — подаренная энергия: выше лимита тает
    // (acc-45). Маркет сюда больше не ходит — у покупки свой вид. Ref теперь
    // передаётся: без него сундуки и маркет были в леджере неразличимы.
    // Отказ базы бросается — вызывающие держат на этом откат сундука.
    await creditEnergy(wallet, amount, "energy_reward", ref);
  } else if (kind === "tickets") {
    // Билетов нет (§8.61): награда в билетах (старые настройки) — золотом, 100 за
    // билет, тем же путём, что ресурс-награда (вид mob/reward, дедуп по ref).
    const { goldForEarnedTickets } = await import("@/lib/ticketGold");
    const { grantExtraReward } = await import("./raid-reward-extra");
    await grantExtraReward({
      kind: "resource",
      wallet,
      amount: goldForEarnedTickets(amount),
      ref: "gold",
      opRef: ref,
      origin: opts?.origin,
    });
  } else if (kind === "item" && packId) {
    const tpl = await pg.mysticItemTemplates
      .raw()
      .select("id,kind")
      .eq("id", packId)
      .maybeSingle();
    const t = tpl.data as { id: string; kind: string } | null;
    if (t)
      await pg.userGameItems.insert({
        id: `ugi_${nanoid(12)}`,
        account_id: await accountOf(wallet),
        wallet,
        template_id: t.id,
        kind: t.kind,
        source: "raid",
        obtained_at: now,
      });
  } else if (kind === "casino_share" || (kind === "treasure" && packId)) {
    await (await import("./raid-reward-special")).claimSpecial(kind, packId ?? "", wallet);
  } else if (kind === "resource" || kind === "custom" || kind === "boss") {
    // СТРОГО до общего else: он считает любой незнакомый вид символом монеты и
    // заводит заявку в redemptions — ресурс и свой товар висели бы там вечно,
    // ожидая несуществующий FT-контракт.
    const { grantExtraReward } = await import("./raid-reward-extra");
    await grantExtraReward({ kind, wallet, amount, ref: packId, opRef: ref, origin: opts?.origin });
  } else {
    const tr = await pg.rewardTokens.findOne({ symbol: kind });
    await pg.redemptions.insert({
      id: `r_${nanoid(10)}`,
      contract_id: "raid",
      token_id: `raid_${ref}_${nanoid(6)}`,
      campaign_id: null,
      wallet,
      amount,
      tx_hash: null,
      status: "pending",
      reward_token: kind,
      ft_contract: tr?.ft_contract ?? null,
      decimals: tr?.decimals ?? null,
      ticket_cost: 0,
      redeemed_at: now,
    });
  }
}
