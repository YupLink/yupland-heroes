// Паки (loot-boxes): админ создаёт пак с составом (NFT/FT с шансами),
// юзер выигрывает их в дропах, открывает кликом, получает случайный приз.
//
// Roll-логика идентична TiersBreakdown:
//   total = max(100, sum(chance_pct))
//   если sum<100 → остаток в «Молодец» (без награды)
//   roll = randomInt(0, totalScaled) → walk через items пока acc>=r

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import type { PgNftPack, PgNftPackItem, PgUserPackInventory } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { rollReward } from "../random";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { secureRandomInt } from "@/lib/secureRandom";
import { accountOf } from "./user-shared";
import { isUsdt, USDT_BANNED_MSG } from "@/lib/usdtBanned";

// ──────── Admin: CRUD паков ────────

const itemSchema = z
  .object({
    kind: z.enum(["nft", "ft"]),
    nftContract: z.string().min(2).max(100).optional(),
    nftTitle: z.string().min(1).max(200).optional(),
    ftToken: z.string().min(1).max(20).optional(),
    ftMin: z.number().int().nonnegative().optional(),
    ftMax: z.number().int().nonnegative().optional(),
    chancePct: z.number().min(0.01).max(100),
  })
  .refine(
    (d) =>
      (d.kind === "nft" && !!d.nftTitle) ||
      (d.kind === "ft" && !!d.ftToken && d.ftMin != null && d.ftMax != null),
    { message: "Для kind=nft нужен nftTitle, для kind=ft — ftToken+ftMin+ftMax" },
  )
  // USDT пак не выдаёт: приз без предела, а USDT — живые деньги (ПРАВИЛА §8.49а).
  .refine((d) => !(d.kind === "ft" && isUsdt(d.ftToken)), { message: USDT_BANNED_MSG });

export const adminCreatePack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        imageUrl: z.string().url().optional(),
        items: z.array(itemSchema).min(1).max(50),
      })
      .refine((d) => d.items.reduce((s, i) => s + i.chancePct, 0) <= 100.001, {
        message: "Сумма шансов должна быть ≤ 100 (остаток уходит в «Молодец»)",
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
    const packId = `pk_${nanoid(10)}`;
    const now = new Date().toISOString();
    const packRow: PgNftPack = {
      id: packId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      image_url: data.imageUrl ?? null,
      created_by_wallet: wallet,
      created_at: now,
      updated_at: now,
      active: true,
    };
    await pg.nftPacks.insert(packRow);
    const itemRows: PgNftPackItem[] = data.items.map((it, i) => ({
      id: `pki_${nanoid(10)}`,
      pack_id: packId,
      kind: it.kind,
      nft_contract: it.nftContract ?? null,
      nft_title: it.nftTitle ?? null,
      ft_token: it.ftToken ?? null,
      ft_min: it.ftMin ?? null,
      ft_max: it.ftMax ?? null,
      chance_pct: it.chancePct,
      sort_order: i,
      created_at: now,
    }));
    await pg.nftPackItems.insert(itemRows);
    return { ok: true, id: packId };
  });

export const adminListPacks = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ activeOnly: z.boolean().optional().default(false) }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
    let q = pg.nftPacks.raw().select("*").order("created_at", { ascending: false });
    if (data.activeOnly) q = q.eq("active", true);
    const { data: packs } = await q;
    const packsArr = (packs ?? []) as PgNftPack[];
    if (packsArr.length === 0) return [];
    const { data: items } = await pg.nftPackItems
      .raw()
      .select("*")
      .in(
        "pack_id",
        packsArr.map((p) => p.id),
      )
      .order("sort_order", { ascending: true });
    const itemsByPack = new Map<string, PgNftPackItem[]>();
    for (const it of (items ?? []) as PgNftPackItem[]) {
      const arr = itemsByPack.get(it.pack_id) ?? [];
      arr.push(it);
      itemsByPack.set(it.pack_id, arr);
    }
    return packsArr.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      imageUrl: p.image_url,
      active: p.active,
      createdAt: p.created_at,
      items: (itemsByPack.get(p.id) ?? []).map((it) => ({
        id: it.id,
        kind: it.kind,
        nftContract: it.nft_contract,
        nftTitle: it.nft_title,
        ftToken: it.ft_token,
        ftMin: it.ft_min,
        ftMax: it.ft_max,
        chancePct: it.chance_pct,
        sortOrder: it.sort_order,
      })),
    }));
  });

