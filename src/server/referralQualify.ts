// Когда реферал засчитывается: только после первой покупки пака с фишками.
//
// Правило владельца (01.09.2026): пригласил — хорошо, но награда идёт лишь за
// того, кто дошёл до покупки. Бесплатных «мёртвых душ» на ТГ-аккаунтах можно
// наделать сколько угодно, а пак стоит билетов или DARAI.
//
// Считаем на уровне Telegram, а не кошелька: у аккаунта их бывает несколько,
// и покупка любым из них засчитывается всему аккаунту.
import { pg } from "./db/pg";

/** Источники выдачи пака, которые считаются покупкой (не раздачей). */
export const PACK_PURCHASE_SOURCES = ["purchase_tickets", "purchase_darai", "purchase_account"];

/** Кошельки одного Telegram; ТГ нет — сам кошелёк. */
export async function accountWallets(wallet: string): Promise<string[]> {
  const me = await pg.users.findOne({ wallet });
  if (me?.telegram_id == null) return [wallet];
  const sisters = await pg.users.findMany({ telegram_id: me.telegram_id });
  return Array.from(new Set([wallet, ...sisters.map((s) => s.wallet)]));
}

/** Кто из перечисленных кошельков купил хотя бы один пак. */
export async function walletsWithPackPurchase(wallets: string[]): Promise<Set<string>> {
  if (wallets.length === 0) return new Set();
  const { data } = await pg.chipPackGrants
    .raw()
    .select("wallet")
    .in("wallet", wallets)
    .in("source", PACK_PURCHASE_SOURCES);
  return new Set(((data ?? []) as Array<{ wallet: string }>).map((r) => r.wallet));
}

/** Этот аккаунт уже покупал пак? */
export async function accountBoughtPack(wallet: string): Promise<boolean> {
  const wallets = await accountWallets(wallet);
  return (await walletsWithPackPurchase(wallets)).size > 0;
}

/**
 * Покупатель купил пак, подписку или золото (или прошёл обучение, island-exit) —
 * его пригласивший, если такой есть, мог дозреть до награды. Пересчитываем вехи инвайтера (бонус-боксы) и «Много
 * друзей»; ошибки не пробрасываем, покупка важнее.
 */
export async function noteReferralPurchase(buyerWallet: string): Promise<void> {
  try {
    const wallets = await accountWallets(buyerWallet);
    const { data } = await pg.referrals
      .raw()
      .select("inviter_wallet")
      .in("friend_wallet", wallets)
      .limit(1);
    const inviter = ((data ?? []) as Array<{ inviter_wallet: string }>)[0]?.inviter_wallet;
    if (!inviter) return;
    const { grantReferralBoxesIfDue } = await import("./referralTiers");
    await grantReferralBoxesIfDue(inviter);
  } catch (err) {
    console.warn("[referralQualify] пересчёт после покупки не удался:", err);
  }
}
