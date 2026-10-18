// Прихожа v2 · серверная механика (server-authoritative, клиентские значения
// НИКОГДА не в доверии). Добыча: тап → осознанность (× звёзды сильнейшей фишки),
// реген тап-пула (+1/мин за звезду по топ-N), сундук-гача (динам. цена, гарант.
// награда, L5-гейт на фишки), 30-дневный марафон (строгий стрик). Выпуск —
// releaseHallway.ts (Шаг 6), босс — boss.ts (Шаг 7), конфиг — hallwayConfig.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { randomInt } from "node:crypto";
import { pg } from "../db/pg";
import type { PgHallwayTrainingChip } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { getHallwayConfig, type HallwayConfig } from "./hallwayConfig";
import { getSisterWallets, invalidateTicketsCache } from "./user";
import { actionGate } from "../rateGate";
import { accountOf } from "./user-shared";
import { accountIdOf } from "./user-shared";

// ──────── RNG (crypto) ────────
const randI = (min: number, max: number) => (max <= min ? min : randomInt(min, max + 1)); // inclusive
const randF = () => randomInt(0, 1_000_000) / 1_000_000; // [0,1)

function requireAdmin(wallet: string | null): void {
  if (!isAdminWallet(wallet)) throw new Error("Только админ");
}

// ──────── yupik / level helpers ────────
async function getOrCreateYupik(
  wallet: string,
): Promise<NonNullable<Awaited<ReturnType<typeof pg.hallwayYupiks.findOne>>>> {
  // Юпик — один на игрока, поэтому ищем его по аккаунту, а не по адресу.
  const account = await accountOf(wallet);
  let y = await pg.hallwayYupiks.findOne({ account_id: account });
  if (!y) {
    const me = await pg.users.findOne({ wallet });
    const nowIso = new Date().toISOString();
    // Старт: L1, 0 EXP. На входе даём 1× 1★ фишку (на тап-иконку + реген).
    y = {
      account_id: account,
      wallet,
      telegram_id: me?.telegram_id ?? null,
      level: 1,
      exp: 0,
      awareness: 0,
      tap_pool: 0,
      last_regen_at: nowIso,
      chest_open_count: 0,
      pending_chests: 0,
      marathon_day: 0,
      marathon_reward_days: [],
      marathon_last_claim_day: null,
      released: false,
      released_at: null,
      released_tickets: 0,
      last_collect_at: null,
      last_petting_at: null,
      last_daily_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    };
    // Один юпик на игрока: правило держат уникальные индексы по account_id и
    // по telegram_id. Гонка двух вкладок → вторая вставка падает, и мы садимся
    // на уже созданный юпик (стартовую фишку он уже получил).
    try {
      await pg.hallwayYupiks.insert(y);
    } catch (e) {
      const mine = await pg.hallwayYupiks.findOne({ account_id: account });
      if (mine) return mine;
      if (me?.telegram_id != null) {
        const { data } = await pg.hallwayYupiks
          .raw()
          .select("*")
          .eq("telegram_id", me.telegram_id)
          .order("created_at", { ascending: true })
          .limit(1);
        const sib = (data ?? [])[0] as typeof y | undefined;
        if (sib) return sib;
      }
      throw e; // не конфликт telegram_id — пробрасываем
    }
    // Стартовая фишка 1★ (только если МЫ создали юпик).
    await pg.hallwayTrainingChips.insert({
      id: `htc_${nanoid(10)}`,
      account_id: account,
      wallet,
      telegram_id: me?.telegram_id ?? null,
      star: 1,
      source: "starter",
      obtained_at: nowIso,
      consumed_at: null,
    });
    bustTopChipsCache();
  }
  // Self-heal (v1-мигрант без фишек) НЕ здесь: getOrCreateYupik зовётся на КАЖДЫЙ
  // тап, а findMany(chips) на каждый тап = треть лишних чтений горячего пути.
  // Перенесён в getMyHallwayState (раз при загрузке экрана, из loadTopChips).
  return y;
}

// Конфиг уровня (EXP до след., окно в часах). Потолок пока L15 (L16-23 позже).
const MAX_LEVEL = 15;
// Кэш строк hallway_levels (15 штук, меняются только из админки). Тап читает
// getLevelConfig на КАЖДЫЙ вызов — без кэша это лишний SELECT на тап.
type LevelCfg = {
  level_no: number;
  exp_to_next: number;
  window_hours: number;
  yupik_image_url: string | null;
};
const _levelCache = new Map<number, { value: LevelCfg; at: number }>();
const LEVEL_TTL_MS = 60_000;
/** Сбросить кэш уровней (звать после админ-редактирования hallway_levels). */
export function bustHallwayLevelCache(): void {
  _levelCache.clear();
}
async function getLevelConfig(level: number): Promise<LevelCfg> {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, level));
  const c = _levelCache.get(clamped);
  if (c && Date.now() - c.at < LEVEL_TTL_MS) return c.value;
  const r = await pg.hallwayLevels.findOne({ level_no: clamped });
  const value: LevelCfg = {
    level_no: clamped,
    exp_to_next: r?.exp_to_next ?? 80,
    window_hours: r?.window_hours ?? 1,
    yupik_image_url: r?.yupik_image_url ?? null,
  };
  _levelCache.set(clamped, { value, at: Date.now() });
  return value;
}

/** Применяет EXP и поднимает уровень (EXP-кривая из hallway_levels). */
async function applyExpGain(
  wallet: string,
  expDelta: number,
): Promise<{ levelUps: number; newLevel: number; newExp: number }> {
  const y = await getOrCreateYupik(wallet);
  let exp = y.exp + Math.max(0, Math.round(expDelta));
  let level = y.level;
  let levelUps = 0;
  for (let i = 0; i < 30; i++) {
    const cfg = await getLevelConfig(level);
    if (cfg.exp_to_next <= 0) break; // L23 — потолок
    if (exp < cfg.exp_to_next) break;
    exp -= cfg.exp_to_next;
    level++;
    levelUps++;
  }
  await pg.hallwayYupiks.update({ wallet }, { exp, level, updated_at: new Date().toISOString() });
  return { levelUps, newLevel: level, newExp: exp };
}

