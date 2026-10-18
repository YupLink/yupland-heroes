// AUTO-EXTRACTED from user.ts lines 523-661
// getMyReputation, listMySisterWallets, unlinkSisterWallet, switchActiveWallet, disconnectWallet

import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import * as ed25519 from "@noble/ed25519";
import { base58, base64 } from "@scure/base";
import { buildNep413Hash } from "@/lib/nep413";
import {
  pg,
  sb,
  type PgCampaign,
  type PgCollectionTitle,
  type PgNft,
  type PgRedemption,
  type PgUser,
} from "../db/pg";
import { evaluateFarmTokenCooldown, evaluateFarmTokenCooldownReadonly } from "../farmTokenCooldown";
import { getSisterWallets } from "./user-shared";
import {
  clearCurrentWallet,
  getCurrentWallet,
  getSessionTgId,
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

export const getMyReputation = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return { rows: [], total: 0 };
  // Sister-кошельки: если TG привязан — все из telegramId-группы;
  // иначе — только активный.
  const me = await pg.users.findOne({ wallet });
  const wallets = me?.telegram_id
    ? (await pg.users.findMany({ telegram_id: me.telegram_id })).map((r) => r.wallet)
    : [wallet];
  return getReputationForWallets(wallets);
});

export const listMySisterWallets = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return { active: null, wallets: [] };
  // Smoke-test #1: первая функция переведена на Supabase (pg.users)
  const me = await pg.users.findOne({ wallet });
  if (!me?.account_id && !me?.telegram_id) {
    return {
      active: wallet,
      wallets: [{ wallet, telegramLinked: false, isActive: true }],
    };
  }
  // Кошельки аккаунта, но БЕЗ отключённых (disconnected скрыты из списка юзера;
  // их активы остаются на учётке через account_id).
  const rows = me.account_id
    ? await pg.users.findMany({ account_id: me.account_id })
    : await pg.users.findMany({ telegram_id: me.telegram_id! });
  // + кошельки Telegram сессии: у одного Telegram бывают кошельки разных
  // аккаунтов (пристёгнутые подписью), между ними тоже можно переключаться.
  const tgNow = getSessionTgId();
  if (tgNow) {
    for (const r of await pg.users.findMany({ telegram_id: tgNow })) {
      if (!rows.some((x) => x.wallet === r.wallet)) rows.push(r);
    }
  }
  return {
    active: wallet,
    wallets: rows
      .filter((s) => !s.disconnected)
      .map((s) => ({
        wallet: s.wallet,
        telegramLinked: true,
        isActive: s.wallet === wallet,
      })),
  };
});

/**
 * Само-отвязка sister-кошелька от текущего TG. Без флага «detached» —
 * кошелёк остаётся в БД, но теряет привязку к TG. Можно потом снова
 * подключить и привязать к ЛЮБОМУ TG (тому же или другому) через
 * обычный TelegramVerify-flow. Это покрывает кейс «случайно подключил
 * не тот кошелёк, хочу попробовать другой».
 *
 * Проверки:
 *  - вызывающий должен быть аутентифицирован
 *  - целевой кошелёк должен быть в той же TG-сетке (sister-кошелёк)
 *  - если отвязываем активный — сбрасываем и серверную сессию
 */
