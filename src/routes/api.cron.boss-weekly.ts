import { createFileRoute } from "@tanstack/react-router";
import { pg } from "@/server/db/pg";
import { closeBossWeek } from "@/server/api/boss";
import { cronDenied } from "@/server/cronAuth";

// Еженедельное закрытие босса. Vercel cron бьёт сюда по понедельникам
// (см. vercel.json). Защита через CRON_SECRET. Убил/не убил — проверка внутри
// closeBossWeek: раздаёт забираемые награды (если убит) + рост HP, иначе отхил,
// week_no+1, уведомление админам.
export const Route = createFileRoute("/api/cron/boss-weekly")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await cronDenied(request);
        if (denied) return denied;
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
