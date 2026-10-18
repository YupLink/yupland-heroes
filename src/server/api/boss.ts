// PvE «Босс» на фишках. Бой считается на СЕРВЕРЕ (честно): игрок присылает
// отряд (до 10, поле = первые 5), сервер списывает энергию, симулирует раунды
// и возвращает лог. Урон фишек = реальные POWER_RANGES (как в PvP). HP фишек —
// согласованная оценка. Урон босса растёт по раундам, бьёт по порядку ряда.
//
// БАЛАНС-КОНСТАНТЫ зафиксированы (не редактируются в админке, только инфо):
// энергия за бой, урон босса (база/рост/разброс), условие лайка. Админ задаёт
// только: имя, картинку, HP, пул наград.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg, sb } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { setAccountEnergy } from "../accountBalances";
import { hpOf, powerOf } from "@/lib/chipStats";
import { tirageBonus, isPremiumCollection } from "@/lib/tirageBonus";
import { getHallwayConfig } from "./hallwayConfig";
import { getSisterWallets } from "./user";
import { notRestingOrFilter } from "../chipRest";
import type { PgChipBoss, PgChipBossSession } from "../db/pg";
import { accountOf, accountIdOf } from "./user-shared";
import { noteEnergySpend } from "./beta-raid/econ/energy-note";
import { usdtInFillers, USDT_BANNED_MSG } from "@/lib/usdtBanned";

function requireWallet(): string {
  const w = getCurrentWallet();
  if (!w) throw new Error("Кошелёк не подключён");
  assertNotMaintenance(w);
  return w;
}
function requireAdmin(): string {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("Только админ");
  return w;
}

// ── Фикс-константы баланса ──
const ENERGY_COST = 10;
const DMG_BASE = 80;
const DMG_GROWTH = 1.6;
const DMG_VARIANCE = 0.15;
const DMG_GROWTH_CAP_ROUND = 5; // урон босса РАСТЁТ только до 5 раунда; дальше — фикс уровня R5 + диапазон ±15%
const LIKE_THRESHOLD = 1000; // урона за один бой
const LIKE_REWARD = 0.1; // лайк за бой при достижении порога
const DEFAULT_SPLIT = [25, 18, 13, 10, 8, 6, 5, 5, 5, 5]; // % пула по топ-10
const HP_GROWTH_DEFAULT = 10; // +% к HP после каждого убийства

// Следующий сброс босса — понедельник 00:00 UTC (крон). Для таймера на UI.
function nextResetAt(from = new Date()): string {
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0 Вс … 1 Пн
  let add = (1 - day + 7) % 7;
  if (add === 0) add = 7; // сегодня уже понедельник 00:00 прошло → следующий
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString();
}

// Боевые характеристики фишки — единый модуль (см. lib/chipStats), тот же
// источник, что и анкета фишки, чтобы числа совпадали.
const rollIn = ([lo, hi]: [number, number]) => lo + Math.floor(Math.random() * (hi - lo + 1));
const roundDamage = (round: number) =>
  Math.round(DMG_BASE * Math.pow(DMG_GROWTH, Math.min(round, DMG_GROWTH_CAP_ROUND) - 1));

// Лимита раундов нет: бой идёт до победы одной из сторон. Это предохранитель
// от вечного цикла, а не правило игры.
const STALL_GUARD_ROUNDS = 100_000;

// Пул наград турнира: НЕСКОЛЬКО наполнителей (лайки/билеты/энергия/токен),
// каждый со своим объёмом — раздаются ПАРАЛЛЕЛЬНО по одному % split. Пакеты —
// отдельно: топ-N мест получают пак целиком (делить нельзя).
// split НЕ блокируется при сумме >100 — нормализуется к 100% (каждое значение
// делится на сумму), поэтому суммарно по наполнителю раздаётся ровно его объём.
type FillerKind = "likes" | "tickets" | "energy" | "token";
type Filler = { kind: FillerKind; amount: number; token?: string | null };
type PackReward = { packId: string; toPlace: number };
type RewardConfig = { fillers: Filler[]; split: number[]; packs: PackReward[] };

function parseRewardConfig(v: unknown): RewardConfig {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const split =
      Array.isArray(o.split) && o.split.length
        ? (o.split as unknown[]).map((x) => Number(x) || 0)
        : [...DEFAULT_SPLIT];
    // новая схема
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
      };
    }
    // back-compat со старой схемой {currency, poolAmount, packId, packToPlace}
    const cur = (o.currency as string) || "likes";
    const amount = Number(o.poolAmount ?? o.likesPool) || 0;
    return {
      fillers:
        amount > 0
          ? [
              {
                kind: cur === "likes" ? "likes" : "token",
                amount,
                token: cur === "likes" ? null : cur,
              },
            ]
          : [],
      split,
      packs: o.packId ? [{ packId: String(o.packId), toPlace: Number(o.packToPlace) || 0 }] : [],
    };
  }
  return { fillers: [], split: [...DEFAULT_SPLIT], packs: [] };
}

/**
 * Закрыть сессию боя ровно один раз. Коммитит урон тот, кто перевёл сессию
 * из 'active' в 'done'; остальные получают отказ.
 *
 * Без этого два одновременных «Завершить» (или две вкладки) коммитили ОДИН И
 * ТОТ ЖЕ урон по нескольку раз: обе читали активную сессию, обе звали
 * commitBossRun, и вклад в топ босса удваивался.
 */
async function closeBossSessionOnce(id: string): Promise<boolean> {
  const rows = (await mcpExec(
    `UPDATE yuplink.chip_boss_session SET status = 'done', updated_at = now()
      WHERE id = ${sqlStr(id)} AND status = 'active' RETURNING id;`,
    { wrapJsonCte: true },
  )) as Array<{ id: string }> | null;
  return (rows?.length ?? 0) > 0;
}

function sqlStr(v: string) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

// ──────── Игрок: активный босс + лидерборд ────────
export const getActiveBoss = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  const boss = await pg.chipBoss.findOne({ active: true });
  if (!boss) return { boss: null as null };

  const cur = boss.week_no;
  // Один ключ на всё: и «твой урон», и невостребованные награды — на аккаунт.
  const myAccount = wallet ? ((await accountIdOf(wallet)) ?? "") : "";

  // Независимые запросы — ПАРАЛЛЕЛЬНО (было 4 последовательных round-trip):
  // лидерборд per-TG, твой урон, энергия, невостребованные награды.
  const [rows, ydRows, energyRes, rrRows] = await Promise.all([
    mcpExec(
      `SELECT r.week_no, min(r.wallet) AS wallet,
                COALESCE(NULLIF(max(u.telegram_username), ''), min(r.wallet)) AS name,
                SUM(r.damage)::int AS total
           FROM yuplink.chip_boss_run r
           LEFT JOIN yuplink.users u ON u.wallet = r.wallet
          WHERE r.boss_id=${sqlStr(boss.id)} AND r.week_no IN (${cur}, ${cur - 1})
          GROUP BY r.week_no, r.account_id
          ORDER BY total DESC
          LIMIT 5000;`,
      { wrapJson: true },
    ) as Promise<Array<{ week_no: number; wallet: string; name: string; total: number }>>,
    wallet
      ? (mcpExec(
          `SELECT COALESCE(SUM(damage),0)::int t FROM yuplink.chip_boss_run
              WHERE boss_id=${sqlStr(boss.id)} AND week_no=${cur}
                AND account_id = ${sqlStr(myAccount)};`,
          { wrapJson: true },
        ) as Promise<Array<{ t: number }>>)
      : Promise.resolve([] as Array<{ t: number }>),
    wallet
      ? sb.rpc("compute_energy", { p_wallet: wallet })
      : Promise.resolve({ data: null } as { data: null }),
    wallet
      ? (mcpExec(
          `SELECT reward_kind, reward_amount, pack_id, place, week_no FROM yuplink.chip_boss_reward
              WHERE account_id = ${sqlStr(myAccount)} AND claimed_at IS NULL
              ORDER BY week_no DESC, place;`,
          { wrapJson: true },
        ) as Promise<
          Array<{
            reward_kind: string;
            reward_amount: number;
            pack_id: string | null;
            place: number;
            week_no: number;
          }>
        >)
      : Promise.resolve(
          [] as Array<{
            reward_kind: string;
            reward_amount: number;
            pack_id: string | null;
            place: number;
            week_no: number;
          }>,
        ),
  ]);

  const lb = rows
    .filter((r) => r.week_no === cur)
    .map((r) => ({ wallet: r.wallet, name: r.name, total: r.total }));
  const lastWeek = rows
    .filter((r) => r.week_no === cur - 1)
    .map((r) => ({ wallet: r.wallet, name: r.name, total: r.total }));
  const yourDamage = ydRows[0]?.t ?? 0;
  // Место игрока в турнире этой недели (по ВСЕМ участникам per-TG, не только
  // топ-20). null, если урона ещё нет. Ранг = сколько бойцов бьют сильнее, +1.
  const weekRows = rows.filter((r) => r.week_no === cur);
  const yourRank = yourDamage > 0 ? weekRows.filter((r) => r.total > yourDamage).length + 1 : null;

  let energy = 30,
    maxEnergy = 30,
    nextRegenSec = 0;
  const erow = (
    energyRes.data as Array<{
      energy_now: number;
      max_energy: number;
      next_regen_seconds: number;
    }> | null
  )?.[0];
  if (erow) {
    energy = erow.energy_now;
    maxEnergy = erow.max_energy;
    nextRegenSec = erow.next_regen_seconds;
    // Снапшот энергии в единую таблицу account_balances (fire-and-forget).
    if (wallet) void setAccountEnergy(wallet, erow.energy_now).catch(() => {});
  }

  // Невостребованные награды (есть → показываем кнопку «забрать»), per-TG.
  const myRewards = rrRows.map((r) => ({
    kind: r.reward_kind,
    amount: Number(r.reward_amount),
    packId: r.pack_id,
    place: r.place,
    weekNo: r.week_no,
  }));

  // Обогащаем награды-паки картинкой+именем — чтобы в пуле показывать
  // мини-обложку пака, а не просто «пак · топ-N».
  const rewardConfig = parseRewardConfig(boss.reward_tiers);
  const packIds = Array.from(
    new Set((rewardConfig.packs ?? []).map((p) => p.packId).filter(Boolean)),
  );
  const packsMeta: Record<string, { name: string; image: string | null }> = {};
  if (packIds.length > 0) {
    const cpIds = packIds.filter((id) => id.startsWith("cp_"));
    const pkIds = packIds.filter((id) => !id.startsWith("cp_"));
    if (cpIds.length > 0) {
      const { data } = await pg.chipPacks.raw().select("id,name,cover_image_url").in("id", cpIds);
      for (const p of (data ?? []) as Array<{
        id: string;
        name: string;
        cover_image_url: string | null;
      }>)
        packsMeta[p.id] = { name: p.name, image: p.cover_image_url };
    }
    if (pkIds.length > 0) {
      const { data } = await pg.nftPacks.raw().select("id,name,image_url").in("id", pkIds);
      for (const p of (data ?? []) as Array<{
        id: string;
        name: string;
        image_url: string | null;
      }>)
        packsMeta[p.id] = { name: p.name, image: p.image_url };
    }
  }

  return {
    boss: {
      id: boss.id,
      name: boss.name,
      imageUrl: boss.image_url,
      isMini: !!boss.is_mini,
      maxHp: Number(boss.max_hp),
      currentHp: Number(boss.current_hp),
      killedAt: boss.killed_at,
      weekNo: boss.week_no,
      weekStartedAt: boss.week_started_at,
      rewardConfig,
      packsMeta,
      hpGrowthPct: Number(boss.hp_growth_pct ?? HP_GROWTH_DEFAULT),
      nextResetAt: nextResetAt(),
      // фикс-параметры (только инфо для «?»)
      energyCost: ENERGY_COST,
      likeThreshold: LIKE_THRESHOLD,
      likeReward: LIKE_REWARD,
      roundDamages: [1, 2, 3, 4, 5, 6].map((r) => ({ round: r, dmg: roundDamage(r) })),
      dmgVariance: DMG_VARIANCE,
    },
    yourDamage,
    yourRank,
    leaderboard: lb,
    leaderboardTotal: rows.filter((r) => r.week_no === cur).length,
    lastWeek,
    lastWeekTotal: rows.filter((r) => r.week_no === cur - 1).length,
    energy,
    maxEnergy,
    nextRegenSec,
    myRewards,
    mustClaimReward: myRewards.length > 0,
  };
});

