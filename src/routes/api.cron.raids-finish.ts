// YUPLINK · Разовое закрытие старых рейдов и переход на гекс-карту.
// Без ?apply=1 показывает план: какие локации закроются и сколько наград
// осталось на руках. С ?apply=1 выполняет.
import { createFileRoute } from "@tanstack/react-router";
import { planRaidFinish, runRaidFinish } from "@/server/api/raid-finish";

export const Route = createFileRoute("/api/cron/raids-finish")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (secret) {
          const auth = request.headers.get("authorization");
          if (auth !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
        }
        const apply = new URL(request.url).searchParams.get("apply") === "1";
        try {
          const body = apply
            ? { ok: true, applied: true, ...(await runRaidFinish()) }
            : { ok: true, applied: false, plan: await planRaidFinish() };
          return new Response(JSON.stringify(body), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
