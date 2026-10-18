// Что изменилось в карте после версии клиента: журнал (map-journal) или
// «бери снимок». Маленький JSON, обычный маршрут: клиент зовёт его при входе
// (с версией из своего кэша), при разрыве нумерации дельт и раз в минуту.
import { createFileRoute } from "@tanstack/react-router";
import { sanitizeDeltaForPlayer } from "@/lib/raid/mapDelta";

export const Route = createFileRoute("/api/beta-raid/map-delta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { mapRequester, deltaFor } = await import("@/server/api/beta-raid/map-serve");
        const { traced } = await import("@/server/perf/trace");
        let who: Awaited<ReturnType<typeof mapRequester>>;
        try {
          who = await mapRequester();
        } catch (e) {
          return new Response((e as Error).message, { status: 401 });
        }
        if (!who.map) return new Response("no map", { status: 404 });
        const from = Number(new URL(request.url).searchParams.get("rev") ?? 0) || 0;
        const raw = await traced("карта: дельта", () => deltaFor(who.map!, from));
        const out = who.admin ? raw : sanitizeDeltaForPlayer(raw);
        return new Response(JSON.stringify({ mapId: who.map.id, ...out }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "private, no-cache",
          },
        });
      },
    },
  },
});