// ──────── training-chip helpers ────────
// Кэш фишек прихожи per-wallet. При ТАПЕ фишки не меняются — незачем читать их
// на каждый тап. Мутации, меняющие фишки (сундук/марафон/обмен/выпуск), зовут
// bustTopChipsCache. TTL 12с — страховка от кросс-sister рассинхрона.
const _topChipsCache = new Map<
  string,
  { chips: PgHallwayTrainingChip[]; top: PgHallwayTrainingChip[]; at: number }
>();
const TOP_CHIPS_TTL_MS = 12_000;
// Чистим ВЕСЬ кэш (фишки общие per-TG, ключ — session-кош; чистить только его
// значит промахнуться по сёстрам). Смена фишек редка против тапов — дёшево.
function bustTopChipsCache(): void {
  _topChipsCache.clear();
}

async function loadTopChips(
  wallet: string,
  cfg: HallwayConfig,
): Promise<{ chips: PgHallwayTrainingChip[]; top: PgHallwayTrainingChip[] }> {
  const cached = _topChipsCache.get(wallet);
  if (cached && Date.now() - cached.at < TOP_CHIPS_TTL_MS) {
    return { chips: cached.chips, top: cached.top };
  }
  // Фишки прихожи — общий инвентарь аккаунта.
  const { getSisterWallets } = await import("./user");
  const sisters = await getSisterWallets(wallet);
  const { data } = await pg.hallwayTrainingChips.raw().select("*").eq("account_id", await accountOf(wallet));
  const all = (data ?? []) as PgHallwayTrainingChip[];
  const live = all.filter((c) => !c.consumed_at);
  const sorted = [...live].sort((a, b) => b.star - a.star);
  const top = sorted.slice(0, cfg.regen.topN);
  _topChipsCache.set(wallet, { chips: live, top, at: Date.now() });
  return { chips: live, top };
}

const starMult = (star: number, cfg: HallwayConfig): number =>
  cfg.tap.starMultipliers[String(star) as keyof typeof cfg.tap.starMultipliers] ?? 1;

const regenPerMin = (top: PgHallwayTrainingChip[], cfg: HallwayConfig): number =>
  top.reduce((s, c) => s + c.star, 0) * cfg.regen.perStarPerMin;

const strongestStar = (top: PgHallwayTrainingChip[]): number =>
  top.reduce((m, c) => Math.max(m, c.star), 0);

/** Досчитывает реген тап-пула. Возвращает settled-пул + новый якорь. */
function settleRegen(
  y: { tap_pool: number; last_regen_at: string },
  windowHours: number,
  rpm: number,
): { tapPool: number; poolLimit: number; lastRegenAt: string } {
  const now = Date.now();
  const last = new Date(y.last_regen_at).getTime();
  const poolLimit = Math.round(windowHours * 60 * rpm);
  if (rpm <= 0) {
    return { tapPool: y.tap_pool, poolLimit, lastRegenAt: new Date(now).toISOString() };
  }
  // Копим ЦЕЛЫЕ тапы по мере поступления (rpm/60 тап/сек), а не лампой раз в
  // минуту → пул растёт по +1 каждые ~60/rpm сек. tap_pool = bigint (дроби
  // нельзя), поэтому именно целые тапы; «съеденное» ими время двигаем в якорь,
  // остаток (доля тапа) сохраняем — ничего не теряется. Реген остаётся ЛЕНИВЫМ
  // (считается при тапе/чтении, без фоновых записей) — нагрузка не растёт.
  const perSec = rpm / 60;
  const elapsedSec = Math.max(0, (now - last) / 1000);
  const tapsToAdd = Math.floor(elapsedSec * perSec);
  const tapPool = Math.min(poolLimit, y.tap_pool + tapsToAdd);
  const secConsumed = tapsToAdd / perSec; // ≤ elapsedSec (floor) → якорь ≤ now
  const anchor = last + secConsumed * 1000;
  return { tapPool, poolLimit, lastRegenAt: new Date(anchor).toISOString() };
}

/** Цена сундука: база, далее строго +growthPct% ИТЕРАТИВНО с округлением вниз
 *  на каждом шаге — floor(price × 1.1). Ровный рост 10→11→12→13→14→15→16…,
 *  без скачков компаунда (floor(base·1.1^n) давал 14→16→17→19→21). */
function chestPriceFor(cfg: HallwayConfig, count: number): number {
  const g = 1 + cfg.chest.priceGrowthPct / 100;
  let price = cfg.chest.basePrice;
  for (let i = 0; i < Math.max(0, count); i++) price = Math.floor(price * g);
  return Math.max(cfg.chest.priceFloor, price);
}

