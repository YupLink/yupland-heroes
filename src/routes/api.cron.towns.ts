// Ежедневный крон городов: consume × residents, produce поверх (см. town-cron).
//
// Дёргается снаружи в 00:00 UTC. Если снаружи ленивы — тот же тик делает
// общий api.cron.daily-likes, поэтому этот роут отдельно настраивать
// не обязательно, но полезно держать: даёт возможность запустить руками.
import { createFileRoute } from "@tanstack/react-router";
import { runTownDailyTick } from "@/server/api/beta-raid/town-cron";
import { cronDenied } from "@/server/cronAuth";

export const Route = createFileRoute("/api/cron/towns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await cronDenied(request);
        if (denied) return denied;
        try {
          const res = await runTownDailyTick();
          const out = { ok: true, ...res, at: new Date().toISOString() };
          console.log("[cron-towns] done:", JSON.stringify(out));
          return new Response(JSON.stringify(out), {
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[cron-towns] failed:", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
