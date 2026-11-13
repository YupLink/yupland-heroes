/**
 * user-auth.ts — Авторизация, подключение кошельков, NEP-413 подпись.
 *
 * Извлечено из user.ts при модульной реорганизации.
 * Все экспорты сохраняются в user.ts через re-export для обратной совместимости.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { issueLoginChallenge, verifyConnectOwnership } from "./nep413-login";
import { pg, type PgUser } from "../db/pg";
import { clearCurrentWallet, getCurrentWallet, getSessionTgId } from "../auth";
import { islandTesterAccess } from "../islandTester";
import { requestEntry } from "../entryHost";

// ─── Environment flags ──────────────────────────────────────────────

export function isMaintenanceMode(): boolean {
  return (process.env.MAINTENANCE_MODE ?? "").toLowerCase() === "true";
}

export function isBetaAdminOnly(): boolean {
  return (process.env.BETA_ADMIN_ONLY ?? "").toLowerCase() === "true";
}

// ─── Session ────────────────────────────────────────────────────────

import {
  isAdminWallet,
  isCastleEditor,
  isPayoutsAdminWallet,
  isTgBypassWallet,
  isTreasuryWallet,
} from "../auth";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const maintenanceMode = isMaintenanceMode();
  const betaAdminOnly = isBetaAdminOnly();
  const wallet = getCurrentWallet();
  const guest = {
    wallet: null,
    inHallway: false,
    onboarding: false,
    telegramId: null as number | null,
    /** Кнопки вывода грузить (белый список, §8.127). */
    canWithdraw: false,
    /** Вход этого домена (§8.127): tg. — Telegram, near. — кошелёк, иначе Google. */
    entry: requestEntry(),
    notificationsEnabled: true,
    raidMode: "legacy" as const,
    isAdmin: false,
    isCastleEditor: false,
    canGodMap: false,
    canPromoSoft: false,
    islandGod: false,
    creator: false,
    canCatalogs: false,
    canBuckwheat: false,
    isIslandTester: false,
    isPayoutsAdmin: false,
    isTreasury: false,
    /** Ресурсный счёт открыт этому игроку (раскатка в settings). */
    accountOpen: false,
    isTester: false,
    features: {} as Record<string, boolean>,
    telegramLinked: false,
    telegramUsername: null,
    tgError: null as string | null,
    lang: null as "ru" | "en" | null,
    maintenanceMode,
    betaAdminOnly,
  };
  if (!wallet) return guest;
  // Сессия держится, только пока кошелёк привязан к Telegram этой сессии
  // (владелец, 18.10.2026): кошелёк отвязали или перевязали — выходим.
  const u = await pg.users.findOne({ wallet });
  if (!u || Number(u.telegram_id) !== getSessionTgId()) {
    clearCurrentWallet();
    return guest;
  }
  // Игрок открыл игру — самый ранний момент, когда виден пострадавший: он же
  // только что отправил NFT и перезагрузил страницу, не получив пак. Ищем его
  // сироту здесь, не дожидаясь получасового крона. Ответ сессии не ждёт
  // результата, а сам поиск троттлится и начинается с дешёвой проверки
  // (nft-input-selfheal). Динамический импорт — чтобы серверный модуль не
  // утянуло в клиентский бандл.
  void import("./nft-input-selfheal").then((m) => m.selfHealNftInputs(wallet)).catch(() => {});

  const { isTesterWallet, testerFeatureFlags, TESTER_FEATURES } = await import("./testers");
  const tester = await isTesterWallet(wallet);
  const flags = await testerFeatureFlags();
  const admin = isAdminWallet(wallet);
  // Клиенту отдаём готовый ответ «можно/нельзя», чтобы UI не повторял логику.
  const featureAccess: Record<string, boolean> = {};
  for (const key of Object.keys(TESTER_FEATURES)) {
    // «all» в настройке = механика вышла из закрытого теста: доступ у всех,
    // а не только у группы. Клиент обязан видеть тот же ответ, что сервер,
    // иначе интерфейс спрячет то, что бэкенд уже разрешил.
    featureAccess[key] = admin || flags[key] === "all" || (tester && !!flags[key]);
  }

  const langKey = u?.telegram_id ? `userlang:tg:${u.telegram_id}` : `userlang:w:${wallet}`;
  const langRow = await pg.settings.findOne({ key: langKey });
  const lang =
    langRow?.value === "en" || langRow?.value === "ru" ? (langRow.value as "ru" | "en") : null;
  const bypass = isTgBypassWallet(wallet);
  const linked = bypass || !!u?.telegram_id;

  let tgError: string | null = null;
  if (!linked) {
    const last = await pg.tgChallenges.findFirst(
      { wallet },
      { orderBy: { column: "created_at", ascending: false } },
    );
    if (last?.error_message) tgError = last.error_message;
  }

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
    onboarding: !!u?.hallway_onboarding,
    isAdmin: isAdminWallet(wallet),
    /** Редактор внутрянки замка: админы + дизайнер интерьера.
     *  Опознание по TG-юзернейму — у неё кошелёк называется иначе. */
    isCastleEditor: isCastleEditor(wallet, u?.telegram_username ?? null),
    // Права по одному (admin-rights): god_map, promo_soft, island_god, creator, catalogs.
    ...(await (await import("@/server/admin-rights")).sessionRights(u?.account_id ?? null)),
    /** Тест острова новичка: админы, дизайнер, право island_tester; без остальной админки. */
    isIslandTester: await islandTesterAccess(wallet, getSessionTgId()),
    isPayoutsAdmin: isPayoutsAdminWallet(wallet),
    /** Казначейство: статистика лута и обмен USDT→DARAI, без рассылки дохода. */
    isTreasury: isTreasuryWallet(wallet),
    // Счёт: владельцу всегда, остальным — когда раскатка включена.
    accountOpen:
      isPayoutsAdminWallet(wallet) ||
      (await (await import("./account-rollout")).accountOpenToAll()),
    /** legacy — прежние локации, hex — гекс-карта на их месте. */
    raidMode: await (await import("./raid-mode")).currentRaidMode(),
    // Группа тестеров: какие закрытые механики открыты этому игроку.
    isTester: tester,
    features: featureAccess,
    telegramLinked: linked,
    telegramUsername: u?.telegram_username ?? (bypass ? "test bypass" : null),
    telegramId: u?.telegram_id ?? null,
    entry: requestEntry(),
    canWithdraw: await (
      await import("./withdraw-list/withdrawList")
    ).sessionCanWithdraw(u?.account_id ?? null, u?.telegram_id ?? null),
    notificationsEnabled: u?.notifications_enabled ?? true,
    tgError,
    lang,
    maintenanceMode,
    betaAdminOnly,
  };
});