export const adminTogglePack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1), active: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
    await pg.nftPacks.update(
      { id: data.id },
      { active: data.active, updated_at: new Date().toISOString() },
    );
    return { ok: true };
  });

export const adminDeletePack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
    await pg.nftPacks.delete({ id: data.id });
    return { ok: true };
  });

// ──────── Public: список активных паков (для поиска в форме дропа) ────────

export const listActivePacks = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ query: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    let q = pg.nftPacks
      .raw()
      .select("id, name, image_url, description")
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (data.query && data.query.trim()) {
      q = q.ilike("name", `%${data.query.trim()}%`);
    }
    const { data: rows } = await q;
    return (
      (rows ?? []) as Array<{
        id: string;
        name: string;
        image_url: string | null;
        description: string | null;
      }>
    ).map((p) => ({
      id: p.id,
      name: p.name,
      imageUrl: p.image_url,
      description: p.description,
    }));
  });

// ──────── User: инвентарь паков ────────

export const myPackInventory = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return [];
  // Паки принадлежат аккаунту.
  const { accountOf } = await import("./user");
  const { sb } = await import("../db/pg");
  const { data: inv } = await sb
    .from("user_pack_inventory")
    .select("*")
    .order("obtained_at", { ascending: false })
    .limit(200)
    .eq("account_id", await accountOf(wallet));
  const rows = (inv ?? []) as PgUserPackInventory[];
  if (rows.length === 0) return [];
  const packIds = Array.from(new Set(rows.map((r) => r.pack_id)));
  const { data: packs } = await pg.nftPacks
    .raw()
    .select("id, name, image_url, description")
    .in("id", packIds);
  const packMap = new Map(
    (
      (packs ?? []) as Array<{
        id: string;
        name: string;
        image_url: string | null;
        description: string | null;
      }>
    ).map((p) => [p.id, p]),
  );
  return rows.map((r) => {
    const p = packMap.get(r.pack_id);
    return {
      id: r.id,
      packId: r.pack_id,
      packName: p?.name ?? r.pack_id,
      packImage: p?.image_url ?? null,
      packDescription: p?.description ?? null,
      status: r.status,
      source: r.source,
      obtainedAt: r.obtained_at,
      openedAt: r.opened_at,
      resultKind: r.result_kind,
      resultNftTitle: r.result_nft_title,
      resultFtToken: r.result_ft_token,
      resultFtAmount: r.result_ft_amount,
    };
  });
});

// ──────── User: открыть пак ────────

