import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { getCurrentWallet, requireAdmin } from "../auth";
import { createAdminPayoutRequest } from "../adminPayouts";

export const listRewardTokens = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    const rows = await pg.rewardTokens.findMany(undefined, {
      orderBy: { column: "sort_order", ascending: true },
    });
    return rows.map((t) => ({
      symbol: t.symbol,
      ftContract: t.ft_contract,
      decimals: t.decimals,
      minWithdraw: t.min_withdraw ?? 1,
    }));
  }
);

/**
 * Обновление min_withdraw для токена. Используется для управления спамом
 * мелких выводов (юзеры копят до минимума).
 */
export const setTokenMinWithdraw = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        symbol: z.string().min(1),
        minWithdraw: z.number().int().min(1).max(1_000_000),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    await pg.rewardTokens.update(
      { symbol: data.symbol },
      { min_withdraw: data.minWithdraw }
    );
    return { ok: true };
  });

/**
 * Запрос ручной выплаты с сервисного admin-коша на ЛЮБОЙ NEAR-адрес.
 * Создаёт pending-запись, шлёт TG-confirm всем админам. on-chain TX
 * происходит ТОЛЬКО после нажатия "Подтвердить" в Telegram.
 */
export const requestAdminPayout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        recipient: z.string().min(2).max(64),
        symbol: z.string().min(1),
        amount: z.number().int().positive().max(1_000_000),
        reason: z.string().min(3).max(500),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const token = await pg.rewardTokens.findOne({ symbol: data.symbol });
    if (!token) throw new Error(`Неизвестный токен: ${data.symbol}`);
    // USDT уходит только из свободного с запасом — деньги игроков не трогаем (§8.49а).
    if (data.symbol.toLowerCase() === "usdt") {
      const { assertSpendableUsdt } = await import("./usdt-guard");
      await assertSpendableUsdt(data.amount, "выплата");
    }
    const requester =
      (await getCurrentWallet()) ?? "admin"; // wallet текущей сессии
    const result = await createAdminPayoutRequest({
      recipient: data.recipient,
      ftContract: token.ft_contract,
      symbol: data.symbol,
      decimals: token.decimals,
      amount: data.amount,
      reason: data.reason,
      requestedBy: requester,
    });
    return result;
  });