// ──────── Лидерборд с пагинацией («Показать ещё» за пределами топ-20) ────────
export const listBossLeaderboard = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        lastWeek: z.boolean().optional().default(false),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(5000).default(5000),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const boss = await pg.chipBoss.findOne({ active: true });
    if (!boss) return { rows: [], total: 0, hasMore: false };
    const week = data.lastWeek ? boss.week_no - 1 : boss.week_no;
    const off = Math.floor(data.offset);
    const lim = Math.floor(data.limit);
    // per-TG: агрегируем урон по Telegram-аккаунту, показываем ЮЗЕР-ИД (TG-ник).
    const rows = (await mcpExec(
      `SELECT min(r.wallet) AS wallet,
              COALESCE(NULLIF(max(u.telegram_username), ''), min(r.wallet)) AS name,
              SUM(r.damage)::int AS total
         FROM yuplink.chip_boss_run r
         LEFT JOIN yuplink.users u ON u.wallet = r.wallet
        WHERE r.boss_id=${sqlStr(boss.id)} AND r.week_no=${week}
        GROUP BY r.account_id ORDER BY total DESC
        OFFSET ${off} LIMIT ${lim};`,
      { wrapJson: true },
    )) as Array<{ wallet: string; name: string; total: number }>;
    const cnt = (await mcpExec(
      `SELECT COUNT(DISTINCT r.account_id)::int AS n
         FROM yuplink.chip_boss_run r
         LEFT JOIN yuplink.users u ON u.wallet = r.wallet
        WHERE r.boss_id=${sqlStr(boss.id)} AND r.week_no=${week};`,
      { wrapJson: true },
    )) as Array<{ n: number }>;
    const total = Number(cnt?.[0]?.n ?? 0);
    const out = rows.map((r) => ({ wallet: r.wallet, name: r.name, total: Number(r.total) }));
    return { rows: out, total, hasMore: off + out.length < total };
  });

