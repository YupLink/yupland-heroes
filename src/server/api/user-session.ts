// AUTO-EXTRACTED from user.ts lines 71-211
// getSession, getFairplayBonus, ackFairplayBonus, setMyLang, setNotificationsEnabled

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
import { markSeen } from "./account-seen";

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

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const maintenanceMode = isMaintenanceMode();
  const betaAdminOnly = isBetaAdminOnly();
  const wallet = getCurrentWallet();
  if (!wallet) {
    return {
      wallet: null,
      inHallway: false,
      isAdmin: false,
      isPayoutsAdmin: false,
      telegramLinked: false,
      telegramUsername: null,
      tgError: null as string | null,
      lang: null as "ru" | "en" | null,
      maintenanceMode,
      betaAdminOnly,
    };
  }
  // Игрок открыл игру — отметка «был в игре» (лагерь на карте виден 7 дней
  // после неё, account-seen.ts). Фоном и без ожидания: вход от неё не зависит.
  void import("./beta-raid/owner")
    .then((m) => m.raidOwner(wallet))
    .then(markSeen)
    .catch(() => {});
  const u = await pg.users.findOne({ wallet });
  // Язык интерфейса — сохранён по TG-аккаунту (кросс-девайс «навсегда»).
  const langKey = u?.telegram_id ? `userlang:tg:${u.telegram_id}` : `userlang:w:${wallet}`;
  const langRow = await pg.settings.findOne({ key: langKey });
  const lang =
    langRow?.value === "en" || langRow?.value === "ru" ? (langRow.value as "ru" | "en") : null;
  // Bypass-кошельки (тестовые) считаем подтверждёнными в TG безусловно.
  const bypass = isTgBypassWallet(wallet);
  const linked = bypass || !!u?.telegram_id;

  // Если ещё не привязан, посмотрим самую свежую попытку — там может лежать
  // ошибка коллизии, которую сайт должен показать поверх UI.
  let tgError: string | null = null;
  if (!linked) {
    const last = await pg.tgChallenges.findFirst(
      { wallet },
      { orderBy: { column: "created_at", ascending: false } },
    );
    if (last?.error_message) tgError = last.error_message;
  }

  // Прихожа v2: зашёл через прихожу и ещё не выпущен → сидит в онбординге.
  // Запрос released только если onboarding=true (старые юзеры = false, не
  // трогаем, лишний запрос не делаем).
  let inHallway = false;
  if (u?.hallway_onboarding) {
    // Прихожая одна на Telegram: юпика ищем по ВСЕМ кошелькам аккаунта.
    // Подключил игрок второй кош — по нему юпика нет, и прежняя проверка
    // отправляла давно выпущенного игрока обратно в Прихожую.
    const { hallwayReleased } = await import("./hallway-released");
    inHallway = !(await hallwayReleased(wallet, u.telegram_id ?? null));
  }

  return {
    wallet,
    inHallway,
    // Новый игрок (пришёл через прихожу). Старые = false. По нему решаем
    // роутинг лендинга: onboarding → прихожа/фишки; иначе — как было (кош).
    onboarding: !!u?.hallway_onboarding,
    isAdmin: isAdminWallet(wallet),
    isPayoutsAdmin: isPayoutsAdminWallet(wallet),
    telegramLinked: linked,
    telegramUsername: u?.telegram_username ?? (bypass ? "test bypass" : null),
    telegramId: u?.telegram_id ?? null,
    notificationsEnabled: u?.notifications_enabled ?? true,
    tgError,
    lang,
    maintenanceMode,
    betaAdminOnly,
  };
});

// ─── Бонус «за честную игру» (одноразовое окно первого входа) ──────────────
// Признак eligible и «показано» хранятся в settings по кошельку:
//   fairplay:eligible:<wallet> = '1'  (проставлен раздачей 830 паков честным)
//   fairplay:seen:<wallet>     = ISO-время (после нажатия «Забрать бонус»)
export const getFairplayBonus = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return { show: false };
  const eligible = await pg.settings.findOne({
    key: `fairplay:eligible:${wallet}`,
  });
  if (!eligible) return { show: false };
  const seen = await pg.settings.findOne({ key: `fairplay:seen:${wallet}` });
  return { show: !seen };
});

export const ackFairplayBonus = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return { ok: false };
  await pg.settings.upsert(
    { key: `fairplay:seen:${wallet}`, value: new Date().toISOString() },
    { onConflict: "key" },
  );
  return { ok: true };
});

/** Сохранить язык интерфейса пользователя — навсегда, по TG-аккаунту
 *  (чтобы выбор запоминался и следовал за юзером на других устройствах). */
export const setMyLang = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ lang: z.enum(["ru", "en"]) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) return { ok: false as const };
    const u = await pg.users.findOne({ wallet });
    const key = u?.telegram_id ? `userlang:tg:${u.telegram_id}` : `userlang:w:${wallet}`;
    await pg.settings.upsert({ key, value: data.lang }, { onConflict: "key" });
    return { ok: true as const };
  });

/**
 * Тумблер уведомлений в TG. Применяется ко ВСЕМ user-row'ам этого TG —
 * если у одного TG несколько кошельков, отключение в одном выключает
 * рассылку для всех.
 */
export const setNotificationsEnabled = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    const u = await pg.users.findOne({ wallet });
    if (!u?.telegram_id) {
      throw new Error("Привяжи Telegram чтобы управлять уведомлениями");
    }
    await pg.users.update({ telegram_id: u.telegram_id }, { notifications_enabled: data.enabled });
    return { ok: true };
  });
