// GET /api/whoami — кто держит эту сессию. Нужен внешним сервисам под тем
// же доменом (Блок задач на /tasks/): они получают cookie gd_wallet вместе с
// запросом, но проверить подпись и список админов могут только здесь. Ответ —
// только про самого звонящего: чужих данных тут не выдать.
//
// Второй режим — служебный: ?tg_id=<id> с Bearer CRON_SECRET. Так Блок задач
// узнаёт, админ ли человек, вошедший к нему через Telegram Login Widget (в
// браузере Telegram cookie игры может и не быть). Без ключа режим закрыт.
import { createFileRoute } from "@tanstack/react-router";
import { getCurrentWallet, isAdminWallet } from "@/server/auth";
import { pg } from "@/server/db/pg";

const NO_STORE = { headers: { "cache-control": "no-store, max-age=0" } };

async function byTelegram(tgId: number) {
  const rows = await pg.users.findMany({ telegram_id: tgId }).catch(() => []);
  const live = rows.filter((r) => !r.disconnected);
  const pool = live.length ? live : rows;
  const admin = pool.find((r) => isAdminWallet(r.wallet));
  const wallet = admin?.wallet ?? pool[0]?.wallet ?? null;
  return {
    wallet,
    isAdmin: !!admin,
    tgUsername: pool.find((r) => r.telegram_username)?.telegram_username ?? null,
    tgId: rows.length ? tgId : null,
  };
}

export const Route = createFileRoute("/api/whoami")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const tgParam = url.searchParams.get("tg_id");
        if (tgParam) {
          const secret = process.env.CRON_SECRET;
          const auth = request.headers.get("authorization");
          if (!secret || auth !== `Bearer ${secret}`) {
            return new Response("unauthorized", { status: 401 });
          }
          const tgId = Number(tgParam);
          if (!Number.isInteger(tgId) || tgId <= 0) return new Response("bad tg_id", { status: 400 });
          return Response.json(await byTelegram(tgId), NO_STORE);
        }
        const wallet = getCurrentWallet();
        let tgUsername: string | null = null;
        let tgId: number | null = null;
        if (wallet) {
          const u = await pg.users.findOne({ wallet }).catch(() => null);
          tgUsername = u?.telegram_username ?? null;
          tgId = u?.telegram_id ?? null;
        }
        return Response.json({ wallet, isAdmin: isAdminWallet(wallet), tgUsername, tgId }, NO_STORE);
      },
    },
  },
});
