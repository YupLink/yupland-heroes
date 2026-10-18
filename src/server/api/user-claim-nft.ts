import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { normalizeTitle } from "@/lib/normalizeTitle";
import { fetchSendlerNftsByOwner, fetchSendlerNftsByTitle } from "../sendler";
import { requireLinkedTelegram } from "./user-claims-inventory";
import { getSisterWallets } from "./user-claims-core";
import { invalidateTicketsCache } from "./user-claims-tickets";
import { NFT_PRIZE_OWNER } from "./user-claims-types";

export const claimNftDrop = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        dropId: z.string().min(1),
        tokenId: z.string().min(1),
        feeTxHash: z.string().min(20),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    await requireLinkedTelegram(wallet);

    const campaign = await pg.campaigns.findOne({ id: data.dropId });
    if (!campaign) throw new Error("Дроп не найден");
    if (campaign.status !== "active") throw new Error("Дроп не активен");
    if (campaign.reward_kind !== "nft")
      throw new Error("Этот дроп с FT-наградой, используй обычный claim");
    if (!campaign.nft_contract || !campaign.nft_pool)
      throw new Error("У NFT-дропа не задан pool");

    // Ключ строки клейма для свободного дропа. Проверка «уже забирал» была
    // обычным SELECT перед вставкой, а пул содержит много токенов — быстрые
    // повторные нажатия хватали РАЗНЫЕ токены и проходили все: в проде так
    // набралось по тридцать выдач на один кошелёк. Теперь «один на аккаунт»
    // держит первичный ключ, а не скорость чтения.
    let freeClaimId: string | null = null;
    if (campaign.free_claim) {
      const sisters = await getSisterWallets(wallet);
      const { ticketAccountId } = await import("./tickets-ledger");
      const account = (await ticketAccountId(wallet)) ?? wallet;
      const safe = (v: string) => v.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
      freeClaimId = `nfr_${safe(campaign.id)}_${safe(account)}`;

      const { data: mine } = await pg.nftRedemptions
        .raw()
        .select("id")
        .eq("campaign_id", campaign.id)
        .in("user_wallet", sisters)
        .limit(1);
      if (mine && mine.length > 0) {
        throw new Error("Бесплатный дроп — 1 на аккаунт, ты уже забрал");
      }
    }

    // Платный дроп гасит КОНКРЕТНУЮ NFT игрока. Раньше её идентификатор
    // приходил из тела запроса и не проверялся вовсе: можно было прислать
    // выдуманную строку и получать призы из пула, не владея ничем.
    if (!campaign.free_claim) {
      const { buildOwnedIndex, getOwnedByTitle } = await import("./user-shared");
      const owners = await getSisterWallets(wallet);
      const idx = await buildOwnedIndex(
        [{ contractId: campaign.contract_id, title: campaign.name }],
        owners,
      );
      const owned = getOwnedByTitle(idx, campaign.contract_id, campaign.name);
      if (!owned.some((it) => it.token_id === data.tokenId)) {
        throw new Error("Эта NFT не твоя или не участвует в дропе");
      }
      const { verifyClaimFeeTx } = await import("../claimFee");
      const v = await verifyClaimFeeTx({
        txHash: data.feeTxHash,
        signerExpected: wallet,
      });
      if (!v.ok) throw new Error(`Fee verification: ${v.error}`);
    }

    let pool: Array<{
      tokenId?: string;
      title?: string;
      weight: number;
      count?: number;
    }>;
    try {
      pool = JSON.parse(campaign.nft_pool ?? "[]");
    } catch {
      throw new Error("Невалидный nft_pool");
    }
    if (pool.length === 0) throw new Error("Pool пустой");

    const already = await pg.nftRedemptions.findMany({
      campaign_id: campaign.id,
    });
    const usedSet = new Set(already.map((r) => r.token_id));

    const candidates = pool.flatMap((item) => {
      const tokenIds: string[] = [];
      if (item.tokenId) tokenIds.push(item.tokenId);
      return tokenIds
        .filter((tid) => !usedSet.has(tid))
        .map((tid) => ({ tokenId: tid, weight: item.weight }));
    });
    if (candidates.length === 0)
      throw new Error("В пуле не осталось NFT для выдачи");

    const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
    let pick = Math.random() * totalWeight;
    let chosen = candidates[0].tokenId;
    for (const c of candidates) {
      pick -= c.weight;
      if (pick <= 0) {
        chosen = c.tokenId;
        break;
      }
    }

    // ЗАМОК ПЕРВЫМ: строка погашения с уникальным ключом (кампания, контракт,
    // токен). Раньше приз резервировался раньше замка, и падение второй
    // вставки оставляло выданный приз без учёта.
    const lockId = nanoid();
    try {
      await pg.redemptions.insert({
        id: lockId,
        contract_id: campaign.contract_id,
        token_id: data.tokenId,
        campaign_id: campaign.id,
        wallet,
        amount: 0,
        tx_hash: null,
        status: "paid",
        reward_token: null,
        ft_contract: null,
        decimals: null,
        ticket_cost: campaign.ticket_cost,
        fee_tx_hash: campaign.free_claim ? null : data.feeTxHash,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("duplicate") || msg.includes("unique")) {
        throw new Error("По этой NFT приз уже забирали");
      }
      throw err;
    }

    try {
      await pg.nftRedemptions.insert({
        id: freeClaimId ?? nanoid(),
        campaign_id: campaign.id,
        user_wallet: wallet,
        contract_id: campaign.nft_contract,
        token_id: chosen,
        status: "pending",
        fee_tx_hash: campaign.free_claim ? null : data.feeTxHash,
        nft_title: campaign.name ?? null,
      });
    } catch (err) {
      // Приз не достался — снимаем замок, иначе игрок потеряет свою NFT ни за что.
      await pg.redemptions.delete({ id: lockId }).catch(() => undefined);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("duplicate") || msg.includes("unique")) {
        // Для свободного дропа ключ строки — кампания плюс аккаунт, значит
        // столкновение здесь означает ровно одно: этот аккаунт уже забрал.
        if (freeClaimId) throw new Error("Бесплатный дроп — 1 на аккаунт, ты уже забрал");
        throw new Error("NFT уже забрали — попробуй ещё раз");
      }
      throw err;
    }

    invalidateTicketsCache(await getSisterWallets(wallet));
    return {
      ok: true,
      awarded: { contract_id: campaign.nft_contract, token_id: chosen },
    };
  });

