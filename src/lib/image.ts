// Резолвит media-поле NFT в загружаемый URL.
// В Sendler API встречаются три формата:
//   1. https://gateway.../ipfs/Qm… — готовый URL → отдаём как есть.
//   2. ipfs://Qm… — IPFS-протокол → подставляем шлюз.
//   3. Qm… / bafy… — голый CID → подставляем шлюз.
//
// Шлюз по умолчанию для (2) и (3) — gateway.dialog-tbot.com (Yupland-овский
// pinata-шлюз, на котором лежит их контент). Если он не отдаст 200, на клиенте
// есть fallback через NftImage-компонент — пробует ipfs.io / nftstorage.

export const PRIMARY_IPFS_GATEWAY = "https://gateway.dialog-tbot.com/ipfs/";
export const FALLBACK_IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://nftstorage.link/ipfs/",
];

export function resolveImage(media: string | null | undefined): string {
  if (!media) return "";
  const s = media.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("ipfs://")) {
    return PRIMARY_IPFS_GATEWAY + s.slice("ipfs://".length).replace(/^\/+/, "");
  }
  // Голый CID: v0 (Qm…) или v1 (bafy/bafk/bafz…)
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|ba[fk-z][a-z0-9]+)$/i.test(s)) {
    return PRIMARY_IPFS_GATEWAY + s;
  }
  // Что-то другое — отдаём как есть, пусть браузер ругнётся
  return s;
}

/**
 * Превью через ресайз-прокси /api/img: маленький WebP нужной ширины + кэш.
 * Для сеток/аватарок фишек и паков (исходники бывают 1+ МБ PNG). Прокси при
 * ошибке редиректит на оригинал, так что безопасно оборачивать любой URL.
 * data:/blob:/пустое — отдаём как есть (нечего ресайзить).
 * @param src уже РЕЗОЛВЛЕННЫЙ URL (http/ipfs-шлюз/относительный /uploads).
 * @param width ширина в CSS-px; удваивать под ретину вызывающий может сам.
 */
/**
 * Картинка босса: если removeWhite — гоним через прокси с cut=white (белый фон
 * → прозрачность). Иначе — resolveImage как есть (прозрачный PNG / GIF не
 * трогаем). Возвращает готовый src.
 */
export function bossImg(
  src: string | null | undefined,
  width: number,
  removeWhite?: boolean
): string {
  const resolved = resolveImage(src);
  if (!resolved) return "";
  // Всегда через ресайз-прокси (быстро: ~30-50 КБ WebP вместо 1-4 МБ PNG).
  // removeWhite → доп. вырез белого. GIF анимируется прокси (animated в /api/img).
  const proxyable =
    /^https?:\/\//i.test(resolved) || resolved.startsWith("/uploads/");
  if (!proxyable) return resolved;
  const w = Math.min(640, Math.max(32, Math.round(width)));
  return `/api/img?u=${encodeURIComponent(resolved)}&w=${w}${removeWhite ? "&cut=white" : ""}`;
}

export function thumb(
  src: string | null | undefined,
  width: number,
  /** "black" — вырезать чёрный фон (JPEG-ассеты без прозрачности). */
  cut?: "black" | "white"
): string {
  const s = (src ?? "").trim();
  if (!s) return "";
  if (s.startsWith("/api/img")) return s; // уже прокси
  // Оборачиваем ТОЛЬКО то, что прокси реально умеет достать: http(s) или наш
  // /uploads. ipfs://, голый CID, data:/blob: — отдаём как есть (прокси их не
  // возьмёт → сломался бы фолбэк). Такие сначала прогони через resolveImage().
  const proxyable = /^https?:\/\//i.test(s) || s.startsWith("/uploads/");
  if (!proxyable) return s;
  const w = Math.min(640, Math.max(32, Math.round(width)));
  return `/api/img?u=${encodeURIComponent(s)}&w=${w}${cut ? `&cut=${cut}` : ""}`;
}

/**
 * Извлекает CID + остаток пути из media (URL шлюза, ipfs:// или голый CID).
 * Нужен NftImage-компоненту для перебора резервных шлюзов.
 */
export function extractIpfsPath(
  media: string | null | undefined
): string | null {
  if (!media) return null;
  const s = media.trim();
  if (!s) return null;
  // /ipfs/<CID>[/...]
  const m = s.match(/\/ipfs\/([A-Za-z0-9]+(?:\/[^?#]*)?)/);
  if (m) return m[1];
  if (s.startsWith("ipfs://")) {
    return s.slice("ipfs://".length).replace(/^\/+/, "");
  }
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|ba[fk-z][a-z0-9]+)/i.test(s)) {
    return s;
  }
  return null;
}