// ──────── Игрок: забрать награды за босса (реальное начисление при клике) ────────
export const claimBossRewards = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = requireWallet();
  const now = new Date().toISOString();
  // Награды принадлежат аккаунту — его и спрашиваем.
  const claimAccount = await accountOf(wallet);
  // Кандидаты (незабранные). Настоящий гейт от гонки — атомарный per-row
  // UPDATE внутри цикла, а не этот SELECT (он может быть устаревшим).
  const candidates = (await mcpExec(
    `SELECT id, reward_kind, reward_amount, pack_id, week_no, boss_id FROM yuplink.chip_boss_reward
        WHERE account_id = ${sqlStr(claimAccount)} AND claimed_at IS NULL;`,
    { wrapJson: true },
  )) as Array<{
    id: string;
    reward_kind: string;
    reward_amount: number;
    pack_id: string | null;
    week_no: number;
    boss_id: string;
  }>;
  if (candidates.length === 0) throw new Error("Нет наград к получению");

  const tokenCache = new Map<string, { ft_contract: string; decimals: number } | null>();
  const summary: Record<string, number> = {};
  let credited = 0;
  for (const r of candidates) {
    // АТОМАРНЫЙ ЗАХВАТ строки: claimed_at NULL → now, RETURNING вернёт её
    // ТОЛЬКО тому запросу, который реально её флипнул (Postgres row-lock).
    // Двойной клик / параллельный запрос получит 0 строк и НЕ начислит —
    // задвоить нельзя ни для одного вида (лайки/энергия/пак тоже).
    const won = (await mcpExec(
      `UPDATE yuplink.chip_boss_reward SET claimed_at=now()
          WHERE id=${sqlStr(r.id)} AND claimed_at IS NULL RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    if (!won || won.length === 0) continue; // уже забрали параллельно — пропуск
    try {
      const amt = Number(r.reward_amount) || 0;
      const kind = r.reward_kind;
      if (kind === "pack" && r.pack_id) {
        const { grantPackToUser } = await import("./packs");
        await grantPackToUser({
          wallet,
          packId: r.pack_id,
          source: "drop",
          sourceRef: `boss:${r.boss_id}:w${r.week_no}`,
        });
        summary["пак"] = (summary["пак"] ?? 0) + 1;
      } else if (kind === "likes") {
        const { likeAccountId, addLikes } = await import("../likesAccount");
        await addLikes(await likeAccountId(wallet), amt);
        summary["лайки"] = (summary["лайки"] ?? 0) + amt;
      } else if (kind === "tickets") {
        await pg.ticketPurchases.insert({
          id: `tp_${nanoid(10)}`,
          wallet,
          offer_id: "boss",
          tickets_added: amt,
          energy_spent: 0,
          yupland_tx_id: null,
          payment_token: null,
          payment_amount: null,
          near_tx_hash: null,
          idempotency_key: `bossclaim:${r.id}`,
          created_at: now,
        });
        {
          // Награда босса — в леджер; ref по id награды, повтор не задвоит.
          const { moveTickets } = await import("./tickets-ledger");
          await moveTickets({ wallet, delta: amt, kind: "nft_claim", ref: `bossclaim:${r.id}` });
        }
        summary["билеты"] = (summary["билеты"] ?? 0) + amt;
      } else if (kind === "energy") {
        await sb.rpc("add_energy", { p_wallet: wallet, p_amount: amt, p_kind: "energy_boss" }); // канон. кош
        summary["энергия"] = (summary["энергия"] ?? 0) + amt;
      } else {
        // токен (kind = символ) → дроп. redemptions.amount теперь numeric —
        // храним ТОЧНО как выиграно (7.5, не округляем). Вывод целыми
        // (withdrawTokens берёт floor), дробный остаток копится через
        // split/leftover.
        let tr = tokenCache.get(kind);
        if (tr === undefined) {
          const row = await pg.rewardTokens.findOne({ symbol: kind });
          tr = row ? { ft_contract: row.ft_contract, decimals: row.decimals } : null;
          tokenCache.set(kind, tr);
        }
        await pg.redemptions.insert({
          id: `r_${nanoid(10)}`,
          contract_id: "boss",
          token_id: `bossclaim_${r.id}`,
          campaign_id: null,
          wallet,
          amount: amt,
          tx_hash: null,
          status: "pending",
          reward_token: kind,
          ft_contract: tr?.ft_contract ?? null,
          decimals: tr?.decimals ?? null,
          ticket_cost: 0,
          redeemed_at: now,
        });
        summary[kind] = (summary[kind] ?? 0) + amt;
      }
      credited++;
    } catch (e) {
      // Начисление упало — ОТКАТ захвата (claimed_at=NULL), чтобы награда не
      // пропала и её можно было забрать повторно (не «claimed без выдачи»).
      await mcpExec(
        `UPDATE yuplink.chip_boss_reward SET claimed_at=NULL WHERE id=${sqlStr(r.id)};`,
      );
      throw e;
    }
  }
  if (credited === 0) throw new Error("Нет наград к получению");
  try {
    const { invalidateTicketsCache } = await import("./user");
    invalidateTicketsCache(wallet);
  } catch {
    /* noop */
  }
  return { ok: true, claimed: credited, summary };
});

/**
 * История наград игрока по боссу (все sister-кошельки, по неделям). Для раздела
 * «История» в экране босса: неделя, место, что дали, забрано ли.
 */
type BossRewardGroup = {
  ordinal: number;
  weekNo: number;
  place: number;
  bossName: string | null;
  claimed: boolean;
  createdAt: string;
  rewards: Array<{ kind: string; amount: number; packId: string | null }>;
};
export const getMyBossRewardHistory = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return [] as BossRewardGroup[];
  const histAccount = await accountIdOf(wallet);
  if (!histAccount) return [] as BossRewardGroup[];
  // b.ordinal — истинная хронология боссов (растёт со временем); НЕ week_no
  // (у мини-боссов и нового главного week_no=1, поэтому сорт по week_no
  // перемешивал очередь). Сортируем по ordinal — «по очереди», последний внизу.
  const rows = (await mcpExec(
    `SELECT r.boss_id, r.week_no, r.place, r.reward_kind, r.reward_amount, r.pack_id,
              r.claimed_at, r.created_at, b.name AS boss_name, COALESCE(b.ordinal,0) AS ordinal
         FROM yuplink.chip_boss_reward r
         LEFT JOIN yuplink.chip_boss b ON b.id=r.boss_id
        WHERE r.account_id = ${sqlStr(histAccount)}
        ORDER BY COALESCE(b.ordinal,0) ASC, r.created_at ASC LIMIT 500;`,
    { wrapJson: true },
  )) as Array<{
    boss_id: string;
    week_no: number;
    place: number;
    reward_kind: string;
    reward_amount: number;
    pack_id: string | null;
    claimed_at: string | null;
    created_at: string;
    boss_name: string | null;
    ordinal: number;
  }>;
  // Группируем все награды ОДНОГО турнира (boss_id + week_no) в одну строку.
  const byKey = new Map<string, BossRewardGroup>();
  const order: string[] = [];
  for (const r of rows) {
    const k = `${r.boss_id}|${r.week_no}`;
    let g = byKey.get(k);
    if (!g) {
      g = {
        ordinal: Number(r.ordinal),
        weekNo: Number(r.week_no),
        place: Number(r.place),
        bossName: r.boss_name,
        claimed: true,
        createdAt: r.created_at,
        rewards: [],
      };
      byKey.set(k, g);
      order.push(k);
    }
    g.rewards.push({
      kind: r.reward_kind,
      amount: Number(r.reward_amount),
      packId: r.pack_id,
    });
    if (!r.claimed_at) g.claimed = false; // не забрана хотя бы одна → турнир не забран
  }
  return order.map((k) => byKey.get(k)!);
});

// История ВСЕХ боссов с турнирными местами: список боссов, НОВЫЕ СВЕРХУ
// (ordinal DESC), у каждого — ВСЕ игроки по суммарному урону за его неделю
// (per-TG, как в getActiveBoss leaderboard). Для сворачиваемого списка на клиенте.
type BossTournament = {
  id: string;
  name: string;
  ordinal: number;
  weekNo: number;
  isMini: boolean;
  killed: boolean;
  top: Array<{ name: string; damage: number; place: number; isMe: boolean }>;
};
export const getBossTournamentHistory = createServerFn({ method: "GET" }).handler(async () => {
  // Ключ текущего игрока — его аккаунт: строки лидерборда сгруппированы по
  // нему же, и подсветка «где я» иначе не совпала бы никогда.
  const wallet = getCurrentWallet();
  const myKey = wallet ? ((await accountIdOf(wallet)) ?? "") : "";
  const rows = (await mcpExec(
    `WITH lb AS (
         SELECT r.boss_id, r.week_no,
                COALESCE(NULLIF(max(u.telegram_username), ''), min(r.wallet)) AS pname,
                SUM(r.damage)::int AS total,
                (r.account_id = ${sqlStr(myKey)}) AS is_me,
                row_number() OVER (PARTITION BY r.boss_id, r.week_no ORDER BY SUM(r.damage) DESC) AS place
           FROM yuplink.chip_boss_run r
           LEFT JOIN yuplink.users u ON u.wallet = r.wallet
          GROUP BY r.boss_id, r.week_no, r.account_id
       )
       SELECT b.id, b.name, COALESCE(b.ordinal,0) AS ordinal, b.week_no,
              b.is_mini, (b.killed_at IS NOT NULL OR b.current_hp<=0) AS killed,
              lb.pname, lb.total, lb.place, lb.is_me
         FROM yuplink.chip_boss b
         JOIN lb ON lb.boss_id = b.id AND lb.week_no = b.week_no
        -- Сверху самые свежие (недавно убитые). ordinal — не время (админ мог
        -- ставить старым боссам произвольно), поэтому первичный ключ — killed_at.
        ORDER BY b.killed_at DESC NULLS LAST, b.week_no DESC,
                 COALESCE(b.ordinal,0) DESC, lb.place ASC;`,
    { wrapJson: true },
  )) as Array<{
    id: string;
    name: string;
    ordinal: number;
    week_no: number;
    is_mini: boolean;
    killed: boolean;
    pname: string;
    total: number;
    place: number;
    is_me: boolean;
  }>;
  const byId = new Map<string, BossTournament>();
  const order: string[] = [];
  for (const r of rows) {
    let g = byId.get(r.id);
    if (!g) {
      g = {
        id: r.id,
        name: r.name,
        ordinal: Number(r.ordinal),
        weekNo: Number(r.week_no),
        isMini: !!r.is_mini,
        killed: !!r.killed,
        top: [],
      };
      byId.set(r.id, g);
      order.push(r.id);
    }
    g.top.push({ name: r.pname, damage: Number(r.total), place: Number(r.place), isMe: !!r.is_me });
  }
  return order.map((k) => byId.get(k)!) as BossTournament[];
});

// ──────── Игрок: бой ────────
// «Единство: Тираж» — множители статов от ТИРАЖА КОЛЛЕКЦИИ фишки (не серийника).
// Каждая фишка коллекции получает одинаковый бонус по её initial_supply (+ премиум).
// Отряд задан как (templateId, level); templateId → collection → {тираж, премиум}.
// Возвращает map: индекс в lineup → {hpMult, atkMult}. Триал-фишки — без бонуса.
async function computeTirageMults(
  lineup: Array<{ templateId: string; level: number; training?: boolean }>,
  enabled: boolean,
): Promise<Map<number, { hpMult: number; atkMult: number }>> {
  const out = new Map<number, { hpMult: number; atkMult: number }>();
  if (!enabled) return out;

  const templateIds = [...new Set(lineup.filter((c) => !c.training).map((c) => c.templateId))];
  if (templateIds.length === 0) return out;

  // templateId → collection_id
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

  // collection_id → {тираж, премиум}
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
    ).map(
      // Премиум — АЛГОРИТМ по имени (isPremiumCollection), а не только ручной флаг,
      // чтобы новые коллекции "X (Premium)" сразу получали бонус в бою.
      (c) => [
        c.id,
        { supply: Number(c.initial_supply), premium: isPremiumCollection(c.name, c.is_premium) },
      ],
    ),
  );

  lineup.forEach((c, i) => {
    if (c.training) return; // триал-фишки без тиража
    const colId = tplToCol.get(c.templateId);
    const info = colId ? colInfo.get(colId) : undefined;
    if (!info) return;
    const b = tirageBonus(info.supply, info.premium);
    if (b.hpMult !== 1 || b.atkMult !== 1) {
      out.set(i, { hpMult: b.hpMult, atkMult: b.atkMult });
    }
  });
  return out;
}

export const fightBoss = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        lineup: z
          .array(
            z.object({
              templateId: z.string().min(1),
              level: z.number(),
            }),
          )
          .min(1)
          .max(10),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const boss = await pg.chipBoss.findOne({ active: true });
    if (!boss) throw new Error("Нет активного босса");
    if (Number(boss.current_hp) <= 0) throw new Error("Босс уже повержен");
    await assertNoUnclaimedReward(wallet);

    // Проверка владения фишками (по template_id+level).
    const account = await accountOf(wallet);
    const sisters = await getSisterWallets(wallet);
    const { data: invRows } = await pg.userChipInventory
      .raw()
      .select("template_id,level")
      .eq("account_id", account)
      .eq("status", "owned")
      // Анти-карусель: отдыхающие фишки (rest_until в будущем) НЕ считаются
      // доступными для боя → сервер отвергнет любой отряд с отдыхающей фишкой,
      // каким бы способом (автоподбор/ручной) её ни выбрали.
      .or(notRestingOrFilter());
    const owned = new Map<string, number>();
    for (const r of (invRows ?? []) as Array<{ template_id: string; level: number }>) {
      const k = `${r.template_id}|${r.level}`;
      owned.set(k, (owned.get(k) ?? 0) + 1);
    }
    for (const c of data.lineup) {
      const k = `${c.templateId}|${c.level}`;
      const n = owned.get(k) ?? 0;
      if (n <= 0) throw new Error("В отряде есть фишки, которых у тебя нет");
      owned.set(k, n - 1);
    }

    // Списываем энергию атомарно.
    const { error: enErr } = await sb.rpc("touch_energy_atomic", {
      p_wallet: wallet,
      p_spend: ENERGY_COST,
    });
    if (enErr) {
      if (String(enErr.message).includes("not_enough_energy"))
        throw new Error("Не хватает энергии");
      throw new Error(enErr.message);
    }
    void noteEnergySpend(account, ENERGY_COST, "boss");

    // «Единство: Тираж» — множители по тиражу коллекции (если включено).
    const tmults = await computeTirageMults(
      data.lineup,
      (await getHallwayConfig()).boss.tirageBonusEnabled,
    );

    // ── Симуляция ──
    type Chip = { level: number; hp: number; maxHp: number; alive: boolean; atkMult: number };
    const all: Chip[] = data.lineup.map((c, i) => {
      const m = tmults.get(i);
      const hp = Math.max(1, Math.round(hpOf(c.level) * (m?.hpMult ?? 1)));
      return { level: c.level, hp, maxHp: hp, alive: true, atkMult: m?.atkMult ?? 1 };
    });
    const field = all.slice(0, 5);
    const reserve = all.slice(5);

    let bossHp = Number(boss.current_hp);
    let totalDamage = 0;
    let round = 1;
    let killed = false;
    const log: Array<{
      round: number;
      playerDmg: number;
      bossDmg: number;
      targetLevel: number | null;
      targetDied: boolean;
      broughtInLevel: number | null;
    }> = [];

    while (round <= STALL_GUARD_ROUNDS && bossHp > 0 && field.some((c) => c.alive)) {
      let playerDmg = 0;
      for (const c of field)
        if (c.alive) {
          const [lo, hi] = powerOf(c.level);
          playerDmg +=
            c.atkMult !== 1
              ? Math.max(
                  1,
                  Math.round(rollIn([lo * c.atkMult, hi * c.atkMult] as [number, number])),
                )
              : rollIn([lo, hi] as [number, number]);
        }
      bossHp -= playerDmg;
      totalDamage += playerDmg;
      if (bossHp <= 0) {
        killed = true;
        log.push({
          round,
          playerDmg,
          bossDmg: 0,
          targetLevel: null,
          targetDied: false,
          broughtInLevel: null,
        });
        break;
      }
      const base = DMG_BASE * Math.pow(DMG_GROWTH, Math.min(round, DMG_GROWTH_CAP_ROUND) - 1);
      const bossDmg = Math.max(1, Math.round(base * (1 + (Math.random() * 2 - 1) * DMG_VARIANCE)));
      const target = field.find((c) => c.alive) ?? null;
      let targetDied = false;
      let broughtInLevel: number | null = null;
      if (target) {
        target.hp -= bossDmg;
        if (target.hp <= 0) {
          target.alive = false;
          targetDied = true;
          const next = reserve.shift();
          if (next) {
            field.push(next);
            broughtInLevel = next.level;
          }
        }
      }
      log.push({
        round,
        playerDmg,
        bossDmg,
        targetLevel: target?.level ?? null,
        targetDied,
        broughtInLevel,
      });
      round++;
    }

    const dealt = Math.min(totalDamage, Number(boss.current_hp));
    const roundsPlayed = log.length;
    const likeAwarded = dealt >= LIKE_THRESHOLD ? LIKE_REWARD : 0;

    await pg.chipBossRun.insert({
      id: `brun_${nanoid(10)}`,
      boss_id: boss.id,
      account_id: await accountOf(wallet),
      wallet,
      damage: dealt,
      rounds: roundsPlayed,
      killed,
      like_awarded: likeAwarded,
      week_no: boss.week_no,
      created_at: new Date().toISOString(),
    });

    await mcpExec(
      `UPDATE yuplink.chip_boss
         SET current_hp = GREATEST(0, current_hp - ${dealt})
       WHERE id=${sqlStr(boss.id)};`,
    );
    if (killed) {
      const kc = (await mcpExec(
        `UPDATE yuplink.chip_boss SET killed_at=now()
          WHERE id=${sqlStr(boss.id)} AND current_hp<=0 AND killed_at IS NULL RETURNING id;`,
        { wrapJsonCte: true },
      )) as Array<{ id: string }>;
      if (kc && kc.length > 0) {
        try {
          await distributeBossRewards(boss.id);
        } catch (e) {
          console.warn("[fightBoss] distribute failed", e);
        }
      }
    }

    if (likeAwarded > 0) {
      const { likeAccountId, addLikes } = await import("../likesAccount");
      await addLikes(await likeAccountId(wallet), likeAwarded);
    }

    const freshBoss = await pg.chipBoss.findOne({ id: boss.id });
    return {
      log,
      totalDamage: dealt,
      killed,
      likeAwarded,
      bossHpAfter: Number(freshBoss?.current_hp ?? 0),
      bossMaxHp: Number(boss.max_hp),
    };
  });

// ──────── Пошаговый (пораундовый) бой — серверно-авторитетно ────────
// Состояние сессии (jsonb), клиент шлёт только sessionId + выбор фишки из резерва.
// atkMult — множитель атаки от «Единство: Тираж» (HP уже вшит в hp/maxHp при
// сборке). undefined/1 = без бонуса. Для триал-фишек не используется (у них
// свой trialScale).
type SessionFieldChip = {
  templateId: string;
  level: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  isTraining?: boolean;
  atkMult?: number;
  serialNo?: number | null;
};
type SessionReserveChip = {
  templateId: string;
  level: number;
  hp: number;
  maxHp: number;
  isTraining?: boolean;
  atkMult?: number;
  serialNo?: number | null;
};
type BossSessionState = {
  bossHp: number;
  bossMaxHp: number;
  field: SessionFieldChip[];
  reserve: SessionReserveChip[];
  round: number;
  totalDamage: number;
};

const FIELD_SLOTS = 5;

// Общая финализация: коммит урона в chip_boss, killed_at, запись chip_boss_run,
// начисление лайка. Возвращает фактически нанесённый урон/флаги/HP босса после.
async function commitBossRun(opts: {
  wallet: string;
  boss: PgChipBoss;
  totalDamage: number;
  rounds: number;
  killed: boolean;
}): Promise<{ totalDamage: number; killed: boolean; likeAwarded: number; bossHpAfter: number }> {
  const { wallet, boss } = opts;
  const dealt = Math.min(opts.totalDamage, Number(boss.current_hp));
  const killed = opts.killed || dealt >= Number(boss.current_hp);
  const likeAwarded = dealt >= LIKE_THRESHOLD ? LIKE_REWARD : 0;
  const now = new Date().toISOString();

  await pg.chipBossRun.insert({
    id: `brun_${nanoid(10)}`,
    boss_id: boss.id,
    account_id: await accountOf(wallet),
    wallet,
    damage: dealt,
    rounds: opts.rounds,
    killed,
    like_awarded: likeAwarded,
    week_no: boss.week_no,
    created_at: now,
  });

  await mcpExec(
    `UPDATE yuplink.chip_boss
       SET current_hp = GREATEST(0, current_hp - ${dealt})
     WHERE id=${sqlStr(boss.id)};`,
  );
  // Килл раздаёт награды СРАЗУ. Атомарный захват: killed_at NULL→now
  // выиграет ровно ОДИН добивший (row-lock) → он и раздаёт.
  if (killed) {
    const kc = (await mcpExec(
      `UPDATE yuplink.chip_boss SET killed_at=now()
        WHERE id=${sqlStr(boss.id)} AND current_hp<=0 AND killed_at IS NULL RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    if (kc && kc.length > 0) {
      try {
        await distributeBossRewards(boss.id);
      } catch (e) {
        console.warn("[commitBossRun] distribute failed", e);
      }
    }
  }

  if (likeAwarded > 0) {
    const { likeAccountId, addLikes } = await import("../likesAccount");
    await addLikes(await likeAccountId(wallet), likeAwarded);
  }

  const fresh = await pg.chipBoss.findOne({ id: boss.id });
  return { totalDamage: dealt, killed, likeAwarded, bossHpAfter: Number(fresh?.current_hp ?? 0) };
}

const lineupValidator = (d: unknown) =>
  z
    .object({
      lineup: z
        .array(
          z.object({
            templateId: z.string().min(1),
            level: z.number(),
            training: z.boolean().optional(), // триал-фишка прихожи
            chipId: z.string().optional(), // id из hallway_training_chips
            serialNo: z.number().nullable().optional(), // серийник экземпляра (только показ)
          }),
        )
        .min(1)
        .max(10),
    })
    .parse(d);

// 1. Активная сессия текущего кошелька (для возобновления) или null.
export const getBossFightSession = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return { session: null as null };
  const s = await pg.chipBossSession.findOne({ wallet, status: "active" });
  if (!s) return { session: null as null };
  const boss = await pg.chipBoss.findOne({ id: s.boss_id });
  return {
    session: {
      sessionId: s.id,
      state: s.state as BossSessionState,
      bossName: boss?.name ?? "Босс",
      bossImageUrl: boss?.image_url ?? null,
    },
  };
});

