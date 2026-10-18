// chips-pack — pack grants listing, open, inventory (buy moved to chips-pack-buy).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import type { PgChipPack, PgChipPackGrant } from "../db/pg";
import { requireWallet } from "./chips-mint-helpers";
import { isPremiumCollection } from "@/lib/tirageBonus";
import { isChipResting } from "../chipRest";
import { chipLite } from "./chips-inventory-lite";
import { getCollectionUsedCounts } from "./chips-utils";
import { openOneChipPack } from "./chips-pack-open";
import { accountOf } from "./user-shared";
import { daraiRate, starsFromDarai } from "./darai-stars";
import { accountIdOf } from "./user-shared";

// Re-export buy/reconcile for backward compatibility (imported by components)
export { buyChipPack, purchaseChipPackViaDarai, reconcileMyDaraiPacks } from "./chips-pack-buy";

export const listChipPacksPublic = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = requireWallet();
  const { data: rows } = await pg.chipPacks
    .raw()
    .select("*")
    .eq("active", true)
    .eq("market_hidden", false)
    .order("created_at", { ascending: false });
  const packs = (rows ?? []) as PgChipPack[];

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data: todayGrants } = await pg.chipPackGrants
    .raw()
    .select("chip_pack_id")
    .eq("account_id", (await accountIdOf(wallet)) ?? "нет-аккаунта")
    .gte("granted_at", startOfDay.toISOString());
  const dailyUsedByPack = new Map<string, number>();
  for (const g of (todayGrants ?? []) as Array<{ chip_pack_id: string }>) {
    dailyUsedByPack.set(g.chip_pack_id, (dailyUsedByPack.get(g.chip_pack_id) ?? 0) + 1);
  }

  const allColIds = new Set<string>();
  for (const p of packs) {
    const dt = p.drop_table as { dropTable?: Array<{ collectionId?: string | null }> } | null;
    for (const it of dt?.dropTable ?? []) if (it.collectionId) allColIds.add(it.collectionId);
  }
  const cols = await pg.chipCollections.findMany();
  const supplyById = new Map(cols.map((c) => [c.id, c.initial_supply]));
  const usedMap = await getCollectionUsedCounts(Array.from(allColIds));
  const isExhausted = (cid: string): boolean =>
    (supplyById.get(cid) ?? 0) <= (usedMap.get(cid) ?? 0);

  const out: Array<{
    id: string;
    name: string;
    description: string | null;
    coverImageUrl: string | null;
    kind: PgChipPack["kind"];
    priceDarai: number | null;
    priceTickets: number | null;
    priceStars: number | null;
    dailyLimit: number;
    dailyUsedToday: number;
    totalSupply: number | null;
    soldCount: number;
    dropTable: PgChipPack["drop_table"];
    startsAt: string | null;
    endsAt: string | null;
  }> = [];
  // Звёзды — от цены в DARAI по курсу (darai-stars.ts); нет курса — прежние.
  const rate = packs.some((p) => p.price_darai != null) ? await daraiRate() : null;
  for (const p of packs) {
    const dt = (p.drop_table ?? {}) as {
      slots?: number;
      dropTable?: Array<{
        collectionId?: string | null;
        templateId?: string | null;
        level: number;
        weight: number;
      }>;
      guarantees?: Array<{ minLevel: number; slotsAtLeast: number }>;
    };
    const filteredItems = (dt.dropTable ?? []).filter(
      (it) => !it.collectionId || !isExhausted(it.collectionId),
    );
    if (filteredItems.length === 0) continue;
    out.push({
      id: p.id,
      name: p.name,
      description: p.description,
      coverImageUrl: p.cover_image_url,
      kind: p.kind,
      priceDarai: p.price_darai,
      priceTickets: p.price_tickets,
      priceStars: starsFromDarai(p.price_darai, rate) ?? p.price_stars,
      dailyLimit: p.daily_limit,
      dailyUsedToday: dailyUsedByPack.get(p.id) ?? 0,
      totalSupply: p.total_supply,
      soldCount: p.sold_count,
      dropTable: { ...dt, dropTable: filteredItems },
      startsAt: p.starts_at,
      endsAt: p.ends_at,
    });
  }
  return out;
});

export const openChipPack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ grantId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const results = await openOneChipPack(wallet, data.grantId);
    return { ok: true, results };
  });