export const unlinkSisterWallet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ wallet: z.string().min(2) }).parse(d))
  .handler(async ({ data }) => {
    const target = data.wallet.toLowerCase();
    const current = getCurrentWallet();
    if (!current) throw new Error("Сессия не активна");
    const sisters = await getSisterWallets(current);
    const ownTg = getSessionTgId();
    const tLinked = await pg.users.findOne({ wallet: target });
    if (!sisters.includes(target) && !(ownTg && Number(tLinked?.telegram_id) === ownTg)) {
      throw new Error("Этот кошелёк не привязан к твоему Telegram");
    }
    // НАСТОЯЩЕЕ отключение: кош помечается disconnected → исчезает из списка и
    // выбора юзера. НО account_id/telegram_id НЕ трогаем: активы (фишки/билеты/
    // лайки лежат в БД с этим account_id) остаются на УЧЁТКЕ и видны на других
    // кошах аккаунта — ничего не теряется. Re-connect вернёт кош (disconnected=false).
    await pg.users.update({ wallet: target }, { disconnected: true });
    // СТРОГО: НФТ отвязанного коша перестают числиться на аккаунте В МОМЕНТ
    // отвязки — сразу не приносят билеты/лайки и не участвуют в дропах. Активы
    // (фишки/герои/…) остаются на account_id — их это не трогает. Чистим зеркало
    // pg.nfts для этого коша; re-connect + скан вернёт их обратно.
    try {
      await pg.nfts.raw().delete().eq("owner_wallet", target);
    } catch {
      /* зеркало НФТ — best-effort; скан всё равно пересоберёт по подключённым */
    }
    // Если отключаем активный кош — переводим сессию на другой кош аккаунта
    // (не отключённый), чтобы юзер не «вылетел».
    if (target === current.toLowerCase()) {
      const acc = (await pg.users.findOne({ wallet: target })) as {
        account_id?: string | null;
      } | null;
      const rest = acc?.account_id
        ? (await pg.users.findMany({ account_id: acc.account_id })).filter(
            (u) => u.wallet !== target && !u.disconnected,
          )
        : [];
      // Пересаживаем только на кошелёк того же проверенного Telegram (18.10).
      const tg = getSessionTgId();
      const sameTg = tg
        ? (await pg.users.findMany({ telegram_id: tg })).filter(
            (u) => u.wallet !== target && !u.disconnected,
          )
        : [];
      const next = tg ? [...rest, ...sameTg].find((u) => Number(u.telegram_id) === tg) : undefined;
      if (next && tg) setCurrentWallet(next.wallet, tg);
      else clearCurrentWallet();
    }
    return { ok: true, unlinked: target };
  });

/**
 * Переключает активный кошелёк сессии. Принимается только sister-кошелёк
 * текущего TG (anti-spoof).
 */
export const switchActiveWallet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ wallet: z.string().min(2) }).parse(d))
  .handler(async ({ data }) => {
    const target = data.wallet.toLowerCase();
    const current = getCurrentWallet();
    if (!current) throw new Error("Сессия не активна");
    const sisters = await getSisterWallets(current);
    const ownTg = getSessionTgId();
    const tLinked = await pg.users.findOne({ wallet: target });
    if (!sisters.includes(target) && !(ownTg && Number(tLinked?.telegram_id) === ownTg)) {
      throw new Error("Этот кошелёк не привязан к твоему Telegram");
    }
    // Нельзя сделать активным отключённый кош (getSisterWallets включает их
    // ради агрегации активов, но переключаться на них нельзя).
    const tRow = (await pg.users.findOne({ wallet: target })) as {
      disconnected?: boolean;
      telegram_id?: number | string | null;
    } | null;
    if (tRow?.disconnected) throw new Error("Этот кошелёк отключён");
    // Сессия — только на кошелёк того же проверенного Telegram (18.10.2026).
    const tg = getSessionTgId();
    if (!tg || Number(tRow?.telegram_id) !== tg) {
      throw new Error("Этот кошелёк не привязан к твоему Telegram");
    }
    setCurrentWallet(target, tg);
    // Запоминаем выбор на аккаунте — чтобы при следующем входе восстановился
    // ИМЕННО этот кош, а не самый ранний (иначе выбор «слетает» при загрузке).
    try {
      const me = (await pg.users.findOne({ wallet: target })) as {
        account_id?: string | null;
      } | null;
      if (me?.account_id)
        await pg.accounts.update({ id: me.account_id }, { active_wallet: target });
      // Вход через Telegram читает выбор с аккаунта этого Telegram.
      await pg.accounts.update({ telegram_id: tg }, { active_wallet: target });
    } catch {
      /* не критично для переключения */
    }
    return { wallet: target };
  });

export const disconnectWallet = createServerFn({ method: "POST" }).handler(async () => {
  clearCurrentWallet();
  return { ok: true };
});
