import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg, sb } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { requireWallet } from "../auth";
import { getSisterWallets } from "./user";
import { hpOf, powerOf } from "@/lib/chipStats";
import { isPremiumCollection, tirageBonus } from "@/lib/tirageBonus";
import { secureRandom } from "@/lib/secureRandom";
import { notRestingOrFilter } from "../chipRest";
import { getHallwayConfig } from "./hallwayConfig";
import { accountOf } from "./user-shared";
import { noteEnergySpend } from "./beta-raid/econ/energy-note";
import { raidWhere, firstNode, setRaidCurrent, advanceToFrontier } from "./raid-helpers";
import { distributeRaidBossKillRewards } from "./raid-distribute";
import type {
  PgRaidLocation,
  PgRaidNode,
  PgRaidPosition,
  PgChipBoss,
  PgChipBossSession,
} from "../db/pg";

// ── Константы (из raid.ts, 필요한 для самодостаточности) ──
const R_ENERGY_COST = 10;
const R_DMG_BASE = 80;
const R_DMG_GROWTH = 1.6;

const sqlStr = (v: string) => `'${String(v).replace(/'/g, "''")}'`;

// ── Reward-config ──
type FillerKind = "likes" | "tickets" | "energy" | "token";
type Filler = { kind: FillerKind; amount: number; token?: string | null };
type PackReward = { packId: string; toPlace: number };
type ItemReward = { itemTemplateId: string; toPlace: number };
type RewardConfig = {
  fillers: Filler[];
  split: number[];
  packs: PackReward[];
  items: ItemReward[];
};

const DEFAULT_SPLIT = [25, 18, 13, 10, 8, 6, 5, 5, 5, 5];

function parseRewardConfig(v: unknown): RewardConfig {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const split =
      Array.isArray(o.split) && o.split.length
        ? (o.split as unknown[]).map((x) => Number(x) || 0)
        : [...DEFAULT_SPLIT];
    if (Array.isArray(o.fillers)) {
      return {
        fillers: (o.fillers as Record<string, unknown>[]).map((fl) => ({
          kind: (fl.kind as FillerKind) || "likes",
          amount: Number(fl.amount) || 0,
          token: (fl.token as string) ?? null,
        })),
        split,
        packs: Array.isArray(o.packs)
          ? (o.packs as Record<string, unknown>[]).map((p) => ({
              packId: String(p.packId),
              toPlace: Number(p.toPlace) || 0,
            }))
          : [],
        items: Array.isArray(o.items)
          ? (o.items as Record<string, unknown>[]).map((p) => ({
              itemTemplateId: String(p.itemTemplateId),
              toPlace: Number(p.toPlace) || 0,
            }))
          : [],
      };
    }
  }
  return { fillers: [], split: [...DEFAULT_SPLIT], packs: [], items: [] };
}

// ══════════════════ ИГРОВАЯ ЧАСТЬ (admin-gated) ══════════════════
// Фича открыта всем админам (requireAdmin, ADMIN_WALLETS — вкл. Ярослава/
// darai_collection.near), он же возвращает кош. Боевой контур — копия боссовой
// логики (boss.ts не трогаем); использует те же stat-хелперы (hpOf/powerOf).

const FIELD_SLOTS = 5;
// Лимита раундов нет: бой идёт до победы одной из сторон. Это предохранитель
// от вечного цикла, а не правило игры.
const STALL_GUARD_ROUNDS = 100_000;
const DMG_GROWTH_CAP_ROUND = 5;
const R_DMG_VARIANCE_ROUND = 0.15;
const rollIn = ([lo, hi]: [number, number]) => lo + Math.floor(secureRandom() * (hi - lo + 1));
const roundDamage = (round: number) =>
  Math.round(R_DMG_BASE * Math.pow(R_DMG_GROWTH, Math.min(round, DMG_GROWTH_CAP_ROUND) - 1));

type RSFieldChip = {
  templateId: string;
  level: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  isTraining?: boolean;
  serialNo?: number | null;
};
type RSReserveChip = Omit<RSFieldChip, "alive">;
type RaidSessionState = {
  bossHp: number;
  bossMaxHp: number;
  field: RSFieldChip[];
  reserve: RSReserveChip[];
  round: number;
  totalDamage: number;
  locationId: string;
  nodeId: string;
};

const raidLineup = (d: unknown) =>
  z
    .object({
      locationId: z.string().min(1),
      lineup: z
        .array(
          z.object({
            templateId: z.string().min(1),
            level: z.number(),
            training: z.boolean().optional(),
            chipId: z.string().optional(),
            serialNo: z.number().nullable().optional(),
          }),
        )
        .min(1)
        .max(10),
    })
    .parse(d);