// 2. Старт боя: списывает энергию один раз, создаёт сессию. Если active уже есть — возвращает её.
export const startBossFight = createServerFn({ method: "POST" })
  .inputValidator(lineupValidator)
  .handler(async ({ data }) => {
    const wallet = requireWallet();

    // Уже есть активная сессия — вернуть её (без повторного списания энергии).
    const existing = await pg.chipBossSession.findOne({ wallet, status: "active" });
    if (existing) {
      const eb = await pg.chipBoss.findOne({ id: existing.boss_id });
      return {
        sessionId: existing.id,
        state: existing.state as BossSessionState,
        bossName: eb?.name ?? "Босс",
        bossImageUrl: eb?.image_url ?? null,
        resumed: true,
      };
    }

    const boss = await pg.chipBoss.findOne({ active: true });
    if (!boss) throw new Error("Нет активного босса");
    if (Number(boss.current_hp) <= 0) throw new Error("Босс уже повержен");
    await assertNoUnclaimedReward(wallet);

    // Владение: реальные фишки — из инвентаря, триал-фишки прихожи — из
    // hallway_training_chips (не consumed). Триал НИКОГДА не берутся из
    // user_chip_inventory (полностью отдельная коллекция).
    const account = await accountOf(wallet);
    const sisters = await getSisterWallets(wallet);
    const realEntries = data.lineup.filter((c) => !c.training);
    const trainEntries = data.lineup.filter((c) => c.training);

    const { data: invRows } = await pg.userChipInventory
      .raw()
      .select("template_id,level")
      .eq("account_id", account)
      .eq("status", "owned")
      // Анти-карусель: отдыхающие фишки (rest_until в будущем) НЕ считаются
      // доступными для боя → сервер отвергнет любой отряд с отдыхающей фишкой,
      // каким бы способом (автоподбор/ручной) её ни выбрали.
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

    // Триал: каждая ровно один раз, star берём с сервера (не с клиента).
    const trialStar = new Map<string, number>();
    if (trainEntries.length > 0) {
      const { data: tcRows } = await pg.hallwayTrainingChips
        .raw()
        .select("id,star")
        .eq("account_id", account)
        .is("consumed_at", null);
      for (const r of (tcRows ?? []) as Array<{ id: string; star: number }>) {
        trialStar.set(r.id, Number(r.star));
      }
      const usedTrial = new Set<string>();
      for (const c of trainEntries) {
        if (!c.chipId || !trialStar.has(c.chipId) || usedTrial.has(c.chipId))
          throw new Error("В отряде есть триал-фишка, которой у тебя нет");
        usedTrial.add(c.chipId);
      }
    }

    // Списываем энергию атомарно — один раз на старте.
    const { error: enErr } = await sb.rpc("touch_energy_atomic", {
      p_wallet: wallet,
      p_spend: ENERGY_COST,
    });
    if (enErr) {
      if (String(enErr.message).includes("not_enough_energy"))
        throw new Error("Не хватает энергии");
      throw new Error(enErr.message);
    }
    void noteEnergySpend(account, ENERGY_COST, "boss");

    // Триал-фишки: star = level (те же ключи статов), но HP/урон ×trialStatScale.
    // Реальные фишки: HP/урон × множитель «Единство: Тираж» (если включено).
    const hcfg = await getHallwayConfig();
    const trialScale = hcfg.boss.trialStatScale;
    const tmults = await computeTirageMults(data.lineup, hcfg.boss.tirageBonusEnabled);
    const buildChip = (c: (typeof data.lineup)[number], i: number): SessionReserveChip => {
      if (c.training && c.chipId) {
        const star = trialStar.get(c.chipId) ?? 1;
        const hp = Math.max(1, Math.round(hpOf(star) * trialScale));
        return { templateId: `training:${c.chipId}`, level: star, hp, maxHp: hp, isTraining: true };
      }
      const m = tmults.get(i);
      const hp = Math.max(1, Math.round(hpOf(c.level) * (m?.hpMult ?? 1)));
      return {
        templateId: c.templateId,
        level: c.level,
        hp,
        maxHp: hp,
        isTraining: false,
        atkMult: m?.atkMult ?? 1,
        serialNo: c.serialNo ?? null,
      };
    };
    const built = data.lineup.map((c, i) => buildChip(c, i));
    const field: SessionFieldChip[] = built
      .slice(0, FIELD_SLOTS)
      .map((c) => ({ ...c, alive: true }));
    const reserve: SessionReserveChip[] = built.slice(FIELD_SLOTS);
    const state: BossSessionState = {
      bossHp: Number(boss.current_hp),
      bossMaxHp: Number(boss.max_hp),
      field,
      reserve,
      round: 1,
      totalDamage: 0,
    };

    const sessionId = `bsess_${nanoid(12)}`;
    const now = new Date().toISOString();
    await pg.chipBossSession.insert({
      id: sessionId,
      wallet,
      boss_id: boss.id,
      week_no: boss.week_no,
      state: state as unknown,
      status: "active",
      created_at: now,
      updated_at: now,
    });

    return {
      sessionId,
      state,
      bossName: boss.name,
      bossImageUrl: boss.image_url,
      resumed: false,
    };
  });

