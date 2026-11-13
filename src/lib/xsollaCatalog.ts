// Товары оплаты картой (Xsolla, §8.127): SKU в кабинете Xsolla = наши id —
// пакеты золота §8.66 (gold_*) и подписки на энергию (esub_*). Пакеты энергии
// в кабинете тоже заведены, но картой не продаются: владелец назвал «подписки и
// золото напрямую». Чистые правила, общие для сервера и окон.
import { GOLD_SHOP_DEFAULTS } from "@/lib/goldShop";

export type CardKind = "gold" | "sub";

const GOLD_SKUS = new Set<string>(GOLD_SHOP_DEFAULTS.map((o) => o.id));
const SUB_SKU_RE = /^esub_[a-z0-9_]{2,30}$/;

/** Что это за товар; null — картой не продаётся. */
export function cardKind(sku: string): CardKind | null {
  if (GOLD_SKUS.has(sku)) return "gold";
  if (SUB_SKU_RE.test(sku)) return "sub";
  return null;
}

/** Окно оплаты Xsolla по токену (тестовый режим — своя страница). */
export function payStationUrl(token: string, sandbox: boolean): string {
  const host = sandbox ? "sandbox-secure.xsolla.com" : "secure.xsolla.com";
  return `https://${host}/paystation4/?token=${encodeURIComponent(token)}`;
}

/** Куда вернуть игрока после оплаты: только путь нашего сайта. */
export function safeReturnPath(path: string | null | undefined): string {
  return path && /^\/[A-Za-z0-9/_\-.]{0,120}$/.test(path) && !path.startsWith("//") ? path : "/";
}
