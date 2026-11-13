// Кому и как открыта «Корона гречневого королевства». 07.11.2026 — «пока только
// админам и Кайлани» (на золото); 08.11 — тест для всех на фантики; 08.11 позже —
// «вырубай фантики и делай на реальное золото — списание и начисление реального
// золота, стату вести — кто сколько корон собрал и сколько гречи заработал».
// Теперь всем, кто вошёл, — на золото. Демо-режим (buckwheat-02-demo) остался в
// базе для партий, начатых на фантики: они доигрываются в своём режиме.
import { getCurrentWallet, getSessionTgId } from "../../auth";
import { isGoogleOnlyTg } from "@/lib/auth/googleTg";

/** gold — настоящее золото и копилка; demo — фантики, ничего не в счёт. */
export type BwMode = "gold" | "demo";

export async function buckwheatMode(
  wallet: string | null,
  account: string | null,
): Promise<BwMode | null> {
  if (!wallet || !account) return null;
  return "gold";
}

/** Открыта ли игра текущей сессии — для окна постройки на карте: всем, кто вошёл
 *  (в замке у игроков игры нет — только постройка на карте, 08.11). */
export async function buckwheatOpenForSession(): Promise<boolean> {
  return !!getCurrentWallet();
}

/**
 * Ставка DARAI (владелец 08.11: «вход 100 000, корона 50 000») — всем, кто вошёл, кроме
 * входа через Google: игра на деньги ему не показывается, как казино (06.11).
 */
export function buckwheatDaraiOpen(): boolean {
  return !!getCurrentWallet() && !isGoogleOnlyTg(getSessionTgId());
}