export const openChipPacks = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ chipPackId: z.string().min(1), count: z.number().int().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const BATCH_MAX = 50;
    const { data: grantsRaw } = await pg.chipPackGrants
      .raw()
      .select("id")
      .eq("account_id", await accountOf(wallet))
      .eq("chip_pack_id", data.chipPackId)
      .is("opened_at", null)
      .order("granted_at", { ascending: true })
      .limit(Math.min(data.count, BATCH_MAX));
    const grantIds = ((grantsRaw ?? []) as Array<{ id: string }>).map((g) => g.id);
    if (grantIds.length === 0) throw new Error("Нет неоткрытых паков этого типа");

    const allResults: Awaited<ReturnType<typeof openOneChipPack>> = [];
    let opened = 0;
    const errors: string[] = [];
    for (const grantId of grantIds) {
      try {
        const r = await openOneChipPack(wallet, grantId);
        allResults.push(...r);
        opened++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[openChipPacks] open failed:", grantId, msg);
        errors.push(msg);
      }
    }
    if (opened === 0 && errors.length > 0) throw new Error(errors[0]);
    return { ok: true, opened, results: allResults };
  });

export const myChipPackGrants = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = requireWallet();
  // Чтение грантов паков по аккаунту ИЛИ кошам-сёстрам (объединение) —
  // остаются при аккаунте после детача коша.
  const { readOwnedById } = await import("./user-shared");
  // Только НЕОТКРЫТЫЕ: экраны паков (лагерь, «Мои паки») показывают и
  // считают лишь их, а вся история с составом выпавшего у активных игроков —
  // до 11 тыс. записей и 3,5 МБ на ответ (замер 11.10.2026: 644 вызова в
  // сутки, 2,2 ГБ разбора на телефонах).
  const grants = await readOwnedById<PgChipPackGrant>(wallet, () =>
    pg.chipPackGrants.raw().select("*").is("opened_at", null),
  );
  grants.sort((a, b) => (b.granted_at ?? "").localeCompare(a.granted_at ?? ""));
  if (grants.length === 0) return [];
  const packIds = Array.from(new Set(grants.map((g) => g.chip_pack_id)));
  const { data: packRows } = await pg.chipPacks
    .raw()
    .select("id,name,cover_image_url,kind")
    .in("id", packIds);
  const packMap = new Map(
    (
      (packRows ?? []) as Array<{
        id: string;
        name: string;
        cover_image_url: string | null;
        kind?: string | null;
      }>
    ).map((p) => [p.id, p]),
  );
  return grants
    .filter((g) => packMap.get(g.chip_pack_id)?.kind !== "mystic")
    .map((g) => {
      const pk = packMap.get(g.chip_pack_id);
      return {
        id: g.id,
        chipPackId: g.chip_pack_id,
        packName: pk?.name ?? "Пак",
        packImageUrl: pk?.cover_image_url ?? null,
        source: g.source,
        sourceRef: g.source_ref,
        grantedAt: g.granted_at,
        openedAt: g.opened_at,
        resultChips: g.result_chips,
        ticketsSpent: g.tickets_spent,
      };
    });
});

