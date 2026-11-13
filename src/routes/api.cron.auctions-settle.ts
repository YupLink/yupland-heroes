import { createFileRoute } from "@tanstack/react-router";
import { settleDueAuctions } from "@/server/api/game-auction";
import { cronDenied } from "@/server/cronAuth";

// Бэкстоп закрытия аукционов: решает победителя и выдаёт приз у тех, что
// истекли, пока никто не смотрел на список (при активном просмотре закрытие
// идёт лениво на каждом listAuctions/placeBid). Защита — CRON_SECRET.
// Крон бьёт сюда каждые 2 минуты (см. серверный crontab).
export const Route = createFileRoute("/api/cron/auctions-settle")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await cronDenied(request);
        if (denied) return denied;
        await settleDueAuctions(true);
        return Response.json({ ok: true, at: new Date().toISOString() });
      },
    },
  },
});
