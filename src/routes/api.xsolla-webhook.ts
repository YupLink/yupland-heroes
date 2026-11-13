// Вебхук Xsolla (оплата картой, §8.127): тело — как пришло (по нему считается подпись).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/xsolla-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const { handleXsollaWebhook } = await import("@/server/api/xsolla/xsollaWebhook");
        try {
          const r = await handleXsollaWebhook(raw, request.headers.get("authorization"));
          if (!r.body) return new Response(null, { status: r.status });
          return new Response(JSON.stringify(r.body), {
            status: r.status,
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          console.error("[xsolla] вебхук:", e instanceof Error ? e.message : e);
          return new Response(null, { status: 500 });
        }
      },
    },
  },
});
