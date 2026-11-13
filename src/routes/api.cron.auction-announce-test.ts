import { createFileRoute } from "@tanstack/react-router";
import { cronDenied } from "@/server/cronAuth";

// Тестовый анонс аукциона админа в боте — ТОЛЬКО владельцу (announce.ts,
// TEAM_OWNER_TG): посмотреть вид сообщения до рассылки всем.
// ?id=<лот> — конкретный лот, без него — последний живой. Защита — CRON_SECRET.
export const Route = createFileRoute("/api/cron/auction-announce-test")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await cronDenied(request);
        if (denied) return denied;
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
