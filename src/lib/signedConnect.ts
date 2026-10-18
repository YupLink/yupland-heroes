// Вход С ПОДПИСЬЮ (NEP-413): доказать владение кошельком, а не просто заявить его.
// Заменяет неподписанный connectWallet. Встроенный кош подписывает НЕИЗВЛЕКАЕМЫМ
// ключом (secureWallet), внешний — через коннектор (wallet.signMessage). Сервер
// проверяет подпись в connectWalletSigned (src/server/api/user-auth.ts).
//
// Без подписи кошелёк не подключается (владелец, 18.10.2026): подписать не вышло —
// ошибка, никакого запасного входа. Кошелёк пристёгивается к Telegram сессии.
import { base64 } from "@scure/base";
import { connectWalletSigned, createLoginChallenge } from "@/server/api/user-auth";

export interface SignedConnectOpts {
  accountId: string;
  /** embedded — встроенный YupLink-кош (ключ локально); external — HOT/инжектед. */
  kind: "embedded" | "external";
  ref?: string | null;
  additionalFor?: string | null;
  /** PIN для legacy встроенного коша (обычно не нужен — сид в кэше сессии). */
  pin?: string;
  /** Только пристегнуть к Telegram, игра остаётся на текущем кошельке. */
  stay?: boolean;
}

interface Challenge {
  message: string;
  recipient: string;
}
interface Proof {
  accountId: string;
  publicKey: string;
  signature: string;
}

async function signEmbedded(
  accountId: string,
  ch: Challenge,
  nonce: Uint8Array,
  pin?: string,
): Promise<Proof> {
  const { signNep413Embedded } = await import("@/lib/embeddedWallet");
  const { publicKey, signature } = await signNep413Embedded({
    accountId,
    pin,
    message: ch.message,
    recipient: ch.recipient,
    nonce,
  });
  return { accountId, publicKey, signature };
}

async function signExternal(ch: Challenge, nonce: Uint8Array): Promise<Proof> {
  const { getSignerWallet } = await import("@/lib/near-connector");
  const wallet = await getSignerWallet();
  const s = await wallet.signMessage({
    message: ch.message,
    recipient: ch.recipient,
    nonce,
  });
  // accountId/publicKey/signature берём из ОТВЕТА подписи — он авторитетен
  // (не из события wallet:signIn, где accountId мог бы разойтись с подписью).
  return { accountId: s.accountId, publicKey: s.publicKey, signature: s.signature };
}

/**
 * Подключить кошелёк к Telegram сессии, доказав владение подписью NEP-413.
 * Подпись не вышла или сервер отказал — ошибка уходит вызывающему.
 */
export async function signedConnect(
  o: SignedConnectOpts,
): Promise<{ wallet: string; signed: boolean }> {
  const { accountId, kind, ref = null, additionalFor = null, pin, stay } = o;
  const ch = await createLoginChallenge();
  // Тот же кодек, что на сервере (@scure/base). nonce возвращаем вербатим —
  // перекодировка сломала бы сверку подписи.
  const nonce = base64.decode(ch.nonce);
  const proof =
    kind === "embedded"
      ? await signEmbedded(accountId, ch, nonce, pin)
      : await signExternal(ch, nonce);
  const res = await connectWalletSigned({
    data: {
      accountId: proof.accountId,
      publicKey: proof.publicKey,
      signature: proof.signature,
      nonce: ch.nonce,
      ref,
      additionalFor,
      stay,
    },
  });
  return { wallet: res.wallet, signed: true };
}
