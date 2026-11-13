import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { requireAdmin } from "../auth";
import { fireBroadcast, shouldBroadcastNewDrop } from "./admin-helpers";
import { goldForEarnedTickets } from "@/lib/ticketGold";

const SENDLER_TICKET_CONTRACT = "yuplandshop.mintbase1.near";

const ticketRequirementSchema = z.object({
  title: z.string().min(1),
  count: z.number().int().positive(),
});

export const listTicketEvents = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    const rows = await pg.ticketEvents.findMany(
      { active: true },
      { orderBy: { column: "created_at", ascending: false } }
    );
    type Stat = { c: number; sum: number };
    const map = new Map<string, Stat>();
    const cooldownMap = new Map<string, number>();
    const [statAgg, cdAgg] = await Promise.all([
      mcpExec(
        `SELECT event_id, count(*)::int AS c, COALESCE(sum(tickets_awarded),0)::float8 AS s
           FROM yuplink.ticket_claims GROUP BY event_id;`,
        { wrapJson: true }
      ) as Promise<Array<{ event_id: string; c: number; s: number }>>,
      mcpExec(
        `SELECT t.event_id, count(*)::int AS in_cd FROM (
           SELECT tc.event_id, tok, max(tc.claimed_at) AS last_at
             FROM yuplink.ticket_claims tc
             CROSS JOIN LATERAL jsonb_array_elements_text(tc.token_ids::jsonb) AS tok
            WHERE tc.event_id IN (SELECT id FROM yuplink.ticket_events WHERE active = true)
            GROUP BY tc.event_id, tok
         ) t
         JOIN yuplink.ticket_events e ON e.id = t.event_id
         WHERE t.last_at + make_interval(secs => e.hold_duration_sec) > now()
         GROUP BY t.event_id;`,
        { wrapJson: true }
      ) as Promise<Array<{ event_id: string; in_cd: number }>>,
    ]);
    for (const r of statAgg) {
      map.set(r.event_id, { c: Number(r.c), sum: Number(r.s) });
    }
    for (const r of cdAgg) {
      cooldownMap.set(r.event_id, Number(r.in_cd));
    }

    return rows.map((r) => {
      const stats = map.get(r.id);
      const reqs = JSON.parse(r.requirements) as Array<{
        title: string;
        count: number;
      }>;
      const tokensInCooldown = cooldownMap.get(r.id) ?? 0;
      return {
        id: r.id,
        contractId: r.contract_id,
        requirements: reqs,
        rewardTickets: r.reward_tickets,
        holdDurationSec: r.hold_duration_sec,
        active: r.active,
        createdAt: r.created_at,
        claimsCount: stats?.c ?? 0,
        ticketsTotalAwarded: stats?.sum ?? 0,
        tokensInCooldown,
      };
    });
  }
);

export const createTicketEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        requirements: z.array(ticketRequirementSchema).min(1),
        rewardTickets: z.number().positive(),
        holdDurationSec: z.number().int().positive().optional(),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const id = `te_${nanoid(8)}`;
    await pg.ticketEvents.insert({
      id,
      contract_id: SENDLER_TICKET_CONTRACT,
      requirements: JSON.stringify(data.requirements),
      reward_tickets: data.rewardTickets,
      hold_duration_sec: data.holdDurationSec ?? 86400,
      active: true,
    });

    const reqLines = data.requirements
      .slice(0, 8)
      .map((r) => `• ${r.title} × ${r.count}`)
      .join("\n");
    const more =
      data.requirements.length > 8
        ? `\n…и ещё ${data.requirements.length - 8}`
        : "";
    if (shouldBroadcastNewDrop()) {
      // Награда события идёт золотом, 100 за билет настройки (§8.61).
      fireBroadcast(
        `🎫 <b>Новое событие для холдеров NFT!</b>\n\n` +
          `Собери:\n${reqLines}${more}\n\n` +
          `За набор: +${goldForEarnedTickets(data.rewardTickets)} золота в сутки\n\n` +
          `Подробнее на <a href="https://service.yupland.io/my-nfts">сайте</a>.`
      );
    }
    return { id };
  });

export const deleteTicketEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    await pg.ticketEvents.update({ id: data.id }, { active: false });
    return { ok: true };
  });
