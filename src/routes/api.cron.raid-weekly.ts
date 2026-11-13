// YUPLINK · Cron НЕДЕЛЬНОГО РЕЙДА (Пн 00:00 UTC, рядом с boss-weekly).
// Для каждой active-локации: раздать турнирные награды по суммарному урону,
// отхилить боссов, инкрементнуть цикл (позиции игроков сбросятся лениво).
// Прописать в crontab сервера (service.yupland.io), НЕ в vercel.json.
import { createFileRoute } from "@tanstack/react-router";
import { pg } from "@/server/db/pg";
import { closeRaidCycle } from "@/server/api/raid-rewards";
import type { PgRaidLocation } from "@/server/db/pg";
import { cronDenied } from "@/server/cronAuth";

export const Route = createFileRoute("/api/cron/raid-weekly")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await cronDenied(request);
        if (denied) return denied;
        try {
          // Старые рейды закрыты навсегда — цикл больше не крутим.
          const { legacyRaidsEnabled } = await import("@/server/api/raid-mode");
          if (!(await legacyRaidsEnabled())) {
            return new Response(JSON.stringify({ ok: true, skipped: "legacy raids closed" }), {
              headers: { "content-type": "application/json" },
            });
          }
          const { data } = await pg.raidLocation.raw().select("*").eq("active", true);
          const locs = (data ?? []) as PgRaidLocation[];
          const results: Array<{
            id: string;
            recipients: number;
            cycle: number;
          }> = [];
          for (const l of locs) {
            try {
              const r = await closeRaidCycle(l.id);
              if (r) results.push({ id: l.id, ...r });
            } catch (e) {
              console.warn("[raid-weekly] close failed", l.id, e);
            }
          }
          return new Response(JSON.stringify({ ok: true, closed: results }), {
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
