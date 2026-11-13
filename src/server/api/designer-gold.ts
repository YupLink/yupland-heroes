// Кнопка «Получить золото» в профиле — только дизайнеру (владелец, 03.11.2026:
// только ей, 1000 за раз, без исключений). Аккаунт — из env (server/team).
// Обычное золото на её счёт через res_move (вид designer_gold — видно в
// журнале), без лимитов. Остальным ручка отказывает, строка у них не рисуется.
//
// Серверные модули грузятся внутри ручек: файл импортирует клиент.
import { createServerFn } from "@tanstack/react-start";

/** Сколько золота за одно нажатие. */
export const DESIGNER_GOLD_STEP = 1000;

async function allowedAccount(): Promise<string | null> {
  const { getCurrentWallet } = await import("@/server/auth");
  const wallet = getCurrentWallet();
  if (!wallet) return null;
  // Аккаунт дизайнера (TEAM_DESIGNER_ACCOUNT); не задан — кнопка никому.
  const { teamDesignerAccount } = await import("@/server/team");
  const designer = teamDesignerAccount();
  if (!designer) return null;
  const { accAccountId } = await import("./currency/move");
  const account = await accAccountId(wallet).catch(() => null);
  return account === designer ? account : null;
}

export const getDesignerGoldAccess = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ allowed: boolean }> => ({ allowed: (await allowedAccount()) !== null }),
);

/** +1 000 золота на счёт; ответ — новый остаток. */
export const takeDesignerGold = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ gold: number }> => {
    const account = await allowedAccount();
    if (!account) throw new Error("Нет доступа");
    const { goldMove, goldOf } = await import("./gold-move");
    const ref = `designer_gold:${globalThis.crypto.randomUUID()}`;
    await goldMove(account, DESIGNER_GOLD_STEP, "designer_gold", ref);
    return { gold: await goldOf(account) };
  },
);
