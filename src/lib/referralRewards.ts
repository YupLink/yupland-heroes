// Награды за друзей (владелец, 22.10.2026) — чистые правила, общие для сервера
// и экрана «Друзья».
//
// «За рефов давались билеты — переделали на золото — теперь бонус-боксы. Доходишь
// до одного, трёх, пяти, десяти, пятнадцати — и потом за каждые пятнадцать
// бонус-бокс». Друг засчитывается после покупки пака (referralQualify); с 05.11.2026
// новый друг — после обучения в игре (REF_TUTORIAL_SINCE, server/referralTutorial).
// Вехи считают только НОВЫХ друзей — связь появилась с REF_NEW_SCHEME_SINCE
// («по старым пересчёт не делаем, только новым — за старых уже всё получено»).
//
// «Если они взяли подписку, ты получаешь с них 10 % на счёт — только доллары»:
// 10 % USDT-оплаты подписки другом — пригласившему; корзины подписки получают
// остальные 90 % (все доли поровну, ×0,9).

/** Bonus Box — тот же бокс, что в подписке на энергию. */
export const REF_BOX_PACK_ID = "cp_eu1k2rl8yG";

/** Первые вехи — штучно, дальше каждые REF_MILESTONE_STEP: 30, 45, 60… */
export const REF_FIRST_MILESTONES = [1, 3, 5, 10, 15] as const;
export const REF_MILESTONE_STEP = 15;

/**
 * Начало новой схемы (бонус-боксы, 22.10.2026 00:00 UTC). Друзья, чья связь в
 * yuplink.referrals (joined_at) раньше этого момента, — старые: за них уже
 * заплачено билетами/золотом, в вехи боксов они не входят вовсе (владелец,
 * 22.10.2026). joined_at пишется датой (полночь UTC) — друг, пришедший 22.10,
 * уже новый.
 */
export const REF_NEW_SCHEME_SINCE = "2026-10-22T00:00:00Z";

/**
 * С этого момента друг засчитывается в вехи бонус-боксов, когда прошёл обучение
 * в игре, — без порога трат (владелец, 05.11.2026: «условие после прохождения
 * обучения в игре… только для новых игроков — кто уже в игре, не трогать»).
 * Друг, у которого хоть одна связь раньше, — по прежним правилам.
 */
export const REF_TUTORIAL_SINCE = "2026-11-05T00:00:00Z";

/** Доля пригласившего в USDT-оплате подписки друга. */
export const REF_SUB_SHARE = 0.1;

const whole = (n: number) => Math.max(0, Math.floor(Number(n) || 0));

/** Все вехи, которых достигает `count` засчитанных друзей. */
export function milestonesUpTo(count: number): number[] {
  const n = whole(count);
  const out: number[] = REF_FIRST_MILESTONES.filter((m) => m <= n);
  const last = REF_FIRST_MILESTONES[REF_FIRST_MILESTONES.length - 1];
  for (let m = last + REF_MILESTONE_STEP; m <= n; m += REF_MILESTONE_STEP) out.push(m);
  return out;
}

/** Ближайшая ещё не достигнутая веха. */
export function nextMilestone(count: number): number {
  const n = whole(count);
  for (const m of REF_FIRST_MILESTONES) if (m > n) return m;
  return (Math.floor(n / REF_MILESTONE_STEP) + 1) * REF_MILESTONE_STEP;
}

/**
 * Связь с другом появилась не раньше `since`? Нет даты или мусор — старая
 * (консервативно: бокс только за доказанно нового друга).
 */
export function joinedSince(joinedAt: unknown, since: string = REF_NEW_SCHEME_SINCE): boolean {
  const t =
    joinedAt instanceof Date
      ? joinedAt.getTime()
      : typeof joinedAt === "string"
        ? Date.parse(joinedAt)
        : Number.NaN;
  return Number.isFinite(t) && t >= Date.parse(since);
}

/** Вехи для экрана: пройденные и следующая (не меньше чем до 30). */
export function milestonesForView(count: number): number[] {
  return milestonesUpTo(Math.max(nextMilestone(count), 30));
}

/**
 * Доля пригласившего в оплате подписки USDT: 10 % вниз до 6 знаков (точность
 * USDT), остальное — корзинам подписки. ref + rest ровно равно оплате.
 */
export function refSubShare(amount: number): { ref: number; rest: number } {
  const micro = Math.max(0, Math.round((Number(amount) || 0) * 1e6));
  const refMicro = Math.floor(micro * REF_SUB_SHARE + 1e-9);
  return { ref: refMicro / 1e6, rest: (micro - refMicro) / 1e6 };
}
