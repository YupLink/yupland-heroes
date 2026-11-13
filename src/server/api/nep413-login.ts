// Подпись кошелька NEP-413: вызов (nonce) и проверка подписи. Общая часть для
// привязки кошелька к Telegram (connectWalletSigned, user-auth.ts) и входа по
// кошельку без Telegram (wallet-login, владелец 06.11.2026). Вынесено из user-auth.ts.
//
// У привязки и входа — свой текст подписи и своя метка вызова (purpose): подпись,
// выманенная для одного, не годится для другого. Счётчики вызовов — раздельные,
// чтобы шквал входов не запирал привязку кошельков Telegram-игрокам.
import * as ed25519 from "@noble/ed25519";
import { base58, base64 } from "@scure/base";
import { buildNep413Hash } from "@/lib/nep413";
import { mcpExec } from "../db/mcpClient";

export type SignPurpose = "link" | "login";

const MESSAGE: Record<SignPurpose, string> = {
  link: "Sign in to YupLink Golden Drop",
  login: "Sign in to YupLand with your NEAR wallet",
};
const CONNECT_RECIPIENT = process.env.CONNECT_RECIPIENT || "yupland.io";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CH_MAX_PER_MIN = 120;
const windows: Record<SignPurpose, { start: number; count: number }> = {
  link: { start: 0, count: 0 },
  login: { start: 0, count: 0 },
};

/** Новый вызов на подпись (лимит 120 в минуту — свой у привязки и у входа). */
export async function issueLoginChallenge(
  purpose: SignPurpose = "link",
): Promise<{ nonce: string; message: string; recipient: string }> {
  const now = Date.now(), w = windows[purpose];
  if (now - w.start > 60_000) {
    w.start = now;
    w.count = 0;
  }
  if (++w.count > CH_MAX_PER_MIN) throw new Error("Слишком много запросов — подожди минуту");
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = base64.encode(bytes);
  await mcpExec(
    `INSERT INTO yuplink.login_challenges(nonce, expires_at, purpose)
         VALUES('${nonce.replace(/'/g, "''")}', now() + interval '${CHALLENGE_TTL_MS} milliseconds', '${purpose}');`,
  );
  mcpExec(
    `DELETE FROM yuplink.login_challenges WHERE expires_at < now() - interval '1 hour';`,
  ).catch(() => {});
  return { nonce, message: MESSAGE[purpose], recipient: CONNECT_RECIPIENT };
}

function pubBytesToImplicit(pub: Uint8Array): string {
  let s = "";
  for (const b of pub) s += b.toString(16).padStart(2, "0");
  return s;
}

/** Ключ есть на блокчейне у этого аккаунта и он FullAccess. */
export async function requireFullAccessKey(accountId: string, publicKey: string): Promise<void> {
  const { nearRpc } = await import("../rpc");
  const j = await nearRpc<{
    permission?: "FullAccess" | { FunctionCall: unknown };
  }>("query", {
    request_type: "view_access_key",
    finality: "final",
    account_id: accountId,
    public_key: publicKey,
  });
  if (j.error) throw new Error("Не удалось проверить ключ на блокчейне");
  if (j.result?.permission !== "FullAccess")
    throw new Error("Этот ключ не FullAccess — вход отклонён");
}

/**
 * implicit-адрес на блокчейне есть — ключ обязан быть живым FullAccess (ключ удалили,
 * а копия осталась у укравшего — не пустим); адреса нет (не пополнялся) — адрес и
 * есть ключ, подписи достаточно.
 */
async function requireLiveImplicitKey(accountId: string, publicKey: string): Promise<void> {
  const { nearRpc } = await import("../rpc");
  const j = await nearRpc("query", {
    request_type: "view_account",
    finality: "final",
    account_id: accountId,
  });
  if (j.error) {
    const e = j.error as { name?: string; cause?: { name?: string }; data?: unknown };
    const name = e.cause?.name ?? e.name ?? "";
    const data = typeof e.data === "string" ? e.data : "";
    if (name === "UNKNOWN_ACCOUNT" || /does not exist/i.test(data)) return;
    throw new Error("Не удалось проверить ключ на блокчейне");
  }
  await requireFullAccessKey(accountId, publicKey);
}

/**
 * Подпись верна, nonce свой (той же метки) и неиспользованный, ключ — FullAccess
 * этого аккаунта. implicit — аккаунт-адрес из ключа: его на блокчейне не
 * проверяем, если не просят onChain (вход нового кошелька — просят); onChain
 * "ifExists" — проверяем, только если адрес на блокчейне есть (вход по кошельку).
 */
export async function verifyConnectOwnership(
  args: { accountId: string; publicKey: string; signature: string; nonce: string },
  opts: { purpose?: SignPurpose; onChain?: boolean | "ifExists" } = {},
): Promise<{ implicit: boolean }> {
  const purpose = opts.purpose ?? "link";
  const consumed = (await mcpExec(
    `UPDATE yuplink.login_challenges SET consumed=true
       WHERE nonce='${args.nonce.replace(/'/g, "''")}' AND consumed=false AND expires_at > now()
         AND COALESCE(purpose, 'link') = '${purpose}'
       RETURNING nonce;`,
    { wrapJsonCte: true },
  )) as Array<{ nonce: string }>;
  if (!consumed[0]) throw new Error("Челлендж истёк или уже использован — начни вход заново");

  const nonceBytes = base64.decode(args.nonce);
  if (nonceBytes.length !== 32) throw new Error("Некорректный nonce");
  const hash = buildNep413Hash({
    message: MESSAGE[purpose],
    recipient: CONNECT_RECIPIENT,
    nonce: nonceBytes,
  });
  const pubBytes = base58.decode(args.publicKey.replace(/^ed25519:/i, ""));
  const sigBytes = base64.decode(args.signature);
  const ok = await ed25519.verifyAsync(sigBytes, hash, pubBytes);
  if (!ok) throw new Error("Подпись неверна");

  const implicit = args.accountId.toLowerCase() === pubBytesToImplicit(pubBytes).toLowerCase();
  if (!implicit || opts.onChain === true)
    await requireFullAccessKey(args.accountId, args.publicKey);
  else if (opts.onChain === "ifExists")
    await requireLiveImplicitKey(args.accountId, args.publicKey);
  return { implicit };
}
