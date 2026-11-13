// Картинки холста дуэли: одна загрузка на адрес на всю страницу. Холст
// перерисовывается каждый кадр, поэтому догрузившаяся картинка появится сама.
import { thumb } from "@/lib/image";
import type { Unit } from "@/lib/duel/types";

const cache = new Map<string, HTMLImageElement>();

export function image(url: string): HTMLImageElement {
  let img = cache.get(url);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = url;
    cache.set(url, img);
  }
  return img;
}

export const ready = (img: HTMLImageElement | null | undefined): img is HTMLImageElement =>
  !!img && img.complete && img.naturalWidth > 0;

/** Адреса — те же, что у карты рейда: картинки уже лежат в кэше браузера. */
export const terrainSrc = (url: string) => thumb(url, 256);
export const decorSrc = (url: string) => thumb(url, 160);
export const mobSrc = (url: string) => thumb(url, 160, "black");
export const foodSrc = (url: string) => thumb(url, 64);

/** Фигурка бойца: атлас героя или картинка моба. */
export function unitImage(u: Unit): HTMLImageElement | null {
  if (u.atlas) return image(u.atlas);
  return u.image ? image(mobSrc(u.image)) : null;
}
