import { createFileRoute } from "@tanstack/react-router";
import { DEFAULT_CONTRACT, runFullRescan } from "@/server/likes-rescan";
import { cronDenied } from "@/server/cronAuth";

// Cron: раз в сутки полный пересчёт каталога → upsert pg.nfts (источник
// NFT-владений для приложения и лотореи). Защита: Bearer CRON_SECRET.
//
// ВАЖНО: полный rescan (~170k NFT) занимает ~3 мин — ДОЛЬШЕ таймаута крон-враппера
// (curl -m 120). Раньше curl обрывал запрос на 120с, скан не доходил до upsert →
// pg.nfts переставала обновляться (юзеры/лоторея видели устаревшие NFT). Поэтому
// запускаем В ФОНЕ (fire-and-forget) и сразу отвечаем 202: на self-host
// (node-server — долгоживущий процесс) задача доезжает до конца без обрыва.

export const Route = createFileRoute("/api/cron/rescan-catalog")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await cronDenied(request);
        if (denied) return denied;
        // Не ждём завершения — иначе cron-curl (-m 120) оборвёт длинный скан.
        // runFullRescan дедупит конкурентные запуски через inflight внутри себя.
        void runFullRescan(DEFAULT_CONTRACT)
          .then((out) => console.log("[cron-rescan] done:", JSON.stringify(out)))
          .catch((err) =>
            console.error(
              "[cron-rescan] failed:",
              err instanceof Error ? err.message : String(err)
            )
          );
        return new Response(JSON.stringify({ ok: true, started: true }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
