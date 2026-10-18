// Ресайз-прокси картинок: /api/img?u=<url>&w=<width>&q=<quality>
// Берёт исходник (наш /uploads или IPFS-шлюз), ужимает до нужной ширины в WebP,
// кэширует на диск и отдаёт с длинным кэшем. Крошечные превью в маркете/фишках
// грузились как 1-1.2 МБ PNG — теперь ~20-50 КБ WebP.
// БЕЗОПАСНОСТЬ (анти-SSRF): source только из /uploads (локальный файл) или из
// whitelisted IPFS-шлюзов / нашего домена. Иначе — фолбэк-редирект.
// НАДЁЖНОСТЬ: любая ошибка (нет sharp / битый файл / шлюз лёг) → 302 на оригинал,
// т.е. в худшем случае как было, без поломки картинок.
import { createFileRoute } from "@tanstack/react-router";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ??
  (process.env.NODE_ENV === "production" ? "/data/uploads" : "public/uploads");
const CACHE_DIR = join(UPLOADS_DIR, "imgcache");

// Хосты, с которых разрешено тянуть по http (IPFS-шлюзы + наш домен).
const ALLOWED_HOST_SUFFIX = [
  "gateway.dialog-tbot.com",
  "ipfs.io",
  "nftstorage.link",
  "cloudflare-ipfs.com",
  "dweb.link",
  "service.yupland.io",
];

