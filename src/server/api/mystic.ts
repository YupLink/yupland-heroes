// ─────────────────────────── Мистические боксы ───────────────────────────
// Мистический бокс = мистери-бокс: заводится в YupLink (как chip-pack-грант),
// выдаётся подарком или подпиской, открывается → роллит ОДИН приз из
// взвешенного пула. Приз — любой внутриигровой ресурс (владелец, 29.09): виды
// в lib/mysticKinds.ts, выдача — mystic-grant.ts.
//
// Бокс хранится в chip_packs (kind='mystic', пул в колонке mystic_pool),
// грант — в chip_pack_grants (контейнер владения и поток depositNftAsPack).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import type { PgChipPack, PgChipPackGrant } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { MYSTIC_KINDS, type MysticKind } from "@/lib/mysticKinds";
import type { MysticPrize } from "./mystic-grant";
import {
  mysticPoolSchema,
  mysticPoolSaveSchema,
  parseMysticPool,
  poolStats,
  type MysticTier,
} from "./mystic-pool";

export { MYSTIC_KINDS, mysticPoolSchema, parseMysticPool };
export type { MysticKind, MysticPrize, MysticTier };
// Открытие и симулятор — в своих файлах (лимит 250 строк); импорты прежние.
export { openMysticBox } from "./mystic-open";
export { simulateMysticOpens } from "./mystic-sim";

function requireAdmin(): string {
  const wallet = getCurrentWallet();
  if (!wallet || !isAdminWallet(wallet)) throw new Error("Нет доступа");
  return wallet;
}

// путь /uploads/... ИЛИ http(s) (как imageRef в chips.ts)
const imageRef = z
  .string()
  .trim()
  .refine((v) => v.startsWith("/") || /^https?:\/\//.test(v), {
    message: "Ожидается путь /uploads/... или http(s)-ссылка",
  });

// ─────────────────────────── Server fns ───────────────────────────

export const adminCreateMysticPack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(150),
        description: z.string().max(2000).optional(),
        coverImageUrl: imageRef.optional(),
        pool: mysticPoolSaveSchema, // USDT — отказ (ПРАВИЛА §8.49а)
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireAdmin();
    const id = `cp_${nanoid(10)}`;
    const now = new Date().toISOString();
    const row: PgChipPack = {
      id,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      cover_image_url: data.coverImageUrl ?? null,
      kind: "mystic",
      price_darai: null,
      price_tickets: null,
      price_stars: null,
      daily_limit: 0,
      total_supply: null,
      sold_count: 0,
      drop_table: { slots: 0, dropTable: [] }, // NOT NULL заглушка; мистик роллит из mystic_pool
      mystic_pool: data.pool,
      active: true,
      market_hidden: true, // только для раздач/заводов, не в маркет
      starts_at: null,
      ends_at: null,
      created_at: now,
      created_by_wallet: wallet,
      updated_at: now,
    };
    await pg.chipPacks.insert(row);
    return { ok: true, id };
  });

export const adminUpdateMysticPack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1),
        name: z.string().min(1).max(150).optional(),
        description: z.string().max(2000).nullable().optional(),
        coverImageUrl: imageRef.nullable().optional(),
        pool: mysticPoolSaveSchema.optional(),
        active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.description !== undefined) patch.description = data.description?.trim() || null;
    if (data.coverImageUrl !== undefined) patch.cover_image_url = data.coverImageUrl ?? null;
    if (data.pool !== undefined) patch.mystic_pool = data.pool;
    if (data.active !== undefined) patch.active = data.active;
    await pg.chipPacks.raw().update(patch).eq("id", data.id).eq("kind", "mystic");
    return { ok: true };
  });

export const adminListMysticPacks = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  const { data: rows } = await pg.chipPacks
    .raw()
    .select("*")
    .eq("kind", "mystic")
    .order("created_at", { ascending: false });
  const packs = (rows ?? []) as PgChipPack[];
  return packs.map((p) => {
    const pool = parseMysticPool(p.mystic_pool) ?? [];
    const { sum, blankPct } = poolStats(pool);
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      coverImageUrl: p.cover_image_url,
      active: p.active,
      pool,
      weightSum: sum,
      blankPct,
      createdAt: p.created_at,
    };
  });
});

/** Выдать N штук существующего бокса игроку — ПОДАРКОМ.
 *  Боксы больше не падают в инвентарь молча: игрок видит подарок в кружке на
 *  карте и забирает сам (см. gifts.ts). */
export const adminGrantMysticBox = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        wallet: z.string().trim().min(3),
        packId: z.string().min(1),
        count: z.number().int().min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const admin = requireAdmin();
    const pack = await pg.chipPacks.findOne({ id: data.packId });
    if (!pack || pack.kind !== "mystic") throw new Error("Это не мистический бокс");
    const { accountOf } = await import("./user-shared");
    const account = await accountOf(data.wallet);
    const { createGift } = await import("./gifts-create");
    const { nanoid: rid } = await import("nanoid");
    await createGift({
      accountId: account,
      kind: "pack",
      amount: data.count,
      refId: data.packId,
      title: pack.name,
      image: pack.cover_image_url ?? null,
      sourceRef: `admin-pack:${data.packId}:${account}:${rid(8)}`,
      createdBy: admin,
    });
    return { ok: true, granted: data.count, packName: pack.name };
  });

/** Инвентарь: заведённые мистик-боксы аккаунта (по sisters). Доступно ЛЮБОМУ
 *  залогиненому — иначе выданный админом бокс не появлялся бы у получателя.
 *  ВАЖНО: без сессии возвращаем [] БЕЗ throw. Этот запрос дёргают ВСЕ на
 *  вкладке «Паки» (MyPacksTab гейтит рендер на его isLoading) — если бросать
 *  requireAuth, у гостей запрос ретраит и вкладка «Паки» виснет. */
export const listMyMysticPacks = createServerFn({ method: "GET" }).handler(async () => {
  // Списком должен пользоваться ЛЮБОЙ владелец бокса (открытие уже не гейтится
  // на админа). Раньше был `!isAdminWallet → return []` → выданные админом
  // боксы не появлялись у получателя (жалоба Ярослава 08.08).
  const wallet = getCurrentWallet();
  if (!wallet) return [];
  const { data: packRows } = await pg.chipPacks
    .raw()
    .select("id,name,cover_image_url")
    .eq("kind", "mystic");
  const packs = (packRows ?? []) as Pick<PgChipPack, "id" | "name" | "cover_image_url">[];
  if (packs.length === 0) return [];
  const byId = new Map(packs.map((p) => [p.id, p]));
  // Объединение (account_id ИЛИ коши-сёстры, дедуп) — мистик-боксы остаются
  // при аккаунте после детача коша. Открытые не показываем.
  const { readOwnedById } = await import("./user-shared");
  const grants = (
    await readOwnedById<PgChipPackGrant>(wallet, () =>
      pg.chipPackGrants
        .raw()
        .select("*")
        .in(
          "chip_pack_id",
          packs.map((p) => p.id),
        )
        .is("opened_at", null),
    )
  ).sort((a, b) => (b.granted_at ?? "").localeCompare(a.granted_at ?? ""));
  return grants.map((g) => {
    const p = byId.get(g.chip_pack_id);
    return {
      grantId: g.id,
      packId: g.chip_pack_id,
      packName: p?.name ?? "Мистический бокс",
      coverImageUrl: p?.cover_image_url ?? null,
      opened: !!g.opened_at,
      prize: (g.result_chips as MysticPrize | null) ?? null,
      grantedAt: g.granted_at,
      source: g.source,
    };
  });
});