/** Коммит рейд-боя: АТОМАРНЫЙ декремент общего HP + запись урона (raid). НЕ
 *  раздаёт турнирные награды (только недельный closeRaidCycle). */
async function commitRaidRun(opts: {
  wallet: string;
  boss: PgChipBoss;
  locationId: string;
  cycleNo: number;
  totalDamage: number;
  rounds: number;
}): Promise<{ dealt: number; killed: boolean; bossHpAfter: number }> {
  const { wallet, boss } = opts;
  // Атомарно: current_hp -= min(dmg, current_hp), вернуть новое HP. Толпа бьёт
  // одного босса параллельно — read-then-write словил бы гонку.
  // FOR UPDATE в подзапросе БЛОКИРУЕТ строку → конкурентные добивания толпы
  // сериализуются, а `was` = РЕАЛЬНОЕ HP до этого удара (не устаревший литерал).
  // Иначе dealt (= was−nowHp) завышался бы на чужой урон и накручивал лидерборд.
  const dmg = Math.max(0, Math.round(opts.totalDamage));
  const rows = (await mcpExec(
    `UPDATE yuplink.chip_boss b
       SET current_hp = GREATEST(0, b.current_hp - ${dmg})
     FROM (SELECT current_hp AS old FROM yuplink.chip_boss
            WHERE id=${sqlStr(boss.id)} FOR UPDATE) o
     WHERE b.id=${sqlStr(boss.id)}
     RETURNING b.current_hp AS hp, o.old AS was;`,
    { wrapJsonCte: true },
  )) as Array<{ hp: number; was: number }>;
  const was = Number(rows?.[0]?.was ?? boss.current_hp);
  const nowHp = Number(rows?.[0]?.hp ?? 0);
  const dealt = Math.max(0, was - nowHp); // фактически нанесённый (с клэмпом по HP)
  const killed = nowHp <= 0;
  const now = new Date().toISOString();

  await mcpExec(
    `INSERT INTO yuplink.chip_boss_run
       (id, boss_id, account_id, wallet, damage, rounds, killed, like_awarded, week_no,
        raid_location_id, raid_cycle_no, created_at)
     VALUES (${sqlStr(`rrun_${nanoid(10)}`)}, ${sqlStr(boss.id)},
        ${sqlStr(await accountOf(wallet))}, ${sqlStr(wallet)},
        ${dealt}, ${opts.rounds}, ${killed}, 0, 0,
        ${sqlStr(opts.locationId)}, ${opts.cycleNo}, now());`,
  );
  // Килл → раздать награду за этого босса (по местам, идемпотентно). Урон этого
  // игрока уже записан выше, поэтому попадёт в расчёт мест.
  if (killed) {
    try {
      await distributeRaidBossKillRewards(boss, opts.locationId, opts.cycleNo);
    } catch (e) {
      console.warn("[raid] boss-kill rewards failed:", e);
    }
  }
  // Бой = реальное действие «я тут»: якорим указатель на локацию боя. Закрывает
  // дыру, когда игрок бил босса в лесу, а указатель оставался на прежней локации.
  await setRaidCurrent(wallet, opts.locationId);
  return { dealt, killed, bossHpAfter: nowHp };
}