// ──────── PUBLIC: state ────────
export const getMyHallwayState = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return null;
  const cfg = await getHallwayConfig();
  const y = await getOrCreateYupik(wallet);
  const levelCfg = await getLevelConfig(y.level);
  const nextCfg = await getLevelConfig(y.level + 1);
  let { chips, top } = await loadTopChips(wallet, cfg);
  // Self-heal (перенесён из горячего пути тапа): существующий юпик без единой
  // фишки (v1-мигрант/пропущенный старт) → выдаём стартовую 1★ ОДИН раз при
  // загрузке экрана, иначе нечего тапать (rpm=0). Не бьёт на каждый тап.
  if (chips.length === 0 && !y.released) {
    await pg.hallwayTrainingChips.insert({
      id: `htc_${nanoid(10)}`,
      wallet: y.wallet,
      telegram_id: y.telegram_id,
      star: 1,
      source: "starter",
      obtained_at: new Date().toISOString(),
      consumed_at: null,
    });
    bustTopChipsCache();
    ({ chips, top } = await loadTopChips(wallet, cfg));
  }
  const rpm = regenPerMin(top, cfg);
  const settle = settleRegen(y, levelCfg.window_hours, rpm);
  const strongest = strongestStar(top);

  // инвентарь по звёздам
  const byStar: Record<string, number> = {};
  for (const c of chips) {
    const k = String(c.star);
    byStar[k] = (byStar[k] ?? 0) + 1;
  }
  const topStars = top.map((c) => c.star).sort((a, b) => b - a);

  // Что ПЕРЕЙДЁТ при выпуске — совпадает с releaseHallway (иначе превью врёт):
  // топ-N по (звезда↓, купленные первыми при равенстве, obtained↑) + ВСЕ
  // купленные (source='stars') вне топ-N. Купленные нельзя не перенести →
  // может перейти БОЛЬШЕ N. Группируем по звёздности для превью.
  const relNeed = cfg.release.requiredTopChips;
  const isBought = (c: PgHallwayTrainingChip) => c.source === "stars";
  const relSorted = [...chips].sort(
    (a, b) =>
      b.star - a.star ||
      (isBought(b) ? 1 : 0) - (isBought(a) ? 1 : 0) ||
      (a.obtained_at < b.obtained_at ? -1 : a.obtained_at > b.obtained_at ? 1 : 0),
  );
  const relTopN = relSorted.slice(0, relNeed);
  const relTopSet = new Set(relTopN.map((c) => c.id));
  const relKeep = [...relTopN, ...relSorted.filter((c) => isBought(c) && !relTopSet.has(c.id))];
  const releaseByStar: Record<string, number> = {};
  for (const c of relKeep) releaseByStar[String(c.star)] = (releaseByStar[String(c.star)] ?? 0) + 1;

  // цена следующего сундука
  const chestPrice = chestPriceFor(cfg, y.chest_open_count);

  // марафон: можно ли забрать сегодня
  const todayUTC = new Date().toISOString().slice(0, 10);
  const claimableToday = y.marathon_last_claim_day !== todayUTC;

  return {
    level: y.level,
    exp: y.exp,
    expToNext: levelCfg.exp_to_next,
    windowHours: levelCfg.window_hours,
    awareness: Number(y.awareness),
    tapPool: settle.tapPool,
    poolLimit: settle.poolLimit,
    regenPerMin: rpm,
    strongestStar: strongest,
    strongestMult: starMult(strongest, cfg),
    // Осознанность за ОДИН тап (без округления) — клиент копит тапы локально
    // и рисует оптимистично точно как сервер (round(base*mult*taps,2)), без
    // отскока. baseAwareness × множитель сильнейшей фишки.
    tapUnitGain: cfg.tap.baseAwareness * starMult(strongest, cfg),
    tapBaseAwareness: cfg.tap.baseAwareness,
    chipCount: chips.length,
    chipsByStar: byStar,
    topStars,
    // Что перейдёт при выпуске (топ-N + купленные вне топ-N), по звёздам + всего.
    releaseChips: releaseByStar,
    releaseCount: relKeep.length,
    topChipCount: top.length,
    pendingChests: y.pending_chests ?? 0,
    chestPrice,
    chestImage: cfg.images.chest,
    // Кастомные картинки фишек по звёздам (админка) — прихожа рисует их
    // вместо иконки-звезды, если задано. {star: url}.
    chipImages: (cfg.images.chipByStar ?? {}) as Record<string, string>,
    yupikImageUrl: cfg.images.yupikByLevel[String(y.level)] ?? levelCfg.yupik_image_url ?? null,
    yupikImageUrlNext:
      cfg.images.yupikByLevel[String(y.level + 1)] ?? nextCfg.yupik_image_url ?? null,
    chipUnlockLevel: cfg.chest.chip.unlockLevel,
    chipsUnlocked: y.level >= cfg.chest.chip.unlockLevel,
    marathon: {
      day: y.marathon_day,
      claimableToday,
      schedule: cfg.marathon.schedule,
      banner: cfg.images.marathonBanner,
      // Дни, за которые тангибл-награда (фишка/сундук) уже забрана — повторно
      // НЕ выдаётся (даже после сброса стрика). Клиент гасит их в сетке.
      rewardDays: Array.isArray(y.marathon_reward_days) ? (y.marathon_reward_days as number[]) : [],
    },
    release: {
      requiredTopChips: cfg.release.requiredTopChips,
      gateLevel: cfg.release.gateLevel,
      eligible: y.level >= cfg.release.gateLevel && top.length >= cfg.release.requiredTopChips,
      estTickets: Math.min(
        cfg.release.ticketCap,
        top
          .slice(0, cfg.release.requiredTopChips)
          .reduce((s, c) => s + c.star * cfg.release.ticketPerStar, 0),
      ),
      ticketCap: cfg.release.ticketCap,
    },
    released: y.released,
  };
});

