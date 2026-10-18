// Привязка Solana-кошелька к TG-аккаунту (НЕ вход — только расширение).
// Вход остаётся по Telegram; кош цепляется к аккаунту, как сёстры-кошельки NEAR.
//
// Поток: nonce → игрок подписывает сообщение кошельком (Phantom signMessage) →
// сервер проверяет подпись ed25519 → привязывает адрес. Адресу без подписи не
// верим. Приватные ключи и транзакции игрока не трогаем.
import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import * as ed25519 from "@noble/ed25519";
import { base58, base64 } from "@scure/base";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { currentAccount } from "../../auth";
import { solanaLinkMessage } from "./config";
import { solBalance, splTokens } from "./helius";
import { solanaLinkGate } from "./linkGate";

// Таблица yuplink.solana_wallet — migrations/sol-01-solana-wallet.sql:
// одна строка привязки на аккаунт, адрес уникален.

async function requireAccount(): Promise<string> {
  const acc = await currentAccount();
  if (!acc) throw new Error("Нет аккаунта — войди через Telegram");
  return acc;
}

/** Выдать одноразовый nonce и сообщение для подписи. */
export const solanaNonce = createServerFn({ method: "POST" }).handler(async () => {
  const acc = await requireAccount();
  await solanaLinkGate("nonce", acc);
  const nonce = nanoid(24);
  const a = sqlStr(acc);
  await mcpExec(
    `INSERT INTO yuplink.solana_wallet (account_id, nonce, nonce_at)
       VALUES (${a}, ${sqlStr(nonce)}, now())
     ON CONFLICT (account_id) DO UPDATE SET nonce=EXCLUDED.nonce, nonce_at=now();`,
    { wrapJson: false },
  );
  return { nonce, message: solanaLinkMessage(nonce) };
});

/** Привязать адрес после проверки подписи. signature — base64 из signMessage. */
export const solanaAttach = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ address: z.string().min(32).max(64), signature: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const acc = await requireAccount();
    await solanaLinkGate("attach", acc);
    const a = sqlStr(acc);
    const rows = (await mcpExec(
      `SELECT nonce, nonce_at FROM yuplink.solana_wallet WHERE account_id=${a} LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{ nonce: string | null; nonce_at: string | null }>;
    const nonce = rows?.[0]?.nonce;
    const nonceAt = rows?.[0]?.nonce_at ? Date.parse(rows[0].nonce_at) : 0;
    if (!nonce || Date.now() - nonceAt > 5 * 60_000)
      throw new Error("Запрос привязки истёк — начни заново");

    // Проверка подписи: сообщение = nonce-строка, ключ = base58-адрес, подпись — base64.
    let pub: Uint8Array;
    try {
      pub = base58.decode(data.address);
    } catch {
      throw new Error("Некорректный адрес Solana");
    }
    if (pub.length !== 32) throw new Error("Некорректный адрес Solana");
    const sig = base64.decode(data.signature);
    const msg = new TextEncoder().encode(solanaLinkMessage(nonce));
    const ok = await ed25519.verifyAsync(sig, msg, pub).catch(() => false);
    if (!ok) throw new Error("Подпись неверна");

    // Антифарм: один адрес — один аккаунт.
    const taken = (await mcpExec(
      `SELECT account_id FROM yuplink.solana_wallet
        WHERE address=${sqlStr(data.address)} AND account_id<>${a} LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{ account_id: string }>;
    if (taken?.[0]) throw new Error("Этот кошелёк уже привязан к другому аккаунту");

    await mcpExec(
      `UPDATE yuplink.solana_wallet
          SET address=${sqlStr(data.address)}, verified_at=now(), nonce=NULL
        WHERE account_id=${a};`,
      { wrapJson: false },
    );
    return { ok: true, address: data.address };
  });

/** Текущая привязка + чтение данных кошелька через Helius (баланс, токены). */
export const solanaStatus = createServerFn({ method: "GET" }).handler(async () => {
  const acc = await requireAccount();
  await solanaLinkGate("status", acc);
  const rows = (await mcpExec(
    `SELECT address, verified_at FROM yuplink.solana_wallet
      WHERE account_id=${sqlStr(acc)} AND address IS NOT NULL LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ address: string; verified_at: string }>;
  const row = rows?.[0];
  if (!row) return { address: null as string | null };
  const [sol, tokens] = await Promise.all([
    solBalance(row.address).catch(() => null),
    splTokens(row.address).catch(() => []),
  ]);
  return { address: row.address, verifiedAt: row.verified_at, sol, tokens };
});

/** Отвязать (по желанию игрока). */
export const solanaUnlink = createServerFn({ method: "POST" }).handler(async () => {
  const acc = await requireAccount();
  await solanaLinkGate("unlink", acc);
  await mcpExec(
    `UPDATE yuplink.solana_wallet SET address=NULL, verified_at=NULL WHERE account_id=${sqlStr(acc)};`,
    { wrapJson: false },
  );
  return { ok: true };
});
