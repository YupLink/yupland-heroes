import { createFileRoute } from "@tanstack/react-router";
import { cronDenied } from "@/server/cronAuth";

// Демо-острова заранее (island/demo-island.ts): каждому аккаунту с правом
// admin_rights «demo_island» — свой, если ещё нет; повтор ничего не задваивает.
// Иначе остров строится при первом нажатии в профиле (несколько секунд).
// Героя никуда не переносит. Защита — CRON_SECRET.
export const Route = createFileRoute("/api/cron/demo-island-setup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await cronDenied(request);
        if (denied) return denied;
        const { mcpExec } = await import("@/server/db/mcpClient");
        const { ADMIN_RIGHTS_KEY, parseAdminRights } = await import("@/server/admin-rights");
        const { ensureDemoIsland } = await import("@/server/api/beta-raid/island/demo-island");
        const rows = (await mcpExec(
          `SELECT value FROM yuplink.settings WHERE key = '${ADMIN_RIGHTS_KEY}' LIMIT 1;`,
          { wrapJson: true },
        )) as Array<{ value: unknown }>;
        const out: Array<{ account: string; mapId: string }> = [];
        for (const [account, rights] of parseAdminRights(rows?.[0]?.value ?? null)) {
          if (!rights.has("demo_island")) continue;
          const demo = await ensureDemoIsland(account, "demo-island-setup");
          out.push({ account, mapId: demo.mapId });
        }
        return Response.json({ ok: true, islands: out });
      },
    },
  },
});
