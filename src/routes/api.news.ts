// GET /api/news — сводка для новостей (владелец, 29.10.2026). Ключ — ?key=…
// или Authorization: Bearer …; ссылку с ключом админ копирует во вкладке
// «$ Экономика → Новости».
//   по умолчанию — готовый текст за 7 дней; days=1 — за сегодня;
//   image=day — газета «Вестник героев» за сегодня (date=YYYY-MM-DD — за тот день),
//   image=week — сводка последних 7 дней (page=2 — вторая страница), v=N — вариант картинки;
//   format=json — то же цифрами для программ; lang=en — по-английски;
//   format=html — страница для людей: газета, сводка, промокод, клад, итоги, лидеры, текст (08.11.2026);
//   в json — `promo` {date, code}: код дня для газеты в игре (один на сутки UTC);
//   `tournaments` {active, soon}: идущие турниры с лидерами и ближайшие
//   запланированные (07.11.2026), в тексте — раздел «Турниры»;
//   `treasure` — {image}: только скрин живого клада, без какой-либо информации о нём;
//   `chat` — [{at, author, text}]: всё, что писали в чат сообщества за период, как есть, без ИИ (08.11.2026);
//   image=treasure&id=… — скрин клада (JPEG).
import { createFileRoute } from "@tanstack/react-router";
import { clampNewsDays } from "@/lib/news/types";
import { newsText } from "@/lib/news/newsText";
import {
  dayWindow,
  parseDay,
  parseVariant,
  recentWeek,
  VESTNIK_EPOCH,
} from "@/lib/news/vestnikWindow";
import { buildNewsDigest } from "@/server/api/news/news-digest";
import { keyFromRequest, readNewsKey, sameKey } from "@/server/api/news/news-key";

const NO_STORE = { "cache-control": "no-store, max-age=0" };

async function treasureImage(url: URL): Promise<Response> {
  const { treasureShot } = await import("@/server/api/treasure/treasure-news");
  const shot = await treasureShot(url.searchParams.get("id") ?? "");
  if (!shot) return new Response("not found", { status: 404, headers: NO_STORE });
  return new Response(new Uint8Array(shot), {
    headers: { "content-type": "image/jpeg", ...NO_STORE },
  });
}

async function image(url: URL, lang: "ru" | "en"): Promise<Response> {
  if (url.searchParams.get("image") === "treasure") return treasureImage(url);
  const { renderIssue } = await import("@/server/news/vestnik-render");
  const week = url.searchParams.get("image") === "week";
  const day = parseDay(url.searchParams.get("date"));
  // Дата — от первого выпуска по сегодня; будущего и прошлого до газеты нет.
  if (day !== null && (day < (parseDay(VESTNIK_EPOCH) as number) || day > Date.now())) {
    return new Response("bad date", { status: 400, headers: NO_STORE });
  }
  const w = week ? recentWeek(Date.now()) : dayWindow(day ?? Date.now());
  // Без промокода: код появляется только в опубликованном выпуске.
  // v — «Сгенерировать заново» на странице: другой вариант картинки.
  const issue = await renderIssue(w, lang, false, parseVariant(url.searchParams.get("v")));
  const n = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
  const page = issue.pages[Math.min(n, issue.pages.length) - 1];
  return new Response(new Uint8Array(page), {
    headers: { "content-type": "image/png", ...NO_STORE },
  });
}

export const Route = createFileRoute("/api/news")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const real = await readNewsKey().catch(() => null);
        if (!sameKey(keyFromRequest(request), real)) {
          return new Response("unauthorized", { status: 401, headers: NO_STORE });
        }
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") === "en" ? "en" : "ru";
        try {
          if (url.searchParams.get("image")) return await image(url, lang);
          const days = clampNewsDays(url.searchParams.get("days") ?? 7);
          const digest = await buildNewsDigest(days, lang);
          const text = newsText(digest, lang);
          const format = url.searchParams.get("format");
          if (format === "json" || format === "html") {
            const { paperPromo } = await import("@/server/news/vestnik-promo");
            const { latestTreasure } = await import("@/server/api/treasure/treasure-news");
            const { chatMessages } = await import("@/server/news/news-chat");
            const [promo, treasure, chat] = await Promise.all([
              paperPromo(),
              latestTreasure().catch(() => null),
              chatMessages(digest.from, digest.to).catch(() => []),
            ]);
            if (format === "html") {
              // Страница для людей: всё по газете на одной странице (news-page.ts).
              const { newsPageHtml } = await import("@/server/api/news/news-page");
              const { cspHeaders, newNonce } = await import("@/lib/csp/cspPolicy");
              const nonce = newNonce();
              const html = newsPageHtml({
                nonce,
                digest,
                text,
                promo,
                treasure,
                key: keyFromRequest(request) ?? "",
                lang,
                paper: url.searchParams.get("paper"),
              });
              return new Response(html, {
                headers: {
                  "content-type": "text/html; charset=utf-8",
                  ...NO_STORE,
                  ...cspHeaders(nonce),
                },
              });
            }
            return new Response(JSON.stringify({ ...digest, text, promo, treasure, chat }), {
              headers: { "content-type": "application/json; charset=utf-8", ...NO_STORE },
            });
          }
          return new Response(text, {
            headers: { "content-type": "text/plain; charset=utf-8", ...NO_STORE },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "content-type": "application/json", ...NO_STORE } },
          );
        }
      },
    },
  },
});
