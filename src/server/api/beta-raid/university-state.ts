// Университет: состояние стейка и всё, что меняет накопленное.
//
// ГЛАВНОЕ ПРАВИЛО. Доход считается «по нынешнему составу с момента последнего
// пересчёта», поэтому пересчёт (settle) обязан идти ПЕРЕД любым изменением
// состава. Положил фишку без пересчёта — и она получит доход за время, когда её
// в университете не было; забрал без пересчёта — потеряет заработанное.
//
// Накопленное лежит одной строкой на аккаунт (chip_university_acc.pending) в
// БАЗОВЫХ лайках, без множителя здания. Множитель применяется в момент клейма и
// берётся у того университета, где игрок стоит: в этом вся суть механики —
// фишки можно положить в одном, а забрать лайки в другом, повыше уровнем.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import {
  UNI_FREE_SLOTS,
  UNI_MAX_SLOTS,
  UNI_ACCRUAL_CAP_MS,
  UNI_CLAIM_COOLDOWN_MS,
  nextSlotPrice,
} from "@/lib/university";

export type StakedChip = {
  chipId: string;
  level: number;
  ratePerDay: number;
  stakedAt: string;
  name: string;
  imageUrl: string | null;
  serialNo: number | null;
};

export type UniversityAccount = {
  /** Сколько мест под обучение открыто у аккаунта. */
  slots: number;
  /** Когда игрок последний раз забирал лайки — для кулдауна. null — ни разу. */
  claimedAtMs: number | null;
  /** Накоплено в базовых лайках — без множителя здания. */
  pending: number;
  /** Сколько лайков этот аккаунт уже забрал отсюда. */
  lifetime: number;
  /** Суммарная ставка нынешнего состава, лайков в сутки. */
  ratePerDay: number;
  chips: StakedChip[];
};

/**
 * Пересчитать накопленное и сдвинуть отметку времени.
 *
 * Одним запросом и без чтения-записи по кругу: строки может не быть вовсе
 * (первый заход), поэтому INSERT … ON CONFLICT DO UPDATE. Повтор запроса
 * безвреден — за прошедшие миллисекунды добавится примерно ноль.
 */
export async function settleUniversity(accountId: string): Promise<void> {
  const acc = sqlStr(accountId);
  const capSec = Math.floor(UNI_ACCRUAL_CAP_MS / 1000);
  await mcpExec(
    `INSERT INTO yuplink.chip_university_acc (account_id, pending, lifetime, settled_at)
     VALUES (${acc}, 0, 0, now())
     ON CONFLICT (account_id) DO UPDATE
        SET pending = yuplink.chip_university_acc.pending
              + COALESCE((SELECT SUM(s.rate_per_day) FROM yuplink.chip_university_stake s
                           WHERE s.account_id = ${acc}), 0)
                * LEAST(
                    EXTRACT(EPOCH FROM (now() - yuplink.chip_university_acc.settled_at)),
                    ${capSec}
                  ) / 86400,
            settled_at = now();`,
  );
}

