// YUPLINK · Cron СВЕРКИ ВАЛЮТНОГО ЛЕДЖЕРА (раз в час).
// Леджер наполняется триггерами БД; здесь проверяем, что он сходится с
// источниками. Расхождение — это деньги, поэтому владельцу уходит алерт.
import { createFileRoute } from "@tanstack/react-router";
import { auditCurrencyLedger } from "@/server/api/ledger-audit";
import { sendTgMessageToAdmins } from "@/server/tg";
import { cronDenied } from "@/server/cronAuth";

export const Route = createFileRoute("/api/cron/ledger-audit")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await cronDenied(request);
        if (denied) return denied;
        try {
          const result = await auditCurrencyLedger();
          if (!result.ok) {
            const lines = result.drifts
              .map(
                (d) =>
                  `• ${d.token}: леджер ${d.ledger}, ожидалось ${d.expected} (расхождение ${d.drift})`,
              )
              .join("\n");
            await sendTgMessageToAdmins(
              `⚠️ Валютный леджер разошёлся с источниками:\n${lines}`,
            ).catch(() => {});
          }
          return new Response(JSON.stringify(result), {
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
