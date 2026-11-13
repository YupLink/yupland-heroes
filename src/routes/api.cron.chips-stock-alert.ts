// YUPLINK · Cron (07:00 UTC, crontab на сервере): проверка рубежа казны DARAI.
// Раньше здесь же проверялся склад NFT-фишек для вывода фишки в NFT; вывод
// удалён словом владельца 17.10.2026, проверка склада — вместе с ним. Адрес
// маршрута прежний, чтобы crontab не менять: он остаётся ради рубежа DARAI.

import { createFileRoute } from "@tanstack/react-router";
import { cronDenied } from "@/server/cronAuth";

export const Route = createFileRoute("/api/cron/chips-stock-alert")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await cronDenied(request);
        if (denied) return denied;
        try {
          // Раз в день: если пройден новый миллиард в казне DARAI — заметный
          // алерт владельцу.
          const { checkDaraiMilestone } = await import("@/server/daraiMilestone");
          const daraiMilestone = await checkDaraiMilestone();
          return new Response(JSON.stringify({ ok: true, daraiMilestone }), {
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }),
            { status: 500, headers: { "content-type": "application/json" } }
          );
        }
      },
    },
  },
});