async function loadActiveSession(sessionId: string, wallet: string): Promise<PgChipBossSession> {
  const s = await pg.chipBossSession.findOne({ id: sessionId });
  if (!s || s.wallet !== wallet) throw new Error("Сессия не найдена");
  if (s.status !== "active") throw new Error("Бой уже завершён");
  return s;
}

// 3. Один раунд боя (всё считает сервер).
export const bossFightRound = createServerFn({ method: "POST" })
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
    const session = await loadActiveSession(data.sessionId, wallet);
    const state = session.state as BossSessionState;
    const round = state.round;

    // Опционально ввести фишку из резерва в СВОБОДНЫЙ слот. Павшие фишки уже
    // удалены из field (см. ниже), поэтому field содержит только живых, и
    // пустые слоты — это просто (field.length < FIELD_SLOTS). Новая фишка
    // встаёт в конец ряда (сохраняя порядок «бьют по порядку»). Происходит ДО
    // удара — новая фишка бьёт в этом же раунде.
    let broughtInLevel: number | null = null;
    if (
      data.bringInIndex !== undefined &&
      data.bringInIndex >= 0 &&
      data.bringInIndex < state.reserve.length &&
      state.field.length < FIELD_SLOTS
    ) {
      const [rc] = state.reserve.splice(data.bringInIndex, 1);
      state.field.push({
        templateId: rc.templateId,
        level: rc.level,
        hp: rc.hp,
        maxHp: rc.maxHp,
        alive: true,
        isTraining: rc.isTraining,
        atkMult: rc.atkMult,
        serialNo: rc.serialNo,
      });
      broughtInLevel = rc.level;
    }

    // Удар игрока — КАЖДАЯ живая фишка поля бьёт босса. Копим и суммарный урон,
    // и пофишковую разбивку (слот, уровень, урон) для читаемой анимации.
    const trialScale = (await getHallwayConfig()).boss.trialStatScale;
    let playerDmg = 0;
    const playerHits: Array<{ index: number; level: number; dmg: number }> = [];
    for (let i = 0; i < state.field.length; i++) {
      const c = state.field[i];
      if (!c.alive) continue;
      const [lo, hi] = powerOf(c.level);
      // Триал → trialScale; реальная фишка → множитель тиража (atkMult).
      const mult = c.isTraining ? trialScale : (c.atkMult ?? 1);
      const dmg =
        mult !== 1
          ? Math.max(1, Math.round(rollIn([lo * mult, hi * mult] as [number, number])))
          : rollIn([lo, hi] as [number, number]);
      playerDmg += dmg;
      playerHits.push({ index: i, level: c.level, dmg });
    }
    state.bossHp -= playerDmg;
    state.totalDamage += playerDmg;

    let bossDmg = 0;
    let targetLevel: number | null = null;
    let targetDied = false;
    let killed = false;
    let bossTarget: { index: number; level: number; dmg: number; died: boolean } | null = null;

    if (state.bossHp <= 0) {
      killed = true;
    } else {
      // Босс бьёт переднюю фишку (field[0] — ряд хранит только живых).
      // roundDamage уже с потолком R5.
      const dmg = Math.max(
        1,
        Math.round(roundDamage(round) * (1 + (Math.random() * 2 - 1) * DMG_VARIANCE)),
      );
      if (state.field.length > 0) {
        const target = state.field[0];
        bossDmg = dmg;
        targetLevel = target.level;
        target.hp -= dmg;
        targetDied = target.hp <= 0;
        // index/level/dmg для анимации смерти ЭТОГО раунда; сама фишка тут же
        // удаляется из field → слот освобождается (никаких «трупов»).
        bossTarget = { index: 0, level: target.level, dmg, died: targetDied };
        if (targetDied) state.field.shift();
      }
    }

    state.round = round + 1;

    // Строй пуст, а игрок не ввёл резерв этим ходом — бой закончен. Раньше
    // такую партию обрывал лимит в 30 раундов; без него она не кончалась бы
    // вовсе, и игрок оставался в «Идёт бой…».
    const idleEmptyField = state.field.length === 0 && data.bringInIndex === undefined;
    const wiped = state.field.length === 0 && (state.reserve.length === 0 || idleEmptyField);
    const overLimit = state.round > STALL_GUARD_ROUNDS;
    const ended = killed || wiped || overLimit;

    // roundInfo: суммарные playerDmg/bossDmg (для лога) + пофишковая разбивка
    // playerHits и bossTarget (кто/слот/урон/смерть) для анимации. Массивы —
    // только в ответе раунда, в jsonb-состоянии сессии их не храним.
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
      // Тот же захват: бой мог закрыть параллельный запрос.
      if (!(await closeBossSessionOnce(session.id))) {
        throw new Error("Этот бой уже завершён");
      }
      const boss = await pg.chipBoss.findOne({ id: session.boss_id });
      let result: {
        killed: boolean;
        totalDamage: number;
        likeAwarded: number;
        bossHpAfter: number;
      };
      if (boss) {
        result = await commitBossRun({
          wallet,
          boss,
          totalDamage: state.totalDamage,
          rounds: round,
          killed,
        });
      } else {
        result = { killed, totalDamage: state.totalDamage, likeAwarded: 0, bossHpAfter: 0 };
      }
      // отразить итог в state для отрисовки
      state.bossHp = result.bossHpAfter;
      await pg.chipBossSession.update(
        { id: session.id },
        {
          state: state as unknown,
          status: "done",
          updated_at: now,
        },
      );
      return { state, round: roundInfo, ended: true, result };
    }

    await pg.chipBossSession.update(
      { id: session.id },
      {
        state: state as unknown,
        updated_at: now,
      },
    );
    return { state, round: roundInfo, ended: false, result: null };
  });

