// /vestnik?key=… — единственная ссылка «Вестника героев» для владельца
// (29.10.2026: «одна ссылка и одна страница, а там уже кнопки управления»).
//   GET  — страница: сегодня/неделя, газета картинкой, текст, кнопки;
//   POST — сводка последних 7 дней в канал (с выбранным вариантом картинки) (то же, что кнопка во вкладке админа;
//          та же сводка за тот же день второй раз не уходит).
// Ключ тот же, что у /api/news (yuplink.settings news_api_key).
import { createFileRoute } from "@tanstack/react-router";
import { keyFromRequest, readNewsKey, sameKey } from "@/server/api/news/news-key";
import { parseVariant, recentWeek } from "@/lib/news/vestnikWindow";

const NO_STORE = { "cache-control": "no-store, max-age=0", "x-robots-tag": "noindex" };

async function allowed(request: Request): Promise<boolean> {
  const real = await readNewsKey().catch(() => null);
  return sameKey(keyFromRequest(request), real);
}

export const Route = createFileRoute("/vestnik")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await allowed(request))) {
          return new Response("unauthorized", { status: 401, headers: NO_STORE });
        }
        const { vestnikPageHtml } = await import("@/server/news/vestnik-page");
        const { cspHeaders, newNonce } = await import("@/lib/csp/cspPolicy");
        const nonce = newNonce();
        return new Response(vestnikPageHtml(nonce), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            ...NO_STORE,
            ...cspHeaders(nonce),
          },
        });
      },
      POST: async ({ request }) => {
        if (!(await allowed(request))) {
          return new Response("unauthorized", { status: 401, headers: NO_STORE });
        }
        const { publishMarked } = await import("@/server/news/vestnik-schedule");
        // v — вариант картинки, который владелец выбрал кнопкой «Сгенерировать заново».
        const v = parseVariant(new URL(request.url).searchParams.get("v"));
        const res = await publishMarked(recentWeek(Date.now()), "ru", v).catch(() => ({
          ok: false as const,
          reason: "send_failed" as const,
        }));
        return new Response(JSON.stringify(res.ok ? { ok: true } : res), {
          headers: { "content-type": "application/json; charset=utf-8", ...NO_STORE },
        });
      },
    },
  },
});