// ──────── PUBLIC: tap ────────
export const tapYupik = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ taps: z.number().int().min(1).max(100000).default(1) }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    // Анти-флуд-лимит УБРАН (мешал быстрому ручному тапу — «слишком часто»).
    // От нагрузки защищает клиентская буферизация (одна запись ~раз в 1.2с) и
    // клэмп по пулу (автокликер ничего не нафармит сверх регена).
    assertNotMaintenance(wallet);
    await actionGate("hallway-chest", wallet);
    const cfg = await getHallwayConfig();
    const y = await getOrCreateYupik(wallet);
    if (y.released) throw new Error("Прихожая пройдена — добыча выключена");
    const yw = y.wallet; // канонический кош юпика (per-TG)

    const levelCfg = await getLevelConfig(y.level);
    const { top } = await loadTopChips(wallet, cfg);
    const rpm = regenPerMin(top, cfg);
    const settle = settleRegen(y, levelCfg.window_hours, rpm);
    const pool = Math.floor(settle.tapPool);
    if (pool < 1) {
      await pg.hallwayYupiks.update(
        { wallet: yw },
        { tap_pool: settle.tapPool, last_regen_at: settle.lastRegenAt },
      );
      return {
        ok: false,
        error: "pool_empty",
        tapPool: pool,
        poolLimit: settle.poolLimit,
        regenPerMin: rpm,
      };
    }
    // Сервер сам решает сколько тапов реально прошло (кламп по пулу).
    const spend = Math.min(pool, data.taps);
    const mult = starMult(strongestStar(top), cfg);
    // Осознанность ДРОБНАЯ (буст фишек): 1 тап 2.5★ = 1.25 осозн, а списывается
    // ровно 1 тап. Округляем до сотых, чтобы множитель реально работал (раньше
    // Math.round убивал дробь: 1.25 → 1).
    const gain = Math.round(cfg.tap.baseAwareness * mult * spend * 100) / 100;
    const newPool = settle.tapPool - spend;
    const newAwareness = Math.round((Number(y.awareness) + gain) * 100) / 100;
    await pg.hallwayYupiks.update(
      { wallet: yw },
      {
        tap_pool: newPool,
        awareness: newAwareness,
        last_regen_at: settle.lastRegenAt,
        updated_at: new Date().toISOString(),
      },
    );
    return {
      ok: true,
      spent: spend,
      awarenessGain: gain,
      awareness: newAwareness,
      tapPool: Math.floor(newPool),
      poolLimit: settle.poolLimit,
      regenPerMin: rpm,
      mult,
    };
  });

// ──────── chest roll (server-side, config-driven) ────────
type ChestReward =
  | { kind: "premium_exp"; amount: number }
  | { kind: "exp"; amount: number }
  | { kind: "awareness"; amount: number }
  | { kind: "chip"; star: number };

function rollChest(level: number, price: number, cfg: HallwayConfig): ChestReward {
  const r = randF() * 100; // 0..100
  const premium = cfg.chest.premiumExp.chancePct;
  if (r < premium) {
    return {
      kind: "premium_exp",
      amount: randI(cfg.chest.premiumExp.min, cfg.chest.premiumExp.max),
    };
  }
  let offset = premium;
  if (level >= cfg.chest.chip.unlockLevel) {
    const chipBand = cfg.chest.chip.totalChancePct;
    if (r < offset + chipBand) {
      const rel = r - offset;
      let cum = 0;
      for (const star of [1, 1.5, 2, 2.5, 3]) {
        cum += cfg.chest.chip.stars[String(star) as keyof typeof cfg.chest.chip.stars] ?? 0;
        if (rel < cum) return { kind: "chip", star };
      }
      // округление весов не покрыло — падаем в split
    }
    offset += chipBand;
  }
  // остаток поровну осознанность / EXP
  const rest = r - offset;
  const span = Math.max(0.0001, 100 - offset);
  if (rest < span / 2) {
    const pct = randI(cfg.chest.cashback.minPct, cfg.chest.cashback.maxPct);
    return { kind: "awareness", amount: Math.ceil((price * pct) / 100) };
  }
  return { kind: "exp", amount: randI(cfg.chest.exp.min, cfg.chest.exp.max) };
}

async function applyChestReward(
  wallet: string,
  reward: ChestReward,
  tgId: number | null,
): Promise<void> {
  if (reward.kind === "chip") {
    await pg.hallwayTrainingChips.insert({
      id: `htc_${nanoid(10)}`,
      wallet,
      telegram_id: tgId,
      star: reward.star,
      source: "chest",
      obtained_at: new Date().toISOString(),
      consumed_at: null,
    });
    bustTopChipsCache(); // новая фишка → пересчитать топ/множитель
  } else if (reward.kind === "exp" || reward.kind === "premium_exp") {
    await applyExpGain(wallet, reward.amount);
  } else if (reward.kind === "awareness") {
    const fresh = await pg.hallwayYupiks.findOne({ wallet });
    await pg.hallwayYupiks.update(
      { wallet },
      {
        awareness: Math.round((Number(fresh?.awareness ?? 0) + reward.amount) * 100) / 100,
        updated_at: new Date().toISOString(),
      },
    );
  }
}

// ──────── PUBLIC: buy + open chest ────────
export const buyOpenChest = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) throw new Error("Кошелёк не подключён");
  assertNotMaintenance(wallet);
  const cfg = await getHallwayConfig();
  const y = await getOrCreateYupik(wallet);
  if (y.released) throw new Error("Прихожая пройдена — добыча выключена");
  const yw = y.wallet; // канонический кош юпика (per-TG)

  const price = chestPriceFor(cfg, y.chest_open_count);
  // Списание с гардом ВНУТРИ запроса. Прежняя пара «прочитал — записал
  // абсолютом» пропускала параллельные нажатия: оба видели один остаток,
  // оба получали сундук, а осознанность уходила один раз.
  const { guardedSpend } = await import("./guarded-spend");
  const { sqlStr } = await import("./chips-utils");
  const paid = await guardedSpend({
    table: "yuplink.hallway_yupiks",
    where: `wallet = ${sqlStr(yw)}`,
    set: `awareness = round((awareness - ${Number(price)})::numeric, 2), chest_open_count = chest_open_count + 1`,
    cond: `awareness >= ${Number(price)}`,
    ret: "chest_open_count",
  });
  if (!paid.ok) {
    throw new Error(`Нужно ${price} осознанности, у тебя ${y.awareness}`);
  }
  const reward = rollChest(y.level, price, cfg);
  await applyChestReward(yw, reward, y.telegram_id);

  // аудит
  await pg.hallwayChestOpenings.insert({
    id: `hco_${nanoid(10)}`,
    wallet: yw,
    chest_id: "training",
    prize_kind: reward.kind,
    prize_amount: reward.kind === "chip" ? 0 : reward.amount,
    prize_token: null,
    source: "purchase",
    source_ref: reward.kind === "chip" ? String(reward.star) : null,
    opened_at: new Date().toISOString(),
  });

  const fresh = await pg.hallwayYupiks.findOne({ wallet: yw });
  const nextPrice = chestPriceFor(cfg, fresh?.chest_open_count ?? 0);
  return {
    ok: true,
    reward,
    awareness: Number(fresh?.awareness ?? 0),
    level: fresh?.level ?? y.level,
    nextChestPrice: nextPrice,
  };
});

