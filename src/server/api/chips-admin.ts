import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import type { PgChipCollection, PgChipTemplate, PgChipPack } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";

function requireAdmin(): string {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("Только админ");
  return w;
}

function requireWallet(): string {
  const w = getCurrentWallet();
  if (!w) throw new Error("Кошелёк не подключён");
  assertNotMaintenance(w);
  return w;
}

const imageRef = z
  .string()
  .min(1)
  .refine((v) => v.startsWith("/") || /^https?:\/\//.test(v), {
    message: "Ожидается путь /uploads/... или http(s)-URL",
  });

function sqlStr(v: string): string {
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function getCollectionUsedCounts(collectionIds: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (collectionIds.length === 0) return m;
  const ids = collectionIds.map((id) => sqlStr(id)).join(",");
  const rows = (await mcpExec(
    `SELECT collection_id, count(*)::int AS c
       FROM yuplink.user_chip_inventory
      WHERE collection_id IN (${ids})
      GROUP BY collection_id;`,
    { wrapJson: true },
  )) as Array<{ collection_id: string; c: number }>;
  for (const r of rows) m.set(r.collection_id, Number(r.c));
  return m;
}

export const adminCreateChipCollection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(100),
        description: z.string().max(2000).optional(),
        coverImageUrl: imageRef.optional(),
        initialSupply: z.number().int().nonnegative().default(10000),
        expandable: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireAdmin();
    const id = `cc_${nanoid(10)}`;
    const now = new Date().toISOString();
    const row: PgChipCollection = {
      id,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      cover_image_url: data.coverImageUrl ?? null,
      initial_supply: data.initialSupply,
      burned_count: 0,
      minted_count: 0,
      in_game_count: 0,
      status: "active",
      expandable: data.expandable,
      is_premium: false,
      sort_order: 0,
      created_at: now,
      created_by_wallet: wallet,
      updated_at: now,
    };
    await pg.chipCollections.insert(row);
    return { ok: true, id };
  });

export const adminListChipCollections = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  const { data: rows } = await pg.chipCollections
    .raw()
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  const collections = (rows ?? []) as PgChipCollection[];
  if (collections.length === 0) return [];
  const { data: tpls } = await pg.chipTemplates
    .raw()
    .select("*")
    .in(
      "collection_id",
      collections.map((c) => c.id),
    )
    .order("template_no", { ascending: true });
  const tplByCol = new Map<string, PgChipTemplate[]>();
  for (const t of (tpls ?? []) as PgChipTemplate[]) {
    const arr = tplByCol.get(t.collection_id) ?? [];
    arr.push(t);
    tplByCol.set(t.collection_id, arr);
  }
  // Считаем по факту: счётчики in_game_count/burned_count в таблице не
  // ведутся и показывали ерунду.
  const { getCollectionStats } = await import("./chips-collection-stats");
  const statsMap = await getCollectionStats(collections.map((c) => c.id));
  return collections.map((c) => {
    const st = statsMap.get(c.id);
    const used = st?.occupied ?? 0;
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      coverImageUrl: c.cover_image_url,
      initialSupply: c.initial_supply,
      burnedCount: st?.burned ?? 0,
      /** Именно NFT на чейне, а не число строк инвентаря. */
      mintedCount: st?.onChain ?? 0,
      inGameCount: st?.inGame ?? 0,
      /** Номера за пределами тиража — след старой выдачи «max+1». */
      aboveTirage: st?.aboveTirage ?? 0,
      availableToDrop: st?.free ?? Math.max(0, c.initial_supply - used),
      exhausted: (st?.free ?? 0) <= 0,
      status: c.status,
      expandable: c.expandable,
      isPremium: c.is_premium,
      sortOrder: c.sort_order,
      createdAt: c.created_at,
      templates: (tplByCol.get(c.id) ?? []).map((t) => ({
        id: t.id,
        templateNo: t.template_no,
        name: t.name,
        description: t.description,
        imageUrl: t.image_url,
        damageTable: t.damage_table,
        rarityHint: t.rarity_hint,
        sortOrder: t.sort_order,
      })),
    };
  });
});

export const adminUpdateChipCollection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(2000).nullable().optional(),
        coverImageUrl: imageRef.nullable().optional(),
        initialSupply: z.number().int().nonnegative().optional(),
        status: z.enum(["active", "sealed", "archived"]).optional(),
        expandable: z.boolean().optional(),
        isPremium: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const patch: Partial<PgChipCollection> = {
      updated_at: new Date().toISOString(),
    };
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.description !== undefined) patch.description = data.description?.trim() || null;
    if (data.coverImageUrl !== undefined) patch.cover_image_url = data.coverImageUrl;
    if (data.initialSupply !== undefined) patch.initial_supply = data.initialSupply;
    if (data.status !== undefined) patch.status = data.status;
    if (data.expandable !== undefined) patch.expandable = data.expandable;
    if (data.isPremium !== undefined) patch.is_premium = data.isPremium;
    if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;
    await pg.chipCollections.update({ id: data.id }, patch);
    return { ok: true };
  });

