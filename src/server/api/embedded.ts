// Non-custodial embedded-кошельки.
// Сервер хранит ТОЛЬКО публичную инфу: account_id + public_key + linked_user.
// Приваты живут в TG CloudStorage клиента, зашифрованные PIN'ом юзера.
// Опционально юзер может сохранить encrypted-blob у нас как «cloud backup»,
// но мы НЕ можем его расшифровать.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getCurrentWallet, getSessionTgId, isAdminWallet } from "../auth";
import { pg } from "../db/pg";

// Проверка "это мой кошелёк" — по двум осям (linked_user ИЛИ linked_tg_id).
// Юзер мог менять коннектящий wallet, но TG тот же → доступ сохраняется.
async function assertMyWallet(accountId: string): Promise<void> {
  const sessionWallet = getCurrentWallet();
  if (!sessionWallet) throw new Error("Нужно сначала залогиниться");
  const row = await pg.userWallets.findOne({ account_id: accountId });
  if (!row) throw new Error("Кошелёк не зарегистрирован");
  if (row.linked_user === sessionWallet) return; // OK by wallet
  const u = await pg.users.findOne({ wallet: sessionWallet });
  if (u?.telegram_id && row.linked_tg_id === u.telegram_id) return; // OK by TG
  throw new Error("Это не твой кошелёк");
}

// ──────── Регистрация ────────

/**
 * Юзер уже сгенерировал кошелёк локально (createEmbeddedWallet в браузере).
 * Регистрирует только публичные поля в БД, чтобы привязать к session-wallet'у.
 */
export const registerEmbeddedWallet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        accountId: z.string().min(2).max(64),
        publicKey: z.string().min(10).max(120),
        label: z.string().max(100).nullable().optional(),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const sessionWallet = getCurrentWallet();
    const tgId = getSessionTgId();
    if (!sessionWallet || !tgId) throw new Error("Нужно сначала войти через Telegram");
    // Кошелёк к Telegram пристёгивает только вход с подписью (connectWalletSigned,
    // 18.10.2026); здесь лишь запоминаем публичные поля уже пристёгнутого.
    // Раньше эта ручка сама заводила кошелёк на Telegram сессии — без подписи.
    // Админский кошелёк-менеджер (/admin/wallet) хранит только публичные поля
    // своих кошельков — к Telegram он их не пристёгивает.
    const own = await pg.users.findOne({ wallet: data.accountId.toLowerCase() });
    if ((!own || Number(own.telegram_id) !== tgId) && !isAdminWallet(sessionWallet)) {
      throw new Error("Сначала подтверди кошелёк подписью");
    }

    await pg.userWallets.upsert(
      {
        account_id: data.accountId,
        linked_user: sessionWallet,
        linked_tg_id: tgId,
        public_key: data.publicKey,
        is_active: true,
        label: data.label ?? null,
      },
      { onConflict: "account_id" }
    );

    await pg.walletAudit.insert({
      id: nanoid(),
      account_id: data.accountId,
      action: "register",
      actor: sessionWallet,
      metadata: JSON.stringify({ source: "embedded", tg_id: tgId }),
    });
    return { ok: true };
  });

/**
 * Список embedded-кошельков, привязанных к текущей сессии. Только public.
 */
export const listMyEmbeddedWallets = createServerFn({ method: "GET" }).handler(
  async () => {
    const sessionWallet = getCurrentWallet();
    type EmbeddedRow = {
      accountId: string;
      publicKey: string;
      label: string | null;
      createdAt: string;
    };
    if (!sessionWallet) return [] as EmbeddedRow[];

    // Ищем по двум критериям через OR: либо linked_user (этой сессии),
    // либо linked_tg_id (если у юзера привязан TG). Это даёт стабильность:
    // юзер сменил коннектящий кошелёк → embedded'ы найдутся по TG-id.
    const u = await pg.users.findOne({ wallet: sessionWallet });
    const tgId = u?.telegram_id ?? null;
    const orFilter = tgId
      ? `linked_user.eq.${sessionWallet},linked_tg_id.eq.${tgId}`
      : `linked_user.eq.${sessionWallet}`;
    const { data } = await pg.userWallets
      .raw()
      .select("*")
      .or(orFilter)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as Array<{
      account_id: string;
      public_key: string;
      label: string | null;
      created_at: string;
    }>;
    return rows.map((r) => ({
      accountId: r.account_id,
      publicKey: r.public_key,
      label: r.label,
      createdAt: r.created_at,
    }));
  }
);

