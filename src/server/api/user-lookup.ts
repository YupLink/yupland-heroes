// AUTO-EXTRACTED from user.ts lines 7750-7948
// lookupNftClaim — публичный поиск NFT по token_id

import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import * as ed25519 from "@noble/ed25519";
import { base58, base64 } from "@scure/base";
import { buildNep413Hash } from "@/lib/nep413";
import { pg, sb, type PgCampaign, type PgCollectionTitle, type PgNft, type PgRedemption, type PgUser } from "../db/pg";
import {
  evaluateFarmTokenCooldown,
  evaluateFarmTokenCooldownReadonly,
} from "../farmTokenCooldown";
import { SENDLER_LOOKUP_CONTRACT, maskWallet } from "./user-shop-lookup";
import {
  clearCurrentWallet,
  getCurrentWallet,
  isAdminWallet,
  isPayoutsAdminWallet,
  isTgBypassWallet,
  requirePayoutsAdmin,
  setCurrentWallet,
} from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { mcpExec } from "../db/mcpClient";
import { parseRewardTiers, pickWeightedReward, rollReward } from "../random";
import { sameTitle, normalizeTitle } from "@/lib/normalizeTitle";
import {
  fetchAdminFtTransferHistory,
  fetchSendlerNftById,
  fetchSendlerNftsByOwner,
  fetchSendlerNftsByTitle,
} from "../sendler";
import {
  ftTransfer,
  humanToRaw,
  ensureStorageDeposit,
  getOperatingBalanceRaw,
  getOperatingNearBalance,
  hasEnough,
  invalidateBalanceCache,
  verifyFtTransfer,
} from "../near";
import {
  signAndSendSafe,
  ftTransferAction,
  checkTxStatus,
  getAdminAccountId,
  type TxStatus,
} from "../nearSafe";
import { notifyLowBalanceDaily } from "../tg";
import { getReputationForWallets } from "../reputation";
import { requireFreshClient } from "../buildGate";

// Maintenance mode: MAINTENANCE_MODE=true в Vercel env переключает сайт в
// режим «системные работы» для всех кроме админов. Без редеплоя через
// Vercel CLI: `vercel env add MAINTENANCE_MODE` / `vercel env rm`.
function isMaintenanceMode(): boolean {
  return (process.env.MAINTENANCE_MODE ?? "").toLowerCase() === "true";
}

// Закрытая бета: BETA_ADMIN_ONLY=true открывает сайт только admin-кошелькам
// (ADMIN_WALLETS), остальные видят экран «идёт закрытое тестирование».
// В отличие от MAINTENANCE_MODE (который через AppShell гейтит только часть
// роутов), этот флаг читается в __root.tsx и блокирует ЛЮБОЙ роут.
// Тоггл без редеплоя: `vercel env add BETA_ADMIN_ONLY` / `vercel env rm`.
function isBetaAdminOnly(): boolean {
  return (process.env.BETA_ADMIN_ONLY ?? "").toLowerCase() === "true";
}


