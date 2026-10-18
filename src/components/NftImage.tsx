import { useEffect, useState } from "react";
import {
  FALLBACK_IPFS_GATEWAYS,
  PRIMARY_IPFS_GATEWAY,
  extractIpfsPath,
  thumb,
} from "@/lib/image";

/**
 * <img>-обёртка с fallback по IPFS-шлюзам. На onError пробует следующий
 * шлюз из списка. Если все упали — показывает YupLink-логотип как fallback,
 * чтобы место под NFT-картинку не зияло пустотой.
 *
 * Если media — обычный https URL без /ipfs/<CID>, fallback на шлюзы не
 * пытаемся (URL «готовый»), но всё равно подменяем на лого если упал.
 */
const LOGO_FALLBACK = "/yuplink-logo.webp";

export function NftImage({
  src,
  alt = "",
  className,
  loading = "lazy",
  width,
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager";
  /** Если задан — грузим через ресайз-прокси (маленький WebP нужной ширины).
   *  Не задан — оригинал (для детальных вью в полном качестве). */
  width?: number;
}) {
  const ipfsPath = extractIpfsPath(src);
  const rawCandidates: string[] = ipfsPath
    ? [PRIMARY_IPFS_GATEWAY + ipfsPath, ...FALLBACK_IPFS_GATEWAYS.map((g) => g + ipfsPath)]
    : src
      ? [src]
      : [];
  // Оборачиваем в прокси только при заданной ширине; фолбэк-цепочка по шлюзам
  // сохраняется (каждый кандидат — свой шлюз, обёрнутый в thumb).
  const candidates = width
    ? rawCandidates.map((c) => thumb(c, width))
    : rawCandidates;
  const [idx, setIdx] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  // Если props.src поменялся — начинаем с первого кандидата.
  useEffect(() => {
    setIdx(0);
    setExhausted(false);
  }, [src]);

  // Нет ни одного валидного источника — сразу лого.
  if (candidates.length === 0 || exhausted) {
    return (
      <img
        src={LOGO_FALLBACK}
        alt={alt || "YupLink"}
        className={className}
        loading={loading}
        decoding="async"
      />
    );
  }

  return (
    <img
      key={candidates[idx]}
      src={candidates[idx]}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      // Низкий приоритет загрузки — браузер сначала тянет видимое, а
      // десятки lazy-плиток качаются по мере прокрутки.
      // @ts-expect-error: fetchpriority — относительно новый HTML-атрибут
      fetchpriority="low"
      onError={() => {
        if (idx < candidates.length - 1) setIdx(idx + 1);
        else setExhausted(true);
      }}
    />
  );
}