// ──────── PUBLIC: marathon ────────
export const marathonClaim = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) throw new Error("Кошелёк не подключён");
  assertNotMaintenance(wallet);
  const cfg = await getHallwayConfig();
  const y = await getOrCreateYupik(wallet);
  if (y.released) throw new Error("Прихожая пройдена");
  const yw = y.wallet; // канонический кош юпика (per-TG)

  const today = new Date();
  const todayUTC = today.toISOString().slice(0, 10);
  if (y.marathon_last_claim_day === todayUTC) {
    throw new Error("Награду за сегодня уже забрал");
  }
  const yesterdayUTC = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10);
  // Строгий стрик: продолжаем только если вчера забирал; иначе — день 1.
  const newDay = y.marathon_last_claim_day === yesterdayUTC ? Math.min(30, y.marathon_day + 1) : 1;
  const entry = cfg.marathon.schedule.find((e) => e.day === newDay) ?? cfg.marathon.schedule[0];

  // Фишки/сундуки — ТАНГИБЛЬНЫЕ награды, выдаются за день ТОЛЬКО ОДИН РАЗ:
  // если стрик сбросился и юзер снова дошёл до этого дня — повторно НЕ выдаём
  // (marathon_reward_days). Осознанность/EXP — мягкие, циклятся без лимита.
  const claimedDays: number[] = Array.isArray(y.marathon_reward_days) ? y.marathon_reward_days : [];
  const isMilestone = entry.kind === "chip" || entry.kind === "chest";
  const alreadyGot = isMilestone && claimedDays.includes(newDay);

  const patch: Record<string, unknown> = {
    marathon_day: newDay,
    marathon_last_claim_day: todayUTC,
    updated_at: new Date().toISOString(),
  };
  let pendingChestsAdded = 0;

  if (entry.kind === "awareness") {
    patch.awareness = Math.round((Number(y.awareness) + entry.amount) * 100) / 100;
  } else if (entry.kind === "exp") {
    await applyExpGain(yw, entry.amount);
  } else if (entry.kind === "chip" && !alreadyGot) {
    await pg.hallwayTrainingChips.insert({
      id: `htc_${nanoid(10)}`,
      wallet: yw,
      telegram_id: y.telegram_id,
      star: entry.star,
      source: "marathon",
      obtained_at: new Date().toISOString(),
      consumed_at: null,
    });
    bustTopChipsCache();
  } else if (entry.kind === "chest" && !alreadyGot) {
    // Сундук(и) кладём в инвентарь НЕОТКРЫТЫМИ — юзер открывает сам.
    pendingChestsAdded = Math.max(1, entry.count);
    patch.pending_chests = y.pending_chests + pendingChestsAdded;
  }
  if (isMilestone && !alreadyGot) {
    patch.marathon_reward_days = [...claimedDays, newDay];
  }

  await pg.hallwayYupiks.update({ wallet: yw }, patch);
  return {
    ok: true,
    day: newDay,
    reward: entry,
    alreadyGot,
    pendingChestsAdded,
  };
});

// ──────── PUBLIC: открыть неоткрытый сундук из инвентаря ────────
// Марафон кладёт сундуки неоткрытыми (pending_chests) — юзер открывает сам,
// по одному. Ролл тот же, что у платного сундука; цена только для кэшбека,
// без списания осознанности и без бампа chest_open_count (это не покупка).
export const openHallwayChest = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) throw new Error("Кошелёк не подключён");
  assertNotMaintenance(wallet);
  const cfg = await getHallwayConfig();
  const y = await getOrCreateYupik(wallet);
  if (y.released) throw new Error("Прихожая пройдена");
  const yw = y.wallet; // канонический кош юпика (per-TG)
  // Списываем один сундук ДО ролла, гардом внутри запроса: чтение с
  // последующей записью абсолютом пропускало два нажатия по одному остатку.
  const { guardedSpend } = await import("./guarded-spend");
  const { sqlStr } = await import("./chips-utils");
  const took = await guardedSpend({
    table: "yuplink.hallway_yupiks",
    where: `wallet = ${sqlStr(yw)}`,
    set: "pending_chests = pending_chests - 1",
    cond: "pending_chests >= 1",
    ret: "pending_chests",
  });
  if (!took.ok) throw new Error("Нет сундуков для открытия");
  const price = chestPriceFor(cfg, y.chest_open_count);
  const reward = rollChest(y.level, price, cfg);
  await applyChestReward(yw, reward, y.telegram_id);
  return { ok: true, reward, pendingLeft: Number(took.row?.pending_chests ?? 0) };
});