/** Что у аккаунта в университете прямо сейчас (после пересчёта). */
export async function universityAccount(accountId: string): Promise<UniversityAccount> {
  await settleUniversity(accountId);
  const acc = sqlStr(accountId);
  const rows = (await mcpExec(
    `SELECT a.pending, a.lifetime, a.slots, a.claimed_at,
            COALESCE((SELECT SUM(s.rate_per_day) FROM yuplink.chip_university_stake s
                       WHERE s.account_id = ${acc}), 0) AS rate
       FROM yuplink.chip_university_acc a WHERE a.account_id = ${acc} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{
    pending: number;
    lifetime: number;
    rate: number;
    slots: number;
    claimed_at: string | null;
  }>;
  const chips = (await mcpExec(
    `SELECT s.chip_id, s.level, s.rate_per_day, s.staked_at,
            t.name, t.image_url, c.serial_no
       FROM yuplink.chip_university_stake s
       LEFT JOIN yuplink.user_chip_inventory c ON c.id = s.chip_id
       LEFT JOIN yuplink.chip_templates t ON t.id = c.template_id
      WHERE s.account_id = ${acc}
      ORDER BY s.level DESC, s.staked_at;`,
    { wrapJson: true },
  )) as Array<{
    chip_id: string;
    level: number;
    rate_per_day: number;
    staked_at: string;
    name: string | null;
    image_url: string | null;
    serial_no: number | null;
  }>;
  const row = rows?.[0];
  return {
    slots: Number(row?.slots) || UNI_FREE_SLOTS,
    claimedAtMs: row?.claimed_at ? new Date(row.claimed_at).getTime() : null,
    pending: Number(row?.pending) || 0,
    lifetime: Number(row?.lifetime) || 0,
    ratePerDay: Number(row?.rate) || 0,
    chips: (chips ?? []).map((c) => ({
      chipId: String(c.chip_id),
      level: Number(c.level),
      ratePerDay: Number(c.rate_per_day),
      stakedAt: String(c.staked_at),
      name: c.name ?? "",
      imageUrl: c.image_url ?? null,
      serialNo: c.serial_no === null ? null : Number(c.serial_no),
    })),
  };
}

/**
 * Забрать накопленное лайками. `bonus` — множитель университета, у которого
 * стоит игрок.
 *
 * Всё одним запросом: обнуление накопленного и начисление лайков ложатся вместе
 * или не ложатся вовсе. Раздельными записями сбор в майнинге уже оставлял
 * игрока без лайков при обрыве на середине (mining-claim-commit).
 */
export async function claimUniversity(opts: {
  accountId: string;
  /** Канонический кошелёк аккаунта: лайки не должны растекаться по сёстрам. */
  wallet: string;
  bonus: number;
}): Promise<number> {
  await settleUniversity(opts.accountId);
  const acc = sqlStr(opts.accountId);
  const w = sqlStr(opts.wallet);
  const b = Number(opts.bonus);
  const cdSec = Math.floor(UNI_CLAIM_COOLDOWN_MS / 1000);
  const rows = (await mcpExec(
    `WITH cur AS (
       SELECT pending, claimed_at FROM yuplink.chip_university_acc
        WHERE account_id = ${acc} FOR UPDATE
     ), ok AS (
       -- Кулдаун 4 часа: если рано, сбор пропускаем, а окно об этом сообщит
       -- (нашего клиента серверный ответ minted=0 не смутит — тост уже покажет
       -- кулдаун, посчитанный на клиенте по claimed_at).
       SELECT (claimed_at IS NULL
               OR now() - claimed_at >= interval '${cdSec} seconds') AS pass FROM cur
     ), calc AS (
       SELECT CASE WHEN (SELECT pass FROM ok)
                   THEN ROUND(COALESCE((SELECT pending FROM cur), 0) * ${b}, 4)
                   ELSE 0 END AS minted
     ), zero AS (
       UPDATE yuplink.chip_university_acc a
          SET pending = 0, settled_at = now(), claimed_at = now(),
              lifetime = a.lifetime + (SELECT minted FROM calc)
        WHERE a.account_id = ${acc} AND (SELECT minted FROM calc) > 0
       RETURNING 1
     ), pay AS (
       INSERT INTO yuplink.user_like_balance (account_id, available, lifetime_granted)
       SELECT ${acc}, (SELECT minted FROM calc), (SELECT minted FROM calc)
        WHERE (SELECT minted FROM calc) > 0 AND EXISTS (SELECT 1 FROM zero)
       ON CONFLICT (account_id) DO UPDATE
          SET available = yuplink.user_like_balance.available + EXCLUDED.available,
              lifetime_granted = yuplink.user_like_balance.lifetime_granted
                + EXCLUDED.lifetime_granted,
              updated_at = now()
       RETURNING 1
     )
     SELECT (SELECT minted FROM calc) AS minted, (SELECT count(*)::int FROM pay) AS paid;`,
    { wrapJson: false },
  )) as Array<{ minted: number; paid: number }>;
  const row = rows?.[0];
  return Number(row?.paid) > 0 ? Number(row?.minted) || 0 : 0;
}

/**
 * Открыть ещё одно место под обучение. Билеты уже списаны вызывающим — здесь
 * только запись, и она условная: место добавляется, лишь пока их меньше
 * предела. Иначе два одновременных нажатия открыли бы тринадцатое.
 */
export async function addUniversitySlot(accountId: string): Promise<number> {
  const rows = (await mcpExec(
    `UPDATE yuplink.chip_university_acc
        SET slots = slots + 1
      WHERE account_id = ${sqlStr(accountId)} AND slots < ${UNI_MAX_SLOTS}
     RETURNING slots;`,
    { wrapJsonCte: true },
  )) as Array<{ slots: number }>;
  const slots = Number(rows?.[0]?.slots);
  if (!Number.isFinite(slots)) throw new Error("Все места уже открыты");
  return slots;
}

/** Цена следующего места — общая формула, чтобы окно и списание не разошлись. */
export function slotPrice(slots: number): number | null {
  return nextSlotPrice(slots);
}

/**
 * Перенести места, купленные в прежнем стейкинге (слоты майнинга).
 *
 * Университет — продолжение той же механики, и человек, купивший там места за
 * билеты, справедливо ждёт их здесь: «у меня больше открыто мест под обучение».
 * Поднимаем ДО их числа, но никогда не опускаем — купленное в университете
 * остаётся, даже если в майнинге мест меньше.
 *
 * Считается по каноническому кошельку аккаунта: состояние майнинга общее на
 * все сестринские кошельки и лежит одной строкой настроек.
 */
export async function syncSlotsFromMining(accountId: string, wallet: string): Promise<void> {
  const { miningCanonicalWallet } = await import("../chips-mint-helpers-mining");
  const { getMiningState } = await import("../chips-mint-helpers-mining");
  const canon = await miningCanonicalWallet(wallet).catch(() => wallet);
  const st = await getMiningState(canon).catch(() => null);
  const unlocked = Math.min(UNI_MAX_SLOTS, Math.max(0, Number(st?.unlocked) || 0));
  if (unlocked <= UNI_FREE_SLOTS) return;
  // INSERT … ON CONFLICT, а не UPDATE: у игрока, который в университет ещё не
  // заходил, строки счёта нет вовсе, и UPDATE молча ничего не делал — места
  // «переносились» только тем, кто уже открывал окно.
  await mcpExec(
    `INSERT INTO yuplink.chip_university_acc (account_id, pending, lifetime, settled_at, slots)
     VALUES (${sqlStr(accountId)}, 0, 0, now(), ${unlocked})
     ON CONFLICT (account_id) DO UPDATE
        SET slots = GREATEST(yuplink.chip_university_acc.slots, ${unlocked});`,
  );
}
