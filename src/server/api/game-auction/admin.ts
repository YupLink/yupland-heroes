// Админка аукционов: создать и запустить одним действием, список, отмена.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { getCurrentWallet, isAdminWallet } from "../../auth";
import { pg } from "../../db/pg";
import { ensureAuctionSchema, AUCTION_DURATIONS } from "./schema";
import { refundLosers } from "./settle";
import { settlePlayerLot } from "./settle-player";
import { activeBidsFor, lotState } from "./lots";
import { droppable } from "../craft/crafted-sql";
import { assertPackMoneyRight } from "../mystic-money";
import {
  AUCTION_SPECIAL_CURRENCIES,
  PIECE_QTY_MAX,
  RESOURCE_QTY_MAX,
  isWholeOnlyCurrency,
} from "@/lib/auctionCurrency";

function requireAdmin(): string {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("Только владелец");
  return w;
}

export async function tokenSymbols(): Promise<string[]> {
  const rows = (await pg.rewardTokens.findMany(undefined, {
    orderBy: { column: "sort_order", ascending: true },
  })) as Array<{ symbol: string }>;
  return rows.map((t) => t.symbol);
}

/** Валюты для селектора: энергия и ресурсы, затем токены счёта (reward_tokens).
 *  Открыто всем: лоты выставляют и игроки (аукционный дом). */
export const auctionCurrencies = createServerFn({ method: "GET" }).handler(async () => {
  const tokens = await tokenSymbols();
  return {
    options: [
      ...AUCTION_SPECIAL_CURRENCIES.map((c) => ({ value: c.value, label: c.ru })),
      ...tokens.map((t) => ({ value: t, label: t })),
    ],
  };
});

export const adminCreateAuction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        prizeKind: z.enum(["box", "pack", "hero", "artifact", "resource"]),
        prizeRef: z.string().min(1),
        // Штук приза каждому победителю. Потолок по виду приза — ниже, в refine.
        prizeQty: z.number().int().min(1).max(RESOURCE_QTY_MAX).default(1),
        // Сколько отдельных одинаковых аукционов выставить разом.
        copies: z.number().int().min(1).max(20).default(1),
        currency: z.string().min(1).max(20),
        startPrice: z.number().positive(),
        duration: z.enum(["1h", "6h", "12h", "1d", "3d", "7d"]),
        minStepPct: z.number().min(0).max(50).default(5),
        antiSnipeMin: z.number().int().min(0).max(60).default(5),
      })
      .refine((v) => v.prizeKind === "resource" || v.prizeQty <= PIECE_QTY_MAX, {
        message: `Штук в лоте — не больше ${PIECE_QTY_MAX}`,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const admin = requireAdmin();
    // Бокс с DARAI/Stars в лоте — деньги: выставляет только админ выплат.
    if (data.prizeKind === "box" || data.prizeKind === "pack")
      await assertPackMoneyRight(data.prizeRef);
    await ensureAuctionSchema();
    // Валюта — только из списка: энергия/ресурс или токен из реестра.
    const special = AUCTION_SPECIAL_CURRENCIES.some((c) => c.value === data.currency);
    if (!special && !(await tokenSymbols()).includes(data.currency)) {
      throw new Error(`Валюта ${data.currency} не заведена`);
    }
    if (isWholeOnlyCurrency(data.currency) && !Number.isInteger(data.startPrice)) {
      throw new Error("Энергия и ресурсы — только целым числом");
    }
    // Уникальный арт генератора (и арт лаборатории) на аукционы не попадает (владелец 09.11).
    if (data.prizeKind === "artifact") {
      const ok = (await mcpExec(
        `SELECT 1 AS ok FROM yuplink.mystic_item_template
          WHERE id = ${sqlStr(data.prizeRef)} AND ${droppable()};`,
        { wrapJson: true },
      )) as Array<{ ok: number }>;
      if (!ok?.[0]) throw new Error("Уникальный артефакт на аукцион не выставляется");
    }
    const hours = AUCTION_DURATIONS[data.duration];
    const series = data.copies > 1 ? `gaus_${nanoid(8)}` : null;
    const ids: string[] = [];
    const values = Array.from({ length: data.copies }, (_, i) => {
      const id = `gauc_${nanoid(10)}`;
      ids.push(id);
      return `(${sqlStr(id)}, ${sqlStr(data.prizeKind)}, ${sqlStr(data.prizeRef)}, ${data.prizeQty},
        ${sqlStr(data.currency)}, ${data.startPrice}, ${data.minStepPct}, ${data.antiSnipeMin},
        now(), now() + make_interval(hours => ${hours}), 'live', ${sqlStr(admin)},
        ${series ? sqlStr(series) : "NULL"}, ${series ? i + 1 : "NULL"}, ${series ? data.copies : "NULL"})`;
    });
    await mcpExec(
      `INSERT INTO yuplink.auction
         (id, prize_kind, prize_ref, prize_qty, currency, start_price, min_step_pct,
          anti_snipe_min, start_at, end_at, status, created_by,
          series_id, series_no, series_total)
       VALUES ${values.join(",")};`,
      { wrapJson: false },
    );
    // Анонс в боте всем игрокам — фоном, если включён (announce.ts). Серия — одним сообщением.
    void import("./announce")
      .then((m) => m.announceNewLot(ids[0]))
      .catch((e) => console.warn("[auction] анонс:", e instanceof Error ? e.message : e));
    return { ok: true, ids };
  });