// 4. Завершить/сдаться — коммит текущего урона, пометить done.
export const endBossFight = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const session = await loadActiveSession(data.sessionId, wallet);
    const state = session.state as BossSessionState;
    // Захват сессии ДО коммита: урон засчитывает только тот, кто её закрыл.
    if (!(await closeBossSessionOnce(session.id))) {
      throw new Error("Этот бой уже завершён");
    }
    const boss = await pg.chipBoss.findOne({ id: session.boss_id });
    let result: { killed: boolean; totalDamage: number; likeAwarded: number; bossHpAfter: number };
    if (boss) {
      result = await commitBossRun({
        wallet,
        boss,
        totalDamage: state.totalDamage,
        rounds: Math.max(0, state.round - 1),
        killed: state.bossHp <= 0,
      });
    } else {
      result = { killed: false, totalDamage: state.totalDamage, likeAwarded: 0, bossHpAfter: 0 };
    }
    state.bossHp = result.bossHpAfter;
    await pg.chipBossSession.update(
      { id: session.id },
      {
        state: state as unknown,
        status: "done",
        updated_at: new Date().toISOString(),
      },
    );
    return { state, ended: true, result };
  });

// ──────── Админ ────────
const rewardConfigBase = z.object({
  fillers: z
    .array(
      z.object({
        kind: z.enum(["likes", "tickets", "energy", "token"]),
        amount: z.number().min(0).default(0),
        token: z.string().nullable().optional(),
      }),
    )
    .default([]),
  split: z.array(z.number().min(0)).default([]),
  packs: z
    .array(
      z.object({
        packId: z.string().min(1),
        toPlace: z.number().int().min(1),
      }),
    )
    .default([]),
});
// Фонд недельного/мини-босса раздаётся каждую неделю без сверки со «Свободно
// USDT» — поэтому USDT в нём не ставится (ПРАВИЛА §8.49а).
const rewardConfigSchema = rewardConfigBase.refine((c) => !usdtInFillers(c), {
  message: USDT_BANNED_MSG,
});
const bossInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  imageUrl: z.string().nullable().optional(),
  // Для будущих боссов (asUpcoming) HP не задаётся — считается СКРИПТОМ при
  // активации: max_hp предыдущего × (1 + его hp_growth_pct/100).
  maxHp: z.number().int().min(1).optional(),
  hpGrowthPct: z.number().min(0).max(1000).default(HP_GROWTH_DEFAULT),
  active: z.boolean().default(true),
  asUpcoming: z.boolean().default(false),
  rewardConfig: rewardConfigSchema.optional(),
});

export const adminUpsertBoss = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => bossInput.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const now = new Date().toISOString();
    const cfg = data.rewardConfig
      ? data.rewardConfig
      : { fillers: [], split: [...DEFAULT_SPLIT], packs: [] };
    const activate = data.active && !data.asUpcoming;
    if (activate) {
      await mcpExec(`UPDATE yuplink.chip_boss SET active=false WHERE active=true;`);
    }
    if (data.id) {
      // Правка существующего: очередь (ordinal/queue_status) не трогаем.
      const patch: Partial<PgChipBoss> = {
        name: data.name,
        image_url: data.imageUrl ?? null,
        energy_cost: ENERGY_COST,
        dmg_base: DMG_BASE,
        dmg_growth: DMG_GROWTH,
        dmg_variance: DMG_VARIANCE,
        like_threshold: LIKE_THRESHOLD,
        like_reward: LIKE_REWARD,
        reward_tiers: cfg as unknown,
        hp_growth_pct: data.hpGrowthPct,
      };
      if (typeof data.maxHp === "number") patch.max_hp = data.maxHp;
      if (activate) patch.active = true;
      await pg.chipBoss.update({ id: data.id }, patch);
      return { id: data.id };
    }
    const id = `boss_${nanoid(8)}`;
    // Номер в очереди: следующий за максимальным.
    const ordRows = (await mcpExec(
      `SELECT COALESCE(MAX(ordinal),0)+1 AS next FROM yuplink.chip_boss;`,
      { wrapJson: true },
    )) as Array<{ next: number }>;
    const ordinal = Number(ordRows?.[0]?.next ?? 1);
    const upcoming = data.asUpcoming;
    // Для upcoming HP = 0 (плейсхолдер): реальный HP посчитает скрипт при
    // активации (closeBossWeek). Для активного — задан админом.
    const hp = upcoming ? 0 : (data.maxHp ?? 1);
    await pg.chipBoss.insert({
      id,
      name: data.name,
      image_url: data.imageUrl ?? null,
      max_hp: hp,
      current_hp: hp,
      energy_cost: ENERGY_COST,
      dmg_base: DMG_BASE,
      dmg_growth: DMG_GROWTH,
      dmg_variance: DMG_VARIANCE,
      like_threshold: LIKE_THRESHOLD,
      like_reward: LIKE_REWARD,
      active: upcoming ? false : data.active,
      killed_at: null,
      week_no: upcoming ? 0 : 1,
      week_started_at: now,
      reward_tiers: cfg as unknown,
      hp_growth_pct: data.hpGrowthPct,
      created_at: now,
      ordinal,
      queue_status: upcoming ? "upcoming" : data.active ? "active" : "defeated",
    });
    return { id };
  });

export const adminListBosses = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  const { data } = await pg.chipBoss.raw().select("*").order("ordinal", { ascending: true });
  return ((data ?? []) as PgChipBoss[]).map((b) => ({
    id: b.id,
    name: b.name,
    imageUrl: b.image_url,
    maxHp: Number(b.max_hp),
    currentHp: Number(b.current_hp),
    active: b.active,
    killedAt: b.killed_at,
    weekNo: b.week_no,
    rewardConfig: parseRewardConfig(b.reward_tiers),
    hpGrowthPct: Number(b.hp_growth_pct ?? HP_GROWTH_DEFAULT),
    ordinal: Number(b.ordinal ?? 0),
    isMini: !!b.is_mini,
    queueStatus: (b.queue_status ?? (b.active ? "active" : "defeated")) as
      | "defeated"
      | "active"
      | "upcoming"
      | "paused",
  }));
});

