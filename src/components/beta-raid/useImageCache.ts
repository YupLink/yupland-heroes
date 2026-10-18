// Кэш картинок местности и объектов для канваса: грузим один раз,
// по загрузке просим перерисовку. Картинки мира качаются, когда кадр их
// впервые попросил (LazyImages): сначала видимое, а не весь мир разом.
import { useEffect, useRef } from "react";
import { queueImage } from "./imageQueue";
import { LazyImages } from "./lazyImages";
import { thumb } from "@/lib/image";
import { MAP_PRELOAD, heroSpriteSrc } from "@/lib/gameArt";

export function useImageCache(
  terrains: Record<string, { imageUrl: string | null }>,
  objects: Record<string, { imageUrl: string | null; mapImageUrl?: string | null }>,
  decorations: Record<string, { imageUrl: string | null }>,
  roads: Record<string, { imageUrl: string | null }>,
  onLoaded: () => void,
  /** Спрайт расы героя игрока (boar/dragon/…). Нет — рисуем рыцаря. */
  heroSprite?: string | null,
  /** Постройки: у каждой свой набор картинок по тирам. */
  buildings?: Record<string, { tiers?: Array<{ imageUrl?: string | null }> }>,
  /** Боссы-охранники шахт: "q,r" → картинка, рисуется поверх шахты. */
  guards?: Record<string, { image: string | null }>,
  /** Магические сундуки: "q,r" → картинка. Ключ кэша — по адресу: вид один. */
  chests?: Record<string, { image: string | null }>,
) {
  const cacheRef = useRef(new LazyImages());
  // Какой спрайт героя уже загружен: ключ в кэше один ("hero"), поэтому при
  // смене расы старую картинку надо выкинуть — иначе на карте остаётся рыцарь.
  const heroKeyRef = useRef<string | null>(null);
  // Предыдущие пропсы для diff-based обновления: вместо полного перебора
  // всех terrains/objects/decorations/... при каждом изменении — сравниваем
  // с прошлым набором и грузим только разницу.
  const prevKeysRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const cache = cacheRef.current;
    const heroKey = heroSprite ?? "knight";
    if (heroKeyRef.current !== heroKey) {
      cache.delete("hero");
      heroKeyRef.current = heroKey;
    }

    // Собираем полный набор ключей, которые нужны в кадре.
    const needed = new Set<string>();
    // eager — герой и стрелки маршрута: крошечные и нужны сразу. Остальные
    // значки игры (9 обликов кораблей, флаги, мешочки) — по требованию кадра,
    // как и мир: на холодном входе они занимали очередь первыми, и видимое
    // качалось только на 18-й секунде (12.10.2026).
    const entries: Array<{ key: string; url: string; eager: boolean }> = [];
    let eager = true;

    const collect = (id: string, url: string, prefix: string) => {
      const key = prefix + id;
      needed.add(key);
      if (!cache.has(key)) entries.push({ key, url, eager });
    };

    collect("", heroSpriteSrc(heroSprite), "hero");
    for (const art of MAP_PRELOAD) {
      eager = art.eager === true;
      collect("", art.src, art.key);
    }
    eager = false;
    for (const [id, item] of Object.entries(terrains ?? {})) {
      if (item.imageUrl) collect(id, thumb(item.imageUrl, 128), "t:");
    }
    for (const [id, item] of Object.entries(objects ?? {})) {
      const url = item.mapImageUrl || item.imageUrl;
      if (url) collect(id, thumb(url, 160, "black"), "o:");
    }
    for (const [id, item] of Object.entries(decorations ?? {})) {
      if (item.imageUrl) collect(id, thumb(item.imageUrl, 160), "d:");
    }
    for (const [id, item] of Object.entries(roads ?? {})) {
      if (item.imageUrl) collect(id, thumb(item.imageUrl, 256), "r:");
    }
    for (const [id, item] of Object.entries(buildings ?? {})) {
      (item.tiers ?? []).forEach((tier, index) => {
        if (tier?.imageUrl) collect(`${id}:${index}`, thumb(tier.imageUrl, 160, "black"), "b:");
      });
    }
    for (const [key, item] of Object.entries(guards ?? {})) {
      if (item.image) collect(key, thumb(item.image, 160, "black"), "mg:");
    }
    // Сундуков на карте много, а картинка у вида одна — грузим её один раз.
    for (const item of Object.values(chests ?? {})) {
      if (item.image && !needed.has("mc:" + item.image)) {
        collect(item.image, thumb(item.image, 160, "black"), "mc:");
      }
    }

    // Diff: грузим только новые ключи, evictим только удалённые.
    // Раньше — полный перебор + cache.delete на каждый отсутствующий ключ.
    // Теперь — сравнение двух Set: O(n) вместо O(n) + N созданий Image.
    const prevKeys = prevKeysRef.current;
    if (prevKeys) {
      // Evict: были в кэше, стали не нужны.
      for (const k of prevKeys) {
        if (!needed.has(k)) cache.delete(k);
      }
    }
    prevKeysRef.current = needed;

    // Грузим только то, чего нет в кэше.
    if (entries.length === 0) return;
    for (const { key, url, eager: now } of entries) {
      const img = new Image();
      img.onload = onLoaded;
      // Битая картинка (404, пустой файл) раньше молчала: на карте оставалась
      // вечная точка-заглушка, и по ней не понять, какой шаблон чинить.
      // Ключ = слой:id, адрес — то, что просили у сервера.
      img.onerror = () => console.warn("[map-img] картинка не загрузилась", key, url);
      if (!now) {
        cache.defer(key, img, url);
        continue;
      }
      queueImage(img, url);
      cache.set(key, img);
      if (img.complete && img.naturalWidth > 0) onLoaded();
    }
    // Новые записи словаря видны кадру только после перерисовки.
    onLoaded();
  }, [terrains, objects, decorations, roads, buildings, guards, chests, onLoaded, heroSprite]);

  return cacheRef;
}
