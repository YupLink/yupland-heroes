// Энергопаки: админский CRUD и килсвич магазина.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg, sb } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { assertNotMaintenance } from "../maintenance";
import { requireFreshClient } from "../buildGate";
import {
  DARAI_FT_CONTRACT,
  DARAI_DECIMALS,
  DARAI_DEPOSIT_RECEIVER,
  ENERGY_SHOP_KEY,
  requireWallet,
  requireAdmin,
  sqlStr,
  applyDiscountCeil,
  energyShopEnabled,
  getCurrentWallet,
  isAdminWallet,
} from "./energy-packs-shared";

// ──────── АДМИН ────────
const packInput = z.object({
  id: z.string().optional(),
  title: z.string().default(""),
  amount: z.number().int().min(1).max(100000),
  priceTickets: z.number().min(0).nullable().optional(),
  priceDarai: z.number().min(0).nullable().optional(),
  // Один произвольный FT-токен экосистемы (symbol из reward_tokens) + цена в нём.
  priceTokenSymbol: z.string().nullable().optional(),
  priceTokenAmount: z.number().min(0).nullable().optional(),
  dailyLimit: z.number().int().min(0).max(1000).default(1),
  // Лестница цен: каждая следующая покупка за день дороже предыдущей.
  // Задана — заменяет одиночные цены и dailyLimit (число ступеней = лимит).
  // Умное предложение: по каждой валюте своя лестница «цена × сколько раз
  // в день». Валюты независимы — исчерпание одной не гасит остальные.
  priceSteps: z
    .array(
      z.union([
        z.object({
          // usd — тариф в $: USDT / DARAI / Stars со счёта по курсу (lib/usdTariff.ts).
          kind: z.enum(["tickets", "darai", "usd"]),
          steps: z
            .array(
              z.object({ amount: z.number().positive(), times: z.number().int().min(1).max(50) }),
            )
            .min(1)
            .max(10),
        }),
        z.object({
          kind: z.literal("token"),
          symbol: z.string().min(1).max(24),
          steps: z
            .array(
              z.object({ amount: z.number().positive(), times: z.number().int().min(1).max(50) }),
            )
            .min(1)
            .max(10),
        }),
      ]),
    )
    .max(10)
    .nullable()
    .optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const adminListEnergyPacks = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  const { data } = await pg.energyPacks
    .raw()
    .select("*")
    .order("sort_order", { ascending: true })
    .order("amount", { ascending: true });
  return ((data ?? []) as Array<import("../db/pg").PgEnergyPack>).map((p) => ({
    id: p.id,
    title: p.title,
    amount: p.amount,
    priceSteps: p.price_steps ?? null,
    priceTickets: p.price_tickets,
    priceDarai: p.price_darai,
    priceTokenSymbol: p.price_token_symbol,
    priceTokenAmount: p.price_token_amount,
    dailyLimit: p.daily_limit,
    active: p.active,
    sortOrder: p.sort_order,
  }));
});

export const adminUpsertEnergyPack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => packInput.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    // Токен-цена: только если задан и symbol, и положительная сумма — иначе оба null.
    const tokSym =
      data.priceTokenSymbol && data.priceTokenAmount != null && data.priceTokenAmount > 0
        ? data.priceTokenSymbol
        : null;
    const tokAmt = tokSym ? (data.priceTokenAmount as number) : null;
    const patch = {
      title: data.title,
      amount: data.amount,
      price_tickets: data.priceTickets ?? null,
      price_darai: data.priceDarai ?? null,
      price_token_symbol: tokSym,
      price_token_amount: tokAmt,
      daily_limit: data.dailyLimit,
      active: data.active,
      sort_order: data.sortOrder,
      // undefined не трогаем (частичное сохранение), null — очистка лестницы.
      ...(data.priceSteps !== undefined ? { price_steps: data.priceSteps } : {}),
    };
    if (data.id) {
      await pg.energyPacks.update({ id: data.id }, patch);
      return { id: data.id };
    }
    const id = `enp_${nanoid(8)}`;
    await pg.energyPacks.insert({ id, ...patch, created_at: new Date().toISOString() });
    return { id };
  });

export const adminDeleteEnergyPack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await pg.energyPacks.delete({ id: data.id });
    return { ok: true };
  });

export const adminSetEnergyShopEnabled = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await pg.settings.upsert(
      { key: ENERGY_SHOP_KEY, value: data.enabled ? "true" : "false" },
      { onConflict: "key" },
    );
    return { ok: true, enabled: data.enabled };
  });

export const adminGetEnergyShopEnabled = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  return { enabled: await energyShopEnabled() };
});

/**
 * Сбросить дневные лимиты покупок ВСЕМ игрокам — и энерго-паки в магазине, и
 * «+10 за лайки». Разово, по нажатию: подарить всем ещё один заход, не дожидаясь
 * полуночи UTC.
 *
 * Для магазинных паков лимит живёт в самих квитанциях (energy_pack_purchases:
 * count(*) за today). Удалять их нельзя — это бухгалтерия. Двигаем `created_at`
 * на «вчера 23:59:59»: SQL-функция buy_energy_pack_atomic перестанет их считать
 * в «сегодня», а сумма проданного за прошлый день чуть подрастёт (это цена
 * подарка). Для «+10 за лайки» лимит — метка `settings(energy_like_daily:*)`;
 * стираем её.
 */
export const adminResetEnergyDailyLimits = createServerFn({ method: "POST" }).handler(async () => {
  requireAdmin();
  // Обе таблицы двигаем по одной — Postgres разрешает data-modifying CTE
  // только на верхнем уровне запроса, а mcpExec с wrapJsonCte оборачивает
  // наш SQL ещё одним WITH-подзапросом (для row_to_json). Пара UPDATE+DELETE
  // в одном WITH внутри такой обёртки падала с ровно этим сообщением
  // («WITH clause containing a data-modifying statement must be at the top
  // level»). Разбили — каждый запрос теперь сам себе верхний уровень.
  const shifted = (await mcpExec(
    `UPDATE yuplink.energy_pack_purchases
        SET created_at = date_trunc('day', now() AT TIME ZONE 'UTC') - interval '1 second'
      WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
      RETURNING 1;`,
    { wrapJsonCte: true },
  )) as Array<unknown>;
  const wiped = (await mcpExec(
    `DELETE FROM yuplink.settings WHERE key LIKE 'energy_like_daily:%' RETURNING 1;`,
    { wrapJsonCte: true },
  )) as Array<unknown>;
  return {
    ok: true as const,
    packReset: shifted.length,
    likeReset: wiped.length,
  };
});
