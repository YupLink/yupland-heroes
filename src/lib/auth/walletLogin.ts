// Вход по NEAR-кошельку без Telegram (06.11.2026): вызов с сервера → выбор
// кошелька (подключение только для подписи — мост игры его не перехватывает) →
// подпись NEP-413 → сервер проверяет и сажает сессию (wallet-login/walletLogin.ts).
import { base64 } from "@scure/base";
import { createWalletLoginChallenge, loginWithWallet } from "@/server/api/wallet-login/walletLogin";
import { getDeviceId } from "@/lib/auth/deviceId";
import { deviceFingerprint } from "@/lib/auth/deviceFingerprint";

/** entry crown — ссылка игры «Корона», near — домен near.service.yupland.io (§8.127): там новый
 *  кошелёк получает свой аккаунт. */
export async function runWalletLogin(entry: "game" | "crown" | "near" = "game") {
  const ch = await createWalletLoginChallenge();
  const { connectForSigning, connectAndSignMessage, getSignerWallet } =
    await import("@/lib/near-connector");
  // nonce — вербатим с сервера (тот же кодек @scure/base): перекодировка сломала бы сверку.
  const params = { message: ch.message, recipient: ch.recipient, nonce: base64.decode(ch.nonce) };
  // Ссылка «Короны» (08.11): подключение и подпись — одним окном кошелька (Safari
  // блокировал второе). Экран гостя игры — как было.
  let s: { accountId: string; publicKey: string; signature: string };
  if (entry !== "game") s = await connectAndSignMessage(params);
  else {
    await connectForSigning();
    s = await (await getSignerWallet()).signMessage(params);
  }
  const fp = await deviceFingerprint().catch(() => null);
  return loginWithWallet({
    data: {
      accountId: s.accountId,
      publicKey: s.publicKey,
      signature: s.signature,
      nonce: ch.nonce,
      device: getDeviceId(),
      ...(fp ? { fp } : {}),
      ...(entry !== "game" ? { entry } : {}),
    },
  });
}
