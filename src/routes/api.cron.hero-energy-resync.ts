import { createFileRoute } from "@tanstack/react-router";
import { cronDenied } from "@/server/cronAuth";

// Пересчитать бонус энергии от Интеллекта (user_energy.hero_max_bonus /
// hero_regen_pct) у ВСЕХ выбранных героев разом — после правки артефактов в
// справочнике (25.10.2026: все артефакты +30 %). Обычно бонус обновляется сам,
// когда игрок заходит в игру; здесь — чтобы и у тех, кто не заходит, энергия
// копилась уже по новым числам. Тот же путь, что и при входе (syncHeroEnergy).
// Работает фоном, итог — в логе. Защита — CRON_SECRET.
export const Route = createFileRoute("/api/cron/hero-energy-resync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await cronDenied(request);
        if (denied) return denied;
        const { mcpExec } = await import("@/server/db/mcpClient");
        const { loadHeroView } = await import("@/server/api/beta-raid/hero-power");
        const { syncHeroEnergy } = await import("@/server/api/beta-raid/hero-energy-sync");
        const rows = (await mcpExec(
          `SELECT DISTINCT wallet FROM yuplink.hero_instance
            WHERE selected_at IS NOT NULL AND wallet IS NOT NULL;`,
          { wrapJson: true },
        )) as Array<{ wallet: string }>;
        void (async () => {
          let done = 0;
          for (const { wallet } of rows ?? []) {
            const view = await loadHeroView(wallet).catch(() => null);
            if (!view) continue;
            await syncHeroEnergy(wallet, view.info.field).catch(() => {});
            done++;
          }
          console.log(`[hero-energy-resync] пересчитано ${done} из ${rows?.length ?? 0}`);
        })();
        return Response.json({ ok: true, heroes: rows?.length ?? 0 });
      },
    },
  },
});
