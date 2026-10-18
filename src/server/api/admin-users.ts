import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { requireAdmin } from "../auth";
import {
  getOperatingBalanceRaw,
  getOperatingNearBalance,
  rawToHuman,
} from "../near";

export const adminLoginPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        login: z.string().min(1),
        password: z.string().min(1),
        otp: z.string().optional(),
      })
      .parse(d)
  )
  .handler(async (): Promise<{ ok: true }> => {
    // Вход по паролю отключён (владелец, 18.10.2026): в игру входят только через
    // Telegram, админку дают кошелёк из списка или Telegram админа (auth.ts).
    throw new Error("Вход по паролю отключён — войди через Telegram");
  });

/**
 * Сервисный кошелёк выплат: адрес для пополнения + NEAR-баланс.
 */
export const getServiceWallet = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    const accountId = process.env.NEAR_SIGNER_ACCOUNT_ID;
    if (!accountId) throw new Error("NEAR_SIGNER_ACCOUNT_ID не задан");
    let nearBalance = "0";
    try {
      const yocto = await getOperatingNearBalance();
      nearBalance = rawToHuman(yocto, 24);
    } catch {
      // RPC недоступен — отдадим 0, UI это переживёт
    }
    return { accountId, nearBalance };
  }
);

/**
 * Балансы по всем 17 токенам справочника на оперативном кошельке.
 * Параллелит запросы к NEAR RPC. Если запрос провалился — возвращает '0'.
 */
export const getOperatingBalances = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    const tokens = await pg.rewardTokens.findMany(undefined, {
      orderBy: { column: "sort_order", ascending: true },
    });

    const results = await Promise.all(
      tokens.map(async (t) => {
        try {
          const raw = await getOperatingBalanceRaw(t.ft_contract);
          return {
            symbol: t.symbol,
            ftContract: t.ft_contract,
            decimals: t.decimals,
            raw,
            human: rawToHuman(raw, t.decimals),
            error: null as string | null,
          };
        } catch (err) {
          return {
            symbol: t.symbol,
            ftContract: t.ft_contract,
            decimals: t.decimals,
            raw: "0",
            human: "0",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );
    return results;
  }
);

// ── Управление ролями пользователей (тестировщик) ──

/** Список пользователей с ролями (для админки ролей). */
export const adminListUserRoles = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const limit = data.limit ?? 50;
    let query = pg.users
      .raw()
      .select("near_account_id, role, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data.search) {
      query = query.ilike("near_account_id", `%${data.search}%`);
    }
    const { data: rows } = await query;
    return { users: (rows ?? []) as Array<{ near_account_id: string; role: string | null; created_at: string }> };
  });

/** Установить роль пользователя. */
export const adminSetUserRole = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        wallet: z.string().min(1),
        role: z.enum(["user", "tester", "admin"]),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    await pg.users.raw().update({ role: data.role }).eq("near_account_id", data.wallet);
    return { ok: true };
  });
