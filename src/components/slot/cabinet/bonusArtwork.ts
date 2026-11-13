import { asset } from "./shared";

export const NOTICE_YUPIK = "bonus-notice-yupik-v1.webp";
export const NOTICE_BACKGROUND = "bonus-notice-background-v1.jpg";

// Warm only the next artwork, one request at a time. Do not force atlas decoding
// during the announcement's entrance animation or keep decoded textures alive.
export function warmArtwork(names: readonly string[], delay: number) {
  let index = 0;
  let cancelled = false;
  let image: HTMLImageElement | null = null;
  let timer: number;
  const next = () => {
    if (cancelled || document.hidden || index >= names.length) return;
    image = new Image();
    image.decoding = "async";
    image.fetchPriority = "low";
    const settle = () => {
      if (image) image.onload = image.onerror = null;
      image = null;
      if (!cancelled) timer = window.setTimeout(next, 100);
    };
    image.onload = image.onerror = settle;
    image.src = asset(names[index++]);
  };
  timer = window.setTimeout(next, delay);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    if (image) image.onload = image.onerror = null;
    image = null;
  };
}
