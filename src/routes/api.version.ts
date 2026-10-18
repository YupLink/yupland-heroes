// GET /api/version — отдаёт текущий BUILD_ID сервера.
// Клиент дёргает на focus/visibilitychange/interval и сравнивает со своим.
// При расхождении показывает баннер «Обновите страницу».

import { createFileRoute } from "@tanstack/react-router";
import { serverBuildId } from "@/lib/buildId";

export const Route = createFileRoute("/api/version")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(JSON.stringify({ build: serverBuildId() }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store, max-age=0",
          },
        });
      },
    },
  },
});