// Раздача ЗАБИРАЕМЫХ наград за убитого босса. Идемпотентно: если награды за
// (boss, week) уже есть — выходим (защита от повтора kill-хук + крон). Вызывается
// СРАЗУ при килле (commitBossRun/fightBoss) и как страховка из closeBossWeek.
async function distributeBossRewards(bossId: string): Promise<number> {
  const boss = await pg.chipBoss.findOne({ id: bossId });
  if (!boss) return 0;
  const wk = boss.week_no;
  const existing = (await mcpExec(
    `SELECT 1 FROM yuplink.chip_boss_reward WHERE boss_id=${sqlStr(bossId)} AND week_no=${wk} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<unknown>;
  if (existing && existing.length > 0) return 0; // уже роздано
  const now = new Date().toISOString();
  const cfg = parseRewardConfig(boss.reward_tiers);
  const recipients = new Set<string>();
  // Место в топе — на аккаунт, награда ложится туда же: забирать её будет тот
  // же игрок, каким бы адресом он ни вошёл.
  const lb = (await mcpExec(
    `SELECT r.account_id AS account, SUM(r.damage)::int AS total
       FROM yuplink.chip_boss_run r
      WHERE r.boss_id=${sqlStr(boss.id)} AND r.week_no=${wk}
      GROUP BY r.account_id ORDER BY total DESC;`,
    { wrapJson: true },
  )) as Array<{ account: string; total: number }>;
  const splitSum = cfg.split.reduce((a, x) => a + (Number(x) || 0), 0);
  const norm = cfg.split.map((x) => (splitSum > 0 ? (Number(x) || 0) / splitSum : 0));
  const places = Math.min(norm.length, lb.length);
  // Собираем все награды в массив, потом вставляем одним Promise.all.
  // Раньше — до 30 последовательных INSERT в цикле (N+1).
  const rows: Array<{
    id: string; boss_id: string; week_no: number; account_id: string;
    wallet: null; place: number; damage: number; reward_kind: string;
    reward_amount: number; pack_id: string | null; claimed_at: string | null;
    created_at: string;
  }> = [];
  for (const fl of cfg.fillers) {
    if (!(fl.amount > 0)) continue;
    let given = 0;
    for (let i = 0; i < places; i++) {
      let amt = Math.round(fl.amount * norm[i] * 100) / 100;
      if (given + amt > fl.amount) amt = Math.max(0, Math.round((fl.amount - given) * 100) / 100);
      given += amt;
      const val = fl.kind === "tickets" || fl.kind === "energy" ? Math.round(amt) : amt;
      if (val <= 0) continue;
      const kind = fl.kind === "token" && fl.token ? fl.token : fl.kind;
      rows.push({
        id: `brw_${nanoid(10)}`, boss_id: boss.id, week_no: wk,
        account_id: lb[i].account, wallet: null, place: i + 1, damage: lb[i].total,
        reward_kind: kind, reward_amount: val, pack_id: null,
        claimed_at: null, created_at: now,
      });
      recipients.add(lb[i].account);
    }
  }
  for (const pk of cfg.packs) {
    if (!pk.packId || pk.toPlace <= 0) continue;
    const top = Math.min(pk.toPlace, lb.length);
    for (let i = 0; i < top; i++) {
      rows.push({
        id: `brw_${nanoid(10)}`, boss_id: boss.id, week_no: wk,
        account_id: lb[i].account, wallet: null, place: i + 1, damage: lb[i].total,
        reward_kind: "pack", reward_amount: 0, pack_id: pk.packId,
        claimed_at: null, created_at: now,
      });
      recipients.add(lb[i].account);
    }
  }
  await Promise.all(rows.map((r) => pg.chipBossReward.insert(r)));
  try {
    const { sendTgMessageToAdmins } = await import("../tg");
    const top = lb.slice(0, 5);
    await sendTgMessageToAdmins(
      [
        `🏆 <b>Босс «${boss.name}» ПОВЕРЖЕН</b> (неделя ${wk})`,
        `Пул роздан сразу после килла — игроки забирают кнопкой. Топ-урон:`,
        ...top.map((r, i) => `${i + 1}. ${r.account} — ${r.total.toLocaleString()}`),
      ].join("\n"),
    );
  } catch (e) {
    console.warn("[distributeBossRewards] notify failed", e);
  }
  return recipients.size;
}

// Гейт: у кошелька есть незабранная награда → бить нового босса нельзя.
// Кто вне топа (наград нет) — не блокируется.
async function assertNoUnclaimedReward(wallet: string): Promise<void> {
  const acc = await accountOf(wallet);
  const rows = (await mcpExec(
    `SELECT 1 FROM yuplink.chip_boss_reward WHERE account_id = ${sqlStr(acc)} AND claimed_at IS NULL LIMIT 1;`,
    { wrapJson: true },
  )) as Array<unknown>;
  if (rows && rows.length > 0) throw new Error("Сначала забери награду за прошлого босса");
}

// Разрулить активного МИНИ-босса и вернуть вытесненного главного. Общий код для
// ручного «Завершить» (adminEndMiniBoss) и понедельничного крона (closeBossWeek).
// Убит → награды уже розданы при килле (тут идемпотентная страховка). Жив →
// отхил до макс, наград НЕТ. Мини прячем в историю (active=false, defeated).
// Главный (queue_status='paused') размораживаем как есть — HP/неделю не трогаем.
async function endMiniAndRestoreMain(
  mini: PgChipBoss,
): Promise<{ mainId: string | null; killed: boolean }> {
  const killed = Number(mini.current_hp) <= 0 || !!mini.killed_at;
  if (killed) {
    try {
      await distributeBossRewards(mini.id);
    } catch (e) {
      console.warn("[endMini] distribute failed", e);
    }
  } else {
    await mcpExec(
      `UPDATE yuplink.chip_boss SET current_hp=max_hp, killed_at=NULL WHERE id=${sqlStr(mini.id)};`,
    );
  }
  await mcpExec(
    `UPDATE yuplink.chip_boss SET active=false, queue_status='defeated' WHERE id=${sqlStr(mini.id)};`,
  );
  const main = await pg.chipBoss.findOne({ queue_status: "paused" });
  if (main) {
    await mcpExec(
      `UPDATE yuplink.chip_boss SET active=true, queue_status='active' WHERE id=${sqlStr(main.id)};`,
    );
  }
  return { mainId: main?.id ?? null, killed };
}

// Закрытие недели — вызывается КРОНОМ в понедельник (ручного нет).
// Если босс убит: фиксируем награды как ЗАБИРАЕМЫЕ (claimed_at=null) — игрок
// получает кнопкой; HP растёт на hp_growth_pct%. Не убит: просто отхил до макс.
// week_no+1, уведомление админам.
export async function closeBossWeek(
  bossId: string,
): Promise<{ weekClosed: number; killed: boolean; recipients: number } | null> {
  const boss = await pg.chipBoss.findOne({ id: bossId });
  if (!boss) return null;

  // ── Мини-босс НЕ участвует в недельном цикле очереди. В понедельник его
  // разруливаем (жив → отхил + спрятать, наград НЕТ; убит → награды уже розданы),
  // возвращаем вытесненного главного и закрываем ЕГО неделю как обычно.
  if (boss.is_mini) {
    const { mainId, killed } = await endMiniAndRestoreMain(boss);
    try {
      const { sendTgMessageToAdmins } = await import("../tg");
      await sendTgMessageToAdmins(
        `🐣 Мини-босс «${boss.name}» закрыт в понедельник (${killed ? "повержен, награды розданы" : "не повержен — награды НЕ выданы"}). Главный босс возвращён в бой.`,
      );
    } catch (e) {
      console.warn("[closeBossWeek/mini] notify failed", e);
    }
    if (mainId) return closeBossWeek(mainId);
    return { weekClosed: boss.week_no, killed, recipients: 0 };
  }

  const wk = boss.week_no;
  const killed = Number(boss.current_hp) <= 0 || !!boss.killed_at;
  // Награды раздаются СРАЗУ при килле; тут — идемпотентная страховка.
  const recipients = killed ? await distributeBossRewards(boss.id) : 0;

  const growth = Number(boss.hp_growth_pct ?? HP_GROWTH_DEFAULT);
  const newMax = killed
    ? Math.round(Number(boss.max_hp) * (1 + growth / 100))
    : Number(boss.max_hp);

  // ── Очередь боссов: если текущий УБИТ и есть запрограммированный
  // следующий (queue_status='upcoming') — переключаемся на него.
  // HP следующего = СКРИПТ: max_hp текущего × (1 + growth%). Побеждённый
  // остаётся в истории как есть (active=false, queue_status='defeated').
  let switchedTo: { id: string; name: string; hp: number } | null = null;
  if (killed) {
    const nextRows = (await mcpExec(
      `SELECT id, name, max_hp FROM yuplink.chip_boss
        WHERE queue_status='upcoming' ORDER BY ordinal ASC LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{ id: string; name: string; max_hp: number }>;
    if (nextRows.length > 0) {
      const next = nextRows[0];
      // HP следующего: если админ задал свой (>0) — берём его; иначе скриптовый.
      const nextMax = Number(next.max_hp) > 0 ? Number(next.max_hp) : newMax;
      await mcpExec(
        `UPDATE yuplink.chip_boss
           SET active=false, queue_status='defeated'
         WHERE id=${sqlStr(boss.id)};`,
      );
      await mcpExec(
        `UPDATE yuplink.chip_boss
           SET active=true, queue_status='active',
               max_hp=${nextMax}, current_hp=${nextMax},
               week_no=${wk + 1}, week_started_at=now(), killed_at=NULL
         WHERE id=${sqlStr(next.id)};`,
      );
      switchedTo = { id: next.id, name: next.name, hp: nextMax };
    }
  }
  if (!switchedTo) {
    // Очереди нет (или босс жив) — прежнее поведение: тот же босс, неделя+1.
    await mcpExec(
      `UPDATE yuplink.chip_boss
         SET week_no=week_no+1, max_hp=${newMax}, current_hp=${newMax},
             killed_at=NULL, week_started_at=now()
       WHERE id=${sqlStr(boss.id)};`,
    );
  }

  try {
    const { sendTgMessageToAdmins } = await import("../tg");
    const top = killed
      ? ((await mcpExec(
          `SELECT account_id AS account, SUM(damage)::int AS total FROM yuplink.chip_boss_run
        WHERE boss_id=${sqlStr(boss.id)} AND week_no=${wk}
        GROUP BY account_id ORDER BY total DESC LIMIT 5;`,
          { wrapJson: true },
        )) as Array<{ account: string; total: number }>)
      : [];
    const msg = killed
      ? [
          `🏆 <b>Босс «${boss.name}» ПОВЕРЖЕН</b> (неделя ${wk})`,
          `Пул роздан — игроки забирают награды. Топ-урон:`,
          ...top.map((r, i) => `${i + 1}. ${r.account} — ${r.total.toLocaleString()}`),
          ``,
          switchedTo
            ? `Следующий босс из очереди: «${switchedTo.name}» · HP ${switchedTo.hp.toLocaleString()}.`
            : `Новый босс: HP ${newMax.toLocaleString()} (+${growth}%).`,
          `⚙️ Пора утвердить пул наград на новую неделю.`,
        ].join("\n")
      : [
          `⌛ Босс «${boss.name}» НЕ повержен (неделя ${wk}).`,
          `Награды не разданы. HP сброшен: ${newMax.toLocaleString()}.`,
          `⚙️ Можно скорректировать HP/пул.`,
        ].join("\n");
    await sendTgMessageToAdmins(msg);
  } catch (e) {
    console.warn("[closeBossWeek] notify failed", e);
  }

  return { weekClosed: wk, killed, recipients };
}

export const adminListRewardTokens = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  const { data } = await pg.rewardTokens
    .raw()
    .select("symbol")
    .order("symbol", { ascending: true });
  return ((data ?? []) as Array<{ symbol: string }>).map((t) => t.symbol);
});