export const myChipInventory = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = requireWallet();
  // Объединение (account_id ИЛИ коши-сёстры) вместо прежнего either/or: тот
  // отбрасывал сестёр при наличии аккаунта и мог прятать фишку с пустой меткой
  // (C1). Тут фишки остаются при аккаунте после детача И не теряются у твинков.
  const { readOwnedById } = await import("./user-shared");
  const inv = await readOwnedById<{
    id: string;
    template_id: string;
    level: number;
    collection_id: string;
    serial_no: number | null;
    obtained_at: string;
    status: string;
    rest_until: string | null;
  }>(wallet, () =>
    pg.userChipInventory
      .raw()
      .select("id,template_id,level,collection_id,serial_no,obtained_at,status,rest_until")
      // 'staked' — фишка учится в университете: в инвентаре она видна, но
      // серой и с пометкой, а в бой, крафт и на маркет не идёт (там свои
      // проверки на 'owned'). Прятать её совсем нельзя — игрок ищет пропажу.
      .in("status", ["owned", "listed", "staked"]),
  );
  if (inv.length === 0) return [];

  // Оглушение боссом висит на конкретной фишке (chip_effects) — такие в бой
  // не берутся. Тянем срок снятия, чтобы клиент показал сепию + таймер.
  const stunUntil = new Map<string, string>();
  {
    const { mcpExec } = await import("../db/mcpClient");
    const { sqlStr } = await import("./raid-shared");
    const ids = inv.map((r) => sqlStr(r.id)).join(",");
    const rows = (await mcpExec(
      `SELECT chip_id, expires_at FROM yuplink.chip_effects
          WHERE kind = 'stun' AND expires_at > now() AND chip_id IN (${ids});`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ chip_id: string; expires_at: string }>;
    for (const r of rows ?? []) stunUntil.set(r.chip_id, r.expires_at);
  }

  const counts = new Map<string, number>();
  const restingCounts = new Map<string, number>();
  const stunnedCounts = new Map<string, number>();
  const onSaleCounts = new Map<string, number>();
  const studyingCounts = new Map<string, number>();
  const chipsByKey = new Map<
    string,
    Array<{
      id: string;
      serialNo: number | null;
      obtainedAt: string;
      restUntil?: string | null;
      stunUntil?: string | null;
      /** Учится в университете: не воюет, не продаётся, забирается оттуда же. */
      studying?: boolean;
    }>
  >();
  const idsByKey = new Map<string, string[]>();
  const key = (t: string, l: number) => `${t}:::${l}`;
  for (const r of inv) {
    const k = key(r.template_id, r.level);
    if (r.status === "listed") {
      onSaleCounts.set(k, (onSaleCounts.get(k) ?? 0) + 1);
      continue;
    }
    if (r.status === "staked") {
      studyingCounts.set(k, (studyingCounts.get(k) ?? 0) + 1);
      // В боевой счёт такая фишка не идёт, но в списке экземпляров остаётся —
      // серой и с пометкой «учится» (chipBusy): игрок должен видеть, где она.
      const sarr = chipsByKey.get(k) ?? [];
      sarr.push({ ...chipLite(r, null), studying: true });
      chipsByKey.set(k, sarr);
      continue;
    }
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (isChipResting(r.rest_until)) restingCounts.set(k, (restingCounts.get(k) ?? 0) + 1);
    const stun = stunUntil.get(r.id) ?? null;
    if (stun) stunnedCounts.set(k, (stunnedCounts.get(k) ?? 0) + 1);
    const arr = idsByKey.get(k) ?? [];
    arr.push(r.id);
    idsByKey.set(k, arr);
    const carr = chipsByKey.get(k) ?? [];
    carr.push(chipLite(r, stun));
    chipsByKey.set(k, carr);
  }

  const templateIds = Array.from(new Set(inv.map((r) => r.template_id)));
  const { data: tplRows } = await pg.chipTemplates
    .raw()
    .select("id,name,image_url,collection_id,template_no")
    .in("id", templateIds);
  const tplMap = new Map(
    (
      (tplRows ?? []) as Array<{
        id: string;
        name: string;
        image_url: string;
        collection_id: string;
        template_no: number;
      }>
    ).map((t) => [t.id, t]),
  );

  const collectionIds = Array.from(
    new Set(Array.from(tplMap.values()).map((t) => t.collection_id)),
  );
  const { data: colRows } = await pg.chipCollections
    .raw()
    .select("id,name,initial_supply,is_premium")
    .in("id", collectionIds);
  const colMap = new Map(
    (
      (colRows ?? []) as Array<{
        id: string;
        name: string;
        initial_supply: number;
        is_premium: boolean;
      }>
    ).map((c) => [c.id, c]),
  );

  const out: Array<{
    templateId: string;
    templateNo: number;
    templateName: string;
    imageUrl: string;
    collectionId: string;
    collectionName: string;
    tirage: number | null;
    isPremium: boolean;
    level: number;
    count: number;
    onSaleCount: number;
    /** Сколько таких фишек сейчас учится в университете. */
    studyingCount: number;
    restingCount: number;
    stunnedCount: number;
    chipIds: string[];
    chips: Array<{
      id: string;
      serialNo: number | null;
      obtainedAt: string;
      restUntil?: string | null;
      stunUntil?: string | null;
      studying?: boolean;
    }>;
  }> = [];
  const allKeys = new Set<string>([
    ...counts.keys(),
    ...onSaleCounts.keys(),
    ...studyingCounts.keys(),
  ]);
  for (const k of allKeys) {
    const [templateId, levelStr] = k.split(":::");
    const tpl = tplMap.get(templateId);
    if (!tpl) continue;
    out.push({
      templateId,
      templateNo: tpl.template_no,
      templateName: tpl.name,
      imageUrl: tpl.image_url,
      collectionId: tpl.collection_id,
      collectionName: colMap.get(tpl.collection_id)?.name ?? "Коллекция",
      tirage: colMap.get(tpl.collection_id)?.initial_supply ?? null,
      isPremium: isPremiumCollection(
        colMap.get(tpl.collection_id)?.name,
        colMap.get(tpl.collection_id)?.is_premium,
      ),
      level: Number(levelStr),
      count: counts.get(k) ?? 0,
      onSaleCount: onSaleCounts.get(k) ?? 0,
      studyingCount: studyingCounts.get(k) ?? 0,
      restingCount: restingCounts.get(k) ?? 0,
      stunnedCount: stunnedCounts.get(k) ?? 0,
      chipIds: idsByKey.get(k) ?? [],
      chips: chipsByKey.get(k) ?? [],
    });
  }
  out.sort((a, b) => b.level - a.level || a.templateName.localeCompare(b.templateName));
  return out;
});