export const openPack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ inventoryId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    assertNotMaintenance(wallet);
    // per-TG: можно открыть пак, лежащий на ЛЮБОМ sister-коше аккаунта
    // (anti-spoof: проверяем принадлежность к TG-сетке).
    const { getSisterWallets } = await import("./user");
    const account = await accountOf(wallet);
    const inv = await pg.userPackInventory.findOne({ id: data.inventoryId });
    if (!inv || inv.account_id !== account) throw new Error("Пак не найден");
    if (inv.status === "opened") {
      throw new Error("Этот пак уже открыт");
    }
    // Занять пак ДО броска (аудит 11.11.2026): иначе N параллельных запросов
    // проходили проверку выше и получали N призов с одного пака.
    const took = (await mcpExec(
      `UPDATE yuplink.user_pack_inventory SET status = 'opened', opened_at = now()
        WHERE id = ${sqlStr(inv.id)} AND account_id = ${sqlStr(account)} AND status = 'unopened'
        RETURNING id`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }> | null;
    if (!took?.length) throw new Error("Этот пак уже открыт");
    // Сбой до выдачи — пак обратно закрытым; приз выдан — остаётся открытым.
    let granted = false;
    try {
      // Загружаем items
      const { data: items } = await pg.nftPackItems
        .raw()
        .select("*")
        .eq("pack_id", inv.pack_id)
        .order("sort_order", { ascending: true });
      const itemsArr = (items ?? []) as PgNftPackItem[];
      if (itemsArr.length === 0) {
        throw new Error("Пак пуст — обратись к админу");
      }

      // Roll: total = max(100, sum_chances). Если sum<100 → виртуальный «Молодец».
      const sumChances = itemsArr.reduce((s, i) => s + i.chance_pct, 0);
      const total = Math.max(100, sumChances);
      const SCALE = 100; // chance_pct до 2 знаков → scale 100
      const totalScaled = Math.max(1, Math.floor(total * SCALE));
      const r = secureRandomInt(0, totalScaled);
      let acc = 0;
      let chosen: PgNftPackItem | null = null;
      for (const it of itemsArr) {
        acc += Math.floor(it.chance_pct * SCALE);
        if (r < acc) {
          chosen = it;
          break;
        }
      }
      // chosen === null → выпал «Молодец»-хвост

      const nowIso = new Date().toISOString();
      type Result =
        | {
            kind: "nft";
            nftTitle: string;
            nftImage?: string | null;
            tokenId?: string;
            redemptionId?: string;
          }
        | {
            kind: "ft";
            token: string;
            amount: number;
            redemptionId?: string;
          }
        | { kind: "molodec" };
      let result: Result;

      if (!chosen) {
        result = { kind: "molodec" };
      } else if (chosen.kind === "nft" && chosen.nft_title) {
        // Резервируем NFT через общий helper
        const { tryReserveNftPrize: tryReserveNftPrizeShared } = await import("./user-claims-core");
        // campaignId=null: NFT приходит из nft_packs, а не из campaigns.
        // FK nft_redemptions.campaign_id → campaigns(id) ругался бы на pack_id.
        // Связь «из какого пака» хранится в user_pack_inventory.result_nft_*.
        const reserved = await tryReserveNftPrizeShared({
          contractId: chosen.nft_contract ?? "yuplandshop.mintbase1.near",
          nftTitle: chosen.nft_title,
          userWallet: wallet,
          campaignId: null,
        });
        if (reserved) granted = true;
        if (!reserved) {
          // NFT нет в призовом коше — fallback в «Молодец»
          result = { kind: "molodec" };
        } else {
          // Подтянуть image из collection_titles (там кэш по title)
          const { normalizeTitle } = await import("@/lib/normalizeTitle");
          const contractId = chosen.nft_contract ?? "yuplandshop.mintbase1.near";
          const ct = await pg.collectionTitles.findOne({
            id: `${contractId}:${normalizeTitle(chosen.nft_title)}`,
          });
          result = {
            kind: "nft",
            nftTitle: chosen.nft_title,
            nftImage: ct?.image ?? null,
            tokenId: reserved.tokenId,
            redemptionId: reserved.redemptionId,
          };
        }
      } else if (chosen.kind === "ft" && isUsdt(chosen.ft_token)) {
        // Старый тир с USDT — «Молодец»: USDT пак не выдаёт (ПРАВИЛА §8.49а).
        console.warn("[packs] ft-тир USDT пропущен", inv.pack_id, chosen.id);
        result = { kind: "molodec" };
      } else if (chosen.kind === "ft" && chosen.ft_token) {
        // Создаём FT-redemption row pending
        const min = chosen.ft_min ?? 0;
        const max = chosen.ft_max ?? min;
        const amount = rollReward(min, max);
        const tokenRow = await pg.rewardTokens.findOne({
          symbol: chosen.ft_token,
        });
        const redId = `r_${nanoid(10)}`;
        await pg.redemptions.insert({
          id: redId,
          contract_id: "pack",
          token_id: inv.id,
          campaign_id: null,
          wallet,
          amount,
          tx_hash: null,
          status: "pending",
          reward_token: chosen.ft_token,
          ft_contract: tokenRow?.ft_contract ?? null,
          decimals: tokenRow?.decimals ?? null,
          ticket_cost: 0,
          redeemed_at: nowIso,
        });
        granted = true;
        result = {
          kind: "ft",
          token: chosen.ft_token,
          amount,
          redemptionId: redId,
        };
      } else {
        result = { kind: "molodec" };
      }
      granted = true;

      // Обновляем inventory с результатом
      await pg.userPackInventory.update(
        { id: data.inventoryId },
        {
          status: "opened",
          opened_at: nowIso,
          result_kind: result.kind,
          result_nft_title: result.kind === "nft" ? result.nftTitle : null,
          result_nft_token_id: result.kind === "nft" ? (result.tokenId ?? null) : null,
          result_nft_redemption_id: result.kind === "nft" ? (result.redemptionId ?? null) : null,
          result_ft_token: result.kind === "ft" ? result.token : null,
          result_ft_amount: result.kind === "ft" ? result.amount : null,
          result_ft_redemption_id: result.kind === "ft" ? (result.redemptionId ?? null) : null,
        },
      );

      return { ok: true, result };
    } catch (e) {
      if (!granted) {
        await mcpExec(
          `UPDATE yuplink.user_pack_inventory SET status = 'unopened', opened_at = NULL
            WHERE id = ${sqlStr(inv.id)} AND status = 'opened' AND result_kind IS NULL;`,
        ).catch(() => undefined);
      }
      throw e;
    }
  });

