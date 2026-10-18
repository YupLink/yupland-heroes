import { createFileRoute } from "@tanstack/react-router";
import { pg } from "@/server/db/pg";
import { closeBossWeek } from "@/server/api/boss";

// Еженедельное закрытие босса. Vercel cron бьёт сюда по понедельникам
// (см. vercel.json). Защита через CRON_SECRET. Убил/не убил — проверка внутри
// closeBossWeek: раздаёт забираемые награды (если убит) + рост HP, иначе отхил,
// week_no+1, уведомление админам.
export const Route = createFileRoute("/api/cron/boss-weekly")({
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
        const active = await pg.chipBoss.findOne({ active: true });
        if (!active) {
          return Response.json({ ok: true, note: "нет активного босса" });
        }
        const r = await closeBossWeek(active.id);
        return Response.json({ ok: true, ...r, at: new Date().toISOString() });
      },
    },
  },
});
