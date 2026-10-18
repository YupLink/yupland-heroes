import { createFileRoute } from "@tanstack/react-router";

// Тестовый анонс аукциона админа в боте — ТОЛЬКО владельцу (announce.ts,
// ANNOUNCE_TEST_TG): посмотреть вид сообщения до рассылки всем.
// ?id=<лот> — конкретный лот, без него — последний живой. Защита — CRON_SECRET.
export const Route = createFileRoute("/api/cron/auction-announce-test")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (secret) {
          const auth = request.headers.get("authorization");
          if (auth !== `Bearer ${secret}`) {
            return new Response("unauthorized", { status: 401 });
          }
        }
        const { announceTest } = await import("@/server/api/game-auction/announce");
        const id = new URL(request.url).searchParams.get("id");
        const r = await announceTest(id);
        console.log(
          `[auction] анонс-тест ${r.id ?? "—"}: ${r.sent ? "отправлен" : "не отправлен"}`,
        );
        return Response.json(r, { status: r.sent ? 200 : 500 });
      },
    },
  },
});