// ──────── Internal helper: создать запись в инвентаре после выпадения pack-ярус ────────

export async function grantPackToUser(opts: {
  wallet: string;
  packId: string;
  source: "drop" | "admin_grant" | "buy";
  sourceRef?: string;
}): Promise<string> {
  // Chip-паки (cp_) — это YUPLINK-фишки. Выдаём их в chip_pack_grants;
  // юзер открывает на странице «Фишки» (openChipPack) и фишки падают в
  // инвентарь. NFT-паки (pk_) идут в user_pack_inventory (старая механика).
  if (opts.packId.startsWith("cp_")) {
    // Исчерпанный пак подменяем ЗДЕСЬ, на выдаче, а не только при открытии:
    // иначе игрок получал бы за приз пак, который заведомо не откроется, и
    // шёл бы с ним к админу. Замену задаёт админ у самого пака.
    const { resolveGrantablePack } = await import("./chips-pack-fallback");
    const packId = await resolveGrantablePack(opts.packId);
    const grantId = `cpg_${nanoid(10)}`;
    // source в chip_pack_grants имеет свой CHECK — маппим на разрешённые.
    const chipSource =
      opts.source === "admin_grant"
        ? "admin"
        : opts.source === "buy"
          ? "purchase_tickets"
          : "event"; // drop → event
    await pg.chipPackGrants.insert({
      id: grantId,
      account_id: await accountOf(opts.wallet),
      wallet: opts.wallet,
      chip_pack_id: packId,
      source: chipSource,
      source_ref: opts.sourceRef ?? null,
      granted_at: new Date().toISOString(),
      opened_at: null,
      result_chips: null,
      tickets_spent: 0,
    });
    return grantId;
  }

  const id = `pi_${nanoid(10)}`;
  const row: PgUserPackInventory = {
    id,
    account_id: await accountOf(opts.wallet),
    wallet: opts.wallet,
    pack_id: opts.packId,
    status: "unopened",
    source: opts.source,
    source_ref: opts.sourceRef ?? null,
    obtained_at: new Date().toISOString(),
    opened_at: null,
    result_kind: null,
    result_nft_title: null,
    result_nft_token_id: null,
    result_nft_redemption_id: null,
    result_ft_token: null,
    result_ft_amount: null,
    result_ft_redemption_id: null,
  };
  await pg.userPackInventory.insert(row);
  return id;
}
