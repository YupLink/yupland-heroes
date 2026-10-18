// Привязка Ethereum-кошелька к аккаунту (НЕ вход — расширение, как Solana).
// Поток: nonce → кошелёк подписывает сообщение (personal_sign) → сервер восстанавливает
// адрес из подписи и сверяет с заявленным. Пока только админам (владелец, 17.10.2026).
import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { currentAccount, requireAdmin } from "../../auth";
import { rateGate } from "../../rateGate";
import { ethLinkMessage } from "./config";
import { normAddress, recoverAddress } from "./sig";

/** Админ с аккаунтом — пока фича только для админов. */
export async function ethAccount(step: string): Promise<string> {
  requireAdmin();
  const acc = await currentAccount();
  if (!acc) throw new Error("Нет аккаунта — войди через Telegram");
  await rateGate(`eth:${step}:${acc}`, {
    limit: 20,
    windowMs: 60_000,
    message: "Слишком часто — подожди минуту и повтори",
  });
  return acc;
}

export const ethNonce = createServerFn({ method: "POST" }).handler(async () => {
  const acc = await ethAccount("nonce");
  const nonce = nanoid(24);
  await mcpExec(
    `INSERT INTO yuplink.eth_wallet (account_id, nonce, nonce_at)
       VALUES (${sqlStr(acc)}, ${sqlStr(nonce)}, now())
     ON CONFLICT (account_id) DO UPDATE SET nonce = EXCLUDED.nonce, nonce_at = now();`,
    { wrapJson: false },
  );
  return { message: ethLinkMessage(nonce) };
});

export const ethAttach = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ address: z.string().min(42).max(42), signature: z.string().min(130).max(140) }).parse(d),
  )
  .handler(async ({ data }) => {
    const acc = await ethAccount("attach");
    const address = normAddress(data.address);
    if (!address) throw new Error("Некорректный адрес Ethereum");
    const a = sqlStr(acc);
    const rows = (await mcpExec(
      `SELECT nonce, nonce_at FROM yuplink.eth_wallet WHERE account_id = ${a} LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{ nonce: string | null; nonce_at: string | null }>;
    const nonce = rows?.[0]?.nonce;
    const at = rows?.[0]?.nonce_at ? Date.parse(rows[0].nonce_at) : 0;
    if (!nonce || Date.now() - at > 5 * 60_000) throw new Error("Запрос привязки истёк — начни заново");
    if (recoverAddress(ethLinkMessage(nonce), data.signature) !== address) {
      throw new Error("Подпись неверна");
    }
    const taken = (await mcpExec(
      `SELECT account_id FROM yuplink.eth_wallet
        WHERE address = ${sqlStr(address)} AND account_id <> ${a} LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{ account_id: string }>;
    if (taken?.[0]) throw new Error("Этот кошелёк уже привязан к другому аккаунту");
    await mcpExec(
      `UPDATE yuplink.eth_wallet SET address = ${sqlStr(address)}, verified_at = now(), nonce = NULL
        WHERE account_id = ${a};`,
      { wrapJson: false },
    );
    return { ok: true as const, address };
  });

export const ethUnlink = createServerFn({ method: "POST" }).handler(async () => {
  const acc = await ethAccount("unlink");
  await mcpExec(
    `UPDATE yuplink.eth_wallet SET address = NULL, verified_at = NULL WHERE account_id = ${sqlStr(acc)};`,
    { wrapJson: false },
  );
  return { ok: true as const };
});

/** Привязанный адрес аккаунта (или null). */
export async function linkedAddress(acc: string): Promise<string | null> {
  const rows = (await mcpExec(
    `SELECT address FROM yuplink.eth_wallet WHERE account_id = ${sqlStr(acc)} AND address IS NOT NULL LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ address: string }>;
  return rows?.[0]?.address ?? null;
}
