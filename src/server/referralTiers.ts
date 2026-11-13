// Вехи друзей → бонус-боксы (владелец, 22.10.2026; было: билет, с 20.10 — 100 золота).
//
// Веха — 1, 3, 5, 10, 15 засчитанных друзей, дальше каждые 15 (lib/referralRewards.ts).
// За каждую — строка «бокс ждёт» в yuplink.ref_reward; игрок забирает её
// кнопкой в «Друзьях», без срока (referral-rewards.ts).
//
// Ключ — аккаунт + веха (source_ref 'refbox:<аккаунт>:<веха>', UNIQUE): пересчёт
// хоть сто раз, гонка двух вкладок, повтор моста — второй строки нет.
// Вехи считают только новых друзей — связь с REF_NEW_SCHEME_SINCE (владелец,
// 22.10.2026: «по старым пересчёт не делаем, только новым — за старых уже всё
// получено»). Старые друзья в счёт не входят вовсе, поэтому прежняя отметка
// users.referral_tier_tickets_granted здесь больше не нужна.
//
// Пересчёт зовут: привязка друга (referralAttach), покупка другом пака,
// подписки, золота (referralQualify.noteReferralPurchase), экран «Друзья» и
// опрос наград (догон).
//
// С 02.11.2026 (рефка золотом, §8.101): в вехи боксов идёт друг, потративший
// больше $15 (владелец: «нигде не пиши об этом — просто начисление боксов»);
// тем же проходом — счёт ачивки «Много друзей» (потратившие от $10, все друзья):
// торговля героям за друзей (achievements/tracks: friends).
//
// С 05.11.2026 (владелец: «условие после прохождения обучения в игре», «только
// обучение», «кто уже в игре — не трогать»): друг со связью не раньше
// REF_TUTORIAL_SINCE идёт в вехи боксов, когда прошёл обучение, — без порога $15.
// Прежние друзья — как были. «Много друзей» не меняли.
import { mcpExec } from "./db/mcpClient";
import { sqlStr } from "./api/raid-shared";
import { accAccountId } from "./api/currency/move";
import {
  REF_BOX_PACK_ID,
  REF_NEW_SCHEME_SINCE,
  REF_TUTORIAL_SINCE,
  milestonesForView,
  milestonesUpTo,
  nextMilestone,
} from "@/lib/referralRewards";
import {
  countUniqueReferrals,
  getInviterCanonicalWallet,
  getInviterSisters,
} from "./referralCount";
import { REF_BOX_MIN_USD, REF_GOLD_SINCE } from "@/lib/referralGold";

/** Счёт ачивки «Много друзей» — числом друзей; вниз не идёт (курс DARAI паков плавает). */
export const friendsAchSql = (account: string, friends: number): string =>
  `INSERT INTO yuplink.account_achievement (account_id, track, count)
VALUES (${sqlStr(account)}, 'friends', ${Math.max(0, Math.floor(friends))})
ON CONFLICT (account_id, track) DO UPDATE
  SET count = GREATEST(yuplink.account_achievement.count, EXCLUDED.count), updated_at = now();`;

/** Ключ повтора строки-бокса: одна веха — одна строка на аккаунт. */
export const boxRef = (account: string, milestone: number) => `refbox:${account}:${milestone}`;

/** Вставка боксов за вехи; уже заведённые ключи — тихо мимо. */
export function insertBoxesSql(
  account: string,
  milestones: number[],
  packId = REF_BOX_PACK_ID,
): string {
  const values = milestones
    .map((m) => {
      const ref = sqlStr(boxRef(account, m));
      return `('rrb_' || substr(md5(${ref}), 1, 16), ${sqlStr(account)}, 'box', ${m}, ${sqlStr(packId)}, 1, ${ref})`;
    })
    .join(",\n       ");
  return `INSERT INTO yuplink.ref_reward (id, account_id, kind, milestone, pack_id, amount, source_ref)
VALUES ${values}
ON CONFLICT (source_ref) DO NOTHING
RETURNING id;`;
}

/**
 * Завести боксы за достигнутые вехи. Безопасно звать сколько угодно раз.
 * Best-effort: ошибки — в лог и null, основной поток (привязка, покупка) важнее.
 */
export async function grantReferralBoxesIfDue(
  inviterWallet: string,
): Promise<{ count: number; boxes: number; friends: number } | null> {
  try {
    const sisters = await getInviterSisters(inviterWallet);
    const [count, friends] = await Promise.all([
      countUniqueReferrals(sisters, REF_NEW_SCHEME_SINCE, {
        minUsd: REF_BOX_MIN_USD,
        strict: true,
        tutorialSince: REF_TUTORIAL_SINCE,
      }),
      // «Много друзей» — только друзья, пришедшие с 02.11.2026 (прежним не компенсируем).
      countUniqueReferrals(sisters, REF_GOLD_SINCE),
    ]);
    const account = await accAccountId(await getInviterCanonicalWallet(inviterWallet));
    if (!account) return { count, boxes: 0, friends };
    if (friends > 0) await mcpExec(friendsAchSql(account, friends));
    if (count <= 0) return { count, boxes: 0, friends };
    const due = milestonesUpTo(count);
    const rows = (await mcpExec(insertBoxesSql(account, due), { wrapJsonCte: true })) as
      | unknown[]
      | null;
    return { count, boxes: rows?.length ?? 0, friends };
  } catch (err) {
    console.warn("[referralTiers] боксы за вехи не заведены:", err);
    return null;
  }
}

/** Для экрана: счёт новых друзей, пройденные вехи, следующая и сетка для показа. */
export function describeTierProgress(qualifiedCount: number) {
  const thresholds = milestonesForView(qualifiedCount);
  return {
    /** Сколько новых засчитанных друзей идёт в вехи (старые не входят). */
    count: qualifiedCount,
    currentTier: milestonesUpTo(qualifiedCount).length,
    nextThreshold: nextMilestone(qualifiedCount),
    maxTier: thresholds.length,
    thresholds,
  };
}
