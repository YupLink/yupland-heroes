// AWS KMS encryption/decryption helpers для NEAR-кошельков.
//
// Архитектура: master-key живёт в AWS KMS HSM (alias/yuplink-wallets),
// никогда не покидает железо. Сервер шлёт данные в KMS API → получает
// ciphertext blob → сохраняет в БД (base64). На decrypt — обратно.
//
// IAM: policy AWSKeyManagementServicePowerUser на user yuplink-kms.
// Region: eu-north-1 (Stockholm). Latency на encrypt/decrypt ~50-100ms из EU.
//
// Cost: $1/мес за key + $0.03 за 10k операций. На наш масштаб ~$1-3/мес.

import {
  KMSClient,
  EncryptCommand,
  DecryptCommand,
} from "@aws-sdk/client-kms";

const REGION = process.env.AWS_REGION ?? "eu-north-1";
const KEY_ID = process.env.KMS_KEY_ID ?? "alias/yuplink-wallets";

let _client: KMSClient | null = null;
function client(): KMSClient {
  if (_client) return _client;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY не сконфигурированы");
  }
  _client = new KMSClient({
    region: REGION,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

/**
 * Шифрует UTF-8 строку через KMS. Возвращает base64-encoded ciphertext blob.
 * Лимит KMS на input — 4 KB. Для NEAR-приватов (~88 chars base58) и сидов
 * (~100 chars 12 слов) — с большим запасом.
 */
export async function kmsEncryptString(plaintext: string): Promise<string> {
  const r = await client().send(
    new EncryptCommand({
      KeyId: KEY_ID,
      Plaintext: new TextEncoder().encode(plaintext),
    })
  );
  if (!r.CiphertextBlob) throw new Error("KMS вернул пустой CiphertextBlob");
  return Buffer.from(r.CiphertextBlob).toString("base64");
}

/**
 * Расшифровывает base64-ciphertext через KMS. Возвращает оригинальную строку.
 * KMS сам определяет каким key расшифровать (encoded в blob).
 *
 * Опциональный 2-й arg label для audit-логирования (фоновое в kms_decrypt_log).
 */
export async function kmsDecryptString(
  b64Ciphertext: string,
  label: string = "unknown"
): Promise<string> {
  const start = Date.now();
  let ok = true;
  let errMsg: string | null = null;
  try {
    const r = await client().send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(b64Ciphertext, "base64"),
      })
    );
    if (!r.Plaintext) throw new Error("KMS вернул пустой Plaintext");
    return new TextDecoder().decode(r.Plaintext);
  } catch (err) {
    ok = false;
    errMsg = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    // Fire-and-forget audit запись. Не блокируем decrypt.
    const duration = Date.now() - start;
    void logKmsDecryptAsync({
      label,
      durationMs: duration,
      ok,
      error: errMsg,
    });
  }
}

// Logging выключено — было overengineering. Только console.error на failure.
async function logKmsDecryptAsync(opts: {
  label: string;
  durationMs: number;
  ok: boolean;
  error: string | null;
}): Promise<void> {
  if (!opts.ok) {
    console.error(
      `[KMS Decrypt failed] label=${opts.label} duration=${opts.durationMs}ms`,
      opts.error
    );
  }
}
