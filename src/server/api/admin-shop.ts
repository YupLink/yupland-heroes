import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { requireAdmin } from "../auth";
import { assertTokenExists } from "./admin-campaigns-schemas";

export const listTicketShopOffers = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    const rows =
      ((
        await pg.ticketShopOffers
          .raw()
          .select("*")
          .order("sort_order", { ascending: true })
          .order("price_energy", { ascending: true })
      ).data as Array<{
        id: string;
        tickets: number;
        price_energy: number;
        payment_token: string | null;
        price_token: number | null;
        price_stars: number | null;
        price_usd?: number | string | null;
        active: boolean;
        sort_order: number;
        created_at: string;
      }>) ?? [];
    type Stat = { c: number; ticketsSum: number; energySum: number };
    const map = new Map<string, Stat>();
    const purchaseAgg = (await mcpExec(
      `SELECT offer_id, count(*)::int AS c,
              COALESCE(sum(tickets_added),0)::float8 AS ts,
              COALESCE(sum(energy_spent),0)::float8 AS es
         FROM yuplink.ticket_purchases
        WHERE offer_id IS NOT NULL
        GROUP BY offer_id;`,
      { wrapJson: true }
    )) as Array<{ offer_id: string; c: number; ts: number; es: number }>;
    for (const p of purchaseAgg) {
      map.set(p.offer_id, {
        c: Number(p.c),
        ticketsSum: Number(p.ts),
        energySum: Number(p.es),
      });
    }
    return rows.map((r) => ({
      id: r.id,
      tickets: r.tickets,
      priceEnergy: r.price_energy,
      paymentToken: r.payment_token,
      priceToken: r.price_token,
      priceStars: r.price_stars,
      priceUsd: r.price_usd != null ? Number(r.price_usd) : null,
      active: r.active,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
      purchases: map.get(r.id)?.c ?? 0,
      ticketsSold: map.get(r.id)?.ticketsSum ?? 0,
      energyEarned: map.get(r.id)?.energySum ?? 0,
    }));
  }
);

const ticketOfferInput = z
  .object({
    tickets: z.number().int().positive(),
    priceEnergy: z.number().int().nonnegative().optional().default(0),
    paymentToken: z.string().optional().nullable(),
    priceToken: z.number().int().positive().optional().nullable(),
    priceStars: z.number().int().positive().optional().nullable(),
    /** Тариф в $: USDT / DARAI / Stars считаются от него по курсу (lib/usdTariff.ts). */
    priceUsd: z.number().positive().max(10000).optional().nullable(),
    sortOrder: z.number().int().optional(),
  })
  .refine(
    (v) =>
      (v.priceUsd != null && v.priceUsd > 0) ||
      (v.paymentToken && v.priceToken && v.priceToken > 0) ||
      (!v.paymentToken && v.priceEnergy && v.priceEnergy > 0),
    {
      message:
        "Задай цену в $, либо priceEnergy>0 (энергия), либо paymentToken+priceToken (токен)",
    }
  );

/** Поля строки по виду цены: тариф в $ — без энергии, токена и звёзд. */
function priceColumns(d: {
  priceEnergy?: number;
  paymentToken?: string | null;
  priceToken?: number | null;
  priceStars?: number | null;
  priceUsd?: number | null;
}) {
  if (d.priceUsd != null && d.priceUsd > 0) {
    return { price_energy: 0, payment_token: null, price_token: null, price_stars: null, price_usd: d.priceUsd };
  }
  return {
    price_energy: d.paymentToken ? 0 : (d.priceEnergy ?? 0),
    payment_token: d.paymentToken ?? null,
    price_token: d.paymentToken ? (d.priceToken ?? null) : null,
    price_stars: d.priceStars ?? null,
    price_usd: null,
  };
}

export const createTicketShopOffer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ticketOfferInput.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    if (data.paymentToken) await assertTokenExists(data.paymentToken);
    const id = `ts_${nanoid(8)}`;
    await pg.ticketShopOffers.insert({
      id,
      tickets: data.tickets,
      ...priceColumns(data),
      sort_order: data.sortOrder ?? 0,
      active: true,
    });
    return { id };
  });

export const updateTicketShopOffer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1),
        tickets: z.number().int().positive(),
        priceEnergy: z.number().int().nonnegative().optional().default(0),
        paymentToken: z.string().optional().nullable(),
        priceToken: z.number().int().positive().optional().nullable(),
        priceStars: z.number().int().positive().optional().nullable(),
        priceUsd: z.number().positive().max(10000).optional().nullable(),
        sortOrder: z.number().int().optional(),
        active: z.boolean().optional(),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    if (data.paymentToken) await assertTokenExists(data.paymentToken);
    await pg.ticketShopOffers.update(
      { id: data.id },
      {
        tickets: data.tickets,
        ...priceColumns(data),
        ...(typeof data.sortOrder === "number" ? { sort_order: data.sortOrder } : {}),
        ...(typeof data.active === "boolean" ? { active: data.active } : {}),
      }
    );
    return { ok: true };
  });

export const deleteTicketShopOffer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    await pg.ticketShopOffers.delete({ id: data.id });
    return { ok: true };
  });
