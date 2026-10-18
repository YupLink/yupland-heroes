// ⚠️ ИСТОРИЧЕСКАЯ ЗАМЕТКА (2026-05-17):
// Этот модуль раньше держал custodial-логику для пользовательских кошельков
// (зашифрованные через AWS KMS сиды/приваты в БД, sign-and-send с бэка).
// Мы перешли на non-custodial модель: ключи юзера живут только в его
// TG CloudStorage, зашифрованные PIN'ом. Бэк физически не может подписать
// за юзера.
//
// Что осталось здесь: только утилиты для admin/operating кошельков
// (приваты для них задаются через ENV NEAR_SIGNER_PRIVATE_KEY).

import { generateSeedPhrase } from "near-seed-phrase";
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  keyToImplicitAddress,
  PublicKey,
} from "near-api-js";

const NEAR_RPC = process.env.NEAR_RPC_URL ?? "https://rpc.mainnet.fastnear.com";

function publicKeyToImplicitAccountId(publicKeyStr: string): string {
  const pk = PublicKey.from(publicKeyStr);
  return keyToImplicitAddress(pk);
}

export interface GeneratedKeypair {
  accountId: string;
  publicKey: string;
  secretKey: string;
  seedPhrase: string;
}

/**
 * Чистая криптогенерация без записи в БД и без KMS. Используется только
 * для одноразовых нужд (тесты, генерация admin-сидки). Возвращённые
 * секреты должен сразу сохранить вызывающий код.
 */
export function generateEphemeralKeypair(): GeneratedKeypair {
  const { seedPhrase, publicKey, secretKey } = generateSeedPhrase();
  return {
    accountId: publicKeyToImplicitAccountId(publicKey),
    publicKey,
    secretKey,
    seedPhrase,
  };
}

/**
 * Сборка admin/operating Account по secret-key из ENV.
 */
export function buildAdminAccount(opts: {
  accountId: string;
  secretKey: string;
  rpcUrl?: string;
}): Account {
  const normalized = opts.secretKey.startsWith("ed25519:")
    ? opts.secretKey
    : `ed25519:${opts.secretKey}`;
  const kp = KeyPair.fromString(normalized);
  const provider = new JsonRpcProvider({ url: opts.rpcUrl ?? NEAR_RPC });
  const signer = new KeyPairSigner(kp);
  return new Account(opts.accountId, provider, signer);
}