type AdminAuctionRow = {
  id: string;
  title: string | null;
  prize_kind: string;
  prize_ref: string;
  prize_qty: number;
  currency: string;
  start_price: number;
  min_step_pct: number;
  anti_snipe_min: number;
  end_at: string;
  status: string;
  top_bid: number | null;
  top_account_id: string | null;
  winner_account_id: string | null;
  winners: number;
  series_no: number | null;
  series_total: number | null;
  bids: number;
  esc_image: string | null;
};

export const adminListAuctions = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  await ensureAuctionSchema();
  const rows = ((await mcpExec(
    `SELECT a.id, a.title, a.prize_kind, a.prize_ref, a.prize_qty, a.currency,
            a.start_price, a.min_step_pct, a.anti_snipe_min, a.end_at, a.status,
            a.top_bid, a.top_account_id, a.winner_account_id, a.escrow->>'image' AS esc_image,
            a.winners, a.series_no, a.series_total,
            (SELECT count(*) FROM yuplink.auction_bid b WHERE b.auction_id = a.id) AS bids
       FROM yuplink.auction a
      WHERE a.status NOT IN ('escrow', 'void')
      ORDER BY a.created_at DESC, a.series_no ASC NULLS FIRST LIMIT 200;`,
    { wrapJson: true },
  ).catch(() => [])) ?? []) as AdminAuctionRow[];
  const { resolvePrizeMeta } = await import("./prize-meta");
  const meta = await resolvePrizeMeta(rows).catch(() => new Map());
  const active = await activeBidsFor(rows.map((r) => r.id));
  const auctions = rows.map((r) => {
    const m = meta.get(r.prize_ref);
    const winners = Number(r.winners) || 1;
    const s = lotState({
      startPrice: Number(r.start_price),
      stepPct: Number(r.min_step_pct),
      winners,
      active: active.get(r.id) ?? [],
      me: null,
    });
    return {
      ...r,
      winners,
      taken: s.taken,
      current: winners === 1 ? (s.top ?? Number(r.start_price)) : s.passing,
      prize_name: m?.name || r.title || r.prize_ref,
      // Товар игрока (custom) — картинка из залога: в справочниках его нет.
      prize_image: m?.image ?? r.esc_image ?? null,
      prize_info: m?.info ?? null,
    };
  });
  return { auctions };
});

/** Отменить живой аукцион: все ставки снять с лотов и вернуть деньги. */
export const adminCancelAuction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ auctionId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await ensureAuctionSchema();
    const a = sqlStr(data.auctionId);
    // Статус меняется под замком строки — после него функция ставки откажет.
    const done = (await mcpExec(
      `UPDATE yuplink.auction SET status='cancelled'
        WHERE id=${a} AND status='live' RETURNING id, currency;`,
      { wrapJsonCte: true },
    ).catch(() => [])) as Array<{ id: string; currency: string }>;
    if (!done?.[0]) return { ok: false, refunded: 0 };
    await mcpExec(`UPDATE yuplink.auction_bid SET active=false WHERE auction_id=${a} AND active;`, {
      wrapJson: false,
    });
    // Сбой возврата не теряет деньги: ставка останется «не возвращённой», и
    // обход settleDueAuctions повторит.
    const refunded = await refundLosers(data.auctionId);
    // Лот игрока — вещь продавцу назад.
    await settlePlayerLot(data.auctionId).catch((e) => console.warn("[auction] возврат лота:", e));
    return { ok: true, refunded };
  });