export const lookupNftClaim = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        tokenId: z.string().min(1),
        contractId: z.string().optional(),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const contractId = data.contractId?.trim() || SENDLER_LOOKUP_CONTRACT;
    const tokenId = data.tokenId.trim();

    // 1. История погашений в drop'ах (любых — активных и неактивных)
    const redRows = await pg.redemptions.findMany({
      contract_id: contractId,
      token_id: tokenId,
    });

    const campIds = Array.from(
      new Set(redRows.map((r) => r.campaign_id).filter(Boolean) as string[])
    );
    const camps =
      campIds.length > 0
        ? (((
            await pg.campaigns.raw().select("*").in("id", campIds)
          ).data as PgCampaign[]) ?? [])
        : [];
    const campMap = new Map(camps.map((c) => [c.id, c]));

    const redemptionsOut = redRows.map((r) => {
      const c = r.campaign_id ? campMap.get(r.campaign_id) : null;
      return {
        dropId: r.campaign_id,
        dropTitle: c?.name ?? "(дроп удалён)",
        amount: r.amount,
        rewardToken: r.reward_token ?? c?.reward_token ?? "?",
        redeemedAt: r.redeemed_at,
        status: r.status,
        walletMasked: maskWallet(r.wallet),
      };
    });

    // 2. Узнаём title + image + текущего owner'а у NFT.
    //    Sendler ?token_id=... поломан (игнорирует фильтр), ?owner_id=... тоже,
    //    зато ?title=... надёжно отдаёт всех владельцев title'а. Стратегия:
    //      a) nfts-кэш (быстро если уже видели)
    //      b) campaign.name из истории погашений (если был клейм — title тот же)
    //      c) перебираем title'ы из collection_titles этого контракта,
    //         каждый title=... ищем — на хите получаем title+media+owner.
    let nftTitle: string | null = null;
    let nftMedia: string | null = null;
    let currentOwner: string | null = null;
    const cachedNft = await pg.nfts.findFirst({
      contract_id: contractId,
      token_id: tokenId,
    });
    if (cachedNft) {
      nftTitle = cachedNft.name;
      nftMedia = cachedNft.image;
      currentOwner = cachedNft.owner_wallet ?? null;
    }
    if (!nftTitle && camps.length > 0) {
      nftTitle = camps[0].name;
    }
    if (!nftMedia || !currentOwner) {
      const candidateTitles: string[] = [];
      if (nftTitle) {
        candidateTitles.push(nftTitle);
      } else {
        const titles = await pg.collectionTitles.findMany({
          contract_id: contractId,
        });
        for (const r of titles) candidateTitles.push(r.title);
      }
      const findResults = await Promise.all(
        candidateTitles.map(async (t) => {
          try {
            const items = await fetchSendlerNftsByTitle(contractId, t);
            const hit = items.find((it) => it.token_id === tokenId);
            return hit ? { title: t, hit } : null;
          } catch {
            return null;
          }
        })
      );
      const found = findResults.find((x) => x !== null) as
        | { title: string; hit: { title?: string; media?: string; owner_id?: string } }
        | null
        | undefined;
      if (found) {
        const fromHit = (found.hit.title ?? "").trim();
        nftTitle = nftTitle ?? (fromHit || found.title);
        nftMedia = nftMedia ?? (found.hit.media ?? null);
        currentOwner = currentOwner ?? (found.hit.owner_id ?? null);
        try {
          await pg.nfts.upsert(
            {
              id: `${contractId}:${tokenId}`,
              contract_id: contractId,
              token_id: tokenId,
              collection: contractId,
              name: nftTitle ?? found.title,
              image: nftMedia ?? "",
              owner_wallet: currentOwner,
            },
            { onConflict: "id" }
          );
        } catch {
          // ignore
        }
      }
    }

    const redeemedDropIds = new Set(redemptionsOut.map((r) => r.dropId));
    let eligibleDrops: Array<{
      id: string;
      title: string;
      rewardSpec: string;
      rewardToken: string;
      freeClaim: boolean;
      alreadyRedeemed: boolean;
      mode: "simple" | "combo";
    }> = [];
    if (nftTitle) {
      const activeDrops = await pg.campaigns.findMany({
        status: "active",
        contract_id: contractId,
      });
      eligibleDrops = activeDrops
        .filter((d) => {
          if (d.mode === "combo") {
            try {
              const reqs = JSON.parse(d.requirements ?? "[]") as Array<{
                title: string;
                count: number;
              }>;
              return reqs.some((r) => sameTitle(r.title, nftTitle));
            } catch {
              return false;
            }
          }
          return sameTitle(d.name, nftTitle);
        })
        .map((d) => ({
          id: d.id,
          title: d.name,
          rewardSpec:
            d.reward_min === d.reward_max
              ? String(d.reward_min)
              : `${d.reward_min}-${d.reward_max}`,
          rewardToken: d.reward_token,
          freeClaim: d.free_claim,
          alreadyRedeemed: redeemedDropIds.has(d.id),
          mode: (d.mode ?? "simple") as "simple" | "combo",
        }));
    }

    // 3. Активные ticket-events, где эта NFT (по title) требуется.
    let ticketEventsUsing: Array<{
      id: string;
      requirements: Array<{ title: string; count: number }>;
      rewardTickets: number;
      cooldownHours: number;
    }> = [];
    if (nftTitle) {
      const allActiveEvents = await pg.ticketEvents.findMany({ active: true });
      ticketEventsUsing = allActiveEvents
        .map((e) => {
          let reqs: Array<{ title: string; count: number }> = [];
          try {
            reqs = JSON.parse(e.requirements);
          } catch {
            reqs = [];
          }
          return { e, reqs };
        })
        .filter(({ reqs }) => reqs.some((r) => sameTitle(r.title, nftTitle)))
        .map(({ e, reqs }) => ({
          id: e.id,
          requirements: reqs,
          rewardTickets: e.reward_tickets,
          cooldownHours: e.hold_duration_sec / 3600,
        }));
    }

    return {
      contractId,
      tokenId,
      title: nftTitle,
      media: nftMedia,
      currentOwner,
      currentOwnerMasked: currentOwner ? maskWallet(currentOwner) : null,
      redemptions: redemptionsOut,
      eligibleDrops,
      ticketEventsUsing,
    };
  });