export const adminDeleteChipCollection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await pg.chipCollections.delete({ id: data.id });
    return { ok: true };
  });

export const adminCreateChipTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        collectionId: z.string().min(1),
        templateNo: z.number().int().positive(),
        name: z.string().max(150).optional(),
        description: z.string().max(1000).optional(),
        imageUrl: z.string().optional(),
        damageTable: z.array(z.any()).optional(),
        rarityHint: z.string().max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const id = `ct_${nanoid(10)}`;
    const row: PgChipTemplate = {
      id,
      collection_id: data.collectionId,
      template_no: data.templateNo,
      name: data.name?.trim() || `#${data.templateNo}`,
      description: data.description?.trim() || null,
      image_url: data.imageUrl || "",
      damage_table: data.damageTable ?? null,
      rarity_hint: data.rarityHint?.trim() || null,
      sort_order: data.templateNo,
      created_at: new Date().toISOString(),
    };
    try {
      await pg.chipTemplates.insert(row);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate|unique/i.test(msg)) {
        throw new Error(`Template #${data.templateNo} уже есть в этой коллекции`);
      }
      throw err;
    }
    return { ok: true, id };
  });

export const adminUpdateChipTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1),
        name: z.string().min(1).max(150).optional(),
        description: z.string().max(1000).nullable().optional(),
        imageUrl: imageRef.optional(),
        damageTable: z.array(z.any()).nullable().optional(),
        rarityHint: z.string().max(40).nullable().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const patch: Partial<PgChipTemplate> = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.description !== undefined) patch.description = data.description?.trim() || null;
    if (data.imageUrl !== undefined) patch.image_url = data.imageUrl;
    if (data.damageTable !== undefined) patch.damage_table = data.damageTable;
    if (data.rarityHint !== undefined) patch.rarity_hint = data.rarityHint?.trim() || null;
    if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;
    await pg.chipTemplates.update({ id: data.id }, patch);
    return { ok: true };
  });

export const adminDeleteChipTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await pg.chipTemplates.delete({ id: data.id });
    return { ok: true };
  });

export const dropTableItemSchema = z.object({
  collectionId: z.string().nullable().optional(),
  templateId: z.string().nullable().optional(),
  level: z
    .number()
    .min(1)
    .max(9)
    .refine((v) => Math.round(v * 2) === v * 2, {
      message: "level должен быть кратен 0.5 (1, 1.5, 2, …, 5)",
    }),
  weight: z.number().min(0.01).max(100),
});

export const dropTableSchema = z.object({
  slots: z.number().int().min(1).max(10).default(3),
  dropTable: z.array(dropTableItemSchema).min(1).max(100),
  guarantees: z
    .array(
      z.object({
        minLevel: z.number().min(1).max(9),
        slotsAtLeast: z.number().int().min(1).max(10),
      }),
    )
    .optional(),
});

export const adminCreateChipPack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(150),
        description: z.string().max(2000).optional(),
        coverImageUrl: imageRef.optional(),
        kind: z.enum(["standard", "themed", "premium", "specialized", "seasonal"]),
        priceDarai: z.number().nonnegative().nullable().optional(),
        priceTickets: z.number().int().nonnegative().nullable().optional(),
        priceStars: z.number().int().nonnegative().nullable().optional(),
        dailyLimit: z.number().int().min(0).max(100).default(5),
        totalSupply: z.number().int().positive().nullable().optional(),
        dropTable: dropTableSchema,
        fallbackPackId: z.string().max(64).nullable().optional(),
        marketHidden: z.boolean().default(false),
        startsAt: z.string().nullable().optional(),
        endsAt: z.string().nullable().optional(),
      })
      .refine(
        (d) =>
          d.marketHidden ||
          (d.priceDarai !== null && d.priceDarai !== undefined) ||
          (d.priceTickets !== null && d.priceTickets !== undefined) ||
          (d.priceStars !== null && d.priceStars !== undefined),
        { message: "Задай цену (DARAI, билеты или звёзды) или отметь «только для раздач»" },
      )
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
      kind: data.kind,
      price_darai: data.priceDarai ?? null,
      price_tickets: data.priceTickets ?? null,
      price_stars: data.priceStars ?? null,
      daily_limit: data.dailyLimit,
      total_supply: data.totalSupply ?? null,
      sold_count: 0,
      drop_table: data.dropTable,
      fallback_pack_id: data.fallbackPackId || null,
      active: true,
      market_hidden: data.marketHidden,
      starts_at: data.startsAt ?? null,
      ends_at: data.endsAt ?? null,
      created_at: now,
      created_by_wallet: wallet,
      updated_at: now,
    };
    await pg.chipPacks.insert(row);
    return { ok: true, id };
  });

