// Ручки меню входа: «Начать игру» (новичок выбирает расу героя) или
// «Продолжить». Логика и SQL — в game-start-core: этот файл импортирует клиент,
// серверные модули грузятся внутри ручек.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSessionTgId, requireAccount, requireWallet } from "@/server/auth";
import type { GameStartStatus } from "./game-start-core";

export type { GameStartOption, GameStartStatus } from "./game-start-core";

/** Новичок ли игрок и из кого выбирать. */
export const getGameStart = createServerFn({ method: "GET" }).handler(
  async (): Promise<GameStartStatus> => {
    const account = await requireAccount();
    const { gameStartStatus } = await import("./game-start-core");
    return gameStartStatus(account);
  },
);

/** Выбор расы: обычный герой этой расы — стартовым героем, раз на аккаунт. */
export const startGame = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ templateId: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data }): Promise<{ granted: boolean; island: boolean }> => {
    const wallet = requireWallet();
    const account = await requireAccount();
    const { startGameWithHero } = await import("./game-start-core");
    return startGameWithHero(account, wallet, data.templateId, getSessionTgId());
  });