// ──────── PUBLIC: выпуск в игру (конверт топ-N фишек в билеты) ────────
// Идемпотентно (released-лок), потолок билетов на аккаунт, ОДИН выпуск на
// Telegram (sisters). Конвертятся ТОЛЬКО топ-N фишек. Излишек не конвертится.
export const releaseHallway = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) throw new Error("Кошелёк не подключён");
  assertNotMaintenance(wallet);
  const cfg = await getHallwayConfig();
  const y = await getOrCreateYupik(wallet);
  if (y.released) throw new Error("Уже выпущен");
  if (y.level < cfg.release.gateLevel) throw new Error(`Нужен уровень ${cfg.release.gateLevel}`);
  const yw = y.wallet; // канонический кош юпика (per-TG)
  const sisters = await getSisterWallets(wallet);

  // Фишки прихожи — общий инвентарь аккаунта.
  const { data: chipRows } = await pg.hallwayTrainingChips.raw().select("*").eq("account_id", await accountOf(wallet));
  const all = (chipRows ?? []) as PgHallwayTrainingChip[];
  // Купленные за Stars фишки (source='stars') ПЕРЕХОДЯТ ВСЕГДА — их нельзя
  // удалить при выпуске. Порядок: сильнее первым; при равной звёздности
  // приоритет купленным (выбитые убираются первыми); затем по времени.
  const isBought = (c: PgHallwayTrainingChip) => c.source === "stars";
  const live = all
    .filter((c) => !c.consumed_at)
    .sort(
      (a, b) =>
        b.star - a.star ||
        (isBought(b) ? 1 : 0) - (isBought(a) ? 1 : 0) ||
        (a.obtained_at < b.obtained_at ? -1 : a.obtained_at > b.obtained_at ? 1 : 0),
    );
  const need = cfg.release.requiredTopChips;
  if (live.length < need)
    throw new Error(`Нужно ${need} фишек в топ-${need} (есть ${live.length})`);
  const topN = live.slice(0, need);
  const topSet = new Set(topN.map((c) => c.id));
  // Переходят: топ-N + ВСЕ купленные, не попавшие в топ-N (их нельзя не
  // перенести → в этом случае переходит >N). Удаляются: только ВЫБИТЫЕ вне
  // топ-N. Пример: 2 выбитых + 9 купленных: если слабейшая выбитая — она
  // удаляется (переходят 10); если слабейшая купленная — она остаётся
  // (переходят 11).
  const boughtBelowTop = live.filter((c) => isBought(c) && !topSet.has(c.id));
  const keep = [...topN, ...boughtBelowTop];
  const keepSet = new Set(keep.map((c) => c.id));
  const excess = live.filter((c) => !keepSet.has(c.id)); // только выбитые вне топ-N

  // Один выпуск на Telegram: если любая sister уже выпущена — блок.
  for (const s of sisters) {
    if (s === wallet) continue;
    const sy = await pg.hallwayYupiks.findOne({ wallet: s });
    if (sy?.released) throw new Error("Уже выпущен на этом Telegram");
  }

  // ВЫПУСК = переход в игру. В игру переходят РОВНО топ-N сильнейших фишек
  // (half-stat, ими валят босса, продать за билеты — отдельно потом). Не
  // прошедшие в топ-N (excess) НЕ сохраняются — удаляются при выпуске (так
  // задумано владельцем: осталось 10 → эти 10 и остаются, остальные удалены).
  const now = new Date().toISOString();
  await pg.hallwayYupiks.update(
    { wallet: yw },
    {
      released: true,
      released_at: now,
      released_tickets: 0,
      updated_at: now,
    },
  );
  // Удаляем не прошедшие в топ-N фишки (после released-лока — идемпотентно).
  if (excess.length > 0) {
    await pg.hallwayTrainingChips
      .raw()
      .delete()
      .in(
        "id",
        excess.map((c) => c.id),
      );
  }
  // Онбординг завершён для всего аккаунта (все sister-коши).
  for (const s of sisters) {
    await pg.users.update({ wallet: s }, { hallway_onboarding: false });
  }
  return { ok: true, chips: keep.length, deleted: excess.length };
});