export const adminListChipPacks = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  const { data: rows } = await pg.chipPacks
    .raw()
    .select("*")
    .neq("kind", "mystic")
    .order("created_at", { ascending: false });
  const packs = (rows ?? []) as PgChipPack[];

  const allColIds = new Set<string>();
  for (const p of packs) {
    const dt = p.drop_table as {
      dropTable?: Array<{ collectionId?: string | null }>;
    } | null;
    for (const it of dt?.dropTable ?? []) if (it.collectionId) allColIds.add(it.collectionId);
  }
  const cols = await pg.chipCollections.findMany();
  const supplyById = new Map(cols.map((c) => [c.id, c.initial_supply]));
  const usedMap = await getCollectionUsedCounts(Array.from(allColIds));
  const isExhausted = (cid: string): boolean =>
    (usedMap.get(cid) ?? 0) >= (supplyById.get(cid) ?? 0);

  return packs.map((p) => {
    const dt = p.drop_table as {
      dropTable?: Array<{ collectionId?: string | null }>;
    } | null;
    const items = dt?.dropTable ?? [];
    const live = items.filter((it) => !it.collectionId || !isExhausted(it.collectionId));
    const exhausted = items.length > 0 && live.length === 0;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      coverImageUrl: p.cover_image_url,
      kind: p.kind,
      priceDarai: p.price_darai,
      priceTickets: p.price_tickets,
      priceStars: p.price_stars,
      dailyLimit: p.daily_limit,
      totalSupply: p.total_supply,
      soldCount: p.sold_count,
      dropTable: p.drop_table,
      fallbackPackId: p.fallback_pack_id ?? null,
      active: p.active,
      marketHidden: p.market_hidden,
      startsAt: p.starts_at,
      endsAt: p.ends_at,
      createdAt: p.created_at,
      exhausted,
    };
  });
});

export const adminUpdateChipPack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1),
        name: z.string().min(1).max(150).optional(),
        description: z.string().max(2000).nullable().optional(),
        coverImageUrl: imageRef.nullable().optional(),
        kind: z.enum(["standard", "themed", "premium", "specialized", "seasonal"]).optional(),
        priceDarai: z.number().nonnegative().nullable().optional(),
        priceTickets: z.number().int().nonnegative().nullable().optional(),
        priceStars: z.number().int().nonnegative().nullable().optional(),
        dailyLimit: z.number().int().min(0).max(100).optional(),
        totalSupply: z.number().int().positive().nullable().optional(),
        dropTable: dropTableSchema.optional(),
        fallbackPackId: z.string().max(64).nullable().optional(),
        active: z.boolean().optional(),
        marketHidden: z.boolean().optional(),
        startsAt: z.string().nullable().optional(),
        endsAt: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const patch: Partial<PgChipPack> = {
      updated_at: new Date().toISOString(),
    };
    if (data.marketHidden !== undefined) patch.market_hidden = data.marketHidden;
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.description !== undefined) patch.description = data.description?.trim() || null;
    if (data.coverImageUrl !== undefined) patch.cover_image_url = data.coverImageUrl;
    if (data.kind !== undefined) patch.kind = data.kind;
    if (data.priceDarai !== undefined) patch.price_darai = data.priceDarai;
    if (data.priceStars !== undefined) patch.price_stars = data.priceStars;
    if (data.priceTickets !== undefined) patch.price_tickets = data.priceTickets;
    if (data.dailyLimit !== undefined) patch.daily_limit = data.dailyLimit;
    if (data.totalSupply !== undefined) patch.total_supply = data.totalSupply;
    if (data.dropTable !== undefined) patch.drop_table = data.dropTable;
    // Пустая строка = «замены нет»: селект в админке отдаёт её при сбросе.
    if (data.fallbackPackId !== undefined) patch.fallback_pack_id = data.fallbackPackId || null;
    if (data.active !== undefined) patch.active = data.active;
    if (data.startsAt !== undefined) patch.starts_at = data.startsAt;
    if (data.endsAt !== undefined) patch.ends_at = data.endsAt;
    await pg.chipPacks.update({ id: data.id }, patch);
    return { ok: true };
  });

export const adminDeleteChipPack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();

    const { data: opened } = await pg.chipPackGrants
      .raw()
      .select("id", { count: "exact", head: false })
      .eq("chip_pack_id", data.id)
      .not("opened_at", "is", null)
      .limit(1);
    const hasOpened = (opened ?? []).length > 0;

    if (hasOpened) {
      await pg.chipPacks.update({ id: data.id }, { active: false });
      return { ok: true, mode: "soft" as const };
    }

    await pg.chipPackGrants.delete({ chip_pack_id: data.id });
    try {
      await pg.chipPacks.delete({ id: data.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/foreign key/i.test(msg)) {
        await pg.chipPacks.update({ id: data.id }, { active: false });
        return { ok: true, mode: "soft" as const };
      }
      throw e;
    }
    return { ok: true, mode: "hard" as const };
  });
