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
import { join, posix } from "node:path";
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

const FULL_WIDTHS = new Set([1024, 1536]);
// Ширины и качество — из короткого списка (аудит 11.11.2026): раньше каждая
// ширина 32…640 и каждое качество давали свой файл в кэше — диск можно было
// забить подбором параметров. Просили между — берём ближайшую большую.
const WIDTHS = [32, 48, 64, 96, 128, 160, 192, 256, 320, 384, 512, 640];
const QUALITIES = [40, 50, 60, 72, 82, 85, 90];
/** Больше — не картинка для превью: не качаем. */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const snapUp = (list: number[], v: number) => list.find((x) => x >= v) ?? list[list.length - 1];
const snapNear = (list: number[], v: number) =>
  list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

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
        // Обычно до 640; газета читается с увеличением — ей полный размер (только эти
        // ширины, чтобы кэш не плодился на каждую).
        const wAsked = parseInt(url.searchParams.get("w") ?? "256", 10) || 256;
        const w = FULL_WIDTHS.has(wAsked) ? wAsked : snapUp(WIDTHS, wAsked);
        const q = snapNear(QUALITIES, parseInt(url.searchParams.get("q") ?? "72", 10) || 72);
        // cut=white — вырезать near-white фон (боссы на белом).
        // cut=black — вырезать чёрный фон у JPEG-ассетов: часть артефактов
        // залита в JPEG, где прозрачности нет, и на карте давала чёрный круг.
        const cutParam = url.searchParams.get("cut");
        const cut = cutParam === "white" ? "white" : cutParam === "black" ? "black" : "";
        // Фолбэк — отдать оригинал (в худшем случае как было): свой /uploads или
        // http(s)-адрес (картинки NFT с чужих хостов идут сюда же). Иные схемы — нет.
        const fallback = () =>
          u.startsWith("/uploads/") || /^https?:\/\//i.test(u)
            ? new Response(null, { status: 302, headers: { location: u } })
            : new Response("bad url", { status: 400 });
        const allowed = (host: string) =>
          ALLOWED_HOST_SUFFIX.some((h) => host === h || host.endsWith("." + h));

        try {
          // Ключ кэша.
          // Один файл — один ключ (аудит 11.11.2026): путь — тот же, что читаем с
          // диска; у внешнего адреса — без «?…» и «#…» (шлюзам IPFS они не нужны).
          let norm = u;
          if (u.startsWith("/uploads/")) {
            norm = `/uploads/${posix.normalize(u.slice("/uploads/".length).replace(/\.\.+/g, ""))}`;
          } else {
            try {
              const pu = new URL(u);
              norm = `${pu.protocol}//${pu.host.toLowerCase()}${pu.pathname}`;
            } catch {
              /* не адрес — ниже уйдёт в фолбэк */
            }
          }
          const key = createHash("sha1").update(`${norm}|${w}|${q}|${cut}`).digest("hex") + ".webp";
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
            if (!allowed(host)) return fallback();
            // Наш домен + /uploads → читаем файл напрямую (без сетевого хопа).
            const pu = new URL(u);
            if (host === "service.yupland.io" && pu.pathname.startsWith("/uploads/")) {
              const rel = pu.pathname.slice("/uploads/".length).replace(/\.\.+/g, "");
              input = await readFile(join(UPLOADS_DIR, rel));
            } else {
              // Переходы — только на разрешённые хосты (шлюзы IPFS уводят на свой
              // поддомен), иначе разрешённый хост увёл бы запрос на внутренний адрес.
              let next = u;
              let r: Response | null = null;
              for (let hop = 0; hop < 4; hop++) {
                r = await fetch(next, { signal: AbortSignal.timeout(8000), redirect: "manual" });
                if (r.status < 300 || r.status >= 400) break;
                const loc = r.headers.get("location");
                const to = loc ? new URL(loc, next) : null;
                if (!to || to.protocol !== "https:" || !allowed(to.hostname.toLowerCase())) {
                  return fallback();
                }
                next = to.href;
                r = null;
              }
              if (!r || !r.ok) return fallback();
              if (Number(r.headers.get("content-length")) > MAX_SOURCE_BYTES) return fallback();
              input = Buffer.from(await r.arrayBuffer());
              if (input.length > MAX_SOURCE_BYTES) return fallback();
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
