// Кто заводит промокоды. Админ — любые (токен — только владелец). Право
// promo_soft (admin-rights; владелец 04.11.2026: «создание промокодов — только
// на энергию или лайки — с отдельными записями, кто создал») — только энергия и
// лайки и только свои коды: список, вкл/выкл, удалить — по created_by.
import { getCurrentWallet, requireAdmin } from "@/server/auth";
import { walletHasRight } from "@/server/admin-rights";
import { PROMO_SOFT_KINDS, type PromoKind } from "@/lib/promo/promoTypes";

export type PromoActor = { by: string; soft: boolean };

export async function promoActor(): Promise<PromoActor> {
  try {
    return { by: requireAdmin(), soft: false };
  } catch (e) {
    const wallet = getCurrentWallet();
    if (wallet && (await walletHasRight(wallet, "promo_soft"))) return { by: wallet, soft: true };
    throw e;
  }
}

/** Не админ — только энергия и лайки. */
export function assertSoftKinds(actor: PromoActor, kinds: readonly PromoKind[]): void {
  if (actor.soft && kinds.some((k) => !PROMO_SOFT_KINDS.includes(k))) {
    throw new Error("promo.err_kind_soft");
  }
}

/** Чьи коды видны и правятся: не админ — только свои, админ — все (null). */
export const ownerOf = (actor: PromoActor): string | null => (actor.soft ? actor.by : null);