// ──────── (удалено) cloud-backup эндпоинты ────────
// uploadCloudBackup/downloadCloudBackup удалены 21.06: были мёртвыми (нигде не
// вызывались) и не валидировали, что блоб реально зашифрован — потенциальная
// мина (plain-сид в БД). Сид/приват живут только на клиенте.

export const removeEmbeddedWallet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ accountId: z.string().min(2).max(64) }).parse(d)
  )
  .handler(async ({ data }) => {
    const sessionWallet = getCurrentWallet();
    if (!sessionWallet) throw new Error("Нужно сначала залогиниться");
    const row = await pg.userWallets.findOne({ account_id: data.accountId });
    if (!row) return { ok: true };
    if (row.linked_user !== sessionWallet)
      throw new Error("Это не твой кошелёк");

    await pg.userWallets.update(
      { account_id: data.accountId },
      { is_active: false }
    );
    await pg.walletAudit.insert({
      id: nanoid(),
      account_id: data.accountId,
      action: "deactivate",
      actor: sessionWallet,
      metadata: null,
    });
    return { ok: true };
  });

// ──────── Зашифрованный бэкап сид-фразы ────────
// Сервер хранит ТОЛЬКО шифр-блоб (Argon2id+AES-GCM, шифрует/дешифрует клиент).
// Расшифровать не может — пароля у нас нет. Валидируем, что пришёл именно base64-
// шифр, а НЕ открытый сид (защита от plain-сида в БД, см. удалённый cloud-backup).
const B64 = /^[A-Za-z0-9+/=]+$/;
const backupBlobSchema = z.object({
  encSeed: z.string().min(16).max(8000).regex(B64, "blob должен быть base64-шифром"),
  salt: z.string().min(8).max(256).regex(B64),
  nonce: z.string().min(8).max(256).regex(B64),
  kdf: z.object({
    algo: z.literal("argon2id"),
    m: z.number().int().positive(),
    t: z.number().int().positive(),
    p: z.number().int().positive(),
    v: z.number().int(),
  }),
});

export const saveWalletBackup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ accountId: z.string().min(2).max(64), blob: backupBlobSchema })
      .parse(d)
  )
  .handler(async ({ data }) => {
    await assertMyWallet(data.accountId);
    await pg.userWallets.update(
      { account_id: data.accountId },
      { backup_blob: data.blob, backup_at: new Date().toISOString() }
    );
    await pg.walletAudit.insert({
      id: nanoid(),
      account_id: data.accountId,
      action: "cloud_backup_uploaded", // разрешённое значение wallet_audit_action_check
      actor: getCurrentWallet(),
      metadata: null,
    });
    return { ok: true };
  });

export const getWalletBackup = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ accountId: z.string().min(2).max(64) }).parse(d)
  )
  .handler(async ({ data }) => {
    await assertMyWallet(data.accountId);
    const row = await pg.userWallets.findOne({ account_id: data.accountId });
    return { blob: (row?.backup_blob ?? null) as any };
  });

// ──────── Балансы / NFT для embedded-кошелька (юзеру доступно для своих) ────────

const FASTNEAR_API = "https://api.fastnear.com";

// reward_tokens почти статичны (symbol/decimals для known FT). Кешируем в
// модульной памяти с TTL, чтобы не бить в БД на каждый запрос балансов.
let _rewardTokensCache: {
  data: Awaited<ReturnType<typeof pg.rewardTokens.findMany>>;
  at: number;
} | null = null;
const REWARD_TOKENS_TTL_MS = 5 * 60_000; // 5 минут

async function getRewardTokensCached() {
  const now = Date.now();
  if (_rewardTokensCache && now - _rewardTokensCache.at < REWARD_TOKENS_TTL_MS) {
    return _rewardTokensCache.data;
  }
  const data = await pg.rewardTokens.findMany();
  _rewardTokensCache = { data, at: now };
  return data;
}