// ──────── PUBLIC: обмен триал-фишек на билеты (опционально, ПОСЛЕ выпуска) ────────
// Отдельно от выпуска: юзер сам решает конвертировать часть фишек в билеты уже
// внутри игры. Жжём выбранные (или топ-N) фишки и начисляем билеты по ★.
export const exchangeTrainingForTickets = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        // id конкретных фишек для обмена; если пусто — топ-N сильнейших.
        chipIds: z.array(z.string().min(1)).max(50).optional(),
        count: z.number().int().min(1).max(50).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    assertNotMaintenance(wallet);
    const cfg = await getHallwayConfig();
    const y = await getOrCreateYupik(wallet);
    // Анти-абуз: продавать триал-фишки за билеты можно с того же L5-гейта, что и
    // выпуск. Фреш-L1 не извлекает билеты из стартовой/сундук-фишки не пройдя
    // прихожу; при этом продажа работает в игре (и у выпущенных, и у теста L5+),
    // не требуя формального released. Потолок билетов на аккаунт (ниже) — второй
    // барьер против фермы.
    if (y.level < cfg.release.gateLevel) throw new Error(`Нужен уровень ${cfg.release.gateLevel}`);
    const yw = y.wallet; // канонический кош юпика (per-TG)
    const sisters = await getSisterWallets(wallet);

    // Кумулятивный потолок билетов от обмена на АККАУНТ (анти-ферма): не больше
    // ticketCap за всю жизнь по всем sister-кошелькам. Per-call min ниже — этот
    // ограничивает суммарно (дизайн «макс ~3 билета/аккаунт навсегда»).
    const { data: priorRows } = await pg.ticketClaims
      .raw()
      .select("tickets_awarded")
      .eq("event_id", "hallway_chip_exchange")
      .in("wallet", sisters);
    const priorTickets = (priorRows ?? []).reduce(
      (s: number, r: { tickets_awarded: number | null }) => s + Number(r.tickets_awarded ?? 0),
      0,
    );
    const capLeft = Math.round((cfg.release.ticketCap - priorTickets) * 1e4) / 1e4;
    if (capLeft <= 0) throw new Error("Лимит обмена фишек на билеты исчерпан");

    // Кандидаты (явные id ∈ live, иначе топ-N) из ЖИВЫХ фишек аккаунта.
    const { data: chipRows } = await pg.hallwayTrainingChips
      .raw()
      .select("*")
      .eq("account_id", await accountOf(wallet));
    // Стартовые фишки (за пропуск Прихожей и разовая раздача до 10) продаже не
    // подлежат: это плата за вход в игру, а не капитал. Иначе стартовый набор
    // сразу обменивался бы на билеты.
    const { isStarterChip } = await import("./hallway-skip");
    const live = ((chipRows ?? []) as PgHallwayTrainingChip[])
      .filter((c) => !c.consumed_at && !isStarterChip(c.source))
      .sort((a, b) => b.star - a.star);
    let candidates: PgHallwayTrainingChip[];
    if (data.chipIds && data.chipIds.length > 0) {
      const idset = new Set(data.chipIds);
      candidates = live.filter((c) => idset.has(c.id));
      if (candidates.length !== data.chipIds.length) {
        const skipped = ((chipRows ?? []) as PgHallwayTrainingChip[]).some(
          (c) => idset.has(c.id) && isStarterChip(c.source),
        );
        throw new Error(
          skipped
            ? "Стартовые фишки не продаются"
            : "Часть фишек не найдена или уже использована",
        );
      }
    } else {
      candidates = live.slice(0, Math.max(1, data.count ?? 1));
    }
    if (candidates.length === 0) throw new Error("Нет фишек для обмена");

    // АТОМАРНОЕ сжигание-гейт: жжём ТОЛЬКО реально не-consumed строки одним
    // UPDATE ... WHERE consumed_at IS NULL RETURNING, и билеты считаем ЛИШЬ по
    // тем, что перевёл в consumed ИМЕННО этот запрос. Конкурентный второй вызов
    // выиграет 0 строк → 0 билетов (как claimBossRewards в boss.ts). Убирает
    // double-spend при дабл-клике/ретрае/параллельном скрипте.
    const now = new Date().toISOString();
    const { data: wonRows, error: burnErr } = await pg.hallwayTrainingChips
      .raw()
      .update({ consumed_at: now })
      .in(
        "id",
        candidates.map((c) => c.id),
      )
      .is("consumed_at", null)
      .select("id, star");
    if (burnErr) throw new Error(burnErr.message);
    const won = (wonRows ?? []) as Array<{ id: string; star: number }>;
    if (won.length === 0) throw new Error("Нет фишек для обмена");
    bustTopChipsCache(); // фишки сожжены → топ/множитель поменялся

    const raw = won.reduce((sum, c) => sum + Number(c.star) * cfg.release.ticketPerStar, 0);
    // Потолок: и разовый (ticketCap), и кумулятивный на аккаунт (capLeft).
    const tickets = Math.round(Math.min(cfg.release.ticketCap, capLeft, raw) * 1e4) / 1e4;
    if (tickets >= 0.01) {
      // event_id 'hallway_chip_exchange' обязан существовать в ticket_events
      // (FK ticket_claims.event_id). Если начисление всё же упало (FK/транзиент)
      // — НЕ теряем фишки: возвращаем сожжённые в живые (компенсация) и кидаем.
      try {
        const claimId = nanoid();
        await pg.ticketClaims.insert({
          id: claimId,
          event_id: "hallway_chip_exchange",
          wallet: yw,
          token_ids: JSON.stringify(won.map((c) => c.id)),
          tickets_awarded: tickets,
        });
        // Обмен триал-фишек прихожей на билеты — в леджер.
        const { moveTickets } = await import("./tickets-ledger");
        await moveTickets({
          wallet: yw,
          delta: tickets,
          kind: "nft_claim",
          ref: `hallway:${claimId}`,
        });
      } catch (e) {
        await pg.hallwayTrainingChips
          .raw()
          .update({ consumed_at: null })
          .in(
            "id",
            won.map((c) => c.id),
          );
        bustTopChipsCache(); // откатили сжигание — вернуть фишки в кэш
        throw e instanceof Error ? e : new Error(String(e));
      }
      invalidateTicketsCache(sisters);
    }
    return { ok: true, exchanged: won.length, tickets };
  });

// ──────── PUBLIC: мои триал-фишки (отдельная категория в инвентаре игры) ────────
// Триал-фишки прихожи (hallway_training_chips) показываем в инвентаре Фишек
// как read-only категорию «Тренировочные»: ими валят босса, характеристики
// ×2 ниже обычных (boss.trialStatScale). В игру «переходят» ТОЛЬКО топ-N по
// звёздам (requiredTopChips=10) — как при выпуске «10 сильнейших»; излишек не
// показываем. Серийник позиционный (1..N, по силе). Каждую можно продать за
// star×ticketPerStar билетов (exchangeTrainingForTickets).
export const myTrainingChips = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  const empty: Array<{
    id: string;
    star: number;
    serialNo: number;
    sellable: boolean;
    sellTickets: number;
    source: string;
    obtainedAt: string;
    imageUrl: string | null;
  }> = [];
  if (!wallet) return empty;
  const cfg = await getHallwayConfig();
  // Картинки фишек по звёздам (те же, что в прихоже) — чтобы в инвентаре игры
  // тренировочные фишки были с картинкой, а не пустым кругом.
  const chipImg = (cfg.images.chipByStar ?? {}) as Record<string, string>;
  const sisters = await getSisterWallets(wallet);
  const showAccount = await accountIdOf(wallet);
  if (!showAccount) return empty;
  const { data } = await pg.hallwayTrainingChips.raw().select("*").eq("account_id", showAccount);
  const live = ((data ?? []) as PgHallwayTrainingChip[]).filter((c) => !c.consumed_at);
  // Показываем то, что «переходит в игру» = keep-набор (та же логика, что в
  // releaseHallway): топ-N сильнейших + ВСЕ купленные (source='stars', они
  // переходят всегда). Купленные приоритетны на равной звёздности.
  const isBought = (c: PgHallwayTrainingChip) => c.source === "stars";
  live.sort(
    (a, b) =>
      b.star - a.star ||
      (isBought(b) ? 1 : 0) - (isBought(a) ? 1 : 0) ||
      (a.obtained_at < b.obtained_at ? -1 : a.obtained_at > b.obtained_at ? 1 : 0),
  );
  const topN = live.slice(0, cfg.release.requiredTopChips);
  const topSet = new Set(topN.map((c) => c.id));
  const top = [...topN, ...live.filter((c) => isBought(c) && !topSet.has(c.id))];
  const { isStarterChip } = await import("./hallway-skip");
  return top.map((c, i) => ({
    id: c.id,
    star: Number(c.star),
    serialNo: i + 1,
    /** Стартовый набор (пропуск Прихожей, раздача до 10) за билеты не продаётся. */
    sellable: !isStarterChip(c.source),
    // Цена продажи за билеты: star × ticketPerStar (серверная правда).
    sellTickets: Math.round(Number(c.star) * cfg.release.ticketPerStar * 1e4) / 1e4,
    source: c.source,
    obtainedAt: c.obtained_at,
    imageUrl: chipImg[String(c.star)] ?? null,
  }));
});