export const adminResetBossHp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await mcpExec(
      `UPDATE yuplink.chip_boss SET current_hp=max_hp, killed_at=NULL WHERE id=${sqlStr(data.id)};`,
    );
    return { ok: true };
  });

// АДМИН: «Выпустить следующего босса» — то же, что делает недельный крон при
// килле, но по кнопке, не дожидаясь понедельника. Гейт: текущий босс ДОЛЖЕН быть
// повержен (иначе нельзя пропустить живого). Если в очереди есть upcoming-босс —
// переключаемся на него (HP+growth%, неделя+1); иначе тот же босс воскресает с
// выросшим HP. Награды за прошлую неделю раздаются идемпотентно внутри
// closeBossWeek (страховка — они уже розданы в момент killed).
export const adminReleaseNextBoss = createServerFn({ method: "POST" }).handler(async () => {
  requireAdmin();
  const boss = await pg.chipBoss.findOne({ active: true });
  if (!boss) throw new Error("Активный босс не найден");
  if (boss.is_mini)
    throw new Error(
      "Сейчас активен мини-босс — заверши его, прежде чем управлять очередью главных боссов",
    );
  const defeated = Number(boss.current_hp) <= 0 || !!boss.killed_at;
  if (!defeated) {
    throw new Error("Текущий босс ещё жив — выпустить следующего можно только после победы");
  }
  const upcoming = (await mcpExec(
    `SELECT name FROM yuplink.chip_boss
        WHERE queue_status='upcoming' ORDER BY ordinal ASC LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ name: string }>;
  const res = await closeBossWeek(boss.id);
  return {
    ok: true as const,
    switched: upcoming.length > 0,
    nextName: upcoming[0]?.name ?? boss.name,
    weekClosed: res?.weekClosed ?? boss.week_no,
  };
});

// АДМИН: «Запустить сейчас» конкретного босса из очереди (upcoming) — даже если
// текущий главный ещё ЖИВ (в отличие от adminReleaseNextBoss). Текущий активный
// главный уходит в историю (defeated, БЕЗ наград — он не был убит). Целевой босс
// активируется: HP = свой заданный (>0), иначе скрипт от текущего (HP × (1+рост%)).
// Неделя 1. Мини-боссов не трогаем.
export const adminForceActivateBoss = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const target = await pg.chipBoss.findOne({ id: data.id });
    if (!target) throw new Error("Босс не найден");
    if (target.is_mini) throw new Error("Мини-босса нельзя запускать этой кнопкой");
    if (target.active) throw new Error("Этот босс уже активен");
    const current = await pg.chipBoss.findOne({ active: true });
    if (current?.is_mini) throw new Error("Сейчас активен мини-босс — сначала заверши его");
    // HP цели: свой (если задан >0), иначе скрипт от текущего активного.
    let hp = Number(target.max_hp);
    if (!(hp > 0)) {
      const base = current ? Number(current.max_hp) : 0;
      const growth = current ? Number(current.hp_growth_pct ?? HP_GROWTH_DEFAULT) : 0;
      hp = base > 0 ? Math.round(base * (1 + growth / 100)) : 1;
    }
    if (current) {
      await mcpExec(
        `UPDATE yuplink.chip_boss SET active=false, queue_status='defeated' WHERE id=${sqlStr(current.id)};`,
      );
    }
    await mcpExec(
      `UPDATE yuplink.chip_boss
         SET active=true, queue_status='active', is_mini=false,
             max_hp=${hp}, current_hp=${hp},
             week_no=1, week_started_at=now(), killed_at=NULL
       WHERE id=${sqlStr(target.id)};`,
    );
    try {
      const { sendTgMessageToAdmins } = await import("../tg");
      await sendTgMessageToAdmins(
        `🚀 Босс «${target.name}» запущен вручную · HP ${hp.toLocaleString()}${current ? ` (предыдущий «${current.name}» ушёл в историю)` : ""}.`,
      );
    } catch (e) {
      console.warn("[forceActivate] notify failed", e);
    }
    return { ok: true as const, name: target.name, hp };
  });

// ──────── МИНИ-БОСС: разовое админ-событие ────────
// Мини-босс временно ЗАМЕЩАЕТ главного: у него свой boss_id (лидерборд/награды
// изолированы), свой пул, HP задаётся напрямую (без роста). Пока он активен,
// главный «на паузе» (queue_status='paused', состояние заморожено). Так как мини
// становится ЕДИНСТВЕННЫМ active-боссом, весь боевой контур (getActiveBoss,
// fightBoss, клейм, килл-хук с раздачей наград) работает без изменений.
// Возврат главного: вручную кнопкой (adminEndMiniBoss) или в понедельник (крон).
const miniBossInput = z.object({
  name: z.string().min(1),
  imageUrl: z.string().nullable().optional(),
  maxHp: z.number().int().min(1),
  rewardConfig: rewardConfigSchema.optional(),
});

export const adminReleaseMiniBoss = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => miniBossInput.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const active = await pg.chipBoss.findOne({ active: true });
    if (!active) throw new Error("Нет активного главного босса — мини-босса выпускать не над кем");
    if (active.is_mini) throw new Error("Мини-босс уже выпущен — сначала заверши текущего");
    const now = new Date().toISOString();
    const cfg = data.rewardConfig ?? { fillers: [], split: [...DEFAULT_SPLIT], packs: [] };
    // Замораживаем главного как есть (HP/неделю не трогаем) — вернём после мини.
    await mcpExec(
      `UPDATE yuplink.chip_boss SET active=false, queue_status='paused' WHERE id=${sqlStr(active.id)};`,
    );
    const id = `mboss_${nanoid(8)}`;
    const ordRows = (await mcpExec(
      `SELECT COALESCE(MAX(ordinal),0)+1 AS next FROM yuplink.chip_boss;`,
      { wrapJson: true },
    )) as Array<{ next: number }>;
    const ordinal = Number(ordRows?.[0]?.next ?? 1);
    await pg.chipBoss.insert({
      id,
      name: data.name,
      image_url: data.imageUrl ?? null,
      max_hp: data.maxHp,
      current_hp: data.maxHp,
      energy_cost: ENERGY_COST,
      dmg_base: DMG_BASE,
      dmg_growth: DMG_GROWTH,
      dmg_variance: DMG_VARIANCE,
      like_threshold: LIKE_THRESHOLD,
      like_reward: LIKE_REWARD,
      active: true,
      killed_at: null,
      week_no: 1,
      week_started_at: now,
      reward_tiers: cfg as unknown,
      hp_growth_pct: 0,
      created_at: now,
      ordinal,
      queue_status: "active",
      is_mini: true,
    });
    try {
      const { sendTgMessageToAdmins } = await import("../tg");
      await sendTgMessageToAdmins(
        `🐣 <b>Мини-босс «${data.name}» ВЫПУЩЕН</b> · HP ${data.maxHp.toLocaleString()}.\n` +
          `Главный босс «${active.name}» на паузе — вернётся после победы над мини (кнопкой) или в понедельник.`,
      );
    } catch (e) {
      console.warn("[releaseMini] notify failed", e);
    }
    return { id, pausedMain: active.name };
  });

export const adminEndMiniBoss = createServerFn({ method: "POST" }).handler(async () => {
  requireAdmin();
  const mini = await pg.chipBoss.findOne({ active: true, is_mini: true });
  if (!mini) throw new Error("Активный мини-босс не найден");
  const { mainId, killed } = await endMiniAndRestoreMain(mini);
  let restoredMain: string | null = null;
  if (mainId) {
    const m = await pg.chipBoss.findOne({ id: mainId });
    restoredMain = m?.name ?? null;
  }
  try {
    const { sendTgMessageToAdmins } = await import("../tg");
    await sendTgMessageToAdmins(
      `🐣 Мини-босс «${mini.name}» завершён вручную (${killed ? "повержен, награды розданы" : "не повержен — награды НЕ выданы"}).` +
        (restoredMain ? ` Главный босс «${restoredMain}» возвращён в бой.` : ""),
    );
  } catch (e) {
    console.warn("[endMini] notify failed", e);
  }
  return { ok: true as const, killed, restoredMain };
});
