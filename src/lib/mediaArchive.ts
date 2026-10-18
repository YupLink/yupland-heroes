// Архив картинок игры (владелец, 06.10.2026): открытая страница, где все
// изображения YupLink разложены по категориям и скачиваются ZIP-архивом.
// Здесь — общее для сервера и страницы: категории по порядку и имена файлов.

export type ArchiveCat =
  | "terrain"
  | "road"
  | "building"
  | "skin"
  | "decoration"
  | "chest"
  | "boss"
  | "hero"
  | "artifact"
  | "custom"
  | "resource"
  | "pack"
  | "chip"
  | "spell"
  | "castle"
  | "location"
  | "sprite";

/** Порядок разделов на странице и папок в архиве. */
export const ARCHIVE_CATS: Array<{ id: ArchiveCat; ru: string; en: string }> = [
  { id: "terrain", ru: "Типы местности", en: "Terrain" },
  { id: "road", ru: "Дороги", en: "Roads" },
  { id: "building", ru: "Здания", en: "Buildings" },
  { id: "skin", ru: "Облики зданий", en: "Building skins" },
  { id: "decoration", ru: "Декорации", en: "Decorations" },
  { id: "chest", ru: "Сундуки и объекты", en: "Chests and objects" },
  { id: "boss", ru: "Боссы", en: "Bosses" },
  { id: "hero", ru: "Герои", en: "Heroes" },
  { id: "artifact", ru: "Артефакты", en: "Artifacts" },
  { id: "custom", ru: "Товары", en: "Goods" },
  { id: "resource", ru: "Ресурсы", en: "Resources" },
  { id: "pack", ru: "Паки", en: "Packs" },
  { id: "chip", ru: "Фишки", en: "Chips" },
  { id: "spell", ru: "Заклинания", en: "Spells" },
  { id: "castle", ru: "Замок: местность", en: "Castle terrain" },
  { id: "location", ru: "Локации", en: "Locations" },
  { id: "sprite", ru: "Герои и корабли на карте", en: "Map heroes and ships" },
];

export type ArchiveItem = {
  /** Уникален в архиве: по нему галочки. */
  key: string;
  cat: ArchiveCat;
  /** Подгруппа: категория товара, группа облика. В архиве — вложенная папка. */
  sub: string | null;
  name: string;
  url: string;
};

/** Имя файла как в игре, но без символов, которые не любят Windows и macOS. */
export function safeFileName(name: string): string {
  const clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return (clean || "без имени").slice(0, 100);
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

/** Расширение: из адреса, а нет — по типу ответа сервера. */
export function extOf(url: string, contentType?: string | null): string {
  const m = /\.([a-z0-9]{2,5})(?:$|[?#])/i.exec(url.split("?")[0] ?? "");
  if (m) return m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
  const t = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return EXT_BY_TYPE[t] ?? "png";
}

/**
 * Пути файлов в архиве: «Категория/Подгруппа/Имя.ext». Одинаковые имена в
 * одной папке — с номером: «Имя (2).ext», иначе второй файл затёр бы первый.
 */
export function makeArchivePaths(files: Array<{ item: ArchiveItem; ext: string }>): string[] {
  const label = new Map(ARCHIVE_CATS.map((c) => [c.id, c.ru]));
  const seen = new Map<string, number>();
  return files.map(({ item, ext }) => {
    const dir = [label.get(item.cat) ?? item.cat, item.sub ? safeFileName(item.sub) : null]
      .filter(Boolean)
      .join("/");
    const base = safeFileName(item.name);
    const key = `${dir}/${base}.${ext}`.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return `${dir}/${base}${n > 1 ? ` (${n})` : ""}.${ext}`;
  });
}
