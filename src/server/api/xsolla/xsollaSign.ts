// Подпись вебхука Xsolla: заголовок «Authorization: Signature <sha1(тело + секрет)>».
// Тело — ровно как пришло (перекодировка JSON ломает подпись). Только сервер.
import { createHash, timingSafeEqual } from "node:crypto";

export function xsollaSignature(rawBody: string, secret: string): string {
  return createHash("sha1")
    .update(rawBody + secret, "utf8")
    .digest("hex");
}

export function xsollaSignatureOk(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
): boolean {
  const got = /^Signature\s+([0-9a-f]{40})$/i.exec((header ?? "").trim())?.[1]?.toLowerCase();
  if (!got) return false;
  const want = xsollaSignature(rawBody, secret);
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
