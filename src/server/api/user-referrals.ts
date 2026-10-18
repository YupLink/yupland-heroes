import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";

export const getReferralStats = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) {
    return {
      link: "",
      totalFriends: 0,
      claimedFriends: 0,
      qualifiedFriends: 0,
      referrals: [] as Array<{
        id: string;
        friend: string;
        joinedAt: string;
        claimed: boolean;
        qualified: boolean;
      }>,
    };
  }

  const me = await pg.users.findOne({ wallet });
  let myWallets: string[] = [wallet];
  if (me?.telegram_id != null) {
    const sisters = await pg.users.findMany({ telegram_id: me.telegram_id });
    myWallets = Array.from(new Set([wallet, ...sisters.map((s) => s.wallet)]));
  }

  const refs =
    ((
      await pg.referrals
        .raw()
        .select("*")
        .in("inviter_wallet", myWallets)
        .order("joined_at", { ascending: false })
    ).data as Array<{
      id: string;
      inviter_wallet: string;
      friend_wallet: string;
      joined_at: string;
    }>) ?? [];

  const claimedRows = (await pg.redemptions.raw().select("wallet")).data as Array<{
    wallet: string;
  }> | null;
  const walletsWithClaims = new Set((claimedRows ?? []).map((r) => r.wallet));

  const friendWalletsForCount = refs.map((r) => r.friend_wallet);
  const refRealClaimsRows =
    friendWalletsForCount.length > 0
      ? ((
          await pg.redemptions
            .raw()
            .select("wallet,amount,ticket_cost")
            .in("wallet", friendWalletsForCount)
        ).data as Array<{
          wallet: string;
          amount: number;
          ticket_cost: number;
        }> | null)
      : null;
  const referralClaimsCount = (refRealClaimsRows ?? []).filter(
    (r) => (r.amount ?? 0) > 0 || (r.ticket_cost ?? 0) > 0,
  ).length;

  const friendWallets = Array.from(new Set(refs.map((r) => r.friend_wallet)));
  const friendUsers =
    friendWallets.length > 0
      ? (((await pg.users.raw().select("*").in("wallet", friendWallets)).data as Array<{
          wallet: string;
          telegram_id: number | null;
        }>) ?? [])
      : [];
  const friendTgByWallet = new Map<string, number | null>(
    friendUsers.map((u) => [u.wallet, u.telegram_id ?? null]),
  );
  const tgIds = Array.from(
    new Set(Array.from(friendTgByWallet.values()).filter((t): t is number => t != null)),
  );
  const tgWallets =
    tgIds.length > 0
      ? (((await pg.users.raw().select("*").in("telegram_id", tgIds)).data as Array<{
          wallet: string;
          telegram_id: number | null;
        }>) ?? [])
      : [];
  const tgWalletsByTg = new Map<number, string[]>();
  for (const u of tgWallets) {
    if (u.telegram_id == null) continue;
    const arr = tgWalletsByTg.get(u.telegram_id) ?? [];
    arr.push(u.wallet);
    tgWalletsByTg.set(u.telegram_id, arr);
  }

  function friendClaimed(friendWallet: string): boolean {
    const tg = friendTgByWallet.get(friendWallet);
    if (tg == null) return walletsWithClaims.has(friendWallet);
    const ws = tgWalletsByTg.get(tg) ?? [friendWallet];
    return ws.some((w) => walletsWithClaims.has(w));
  }

  // Реферал засчитывается только после покупки пака (правило владельца 01.09):
  // берём ВСЕ кошельки его Telegram — купил любым, зачтён весь аккаунт.
  const allFriendWallets = Array.from(
    new Set([...friendWallets, ...tgWallets.map((u) => u.wallet)]),
  );
  const { walletsWithPackPurchase } = await import("../referralQualify");
  const buyerWallets = await walletsWithPackPurchase(allFriendWallets);
  function friendBoughtPack(friendWallet: string): boolean {
    const tg = friendTgByWallet.get(friendWallet);
    const ws = tg != null ? (tgWalletsByTg.get(tg) ?? [friendWallet]) : [friendWallet];
    return ws.some((w) => buyerWallets.has(w));
  }

  const seenIdentity = new Set<string>();
  const enriched = refs
    .map((r) => {
      const tg = friendTgByWallet.get(r.friend_wallet);
      const identity = tg != null ? `t:${tg}` : `w:${r.friend_wallet}`;
      if (seenIdentity.has(identity)) return null;
      seenIdentity.add(identity);
      return {
        id: r.id,
        friend: r.friend_wallet,
        joinedAt: r.joined_at,
        claimed: friendClaimed(r.friend_wallet),
        /** Купил пак — реферал созрел и приносит инвайтеру награду. */
        qualified: friendBoughtPack(r.friend_wallet),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const base = process.env.PUBLIC_BASE_URL ?? "https://service.yupland.io";
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  let tgLink: string | null = null;
  let webLink: string;
  if (me?.telegram_id != null) {
    webLink = `${base}?ref=tg${me.telegram_id}`;
    if (botUsername) {
      tgLink = `https://t.me/${botUsername}?start=ref${me.telegram_id}`;
    }
  } else {
    webLink = `${base}?ref=${wallet}`;
  }
  const link = tgLink ?? webLink;

  // Догоняем тиры при чтении: реферал созревает не в момент регистрации, а
  // когда купит пак, и хук на покупке мог не сработать (восстановление
  // платежа, ручная выдача). Экран «Друзья» — дешёвое место для пересчёта.
  try {
    const { grantReferralTierTicketsIfDue } = await import("../referralTiers");
    await grantReferralTierTicketsIfDue(wallet);
  } catch (err) {
    console.warn("[referrals] пересчёт тиров при чтении не удался:", err);
  }
  const { describeTierProgress } = await import("../referralTiers");
  const tierProgress = describeTierProgress(enriched.length);

  return {
    link,
    webLink,
    tgLink,
    totalFriends: enriched.length,
    claimedFriends: enriched.filter((r) => r.claimed).length,
    /** Сколько друзей купили пак — за них и идёт награда инвайтеру. */
    qualifiedFriends: enriched.filter((r) => r.qualified).length,
    referralClaimsCount,
    referrals: enriched,
    tierProgress,
  };
});
