// Тест острова новичка без админки (19.10.2026): админы + дизайнер.
// Отдельное право — только кнопка «Остров новичка» на карте и её ручки (войти,
// выйти, заново); остальная админка закрыта. Опознание — по ПРОВЕРЕННОМУ
// Telegram сессии (id, а не юзернейм: юзернейм можно занять).
// Право island_tester (admin-rights, 12.11.2026) — то же для любого аккаунта:
// владелец: «сделай так, чтобы она могла это всё сама» — Google-профиль
// дизайнера отдельный аккаунт, Telegram у него нет.
import { getCurrentWallet, getSessionTgId, isAdminWallet } from "@/server/auth";
import { teamDesignerTg, teamTgIds } from "@/server/team";

/** Дизайнер — TG id из env (TEAM_DESIGNER_TG, server/team); пусто — никого. */
const islandTesterTgIds = (): number[] => teamTgIds(teamDesignerTg());

/**
 * Тест-аккаунт прогонов обучения (владелец, 05.11.2026: «сделай пробежку по острову,
 * как новичок»): остров и общий маршрут новичка, не пилотный. Только эта пара
 * кошелёк + Telegram.
 */
const ISLAND_RUN_ACCOUNT = { wallet: "tgtest_hw_1784407160136", tgId: 999000001 } as const;

/** Pilot tutorial variant only for the owner's verified Telegram identity. */
export function isIslandTutorialPilot(tgId: number | null): boolean {
  return tgId != null && islandTesterTgIds().includes(tgId);
}

export function isIslandTester(wallet: string | null, tgId: number | null): boolean {
  if (isAdminWallet(wallet)) return true;
  if (wallet === ISLAND_RUN_ACCOUNT.wallet && tgId === ISLAND_RUN_ACCOUNT.tgId) return true;
  return !!wallet && tgId != null && islandTesterTgIds().includes(tgId);
}

/** Тестер острова: админ, дизайнер по Telegram или право island_tester у аккаунта. */
export async function islandTesterAccess(wallet: string | null, tgId: number | null): Promise<boolean> {
  if (isIslandTester(wallet, tgId)) return true;
  const { walletHasRight } = await import("@/server/admin-rights");
  return walletHasRight(wallet, "island_tester");
}

export async function requireIslandTester(): Promise<string> {
  const wallet = getCurrentWallet();
  if (!(await islandTesterAccess(wallet, getSessionTgId()))) {
    throw new Error("Доступ запрещён: тест острова новичка");
  }
  return wallet as string;
}