/** Старт боя с боссом ТЕКУЩЕГО узла позиции. */
export const startRaidFight = createServerFn({ method: "POST" })
  .inputValidator(raidLineup)
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    // активная сессия — вернуть. ВАЖНО: рейд делит таблицу chip_boss_session с
    // недельным боссом → используем ОТДЕЛЬНЫЙ статус "raid_active", чтобы боевая
    // сессия босса не «утекла» в рейд (и наоборот: boss.ts фильтрует "active" и
    // рейд-сессий не видит). Иначе commitRaidRun ударил бы по живому боссу.
    const existing = await pg.chipBossSession.findOne({
      wallet,
      status: "raid_active",
    });
    if (existing) {
      const eb = await pg.chipBoss.findOne({ id: existing.boss_id });
      const est = existing.state as RaidSessionState;
      if (est?.locationId) await setRaidCurrent(wallet, est.locationId); // «я тут» = локация активного боя
      return {
        sessionId: existing.id,
        state: est,
        bossName: eb?.name ?? "Босс",
        bossImageUrl: eb?.image_url ?? null,
        resumed: true,
      };
    }
    const { node, loc } = await raidWhere(wallet, data.locationId);
    if (node.node_type !== "boss" && node.node_type !== "final")
      throw new Error("Текущий узел — не босс");
    if (!node.boss_id) throw new Error("У узла нет босса");
    const boss = await pg.chipBoss.findOne({ id: node.boss_id });
    if (!boss) throw new Error("Босс не найден");
    if (Number(boss.current_hp) <= 0) throw new Error("Босс уже повержен");

    const account = await accountOf(wallet);
    const sisters = await getSisterWallets(wallet);
    const realEntries = data.lineup.filter((c) => !c.training);
    const trainEntries = data.lineup.filter((c) => c.training);
    const { data: invRows } = await pg.userChipInventory
      .raw()
      .select("template_id,level")
      .eq("account_id", account)
      .eq("status", "owned")
      .or(notRestingOrFilter());
    const owned = new Map<string, number>();
    for (const r of (invRows ?? []) as Array<{
      template_id: string;
      level: number;
    }>) {
      const k = `${r.template_id}|${r.level}`;
      owned.set(k, (owned.get(k) ?? 0) + 1);
    }
    for (const c of realEntries) {
      const k = `${c.templateId}|${c.level}`;
      const n = owned.get(k) ?? 0;
      if (n <= 0) throw new Error("В отряде есть фишки, которых у тебя нет");
      owned.set(k, n - 1);
    }
    const trialStar = new Map<string, number>();
    if (trainEntries.length > 0) {
      const { data: tcRows } = await pg.hallwayTrainingChips
        .raw()
        .select("id,star")
        .eq("account_id", account)
        .is("consumed_at", null);
      for (const r of (tcRows ?? []) as Array<{ id: string; star: number }>)
        trialStar.set(r.id, Number(r.star));
      const used = new Set<string>();
      for (const c of trainEntries) {
        if (!c.chipId || !trialStar.has(c.chipId) || used.has(c.chipId))
          throw new Error("В отряде есть триал-фишка, которой у тебя нет");
        used.add(c.chipId);
      }
    }

    const { error: enErr } = await sb.rpc("touch_energy_atomic", {
      p_wallet: wallet,
      p_spend: R_ENERGY_COST,
    });
    if (enErr) {
      if (String(enErr.message).includes("not_enough_energy"))
        throw new Error("Не хватает энергии");
      throw new Error(enErr.message);
    }
    void noteEnergySpend(account, R_ENERGY_COST, "fight");

    const trialScale = (await getHallwayConfig()).boss.trialStatScale;
    const build = (c: (typeof data.lineup)[number]): RSReserveChip => {
      if (c.training && c.chipId) {
        const star = trialStar.get(c.chipId) ?? 1;
        const hp = Math.max(1, Math.round(hpOf(star) * trialScale));
        return {
          templateId: `training:${c.chipId}`,
          level: star,
          hp,
          maxHp: hp,
          isTraining: true,
        };
      }
      const hp = hpOf(c.level);
      return {
        templateId: c.templateId,
        level: c.level,
        hp,
        maxHp: hp,
        isTraining: false,
        serialNo: c.serialNo ?? null,
      };
    };
    const built = data.lineup.map(build);
    const field: RSFieldChip[] = built.slice(0, FIELD_SLOTS).map((c) => ({ ...c, alive: true }));
    const reserve = built.slice(FIELD_SLOTS);
    const state: RaidSessionState = {
      bossHp: Number(boss.current_hp),
      bossMaxHp: Number(boss.max_hp),
      field,
      reserve,
      round: 1,
      totalDamage: 0,
      locationId: data.locationId,
      nodeId: node.id,
    };
    const sessionId = `rsess_${nanoid(12)}`;
    const now = new Date().toISOString();
    await pg.chipBossSession.insert({
      id: sessionId,
      wallet,
      boss_id: boss.id,
      week_no: loc.cycle_no,
      state: state as unknown,
      status: "raid_active", // см. коммент в startRaidFight — не пересекается с боссом
      created_at: now,
      updated_at: now,
    });
    await setRaidCurrent(wallet, data.locationId); // начал бой = «я тут»
    return {
      sessionId,
      state,
      bossName: boss.name,
      bossImageUrl: boss.image_url,
      resumed: false,
    };
  });

async function loadRaidSession(sessionId: string, wallet: string): Promise<PgChipBossSession> {
  const s = await pg.chipBossSession.findOne({ id: sessionId });
  if (!s || s.wallet !== wallet) throw new Error("Сессия не найдена");
  if (s.status !== "raid_active") throw new Error("Бой уже завершён");
  return s;
}

