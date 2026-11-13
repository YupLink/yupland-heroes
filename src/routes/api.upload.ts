import { createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getCurrentWallet, isAdminWallet, requireCastleEditor } from "@/server/auth";
import { storeNewspaperPng } from "@/server/newspaper-upload";

// Загрузка файла-картинки на локальный диск (self-host). Админ — или
// редактор внутрянки замка (дизайнер грузит свои картинки в /castle-editor).
// Раньше писали в Vercel Blob — теперь в UPLOADS_DIR (по умолчанию
// /data/uploads), Caddy раздаёт по <UPLOADS_PUBLIC_BASE>/tasks/<id>.<ext>
// (по умолчанию /uploads). Возвращает { url } — сохраняется в tasks.image.

const MAX_BYTES = 8 * 1024 * 1024; // self-host без 4.5MB-лимита Vercel
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Прод задаёт UPLOADS_DIR=/srv/yuplink-uploads (Caddy раздаёт /uploads).
// В деве переменной нет → пишем в public/uploads (Vite раздаёт public/ по /uploads),
// иначе /data read-only на локалке.
const UPLOADS_DIR =
  process.env.UPLOADS_DIR ??
  (process.env.NODE_ENV === "production" ? "/data/uploads" : "public/uploads");
const UPLOADS_PUBLIC_BASE = (process.env.UPLOADS_PUBLIC_BASE ?? "/uploads").replace(/\/+$/, "");

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const wallet = getCurrentWallet();
        if (!isAdminWallet(wallet)) {
          // Не админ — может быть дизайнер замка (проверка по TG username в users).
          try {
            await requireCastleEditor();
          } catch {
            return Response.json({ error: "forbidden" }, { status: 403 });
          }
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "bad form" }, { status: 400 });
        }

        const file = form.get("file");
        if (!(file instanceof File)) {
          return Response.json({ error: "no file" }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
          return Response.json({ error: "Файл больше 8 MB" }, { status: 413 });
        }
        if (!ALLOWED_MIME.has(file.type)) {
          return Response.json({ error: "Только JPEG/PNG/WebP/GIF" }, { status: 415 });
        }

        // Explicit opt-in: all other upload consumers retain their existing behavior.
        if (form.get("purpose") === "newspaper") {
          try {
            return Response.json(await storeNewspaperPng(file, UPLOADS_DIR, UPLOADS_PUBLIC_BASE));
          } catch {
            return Response.json(
              { error: "Не удалось сохранить оригинал. Проверь PNG (до 8 МБ) и повтори." },
              { status: 400 },
            );
          }
        }

        try {
          const dir = join(UPLOADS_DIR, "tasks");
          await mkdir(dir, { recursive: true });
          const raw = Buffer.from(await file.arrayBuffer());

          // Формат — по содержимому, не по имени и не по типу из формы (аудит
          // 11.11.2026: «x.html» с типом image/gif ложился как есть и открывался
          // страницей на нашем домене). Не картинка — отказ, оригинал не пишем.
          const sharp = (await import("sharp")).default;
          const fmt = await sharp(raw, { animated: true })
            .metadata()
            .then((m) => m.format)
            .catch(() => null);
          if (fmt !== "jpeg" && fmt !== "png" && fmt !== "webp" && fmt !== "gif") {
            return Response.json({ error: "Только JPEG/PNG/WebP/GIF" }, { status: 415 });
          }

          // Сжимаем на входе: админ грузит PNG до 8 МБ, а на карте/в палитре
          // нужен максимум ~1280px. Ужимаем в WebP ЕДИНОЖДЫ при загрузке —
          // иначе оригинал в 2–8 МБ висит на диске и в первый показ его тянет
          // ресайз-прокси целиком. GIF не трогаем (анимация).
          let outBuf: Uint8Array = raw;
          let outExt = "gif";
          if (fmt !== "gif") {
            try {
              outBuf = await sharp(raw)
                .rotate()
                .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
                .webp({ quality: 82 })
                .toBuffer();
              outExt = "webp";
            } catch {
              return Response.json({ error: "Не удалось прочитать картинку" }, { status: 415 });
            }
          }
          const rel = `tasks/${nanoid(10)}.${outExt}`;
          await writeFile(join(UPLOADS_DIR, rel), outBuf);
          return Response.json({ url: `${UPLOADS_PUBLIC_BASE}/${rel}` });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json({ error: `upload failed: ${msg}` }, { status: 500 });
        }
      },
    },
  },
});