// ─── Fairplay bonus ─────────────────────────────────────────────────

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

// ─── Wallet connection: только кошельки своего Telegram ─────────────

export const connectWallet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        wallet: z
          .string()
          .min(2)
          .regex(
            /^[a-z0-9_\-.]+$/i,
            "NEAR accountId должен содержать только буквы, цифры, '.', '_', '-'",
          ),
        ref: z.string().nullish(),
        additionalFor: z.string().nullish(),
        // Подтверждение личности из мини-аппа: Telegram подписывает initData
        // токеном бота, и по нему видно, чей это игрок.
        initData: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // Без подписи кошелёк не подключается никогда (владелец, 18.10.2026). Можно
    // только пересесть на кошелёк, который УЖЕ привязан к Telegram этой сессии
    // (или к Telegram из проверенного initData мини-аппа). Новый кошелёк —
    // connectWalletSigned (подпись NEP-413), см. wallet-link.ts.
    let tg = getSessionTgId();
    const proof = (data.initData ?? "").trim();
    if (proof) {
      const { verifyTelegramInitData } = await import("./user-drops-hallway");
      const check = await verifyTelegramInitData(proof);
      if (check.ok) tg = check.telegramId;
    }
    if (!tg) {
      console.warn(`[connectWallet] отказ: нет Telegram wallet=${data.wallet}`);
      throw new Error("Войди через Telegram");
    }
    const { switchToLinkedWallet } = await import("./wallet-link");
    try {
      // С живой сессией — только свой аккаунт; без неё (initData) — любой кошелёк Telegram.
      const r = await switchToLinkedWallet(data.wallet, tg, { sameAccountAs: getCurrentWallet() });
      console.log(`[connectWallet] LINKED switch wallet=${r.wallet}`);
      return r;
    } catch (e) {
      console.warn(`[connectWallet] отказ: не привязан wallet=${data.wallet}`);
      throw e;
    }
  });