/**
 * Закрыть бой одной записью ДО коммита урона (аудит 11.11.2026): N параллельных
 * «Завершить» / последних раундов коммитили урон N раз и поднимали место в наградах.
 * true — закрыл этот вызов; false — бой уже закрыт.
 */
async function closeRaidSession(id: string, wallet: string): Promise<boolean> {
  const rows = (await mcpExec(
    `UPDATE yuplink.chip_boss_session SET status = 'done', updated_at = now()
      WHERE id = ${sqlStr(id)} AND wallet = ${sqlStr(wallet)} AND status = 'raid_active'
      RETURNING id`,
    { wrapJsonCte: true },
  )) as Array<{ id: string }> | null;
  return !!rows?.length;
}

/** Один раунд рейд-боя. */
export const raidFightRound = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: z.string().min(1),
        bringInIndex: z.number().int().min(0).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const session = await loadRaidSession(data.sessionId, wallet);
    const state = session.state as RaidSessionState;
    const round = state.round;
    const trialScale = (await getHallwayConfig()).boss.trialStatScale;

    let broughtInLevel: number | null = null;
    if (
      data.bringInIndex !== undefined &&
      data.bringInIndex >= 0 &&
      data.bringInIndex < state.reserve.length &&
      state.field.length < FIELD_SLOTS
    ) {
      const [rc] = state.reserve.splice(data.bringInIndex, 1);
      state.field.push({ ...rc, alive: true });
      broughtInLevel = rc.level;
    }

    let playerDmg = 0;
    const playerHits: Array<{ index: number; level: number; dmg: number }> = [];
    for (let i = 0; i < state.field.length; i++) {
      const c = state.field[i];
      if (!c.alive) continue;
      const [lo, hi] = powerOf(c.level);
      const mult = c.isTraining ? trialScale : 1;
      const dmg =
        mult !== 1 ? Math.max(1, Math.round(rollIn([lo * mult, hi * mult]))) : rollIn([lo, hi]);
      playerDmg += dmg;
      playerHits.push({ index: i, level: c.level, dmg });
    }
    state.bossHp -= playerDmg;
    state.totalDamage += playerDmg;

    let bossDmg = 0;
    let targetLevel: number | null = null;
    let targetDied = false;
    let killed = false;
    let bossTarget: {
      index: number;
      level: number;
      dmg: number;
      died: boolean;
    } | null = null;
    if (state.bossHp <= 0) {
      killed = true;
    } else if (state.field.length > 0) {
      const dmg = Math.max(
        1,
        Math.round(roundDamage(round) * (1 + (secureRandom() * 2 - 1) * R_DMG_VARIANCE_ROUND)),
      );
      const target = state.field[0];
      bossDmg = dmg;
      targetLevel = target.level;
      target.hp -= dmg;
      targetDied = target.hp <= 0;
      bossTarget = { index: 0, level: target.level, dmg, died: targetDied };
      if (targetDied) state.field.shift();
    }

    state.round = round + 1;
    // Строй пуст, а игрок не ввёл резерв этим ходом — бой закончен. Раньше
    // такую партию обрывал лимит в 30 раундов; без него она не кончалась бы
    // вовсе, и игрок оставался в «Идёт бой…».
    const idleEmptyField = state.field.length === 0 && data.bringInIndex === undefined;
    const wiped = state.field.length === 0 && (state.reserve.length === 0 || idleEmptyField);
    const overLimit = state.round > STALL_GUARD_ROUNDS;
    const ended = killed || wiped || overLimit;
    const roundInfo = {
      playerDmg,
      bossDmg,
      targetLevel,
      targetDied,
      broughtInLevel,
      playerHits,
      bossTarget,
    };
    const now = new Date().toISOString();

    if (ended) {
      if (!(await closeRaidSession(session.id, wallet))) throw new Error("Бой уже завершён");
      const boss = await pg.chipBoss.findOne({ id: session.boss_id });
      let result = { dealt: 0, killed, bossHpAfter: 0 };
      if (boss) {
        result = await commitRaidRun({
          wallet,
          boss,
          locationId: state.locationId,
          cycleNo: session.week_no,
          totalDamage: state.totalDamage,
          rounds: round,
        });
      }
      state.bossHp = result.bossHpAfter;
      await pg.chipBossSession.update(
        { id: session.id },
        { state: state as unknown, status: "done", updated_at: now },
      );
      return { state, round: roundInfo, ended: true, result };
    }
    await pg.chipBossSession.update(
      { id: session.id },
      { state: state as unknown, updated_at: now },
    );
    return { state, round: roundInfo, ended: false, result: null };
  });

