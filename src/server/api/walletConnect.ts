// YupLink Wallet · Connector API.
// Управление dapp-подключениями (FCAK / full access ключи, выданные dApps).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import type { PgWalletDappConnection } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { accountIdOf } from "./user-shared";

function requireSession(): string {
  const w = getCurrentWallet();
  if (!w) throw new Error("Подключи кошелёк");
  return w;
}

/**
 * Кошелёк из тела запроса — не доказательство владения. Раньше сюда хватало
 * любой сессии: чужой адрес в поле `wallet` открывал список выданных dapp-
 * ключей и позволял записать подключение на чужое имя. Сверяем аккаунт.
 */
async function requireOwnWallet(wallet: string): Promise<void> {
  const me = await accountIdOf(requireSession());
  const owner = await accountIdOf(wallet);
  if (!me || !owner || me !== owner) throw new Error("Это чужой кошелёк");
}

// Нормализация origin: убираем path/query, оставляем `scheme://host[:port]`.
function normalizeOrigin(input: string): string {
  try {
    const u = new URL(input);
    return `${u.protocol}//${u.host}`;
  } catch {
    return input.trim().toLowerCase();
  }
}

// ─────────────────────── Save connection (после успешного AddKey) ───────────────────────

export const saveWalletDappConnection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        wallet: z.string().min(2),
        dappOrigin: z.string().min(1),
        dappName: z.string().max(100).optional(),
        dappIconUrl: z.string().url().optional(),
        publicKey: z.string().regex(/^ed25519:/, "ed25519:<base58> ожидается"),
        contractId: z.string().nullable().optional(),
        methods: z.array(z.string()).nullable().optional(),
        allowanceYocto: z.string().nullable().optional(),
        grantedTxHash: z.string().nullable().optional(),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    // Принимаем только wallet'ы, которые этот session-юзер контролирует
    // (для embedded — мы храним только public, привата у нас нет, поэтому
    // мост между session и embedded-wallet'ом — это просто факт что юзер
    // его создал и/или импортировал; защита от подделки на уровне сессии).
    await requireOwnWallet(data.wallet);
    const id = `dc_${nanoid(12)}`;
    const row: PgWalletDappConnection = {
      id,
      wallet: data.wallet,
      dapp_origin: normalizeOrigin(data.dappOrigin),
      dapp_name: data.dappName?.trim() || null,
      dapp_icon_url: data.dappIconUrl || null,
      public_key: data.publicKey,
      contract_id: data.contractId ?? null,
      methods: data.methods ?? null,
      allowance_yocto: data.allowanceYocto ?? null,
      granted_at: new Date().toISOString(),
      last_used_at: null,
      revoked_at: null,
      granted_tx_hash: data.grantedTxHash ?? null,
      revoked_tx_hash: null,
    };
    await pg.walletDappConnections.insert(row);
    return { ok: true, id };
  });

// ─────────────────────── List мои подключения ───────────────────────

export const listMyDappConnections = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        wallet: z.string().min(2),
        includeRevoked: z.boolean().default(false),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    await requireOwnWallet(data.wallet);
    let q = pg.walletDappConnections
      .raw()
      .select("*")
      .eq("wallet", data.wallet)
      .order("granted_at", { ascending: false });
    if (!data.includeRevoked) q = q.is("revoked_at", null);
    const { data: rows } = await q;
    return ((rows ?? []) as PgWalletDappConnection[]).map((r) => ({
      id: r.id,
      wallet: r.wallet,
      dappOrigin: r.dapp_origin,
      dappName: r.dapp_name,
      dappIconUrl: r.dapp_icon_url,
      publicKey: r.public_key,
      contractId: r.contract_id,
      methods: r.methods,
      allowanceYocto: r.allowance_yocto,
      grantedAt: r.granted_at,
      lastUsedAt: r.last_used_at,
      revokedAt: r.revoked_at,
      grantedTxHash: r.granted_tx_hash,
      revokedTxHash: r.revoked_tx_hash,
    }));
  });

// ─────────────────────── Mark as revoked (после успешного DeleteKey) ───────────────────────

export const markDappConnectionRevoked = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1),
        revokedTxHash: z.string().nullable().optional(),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    // Отзыв — тоже владение: строка ищется по id, поэтому проверяем её хозяина.
    const row = await pg.walletDappConnections.findOne({ id: data.id });
    if (!row) throw new Error("Подключение не найдено");
    await requireOwnWallet(row.wallet);
    await pg.walletDappConnections.update(
      { id: data.id },
      {
        revoked_at: new Date().toISOString(),
        revoked_tx_hash: data.revokedTxHash ?? null,
      }
    );
    return { ok: true };
  });

// ─────────────────────── Touch last_used_at (для аудита) ───────────────────────

export const touchDappConnection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ publicKey: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    // No-auth — это вызывает /wallet/sign при подписи tx, чтобы пометить
    // что ключ используется. Никаких прав не открывает.
    await pg.walletDappConnections
      .raw()
      .update({ last_used_at: new Date().toISOString() })
      .eq("public_key", data.publicKey)
      .is("revoked_at", null);
    return { ok: true };
  });
