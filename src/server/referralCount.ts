// Сколько друзей засчитано пригласившему — общий счёт для вех (referralTiers).
//
// Считаем на уровне TG: все sister-кошельки инвайтера агрегируем, у друга —
// TG-dedup. Кошельки одного человека = один реферал. Свои же кошельки (тот же
// Telegram или аккаунт, что у пригласившего) — не друзья вовсе.
//
// С 01.09.2026 «приглашение» = приглашённый купил пак с фишками: бесплатных
// tg<id>-аккаунтов можно наделать сколько угодно, а пак стоит денег.
// С 22.10.2026 вехи считают только новых друзей (since = REF_NEW_SCHEME_SINCE).
// С 02.11.2026 (рефка золотом, §8.101) — друг засчитан, когда потратил в игре
// порог в $ (referralSpend): «Много друзей» — от $10, бонус-боксы — больше $15.
// С 05.11.2026 новый друг в вехах боксов — за пройденное обучение (rule.tutorialSince).
import { pg } from "./db/pg";
import { joinedSince } from "@/lib/referralRewards";
import { REF_FRIEND_MIN_USD } from "@/lib/referralGold";

/**
 * Порог траты друга: от `minUsd` (strict — строго больше). С `tutorialSince` друг,
 * у которого все связи не раньше отсечки, засчитан за пройденное обучение — без трат.
 */
export type SpendRule = { minUsd: number; strict?: boolean; tutorialSince?: string };

/**
 * Все wallet'ы инвайтера (sister-кошельки одного TG).
 * Если у inviter нет TG — фолбэк на сам wallet.
 */
export async function getInviterSisters(inviterWallet: string): Promise<string[]> {
  const me = await pg.users.findOne({ wallet: inviterWallet });
  if (!me?.telegram_id) return [inviterWallet];
  const sisters = await pg.users.findMany({ telegram_id: me.telegram_id });
  return Array.from(new Set([inviterWallet, ...sisters.map((s) => s.wallet)]));
}

/** Canonical wallet инвайтера (первый по created_at среди sister-кошельков). */
export async function getInviterCanonicalWallet(inviterWallet: string): Promise<string> {
  const me = await pg.users.findOne({ wallet: inviterWallet });
  if (!me?.telegram_id) return inviterWallet;
  const sisters = await pg.users.findMany(
    { telegram_id: me.telegram_id },
    { orderBy: { column: "created_at", ascending: true } },
  );
  return sisters[0]?.wallet ?? inviterWallet;
}

/**
 * TG-dedup'нутое количество ЗАСЧИТАННЫХ рефералов у инвайтера: друг потратил
 * порог `rule` всеми кошельками своего Telegram. С `since` — только новые друзья:
 * человек, у которого хоть одна связь с инвайтером раньше `since`, не считается вовсе.
 */
export async function countUniqueReferrals(
  inviterSisters: string[],
  since?: string,
  rule: SpendRule = { minUsd: REF_FRIEND_MIN_USD },
): Promise<number> {
  const refRows = (
    await pg.referrals.raw().select("friend_wallet,joined_at").in("inviter_wallet", inviterSisters)
  ).data as Array<{ friend_wallet: string; joined_at: string | null }> | null;
  const friendWallets = (refRows ?? []).map((r) => r.friend_wallet);
  if (friendWallets.length === 0) return 0;

  type UserRow = { wallet: string; telegram_id: number | null; account_id: string | null };
  const [friendRes, ownRes] = await Promise.all([
    pg.users.raw().select("wallet,telegram_id,account_id").in("wallet", friendWallets),
    pg.users.raw().select("wallet,telegram_id,account_id").in("wallet", inviterSisters),
  ]);
  const friendUsers = friendRes.data as UserRow[] | null;
  const userMap = new Map((friendUsers ?? []).map((u) => [u.wallet, u]));

  // Сам себе не друг: кошелёк того же Telegram или того же аккаунта, что у
  // пригласившего, вехи не двигает (иначе свой второй кошелёк = бокс).
  const own = (ownRes.data as UserRow[] | null) ?? [];
  const ownWallets = new Set(inviterSisters);
  const ownTgs = new Set(
    own.filter((u) => u.telegram_id != null).map((u) => String(u.telegram_id)),
  );
  const ownAccs = new Set(own.map((u) => u.account_id).filter((a): a is string => !!a));
  const isSelf = (fw: string): boolean => {
    const u = userMap.get(fw);
    if (ownWallets.has(fw)) return true;
    if (u?.telegram_id != null && ownTgs.has(String(u.telegram_id))) return true;
    return !!u?.account_id && ownAccs.has(u.account_id);
  };

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
  const { usdSpentByWallet } = await import("./referralSpend");
  const spent = await usdSpentByWallet(allFriendWallets);
  const tgOfWallet = new Map((sisterRows ?? []).map((r) => [r.wallet, r.telegram_id]));
  /** Сколько инвайти потратил, $: все кошельки его Telegram (нет Telegram — этот кошелёк). */
  const usdOf = (fw: string, tg: number | null | undefined): number => {
    if (tg == null) return spent.get(fw) ?? 0;
    let sum = tgOfWallet.get(fw) === tg ? 0 : (spent.get(fw) ?? 0);
    for (const [w, usd] of spent) if (tgOfWallet.get(w) === tg) sum += usd;
    return sum;
  };
  const passes = (usd: number): boolean =>
    rule.strict ? usd > rule.minUsd + 1e-9 : usd >= rule.minUsd - 1e-9;

  const keyOf = (fw: string): string => {
    const tg = userMap.get(fw)?.telegram_id;
    return tg ? `tg:${tg}` : `w:${fw}`;
  };
  // Старый друг (связь до since) — за него уже заплачено прежней схемой.
  const old = new Set(
    since
      ? (refRows ?? [])
          .filter((r) => !joinedSince(r.joined_at, since))
          .map((r) => keyOf(r.friend_wallet))
      : [],
  );

  // Новый друг (ни одной связи до tutorialSince) — по обучению, прежний — по тратам.
  const since2 = rule.tutorialSince;
  const beforeTutorial = new Set(
    since2
      ? (refRows ?? [])
          .filter((r) => !joinedSince(r.joined_at, since2))
          .map((r) => keyOf(r.friend_wallet))
      : [],
  );
  const byTutorial = (fw: string): boolean => !!since2 && !beforeTutorial.has(keyOf(fw));
  const tutorial = friendWallets.some(byTutorial)
    ? await (await import("./referralTutorial")).walletsWithTutorial(allFriendWallets)
    : new Set<string>();
  /** Обучение прошёл любой кошелёк его Telegram (нет Telegram — этот кошелёк). */
  const tutorialDone = (fw: string, tg: number | null | undefined): boolean =>
    tutorial.has(fw) || (tg != null && [...tutorial].some((w) => tgOfWallet.get(w) === tg));

  const dedup = new Set<string>();
  for (const fw of friendWallets) {
    if (isSelf(fw) || old.has(keyOf(fw))) continue;
    const tg = userMap.get(fw)?.telegram_id;
    // Условие не выполнено — реф ещё не созрел.
    if (!(byTutorial(fw) ? tutorialDone(fw, tg) : passes(usdOf(fw, tg)))) continue;
    dedup.add(keyOf(fw));
  }
  return dedup.size;
}