/** Завершить/сдаться — коммит текущего урона. */
export const endRaidFight = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const session = await loadRaidSession(data.sessionId, wallet);
    if (!(await closeRaidSession(session.id, wallet))) throw new Error("Бой уже завершён");
    const state = session.state as RaidSessionState;
    const boss = await pg.chipBoss.findOne({ id: session.boss_id });
    let result = { dealt: 0, killed: false, bossHpAfter: 0 };
    if (boss) {
      result = await commitRaidRun({
        wallet,
        boss,
        locationId: state.locationId,
        cycleNo: session.week_no,
        totalDamage: state.totalDamage,
        rounds: Math.max(0, state.round - 1),
      });
    }
    state.bossHp = result.bossHpAfter;
    await pg.chipBossSession.update(
      { id: session.id },
      { state: state as unknown, status: "done", updated_at: new Date().toISOString() },
    );
    return { state, ended: true, result };
  });

// «Единство: Тираж» — множители по тиражу/премиуму коллекции (копия боссовой
// логики; boss.ts НЕ трогаем). Ключ = индекс фишки в отряде. Гейт — общий с боссом
// (hallwayConfig.boss.tirageBonusEnabled), чтобы рейд бил 1-в-1 как босс.
async function computeRaidTirageMults(
  lineup: Array<{ templateId: string; level: number; training?: boolean }>,
  enabled: boolean,
): Promise<Map<number, { hpMult: number; atkMult: number }>> {
  const out = new Map<number, { hpMult: number; atkMult: number }>();
  if (!enabled) return out;
  const templateIds = [...new Set(lineup.filter((c) => !c.training).map((c) => c.templateId))];
  if (templateIds.length === 0) return out;
  const { data: tpls } = await pg.chipTemplates
    .raw()
    .select("id,collection_id")
    .in("id", templateIds);
  const tplToCol = new Map(
    ((tpls ?? []) as Array<{ id: string; collection_id: string }>).map((t) => [
      t.id,
      t.collection_id,
    ]),
  );
  const colIds = [...new Set([...tplToCol.values()].filter(Boolean))];
  if (colIds.length === 0) return out;
  const { data: cols } = await pg.chipCollections
    .raw()
    .select("id,name,initial_supply,is_premium")
    .in("id", colIds);
  const colInfo = new Map(
    (
      (cols ?? []) as Array<{
        id: string;
        name: string;
        initial_supply: number;
        is_premium: boolean;
      }>
    ).map((c) => [
      c.id,
      { supply: Number(c.initial_supply), premium: isPremiumCollection(c.name, c.is_premium) },
    ]),
  );
  lineup.forEach((c, i) => {
    if (c.training) return;
    const colId = tplToCol.get(c.templateId);
    const info = colId ? colInfo.get(colId) : undefined;
    if (!info) return;
    const b = tirageBonus(info.supply, info.premium);
    if (b.hpMult !== 1 || b.atkMult !== 1) out.set(i, { hpMult: b.hpMult, atkMult: b.atkMult });
  });
  return out;
}

/** АВТОБОЙ рейда за ОДИН вызов (как fightBoss у босса): вся симуляция на сервере
 *  → быстро (без 40 сетевых раундов) и с ТЕМИ ЖЕ бонусами тиража/премиума. Коммит
 *  атомарный через commitRaidRun (общий HP + награда за килл). */