function webp(buf: Buffer, status = 200): Response {
  return new Response(new Uint8Array(buf), {
    status,
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

export const Route = createFileRoute("/api/img")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const u = url.searchParams.get("u");
        if (!u) return new Response("no url", { status: 400 });
        const w = Math.min(
          640,
          Math.max(32, parseInt(url.searchParams.get("w") ?? "256", 10) || 256),
        );
        const q = Math.min(90, Math.max(40, parseInt(url.searchParams.get("q") ?? "72", 10) || 72));
        // cut=white — вырезать near-white фон (боссы на белом).
        // cut=black — вырезать чёрный фон у JPEG-ассетов: часть артефактов
        // залита в JPEG, где прозрачности нет, и на карте давала чёрный круг.
        const cutParam = url.searchParams.get("cut");
        const cut = cutParam === "white" ? "white" : cutParam === "black" ? "black" : "";
        // Фолбэк — отдать оригинал (в худшем случае как было).
        const fallback = () => new Response(null, { status: 302, headers: { location: u } });

        try {
          // Ключ кэша.
          const key = createHash("sha1").update(`${u}|${w}|${q}|${cut}`).digest("hex") + ".webp";
          const cachePath = join(CACHE_DIR, key);
          try {
            const cached = await readFile(cachePath);
            return webp(cached);
          } catch {
            /* нет в кэше — генерим */
          }

          // Загружаем исходник (SSRF-safe).
          let input: Buffer | null = null;
          if (u.startsWith("/uploads/")) {
            const rel = u.slice("/uploads/".length).replace(/\.\.+/g, "");
            input = await readFile(join(UPLOADS_DIR, rel));
          } else if (/^https?:\/\//i.test(u)) {
            let host = "";
            try {
              host = new URL(u).hostname.toLowerCase();
            } catch {
              return fallback();
            }
            const ok = ALLOWED_HOST_SUFFIX.some((h) => host === h || host.endsWith("." + h));
            if (!ok) return fallback();
            // Наш домен + /uploads → читаем файл напрямую (без сетевого хопа).
            const pu = new URL(u);
            if (host === "service.yupland.io" && pu.pathname.startsWith("/uploads/")) {
              const rel = pu.pathname.slice("/uploads/".length).replace(/\.\.+/g, "");
              input = await readFile(join(UPLOADS_DIR, rel));
            } else {
              const r = await fetch(u, {
                signal: AbortSignal.timeout(8000),
              });
              if (!r.ok) return fallback();
              input = Buffer.from(await r.arrayBuffer());
            }
          } else {
            return fallback();
          }
          if (!input) return fallback();

          const sharp = (await import("sharp")).default;
          // GIF → читаем все кадры (animated), webp сохранит анимацию + ужмёт.
          const animated = cut !== "white" && /\.gif(\?|$)/i.test(u);
          const base = (animated ? sharp(input, { animated: true }) : sharp(input).rotate()).resize(
            { width: w, withoutEnlargement: true },
          );
          let out: Buffer;
          if (cut === "black") {
            // PNG/WebP с альфой не трогаем: у них фон уже прозрачный, а
            // заливка съедала бы чёрные детали рисунка (жалоба 21.08 —
            // «иконки на карте будто съедают весь чёрный слой»).
            const meta = await sharp(input).metadata();
            if (meta.hasAlpha) {
              out = await base.webp({ quality: q }).toBuffer();
            } else {
              // Заливка от КРАЁВ: убираем только фон, а чёрные детали внутри
              // рисунка (контуры, тени) остаются нетронутыми.
              const { data, info } = await base
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });
              const { width: iw, height: ih } = info;
              const TH = 42; // порог «почти чёрного»
              const isDark = (i: number) => data[i] <= TH && data[i + 1] <= TH && data[i + 2] <= TH;
              const seen = new Uint8Array(iw * ih);
              const stack: number[] = [];
              const push = (x: number, y: number) => {
                if (x < 0 || y < 0 || x >= iw || y >= ih) return;
                const px = y * iw + x;
                if (seen[px]) return;
                seen[px] = 1;
                if (!isDark(px * 4)) return;
                data[px * 4 + 3] = 0;
                stack.push(px);
              };
              for (let x = 0; x < iw; x++) {
                push(x, 0);
                push(x, ih - 1);
              }
              for (let y = 0; y < ih; y++) {
                push(0, y);
                push(iw - 1, y);
              }
              while (stack.length > 0) {
                const px = stack.pop()!;
                const x = px % iw;
                const y = (px / iw) | 0;
                push(x + 1, y);
                push(x - 1, y);
                push(x, y + 1);
                push(x, y - 1);
              }
              // Страховка от катастрофы: если рисунок сам почти весь тёмный,
              // заливка может съесть и предмет. Сравниваем оставшееся с тем,
              // сколько в исходнике было НЕтёмных пикселей: мелкий светлый
              // предмет на чёрном фоне — норма, а вот потеря его — нет.
              let opaque = 0;
              let light = 0;
              for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] !== 0) opaque++;
                if (data[i] > TH || data[i + 1] > TH || data[i + 2] > TH) light++;
              }
              if (opaque < light * 0.6) {
                out = await base.webp({ quality: q }).toBuffer();
              } else {
                out = await sharp(data, {
                  raw: { width: iw, height: ih, channels: 4 },
                })
                  .webp({ quality: q, alphaQuality: 100 })
                  .toBuffer();
              }
            }
          } else if (cut === "white") {
            // Near-white → прозрачность (raw-проход по пикселям). Порог 236 ловит
            // белый фон, не съедая светлые детали. Кэшируется, так что не горячо.
            const { data, info } = await base
              .ensureAlpha()
              .raw()
              .toBuffer({ resolveWithObject: true });
            const TH = 236;
            for (let i = 0; i < data.length; i += 4) {
              if (data[i] >= TH && data[i + 1] >= TH && data[i + 2] >= TH) data[i + 3] = 0;
            }
            out = await sharp(data, {
              raw: { width: info.width, height: info.height, channels: 4 },
            })
              .webp({ quality: q, alphaQuality: 100 })
              .toBuffer();
          } else {
            out = await base.webp({ quality: q }).toBuffer();
          }

          // Пишем кэш best-effort (не блокируем ответ).
          void mkdir(CACHE_DIR, { recursive: true })
            .then(() => writeFile(cachePath, out))
            .catch(() => {});

          return webp(out);
        } catch {
          return fallback();
        }
      },
    },
  },
});
