// YupLink PWA service worker.
//
// Зачем вообще SW: чтобы приложение было УСТАНАВЛИВАЕМЫМ (PWA). После установки
// на «Домой» браузер выдаёт persistent-storage → IndexedDB с ключом кошелька
// перестаёт вытесняться. Это и есть цель — «аппаратный кош».
//
// Стратегия БЕЗ устаревшего кода (критично для кошелька):
//   • навигации / HTML — ВСЕГДА из сети (свежий код), офлайн → фолбэк из кэша;
//   • статик с хэшем в имени (js/css/шрифты/иконки) — кэш (он иммутабелен,
//     каждый деплой = новые имена), быстрый старт + офлайн.
// IndexedDB сюда НЕ относится — Cache API и SW её не трогают.
// versionCheck.tsx при форс-обновлении анрегает SW + чистит кэш — это ок,
// SW переустановится, IndexedDB (ключ) переживает.

const CACHE = "yl-pwa-v4";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Чистим ВСЕ кэши при обновлении SW — гарантирует свежий код
      for (const k of await caches.keys()) {
        await caches.delete(k);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // НЕ кэшируем dev/vite-модули и любые URL с query — иначе ломается HMR и
  // гидрация в dev (vite отдаёт модули с ?v=/?import, из /@, /src, node_modules).
  // В проде ассеты хэшированы и без query → кэшируются нормально.
  if (
    url.search ||
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.includes("/node_modules/")
  ) {
    return;
  }

  // Навигации (HTML) — ВСЕГДА из сети (свежие ссылки на JS-чанки).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => new Response("Offline", { status: 503 }))
    );
    return;
  }

  // JS — network-first (старые чанки после деплоя ломают загрузку).
  if (/\.js$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const c = await caches.open(CACHE);
            c.put(req, res.clone());
          }
          return res;
        } catch {
          return (await caches.match(req)) || new Response("", { status: 504 });
        }
      })()
    );
    return;
  }

  // Остальная статика — cache-first (css/шрифты/иконки/картинки).
  if (/\.(?:css|woff2?|png|svg|ico|webmanifest|jpg|jpeg)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res && res.ok) {
          const c = await caches.open(CACHE);
          c.put(req, res.clone());
        }
        return res;
      })()
    );
  }
});