// ──────── PUBLIC: магазин прихожи за Telegram Stars ────────
// Наборы триал-фишек за ⭐ — быстро набрать 10 и выпуститься, минуя гринд.
export const getHallwayStarOffers = createServerFn({ method: "GET" }).handler(async () => {
  const cfg = await getHallwayConfig();
  // Офферы ПОКАЗЫВАЕМ всегда (витрина); killswitch enabled гейчит только саму
  // покупку (кнопка «Скоро» до go-live вебхука).
  const offers = (cfg.starShop?.offers ?? [])
    .filter((o) => o.active)
    .map((o) => ({
      id: o.id,
      title: o.title,
      kind: o.kind,
      star: o.star,
      count: o.count,
      priceStars: o.priceStars,
    }));
  return { enabled: !!cfg.starShop?.enabled, offers };
});

// Создать invoice-ссылку Stars для набора фишек. Клиент открывает её через
// WebApp.openInvoice(link). Товар выдаётся ТОЛЬКО по вебхуку successful_payment
// (клиентский статус openInvoice — лишь для UI, ему не доверяем).
export const createHallwayChipInvoice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ offerId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    const me = await pg.users.findOne({ wallet });
    const tgId = me?.telegram_id ?? null;
    if (!tgId) throw new Error("Привяжи Telegram, чтобы платить звёздами");
    const cfg = await getHallwayConfig();
    if (!cfg.starShop?.enabled) throw new Error("Покупка временно недоступна");
    const offer = (cfg.starShop?.offers ?? []).find((o) => o.id === data.offerId && o.active);
    if (!offer) throw new Error("Набор недоступен");
    // Оффер за 0⭐ → выдача без Telegram-инвойса (счёт на ноль звёзд TG не
    // создаёт). Ключ выдачи — игрок, оффер и сутки: раньше он был случайным,
    // и бесплатный набор можно было брать в цикле сколько угодно раз.
    if ((offer.priceStars ?? 0) <= 0) {
      const { grantStarHallwayChips } = await import("@/server/hallwayStars");
      const day = new Date().toISOString().slice(0, 10);
      const r = await grantStarHallwayChips({
        chargeId: `free:${tgId}:${offer.id}:${day}`,
        tgId,
        offerId: offer.id,
        amountStars: 0,
      });
      return { free: true as const, granted: r.count, stars: r.stars };
    }
    const { createStarsInvoiceLink } = await import("../tg");
    // payload ставит СЕРВЕР (не юзер) → доверенный. ≤128 байт.
    const payload = JSON.stringify({ k: "hw_chips", o: offer.id, tg: tgId });
    const desc =
      offer.kind === "random"
        ? `${offer.count}× случайные тренировочные фишки (1–3★)`
        : `${offer.count}× тренировочных фишек ${offer.star}★`;
    const link = await createStarsInvoiceLink({
      title: offer.title,
      description: desc,
      payload,
      amountStars: offer.priceStars,
      label: offer.title,
    });
    if (!link) throw new Error("Не удалось создать счёт");
    return { link, priceStars: offer.priceStars };
  });

// Выдача оплаченных Stars-фишек (grantStarHallwayChips) вынесена в SERVER-ONLY
// src/server/hallwayStars.ts — она использует node:crypto, а этот модуль
// импортируется клиентом. Вебхук зовёт её оттуда.

// ──────── ADMIN: levels (EXP-кривая + окно + картинка) ────────
export const adminListHallwayLevels = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin(getCurrentWallet());
  const rows = await pg.hallwayLevels.findMany(
    {},
    { orderBy: { column: "level_no", ascending: true } },
  );
  return rows.map((r) => ({
    levelNo: r.level_no,
    yupikImageUrl: r.yupik_image_url,
    expToNext: r.exp_to_next,
    windowHours: r.window_hours,
  }));
});

export const adminUpdateHallwayLevel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        levelNo: z.number().int().min(1).max(23),
        yupikImageUrl: z.string().nullable().optional(),
        expToNext: z.number().int().min(0).max(10_000_000).optional(),
        windowHours: z.number().min(0.5).max(48).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin(getCurrentWallet());
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (data.yupikImageUrl !== undefined) patch.yupik_image_url = data.yupikImageUrl;
    if (data.expToNext !== undefined) patch.exp_to_next = data.expToNext;
    if (data.windowHours !== undefined) patch.window_hours = data.windowHours;
    const existing = await pg.hallwayLevels.findOne({ level_no: data.levelNo });
    if (existing) {
      await pg.hallwayLevels.update({ level_no: data.levelNo }, patch);
    } else {
      await pg.hallwayLevels.insert({
        level_no: data.levelNo,
        yupik_image_url: data.yupikImageUrl ?? null,
        mine_per_collect: 0,
        exp_to_next: data.expToNext ?? 80,
        window_hours: data.windowHours ?? 1,
        updated_at: new Date().toISOString(),
      });
    }
    bustHallwayLevelCache(); // применить правку уровня сразу
    return { ok: true };
  });
