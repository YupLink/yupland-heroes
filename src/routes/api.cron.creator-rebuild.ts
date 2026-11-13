import { createFileRoute } from "@tanstack/react-router";
import { cronDenied } from "@/server/cronAuth";

// Пересобрать миры креатора (isle_cw_…) через журнал карты: клиенты перекачают
// снимок. Нужно, когда меняется сам состав снимка (07.11.2026: пустые клетки
// мира креатора стали частью снимка — прежний снимок без них у игроков
// остался бы до первой правки). Клетки не трогает. Защита — CRON_SECRET.
export const Route = createFileRoute("/api/cron/creator-rebuild")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await cronDenied(request);
        if (denied) return denied;
        const { mcpExec } = await import("@/server/db/mcpClient");
        const { noteMapRebuilt } = await import("@/server/api/beta-raid/map-change-hooks");
        const { purgeMapBase } = await import("@/server/api/beta-raid/map-base");
        const { publishRaid } = await import("@/server/raidLive");
        const rows = ((await mcpExec(`SELECT map_id FROM yuplink.raid_creator_work ORDER BY map_id;`, {
          wrapJson: true,
        })) ?? []) as Array<{ map_id: string }>;
        for (const r of rows) {
          purgeMapBase(r.map_id);
          await noteMapRebuilt(r.map_id);
          publishRaid({ mapId: r.map_id, type: "restored" });
        }
        return Response.json({ ok: true, rebuilt: rows.map((r) => r.map_id) });
      },
    },
  },
});
