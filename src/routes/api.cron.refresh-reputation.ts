import { createFileRoute } from "@tanstack/react-router";
import { pg } from "@/server/db/pg";
import { refreshReputation } from "@/server/reputation";
import { checkMarketplaceListings } from "@/server/marketplace";

// Vercel cron вызывает этот endpoint каждые 5 минут (см. vercel.json).
// Защита: Vercel передаёт заголовок `Authorization: Bearer $CRON_SECRET`
// если CRON_SECRET выставлен. Если переменная не задана — endpoint открыт
// (для preview/dev). На prod лучше задать CRON_SECRET.
//
// Помимо репутации, по этому же триггеру дёргаем checkMarketplaceListings,
// если settings.marketplace_alerts_enabled=true. Hobby-plan Vercel пускает
// крон только раз в день — этого мало для real-time, но 1 раз/сутки лучше
// чем ничего. Админ может ускорить через кнопку «Проверить сейчас» в /lookup.

export const Route = createFileRoute("/api/cron/refresh-reputation")({
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
        const result: Record<string, unknown> = {};
        try {
          result.reputation = await refreshReputation();
        } catch (err) {
          result.reputationError =
            err instanceof Error ? err.message : String(err);
        }
        // Маркетплейс-алерты — только если включены админом.
        try {
          const en = await pg.settings.findOne({
            key: "marketplace_alerts_enabled",
          });
          if (en?.value === "true") {
            result.marketplace = await checkMarketplaceListings();
          } else {
            result.marketplace = { skipped: "disabled" };
          }
        } catch (err) {
          result.marketplaceError =
            err instanceof Error ? err.message : String(err);
        }
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
