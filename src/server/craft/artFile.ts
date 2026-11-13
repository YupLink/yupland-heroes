// Иконка артефакта из лаборатории — на диск загрузок, рядом с картинками
// админки (/uploads/tasks/…). Каталог — как в api.upload.ts: на проде
// UPLOADS_DIR, в деве public/uploads (Vite раздаёт public/ по /uploads).
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ??
  (process.env.NODE_ENV === "production" ? "/data/uploads" : "public/uploads");
const PUBLIC_BASE = (process.env.UPLOADS_PUBLIC_BASE ?? "/uploads").replace(/\/+$/, "");

/** Имя файла — задание и посев: опоздавший обработчик с другим посевом пишет
 *  свой файл и не подменяет картинку уже выданного артефакта. */
export async function saveCraftPng(jobId: string, seed: number, png: Buffer): Promise<string> {
  const safe = jobId.replace(/[^A-Za-z0-9_-]/g, "");
  const rel = `tasks/craft_${safe}_${Math.floor(Math.abs(seed))}.png`;
  await mkdir(join(UPLOADS_DIR, "tasks"), { recursive: true });
  await writeFile(join(UPLOADS_DIR, rel), png);
  return `${PUBLIC_BASE}/${rel}`;
}
