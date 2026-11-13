// Архив файлов прошлых сборок (владелец, 28.10.2026: «вылетает „загрузка не удалась“,
// приходится перезагружать — пользователя не должно никуда гонять»).
//
// После выката у игрока с открытой игрой старая страница просит куски кода по старым
// именам (`/assets/tavern-Cq0P74Fv.js`), а в новой сборке их нет: сервер отдавал HTML
// «не найдено», браузер падал на импорте — «Не удалось открыть окно». Деплой держит
// всего три сборки, а в день их бывает по десятку.
//
// Теперь каждый рабочий при старте докладывает файлы своей сборки в общий архив
// (`.assets-archive` рядом с `.builds`), архив хранит неделю, и если файла нет в текущей
// сборке — его отдаёт маршрут `/assets/$` (routes/assets.$.ts). Старая страница просто
// продолжает работать; обновится сама, когда игрок свернёт игру (lib/versionCheck).
import { promises as fs } from "node:fs";
import path from "node:path";

/** Сколько хранить файлы в архиве. */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
/** Имя файла сборки: плоское, без папок (vite кладёт assets в одну папку). */
const SAFE_NAME = /^[A-Za-z0-9._-]{1,200}$/;

const root = () => process.env.ASSET_ARCHIVE_ROOT ?? process.cwd();
const archiveDir = () => path.join(root(), ".assets-archive");
const buildsDir = () => path.join(root(), ".builds");

export const isSafeAssetName = (name: string): boolean =>
  SAFE_NAME.test(name) && !name.startsWith(".");

/** Сложить файлы всех хранящихся сборок в архив (нового — докладываем, старое — не трогаем). */
export async function archiveBuildAssets(): Promise<{ copied: number; pruned: number }> {
  const dir = archiveDir();
  let builds: string[];
  try {
    builds = await fs.readdir(buildsDir());
  } catch {
    return { copied: 0, pruned: 0 }; // не прод (нет .builds) — молчим
  }
  await fs.mkdir(dir, { recursive: true });
  let copied = 0;
  for (const b of builds) {
    const src = path.join(buildsDir(), b, "public", "assets");
    let names: string[];
    try {
      names = await fs.readdir(src);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!isSafeAssetName(name)) continue;
      // Сначала во временный, потом ссылкой на место: читатель не увидит недописанный
      // файл, а второй рабочий, копирующий тот же файл, просто получит «уже есть».
      const tmp = path.join(dir, `.tmp-${process.pid}-${name}`);
      try {
        await fs.access(path.join(dir, name));
        continue; // уже в архиве
      } catch {
        /* нет — докладываем */
      }
      try {
        await fs.copyFile(path.join(src, name), tmp);
        await fs.link(tmp, path.join(dir, name));
        copied++;
      } catch {
        /* уже есть или не файл */
      } finally {
        await fs.unlink(tmp).catch(() => {});
      }
    }
  }
  let pruned = 0;
  const now = Date.now();
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    const file = path.join(dir, name);
    const st = await fs.stat(file).catch(() => null);
    if (
      st &&
      now - st.mtimeMs > KEEP_MS &&
      (await fs.unlink(file).then(
        () => true,
        () => false,
      ))
    )
      pruned++;
  }
  return { copied, pruned };
}

/** Файл прошлой сборки по имени; нет — null. */
export async function readArchivedAsset(name: string): Promise<Buffer | null> {
  if (!isSafeAssetName(name)) return null;
  return fs.readFile(path.join(archiveDir(), name)).catch(() => null);
}

const TYPES: Record<string, string> = {
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  map: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  wasm: "application/wasm",
};

export const assetType = (name: string): string =>
  TYPES[name.slice(name.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";
