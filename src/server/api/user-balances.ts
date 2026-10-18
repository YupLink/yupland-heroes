// AUTO-EXTRACTED from user.ts lines 6760-6885
// mySisterWalletsBalances + локальные конверторы raw/yocto

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
import { getSisterWallets } from "./user-shared";
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


export const mySisterWalletsBalances = createServerFn({ method: "GET" })
  .handler(async () => {
    const wallet = getCurrentWallet();
    if (!wallet) return { active: null, byToken: {}, near: { totalHuman: "0" } };
    const sisters = await getSisterWallets(wallet);
    const tokens = await pg.rewardTokens.findMany();
    const tokenByContract = new Map(tokens.map((t) => [t.ft_contract, t]));

    const FASTNEAR = "https://api.fastnear.com";
    // Параллельно: для каждого sister-кошелька — FT + NEAR.
    const results = await Promise.all(
      sisters.map(async (acc) => {
        // FT
        let fts: Array<{ contract_id: string; balance: string }> = [];
        try {
          const r = await fetch(
            `${FASTNEAR}/v1/account/${encodeURIComponent(acc)}/ft`
          );
          if (r.ok) {
            const j = (await r.json()) as {
              tokens?: Array<{ contract_id: string; balance: string }>;
            };
            fts = (j.tokens ?? []).filter((t) => t.balance && t.balance !== "0");
          }
        } catch {
          // ignore single-wallet failure
        }
        // NEAR
        let nearYocto = "0";
        try {
          const { nearRpc } = await import("../rpc");
          const j = await nearRpc<{ amount?: string }>("query", {
            request_type: "view_account",
            finality: "final",
            account_id: acc,
          });
          nearYocto = j.result?.amount ?? "0";
        } catch {
          // ignore
        }
        return { acc, fts, nearYocto };
      })
    );

    // Агрегация по symbol.
    const byToken: Record<
      string,
      {
        symbol: string;
        ftContract: string;
        decimals: number;
        totalRaw: string;
        totalHuman: string;
        byWallet: Array<{ wallet: string; raw: string; human: string }>;
      }
    > = {};

    for (const r of results) {
      for (const t of r.fts) {
        const meta = tokenByContract.get(t.contract_id);
        if (!meta) continue; // только known reward-tokens
        const cur = byToken[meta.symbol] ?? {
          symbol: meta.symbol,
          ftContract: meta.ft_contract,
          decimals: meta.decimals,
          totalRaw: "0",
          totalHuman: "0",
          byWallet: [],
        };
        cur.totalRaw = (BigInt(cur.totalRaw) + BigInt(t.balance)).toString();
        cur.byWallet.push({
          wallet: r.acc,
          raw: t.balance,
          human: rawToHumanLocal(t.balance, meta.decimals),
        });
        byToken[meta.symbol] = cur;
      }
    }
    for (const k of Object.keys(byToken)) {
      byToken[k].totalHuman = rawToHumanLocal(
        byToken[k].totalRaw,
        byToken[k].decimals
      );
    }

    const totalNearYocto = results
      .reduce((acc, r) => acc + BigInt(r.nearYocto), 0n)
      .toString();

    return {
      active: wallet,
      byToken,
      near: {
        totalYocto: totalNearYocto,
        totalHuman: yoctoToNearHuman(totalNearYocto),
        byWallet: results.map((r) => ({
          wallet: r.acc,
          yocto: r.nearYocto,
          human: yoctoToNearHuman(r.nearYocto),
        })),
      },
    };
  });

function rawToHumanLocal(raw: string, decimals: number): string {
  if (decimals === 0) return raw;
  const r = BigInt(raw);
  const divisor = 10n ** BigInt(decimals);
  const whole = r / divisor;
  const remainder = r % divisor;
  if (remainder === 0n) return whole.toString();
  const frac = remainder
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "")
    .slice(0, 4);
  return frac ? `${whole}.${frac}` : whole.toString();
}
function yoctoToNearHuman(y: string): string {
  return rawToHumanLocal(y, 24);
}

/**
 * Глобальные итоги магазина билетов: всего сожжено энергии и токенов
 * за всё время. Public-эндпоинт — отображается в шапке магазина.
 */