export const raidAutoFight = createServerFn({ method: "POST" })
  .inputValidator(raidLineup)
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const w0 = await raidWhere(wallet, data.locationId);
    const loc = w0.loc;
    // Бьём ФРОНТИР (первый живой босс), а не труп под позицией.
    const node = await advanceToFrontier(wallet, loc, w0.node);
    if (node.node_type !== "boss" && node.node_type !== "final")
      throw new Error("Текущий узел — не босс");
    if (!node.boss_id) throw new Error("У узла нет босса");
    const boss = await pg.chipBoss.findOne({ id: node.boss_id });
    if (!boss) throw new Error("Босс не найден");
    if (Number(boss.current_hp) <= 0) throw new Error("Босс уже повержен");

    // Валидация владения отрядом (как в startRaidFight).
    const account = await accountOf(wallet);
    const sisters = await getSisterWallets(wallet);
    const realEntries = data.lineup.filter((c) => !c.training);
    const trainEntries = data.lineup.filter((c) => c.training);
    const { data: invRows } = await pg.userChipInventory
      .raw()
      .select("template_id,level")
      .eq("account_id", account)
      .eq("status", "owned")
      .or(notRestingOrFilter());
    const owned = new Map<string, number>();
    for (const r of (invRows ?? []) as Array<{ template_id: string; level: number }>) {
      const k = `${r.template_id}|${r.level}`;
      owned.set(k, (owned.get(k) ?? 0) + 1);
    }
    for (const c of realEntries) {
      const k = `${c.templateId}|${c.level}`;
      const n = owned.get(k) ?? 0;
      if (n <= 0) throw new Error("В отряде есть фишки, которых у тебя нет");
      owned.set(k, n - 1);
    }
    const trialStar = new Map<string, number>();
    if (trainEntries.length > 0) {
      const { data: tcRows } = await pg.hallwayTrainingChips
        .raw()
        .select("id,star")
        .eq("account_id", account)
        .is("consumed_at", null);
      for (const r of (tcRows ?? []) as Array<{ id: string; star: number }>)
        trialStar.set(r.id, Number(r.star));
      const used = new Set<string>();
      for (const c of trainEntries) {
        if (!c.chipId || !trialStar.has(c.chipId) || used.has(c.chipId))
          throw new Error("В отряде есть триал-фишка, которой у тебя нет");
        used.add(c.chipId);
      }
    }

    const { error: enErr } = await sb.rpc("touch_energy_atomic", {
      p_wallet: wallet,
      p_spend: R_ENERGY_COST,
    });
    if (enErr) {
      if (String(enErr.message).includes("not_enough_energy"))
        throw new Error("Не хватает энергии");
      throw new Error(enErr.message);
    }
    void noteEnergySpend(account, R_ENERGY_COST, "fight");

    const hcfg = await getHallwayConfig();
    const trialScale = hcfg.boss.trialStatScale;
    const tmults = await computeRaidTirageMults(data.lineup, hcfg.boss.tirageBonusEnabled);

    type Chip = {
      level: number;
      hp: number;
      alive: boolean;
      atkMult: number;
    };
    const all: Chip[] = data.lineup.map((c, i) => {
      if (c.training && c.chipId) {
        const star = trialStar.get(c.chipId) ?? 1;
        const hp = Math.max(1, Math.round(hpOf(star) * trialScale));
        return { level: star, hp, alive: true, atkMult: trialScale };
      }
      const m = tmults.get(i);
      const hp = Math.max(1, Math.round(hpOf(c.level) * (m?.hpMult ?? 1)));
      return { level: c.level, hp, alive: true, atkMult: m?.atkMult ?? 1 };
    });
    const field = all.slice(0, FIELD_SLOTS);
    const reserve = all.slice(FIELD_SLOTS);

    // Симуляция — 1-в-1 как fightBoss (та же формула урона босса и раундов).
    let bossHp = Number(boss.current_hp);
    let totalDamage = 0;
    let round = 1;
    while (round <= STALL_GUARD_ROUNDS && bossHp > 0 && field.some((c) => c.alive)) {
      let playerDmg = 0;
      for (const c of field)
        if (c.alive) {
          const [lo, hi] = powerOf(c.level);
          playerDmg +=
            c.atkMult !== 1
              ? Math.max(1, Math.round(rollIn([lo * c.atkMult, hi * c.atkMult])))
              : rollIn([lo, hi]);
        }
      bossHp -= playerDmg;
      totalDamage += playerDmg;
      if (bossHp <= 0) break;
      const bossDmg = Math.max(
        1,
        Math.round(roundDamage(round) * (1 + (secureRandom() * 2 - 1) * R_DMG_VARIANCE_ROUND)),
      );
      const target = field.find((c) => c.alive);
      if (target) {
        target.hp -= bossDmg;
        if (target.hp <= 0) {
          target.alive = false;
          const next = reserve.shift();
          if (next) field.push(next);
        }
      }
      round++;
    }

    const result = await commitRaidRun({
      wallet,
      boss,
      locationId: data.locationId,
      cycleNo: loc.cycle_no,
      totalDamage,
      rounds: round,
    });
    return { ...result, bossMaxHp: Number(boss.max_hp) };
  });

// ═══════════════════════════════════════════════════════════════════
// DistributeRaidBossKillRewards (внешняя зависимость commitRaidRun)
// ═══════════════════════════════════════════════════════════════════
