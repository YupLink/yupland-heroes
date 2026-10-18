// Тиерное поощрение рефералов.
//
// Юзер достиг порога N рефералов → +1 билет. Пороги:
// [1, 3, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] — итого 13.
//
// Учёт через users.referral_tier_tickets_granted (индекс последнего
// достигнутого тиера, 0..13). Растёт только вверх — защита от
// дублирования при пересчёте после disconnect-а или race'ов.
//
// Считаем рефералов на уровне TG: все sister-кошельки инвайтера
// агрегируем, у friend'а — TG-dedup. Это правильно — кошельки
// одного юзера = один реф для нас.
//
// Активные рефералы (клеймили) поощряются ОТДЕЛЬНО, через
// computeTickets.earnedFromReferrals (1 актив = 1 билет). Тиеры
// здесь — дополнительная награда за факт приглашения.
//
// С 01.09.2026 «приглашение» = приглашённый купил пак с фишками
// (referralQualify). Пересчёт дёргается и при регистрации, и при покупке.

import { pg } from "./db/pg";
import { nanoid } from "nanoid";

const TIER_THRESHOLDS = [1, 3, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

const REFERRAL_TIER_EVENT_ID = "__referral_tier__";

/** Найти максимальный тиер, который юзер уже достиг. 0 = не достиг даже 1-го. */
function highestReachedTier(referralCount: number): number {
  let tier = 0;
  for (let i = 0; i < TIER_THRESHOLDS.length; i++) {
    if (referralCount >= TIER_THRESHOLDS[i]) tier = i + 1;
    else break;
  }
  return tier;
}

/**
 * Все wallet'ы инвайтера (sister-кошельки одного TG).
 * Если у inviter нет TG — фолбэк на сам wallet.
 */
async function getInviterSisters(inviterWallet: string): Promise<string[]> {
  const me = await pg.users.findOne({ wallet: inviterWallet });
  if (!me?.telegram_id) return [inviterWallet];
  const sisters = await pg.users.findMany({ telegram_id: me.telegram_id });
  return sisters.map((s) => s.wallet);
}

/** Canonical wallet инвайтера (первый по created_at среди sister-кошельков).
 *  Билеты пишутся на него — стабильный и не меняется при добавлении новых. */
async function getInviterCanonicalWallet(inviterWallet: string): Promise<string> {
  const me = await pg.users.findOne({ wallet: inviterWallet });
  if (!me?.telegram_id) return inviterWallet;
  const sisters = await pg.users.findMany(
    { telegram_id: me.telegram_id },
    { orderBy: { column: "created_at", ascending: true } },
  );
  return sisters[0]?.wallet ?? inviterWallet;
}

/**
 * TG-dedup'нутое количество УНИКАЛЬНЫХ рефералов у инвайтера.
 * Один реальный человек = один реферал даже если у него несколько кошельков.
 */
async function countUniqueReferrals(inviterSisters: string[]): Promise<number> {
  const refRows = (
    await pg.referrals.raw().select("friend_wallet").in("inviter_wallet", inviterSisters)
  ).data as Array<{ friend_wallet: string }> | null;
  const friendWallets = (refRows ?? []).map((r) => r.friend_wallet);
  if (friendWallets.length === 0) return 0;

  const friendUsers = (
    await pg.users.raw().select("wallet,telegram_id").in("wallet", friendWallets)
  ).data as Array<{
    wallet: string;
    telegram_id: number | null;
  }> | null;
  const userMap = new Map((friendUsers ?? []).map((u) => [u.wallet, u]));

  // Анти-абуз (правило владельца 01.09): реферал засчитывается только после
  // покупки пака с фишками. Прежний гейт «вышел из прихожей» перестал что-то
  // значить — прихожую теперь проходят на входе, а бесплатных tg<id>-акков
  // можно наделать сколько угодно. Пак стоит билетов или DARAI.
  //
  // Кошельки инвайти берём ВСЕ по его Telegram: купил любым — засчитано.
  const friendTgs = new Set(
    (friendUsers ?? []).map((u) => u.telegram_id).filter((t): t is number => t != null),
  );
  const sisterRows =
    friendTgs.size > 0
      ? ((
          await pg.users.raw().select("wallet,telegram_id").in("telegram_id", Array.from(friendTgs))
        ).data as Array<{ wallet: string; telegram_id: number | null }> | null)
      : [];
  const allFriendWallets = Array.from(
    new Set([...friendWallets, ...(sisterRows ?? []).map((r) => r.wallet)]),
  );
  const { walletsWithPackPurchase } = await import("./referralQualify");
  const buyers = await walletsWithPackPurchase(allFriendWallets);
  const tgOfWallet = new Map((sisterRows ?? []).map((r) => [r.wallet, r.telegram_id]));
  /** Аккаунт инвайти купил пак хоть каким-то своим кошельком? */
  const accountBought = (fw: string, tg: number | null | undefined): boolean => {
    if (buyers.has(fw)) return true;
    if (tg == null) return false;
    for (const w of buyers) if (tgOfWallet.get(w) === tg) return true;
    return false;
  };

  const dedup = new Set<string>();
  for (const fw of friendWallets) {
    const u = userMap.get(fw);
    const tg = u?.telegram_id;
    if (!accountBought(fw, tg)) continue; // пак не куплен — реф ещё не созрел
    dedup.add(tg ? `tg:${tg}` : `w:${fw}`);
  }
  return dedup.size;
}

/**
 * Главная функция. Вызывается при создании нового реферала
 * (в connectWallet) и любых ручных пересчётах.
 *
 * Логика:
 *   1. Считаем уникальных рефералов у инвайтера (по TG).
 *   2. Определяем highest reached tier (0..13).
 *   3. Сравниваем с users.referral_tier_tickets_granted у canonical wallet.
 *   4. Если новый тиер выше — INSERT в ticket_claims разницу штук + UPDATE
 *      колонки. Если ниже или равен — ничего не делаем.
 *
 * Best-effort: ошибки логируются и не пробрасываются, чтобы не валить
 * основной flow (connectWallet).
 */
export async function grantReferralTierTicketsIfDue(
  inviterWallet: string,
): Promise<{ newTier: number; ticketsGranted: number } | null> {
  try {
    const sisters = await getInviterSisters(inviterWallet);
    const canonical = await getInviterCanonicalWallet(inviterWallet);

    const refCount = await countUniqueReferrals(sisters);
    const newTier = highestReachedTier(refCount);

    const me = await pg.users.findOne({ wallet: canonical });
    const oldTier = me?.referral_tier_tickets_granted ?? 0;

    if (newTier <= oldTier) return { newTier, ticketsGranted: 0 };

    const delta = newTier - oldTier;
    const now = new Date().toISOString();

    // Один ticket_claim на каждый перешагнутый тиер — так в истории видно
    // когда и за какой тиер. tickets_awarded=1 у каждого.
    for (let t = oldTier + 1; t <= newTier; t++) {
      await pg.ticketClaims.insert({
        id: nanoid(),
        event_id: `${REFERRAL_TIER_EVENT_ID}:${t}`,
        wallet: canonical,
        token_ids: JSON.stringify({
          tier: t,
          threshold: TIER_THRESHOLDS[t - 1],
        }),
        tickets_awarded: 1,
        claimed_at: now,
      });
      // ref включает кошелёк: уникальный индекс леджера по (kind, ref)
      // глобальный, и без кошелька тиры разных инвайтеров столкнулись бы.
      const { moveTickets } = await import("./api/tickets-ledger");
      await moveTickets({
        wallet: canonical,
        delta: 1,
        kind: "referral",
        ref: `tier:${canonical}:${t}`,
      });
    }

    await pg.users.update({ wallet: canonical }, { referral_tier_tickets_granted: newTier });

    return { newTier, ticketsGranted: delta };
  } catch (err) {
    console.warn("[referralTiers] grant failed:", err);
    return null;
  }
}

/** Для UI: отдать статус тиеров — текущий уровень, следующий порог, всё ли. */
export function describeTierProgress(referralCount: number) {
  const tier = highestReachedTier(referralCount);
  const max = TIER_THRESHOLDS.length;
  const next = tier < max ? TIER_THRESHOLDS[tier] : null;
  return {
    currentTier: tier, // 0..13
    nextThreshold: next, // null если максимум достигнут
    maxTier: max, // 13
    thresholds: TIER_THRESHOLDS as unknown as number[],
  };
}
