import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { requireAdmin } from "../auth";
import { fireBroadcast, shouldBroadcastNewDrop } from "./admin-helpers";

// ──────── Универсальный лайк-майнинг ────────

export const adminGetUniversalLikeMining = createServerFn({
  method: "GET",
}).handler(async () => {
  requireAdmin();
  const { getUniversalSettings } = await import(
    "../universalLikeMining"
  );
  return await getUniversalSettings();
});

export const adminSetUniversalLikeMining = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ active: z.boolean() }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const { setUniversalActive } = await import("../universalLikeMining");
    await setUniversalActive(data.active);
    return { ok: true, active: data.active };
  });

// ──────── Like events ────────

const likeRequirementSchema = z.object({
  title: z.string().min(1),
  count: z.number().int().positive(),
});

export const listLikeEvents = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    const rows = await pg.likeEvents.findMany(
      { active: true },
      { orderBy: { column: "created_at", ascending: false } }
    );
    type Stat = { c: number; sum: number };
    const map = new Map<string, Stat>();
    const cooldownMap = new Map<string, number>();
    const [statAgg, cdAgg] = await Promise.all([
      mcpExec(
        `SELECT event_id, count(*)::int AS c, COALESCE(sum(likes_awarded),0)::float8 AS s
           FROM yuplink.like_claims GROUP BY event_id;`,
        { wrapJson: true }
      ) as Promise<Array<{ event_id: string; c: number; s: number }>>,
      mcpExec(
        `SELECT t.event_id, count(*)::int AS in_cd FROM (
           SELECT lc.event_id, tok, max(lc.claimed_at) AS last_at
             FROM yuplink.like_claims lc
             CROSS JOIN LATERAL jsonb_array_elements_text(lc.token_ids::jsonb) AS tok
            WHERE lc.event_id IN (SELECT id FROM yuplink.like_events WHERE active = true)
            GROUP BY lc.event_id, tok
         ) t
         JOIN yuplink.like_events e ON e.id = t.event_id
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
        rewardLikes: r.reward_likes,
        holdDurationSec: r.hold_duration_sec,
        active: r.active,
        createdAt: r.created_at,
        claimsCount: stats?.c ?? 0,
        likesTotalAwarded: stats?.sum ?? 0,
        tokensInCooldown,
      };
    });
  }
);

export const createLikeEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        requirements: z.array(likeRequirementSchema).min(1),
        rewardLikes: z.number().positive(),
        holdDurationSec: z.number().int().positive().optional(),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const id = `le_${nanoid(8)}`;
    await pg.likeEvents.insert({
      id,
      contract_id: "yuplandshop.mintbase1.near",
      requirements: JSON.stringify(data.requirements),
      reward_likes: data.rewardLikes,
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
      fireBroadcast(
        `❤️ <b>Новое лайк-событие!</b>\n\n` +
          `Собери:\n${reqLines}${more}\n\n` +
          `За набор: +${data.rewardLikes} лайк(ов)\n\n` +
          `Подробнее на <a href="https://service.yupland.io/my-nfts">сайте</a>.`
      );
    }
    return { id };
  });

export const deleteLikeEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    await pg.likeEvents.update({ id: data.id }, { active: false });
    return { ok: true };
  });

export const getLikeEventClaimers = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ eventId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const allClaims = await pg.likeClaims.findMany({ event_id: data.eventId });
    type Stat = { count: number; likesTotal: number };
    const map = new Map<string, Stat>();
    for (const c of allClaims) {
      const cur = map.get(c.wallet) ?? { count: 0, likesTotal: 0 };
      cur.count++;
      cur.likesTotal += c.likes_awarded ?? 0;
      map.set(c.wallet, cur);
    }
    return Array.from(map.entries())
      .map(([wallet, s]) => ({
        wallet,
        claimsCount: s.count,
        likesTotal: s.likesTotal,
      }))
      .sort((a, b) => b.likesTotal - a.likesTotal);
  });
