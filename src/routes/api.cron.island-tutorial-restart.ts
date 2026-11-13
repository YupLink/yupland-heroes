import { createFileRoute } from "@tanstack/react-router";
import { cronDenied } from "@/server/cronAuth";

// «Обучение с нуля» за тестера (12.11.2026, по просьбе дизайнера через владельца):
// тот же код, что кнопка-пальма (island-tutorial-reset) — снимок, отметки
// обучения, новый остров; герой, рюкзак, балансы и ачивки остаются. Только
// аккаунтам с правом island_tester — чужой остров так не сбросить. Защита — CRON_SECRET.
export const Route = createFileRoute("/api/cron/island-tutorial-restart")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await cronDenied(request);
        if (denied) return denied;
        const account = new URL(request.url).searchParams.get("account") ?? "";
        const { accountHasRight } = await import("@/server/admin-rights");
        if (!/^acc_[\w-]+$/.test(account) || !(await accountHasRight(account, "island_tester")))
          return Response.json({ ok: false, error: "not_island_tester" }, { status: 403 });
        const { mcpExec } = await import("@/server/db/mcpClient");
        const { sqlStr } = await import("@/server/api/raid-shared");
        const rows = (await mcpExec(
          `SELECT wallet FROM yuplink.users WHERE account_id = ${sqlStr(account)} ORDER BY wallet LIMIT 1;`,
          { wrapJson: true },
        )) as Array<{ wallet: string }>;
        const wallet = rows?.[0]?.wallet;
        if (!wallet) return Response.json({ ok: false, error: "no_wallet" }, { status: 404 });
        const { restartIslandTutorial } = await import("@/server/api/beta-raid/island/island-tutorial-reset");
        return Response.json({ ok: true, wallet, result: await restartIslandTutorial(wallet, account) });
      },
    },
  },
});