export const myPendingNfts = createServerFn({ method: "GET" }).handler(
  async () => {
    const wallet = getCurrentWallet();
    if (!wallet) return [];
    const sisters = await getSisterWallets(wallet);
    const { data } = await pg.nftRedemptions
      .raw()
      .select("*")
      .in("user_wallet", sisters)
      .eq("status", "pending");
    const rows = (data ?? []) as Array<{
      id: string;
      contract_id: string;
      token_id: string;
      campaign_id: string | null;
      claimed_at: string;
      nft_title: string | null;
    }>;

    const ids = rows.map((r) => r.id);
    let titleByRedemption = new Map<string, string>();
    if (ids.length > 0) {
      const { data: pInv } = await pg.userPackInventory
        .raw()
        .select("result_nft_redemption_id,result_nft_title")
        .in("result_nft_redemption_id", ids);
      for (const p of (pInv ?? []) as Array<{
        result_nft_redemption_id: string;
        result_nft_title: string | null;
      }>) {
        if (p.result_nft_title) {
          titleByRedemption.set(p.result_nft_redemption_id, p.result_nft_title);
        }
      }
    }
    const campIds = Array.from(
      new Set(rows.map((r) => r.campaign_id).filter(Boolean))
    ) as string[];
    let campTitleMap = new Map<string, string>();
    if (campIds.length > 0) {
      const { data: camps } = await pg.campaigns
        .raw()
        .select("id,name")
        .in("id", campIds);
      for (const c of (camps ?? []) as Array<{ id: string; name: string }>) {
        campTitleMap.set(c.id, c.name);
      }
    }

    return rows.map((r) => ({
      id: r.id,
      contract_id: r.contract_id,
      token_id: r.token_id,
      campaign_id: r.campaign_id,
      claimed_at: r.claimed_at,
      nftTitle:
        r.nft_title ??
        titleByRedemption.get(r.id) ??
        (r.campaign_id ? campTitleMap.get(r.campaign_id) : undefined) ??
        null,
    }));
  }
);