export { deriveWalletKind } from "./wallet-link";

// ─── NEP-413 signed login ───────────────────────────────────────────
// Вызов и проверка подписи — nep413-login.ts (общие со входом по кошельку).

export const createLoginChallenge = createServerFn({ method: "POST" }).handler(async () => {
  // Подписывать имеет смысл только в Telegram-сессии (18.10.2026): отказываем ДО
  // подписи, а не после — игрок не подписывает впустую.
  if (!getSessionTgId())
    throw new Error("Сначала войди через Telegram — кошелёк добавляется к нему");
  (await import("./wallet-link")).assertWalletLinkAllowed(getSessionTgId());
  return issueLoginChallenge();
});

export const connectWalletSigned = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        accountId: z
          .string()
          .min(2)
          .regex(/^[a-z0-9_\-.]+$/i),
        publicKey: z.string().min(8).max(120),
        signature: z.string().min(8).max(200),
        nonce: z.string().min(8).max(120),
        ref: z.string().nullish(),
        additionalFor: z.string().nullish(),
        /** Только пристегнуть к Telegram, сессию не переводить. */
        stay: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // Кошелёк добавляется только к Telegram сессии (владелец, 18.10.2026).
    const tg = getSessionTgId();
    if (!tg) throw new Error("Сначала войди через Telegram — кошелёк добавляется к нему");
    (await import("../walletOnlySession")).assertNotWalletOnly();
    await verifyConnectOwnership({
      accountId: data.accountId,
      publicKey: data.publicKey,
      signature: data.signature,
      nonce: data.nonce,
    });
    const { linkSignedWallet } = await import("./wallet-link");
    const session = await linkSignedWallet(data.accountId, tg, { stay: data.stay === true });
    console.log(`[connectWallet] SIGNED link wallet=${session.wallet}`);
    // Пометка «владение кошем доказано подписью» — атрибут аккаунта (identity
    // фаза 1). Именно этот момент — привязка коша с доказательством.
    await pg.users
      .update(
        { wallet: session.wallet },
        {
          ownership_verified: true,
          ownership_verified_at: new Date().toISOString(),
          ownership_method: "nep413",
        },
      )
      .catch(() => {});
    return session;
  });

// ─── Prepare add wallet ─────────────────────────────────────────────

// Telegram для нового кошелька берётся из подписанной сессии, а не из куки
// браузера (18.10.2026) — здесь осталось только проверить, что он есть.
export const prepareAddWallet = createServerFn({ method: "POST" }).handler(async () => {
  if (!getSessionTgId()) throw new Error("Войди через Telegram, чтобы добавлять кошельки");
  (await import("./wallet-link")).assertWalletLinkAllowed(getSessionTgId());
  (await import("../walletOnlySession")).assertNotWalletOnly();
  return { ok: true };
});

// ─── Disconnect ─────────────────────────────────────────────────────

/**
 * ВЫХОД ИЗ СЕССИИ — и только он: чистим куку, кошелёк остаётся привязанным
 * к аккаунту.
 *
 * Раньше здесь стояло `disconnected: true`, и это ломало людям вход: кнопка
 * «Выйти» (AppHeader) и авто-обработчик onSignOut в NearConnectorBridge —
 * который срабатывает САМ, когда коннектор разлогинился, — помечали кошелёк
 * отключённым. Он пропадал из списка, а переключиться обратно было нельзя
 * («Этот кошелёк отключён»). Жалоба игрока: «отлетать начал основной кош,
 * когда по ошибке вышел из него».
 *
 * Осознанная отвязка — отдельное действие с подтверждением: unlinkWallet
 * в user-sister-wallets.ts (кнопка в списке кошельков).
 */
export const disconnectWallet = createServerFn({ method: "POST" }).handler(async () => {
  clearCurrentWallet();
  return { ok: true };
});

// ─── Settings ───────────────────────────────────────────────────────

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