export const myWalletBalances = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ accountId: z.string().min(2).max(64) }).parse(d)
  )
  .handler(async ({ data }) => {
    await assertMyWallet(data.accountId);

    // NEAR-RPC, FastNear-FT и reward_tokens (кеш) — параллельно, чтобы не
    // ждать их последовательно (раньше это растягивало загрузку балансов).
    const nearPromise = (async (): Promise<string> => {
      try {
        const { nearRpc } = await import("../rpc");
        const j = await nearRpc<{ amount?: string }>("query", {
          request_type: "view_account",
          finality: "final",
          account_id: data.accountId,
        });
        return j.result?.amount ?? "0";
      } catch {
        return "0";
      }
    })();

    const ftPromise = (async (): Promise<
      Array<{ contract_id: string; balance: string }>
    > => {
      try {
        const r = await fetch(
          `${FASTNEAR_API}/v1/account/${encodeURIComponent(data.accountId)}/ft`
        );
        if (!r.ok) return [];
        const j = (await r.json()) as {
          tokens?: Array<{ contract_id: string; balance: string }>;
        };
        return (j.tokens ?? []).map((t) => ({
          contract_id: t.contract_id,
          balance: t.balance,
        }));
      } catch {
        return [];
      }
    })();

    const [nearYocto, rawFts, tokens] = await Promise.all([
      nearPromise,
      ftPromise,
      getRewardTokensCached(),
    ]);

    // Подмешаем symbol/decimals из reward_tokens
    let fts: Array<{
      contract_id: string;
      balance: string;
      symbol?: string;
      decimals?: number;
    }> = rawFts;
    const tokenMap = new Map(tokens.map((t) => [t.ft_contract, t]));
    fts = fts
      .map((f) => {
        const meta = tokenMap.get(f.contract_id);
        return {
          ...f,
          symbol: meta?.symbol,
          decimals: meta?.decimals,
        };
      })
      // Спрячем токены с нулевым балансом и неизвестные (минимизируем шум)
      .filter((f) => f.balance !== "0");

    return { nearYocto, fts };
  });

/**
 * Найти все NEAR-аккаунты, у которых этот public_key прописан как
 * full-access. Через FastNear indexer. Используется при импорте сидки,
 * чтобы автоматически предложить named-аккаунт (например `player11.near`)
 * вместо implicit-hex.
 */
export const lookupAccountsByPublicKey = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ publicKey: z.string().min(10).max(120) }).parse(d)
  )
  .handler(async ({ data }) => {
    const pk = data.publicKey.startsWith("ed25519:")
      ? data.publicKey
      : `ed25519:${data.publicKey}`;
    // FastNear /all возвращает аккаунты где этот ключ есть (любого типа).
    // Реальный тип доступа определяем через NEAR RPC view_access_key для
    // первого найденного аккаунта — если FullAccess, значит свободно
    // подписывать TX. Иначе ключ ограниченный.
    try {
      const rAll = await fetch(
        `${FASTNEAR_API}/v0/public_key/${encodeURIComponent(pk)}/all`
      );
      if (!rAll.ok) return { accountIds: [], hasFullAccess: false };
      const j = (await rAll.json()) as { account_ids?: string[] };
      const accountIds = (j.account_ids ?? []).filter(Boolean);
      if (accountIds.length === 0)
        return { accountIds: [], hasFullAccess: false };

      // Проверяем тип ключа на первом аккаунте через RPC-пул
      let hasFullAccess = false;
      try {
        const { nearRpc } = await import("../rpc");
        const j = await nearRpc<{
          permission?: "FullAccess" | { FunctionCall: unknown };
        }>("query", {
          request_type: "view_access_key",
          finality: "final",
          account_id: accountIds[0],
          public_key: pk,
        });
        const perm = j.result?.permission;
        hasFullAccess = perm === "FullAccess";
        return { accountIds, hasFullAccess };
      } catch {
        return { accountIds, hasFullAccess: false };
      }
    } catch {
      return { accountIds: [], hasFullAccess: false };
    }
  });

export const myWalletNfts = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ accountId: z.string().min(2).max(64) }).parse(d)
  )
  .handler(async ({ data }) => {
    await assertMyWallet(data.accountId);
    const rows = await pg.nfts.findMany({ owner_wallet: data.accountId });
    return rows.map((r) => ({
      contract_id: r.contract_id,
      token_id: r.token_id,
      title: r.name,
      media: r.image,
      collection: r.collection,
    }));
  });
