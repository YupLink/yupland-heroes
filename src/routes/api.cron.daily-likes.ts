import { createFileRoute } from "@tanstack/react-router";
import { mcpExec } from "@/server/db/mcpClient";
import { pg } from "@/server/db/pg";
import { nanoid } from "nanoid";
import { runTownDailyTick } from "@/server/api/beta-raid/town-cron";

// Ежедневное начисление лайков всем юзерам (кто ниже cap'a). Крон бьёт сюда раз
// в сутки (00:00 UTC). Защита через CRON_SECRET.
//
// Логика — в PG function yuplink.grant_daily_likes_for_all:
//   UPDATE user_like_balance SET available = LEAST(maxPool, available+grant)
//   WHERE last_daily_grant_at < today AND available < maxPool
// СТРОГО +grant за прогон (обычно +1/день). Раньше был множитель ×дней
// (available+grant·days) — но т.к. полных юзеров фильтр исключает, их
// last_daily_grant_at протухал → спустив баланс в 0, юзер получал долив
// до cap за один прогон (абуз). Множитель убран (миграция
// scripts/migrate-fix-daily-likes-grant.ts), теперь как в TS ensureDailyGrant.
//
// ВАЖНО: зовём функцию НАПРЯМУЮ через mcpExec, а НЕ через sb.rpc — sb.rpc
// (supabase-js + postgrest-shim) мог уходить не в ту схему (rpc дефолтил в
// public, а функция в yuplink) → грант молча не происходил, хотя крон срабатывал.

export const Route = createFileRoute("/api/cron/daily-likes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (secret) {
          const auth = request.headers.get("authorization");
          if (auth !== `Bearer ${secret}`) {
            return new Response("unauthorized", { status: 401 });
          }
        }
        try {
          const rows = (await mcpExec(
            "SELECT * FROM yuplink.grant_daily_likes_for_all();",
            { wrapJson: true }
          )) as Array<{ updated_count: number; granted_total: number }>;
          const row = rows?.[0];

          // ── Авто-ПЕРЕЗАПУСК recurring-дропов (>30д) ──
          // recurring=true: дроп НЕ завершается, а клонируется в новый цикл —
          // новая кампания (новый id, окно 30д заново, status='active'), старая →
          // ended. Новый campaign_id освобождает UNIQUE(campaign,contract,token) в
          // redemptions → юзеры клеймят награду по своим NFT ЗАНОВО раз в цикл.
          // Клон копирует ВСЕ поля старой кампании (включая combo requirements —
          // это колонка), кроме id/created_at/status. Claim-таблицы (nft_redemptions/
          // redemptions) остаются на старом id → у нового цикла чистый набор.
          const recurringExpired = (await mcpExec(
            `SELECT * FROM yuplink.campaigns
               WHERE status='active' AND recurring=true
                 AND (chip_collection_id IS NULL OR chip_collection_id='')
                 AND created_at < now() - interval '30 days';`,
            { wrapJson: true }
          )) as Array<Record<string, unknown>>;
          const nowIso = new Date().toISOString();
          let dropsRenewed = 0;
          for (const old of recurringExpired) {
            const oldId = String(old.id).replace(/'/g, "''");
            const clone = {
              ...old,
              id: nanoid(),
              created_at: nowIso,
              status: "active",
              recurring: true,
            } as Record<string, unknown>;
            try {
              await pg.campaigns.insert(clone as never);
              await mcpExec(
                `UPDATE yuplink.campaigns SET status='ended' WHERE id='${oldId}';`
              );
              dropsRenewed++;
            } catch (e) {
              console.warn(
                "[cron-daily-likes] recurring clone failed:",
                oldId,
                e
              );
            }
          }

          // Авто-экспирация НЕ-recurring дропов: 30 дней с created_at → active
          // становится ended (остаётся в БД). recurring исключены (клонированы
          // выше). Chip-кампании (chip_collection_id) не трогаем — свой цикл.
          const expWhere =
            `status='active' AND recurring=false AND (chip_collection_id IS NULL OR chip_collection_id='')` +
            ` AND created_at < now() - interval '30 days'`;
          const expCnt = (await mcpExec(
            `SELECT count(*)::int n FROM yuplink.campaigns WHERE ${expWhere};`,
            { wrapJson: true }
          )) as Array<{ n: number }>;
          const dropsExpired = expCnt?.[0]?.n ?? 0;
          if (dropsExpired > 0) {
            await mcpExec(
              `UPDATE yuplink.campaigns SET status='ended' WHERE ${expWhere};`
            );
          }

          // Города: жители потребили, город произвёл (см. town-cron.ts). Ошибку
          // тик не роняет — сюда попадёт нулём, а отдельный /api/cron/towns
          // всегда можно дёрнуть руками.
          const towns = await runTownDailyTick().catch((e) => {
            console.warn("[cron-daily-likes] town tick failed:", e);
            return { towns: 0, goods: 0 };
          });

          const out = {
            ok: true,
            updated: row?.updated_count ?? 0,
            granted: row?.granted_total ?? 0,
            dropsExpired,
            dropsRenewed,
            townsTicked: towns.towns,
            townGoodsMoved: towns.goods,
            at: new Date().toISOString(),
          };
          console.log("[cron-daily-likes] done:", JSON.stringify(out));
          return new Response(JSON.stringify(out), {
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[cron-daily-likes] failed:", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
