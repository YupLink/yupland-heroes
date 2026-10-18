// Ломбард (владелец, 13.10.2026): артефакт, сданный в скупку «Любой … артефакт»,
// сразу встаёт на витрину ПОКУПКИ той же лавки — тот самый шаблон, по цене
// выплаты × наценка лавки (по умолчанию ×5). Продал за 100 золота — в лавке он
// же за 500. Повторная сдача того же артефакта по той же цене прибавляет запас
// к уже выставленной позиции, а не плодит дубли.
//
// Наценка — на лавку (raid_market_shop.pawn_markup, migrations/pawn-01), правит
// админ в редакторе маркета. Касается ТОЛЬКО скупки «Любой … артефакт».
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { getCurrentWallet, isAdminWallet } from "../../auth";
import { godMapId } from "./god-map";
import { isArtAny } from "./art-rarity";
import { payoutMeta } from "./market-payout-meta";
import type { MarketItem } from "@/lib/marketItem";

export const PAWN_MARKUP_DEFAULT = 5;

export async function pawnMarkupFor(mapId: string, q: number, r: number): Promise<number> {
  const rows = (await mcpExec(
    `SELECT pawn_markup FROM yuplink.raid_market_shop
      WHERE map_id=${sqlStr(mapId)} AND q=${q} AND r=${r} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ pawn_markup: number | null }>;
  const v = Number(rows?.[0]?.pawn_markup);
  return Number.isFinite(v) && v > 0 ? v : PAWN_MARKUP_DEFAULT;
}

/** Позиция скупки — «любой артефакт редкости»: только её сдачи перепродаются. */
export function isPawnBuyout(item: Pick<MarketItem, "side" | "kind" | "refId">): boolean {
  return item.side === "sell" && item.kind === "art" && isArtAny(item.refId);
}

const newId = () =>
  `pawn_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Выставить сданные артефакты на витрину покупки. Шаблоны — из квитанции
 * списания (какие именно экземпляры забрали у игрока). Сбой здесь сделку
 * игрока не трогает: он уже получил золото.
 */
export async function relistPawned(opts: {
  mapId: string;
  item: MarketItem;
  templateIds: string[];
}): Promise<void> {
  const { mapId, item, templateIds } = opts;
  if (!isPawnBuyout(item) || templateIds.length === 0) return;
  const markup = await pawnMarkupFor(mapId, item.q, item.r);
  const price = Math.round(item.priceAmount * markup * 10000) / 10000;
  if (!(price > 0)) return;
  const counts = new Map<string, number>();
  for (const id of templateIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [templateId, n] of counts) {
    const meta = await payoutMeta("art", templateId).catch(() => null);
    const cell = `map_id=${sqlStr(mapId)} AND q=${item.q} AND r=${item.r}`;
    const same = `${cell} AND side='buy' AND kind='art' AND ref_id=${sqlStr(templateId)}
       AND price_resource=${sqlStr(item.priceResource)}
       AND price_token IS NOT DISTINCT FROM ${item.priceToken ? sqlStr(item.priceToken) : "NULL"}
       AND price_amount=${price} AND price2_resource IS NULL AND id LIKE 'pawn\\_%'`;
    // Одной командой: есть такая позиция — прибавить запас, нет — создать.
    await mcpExec(
      `WITH upd AS (
         UPDATE yuplink.raid_market_item SET stock = COALESCE(stock, 0) + ${n}
          WHERE ${same} RETURNING id)
       INSERT INTO yuplink.raid_market_item
         (id, map_id, q, r, pos, kind, ref_id, give_amount, name, image, price_resource,
          price_token, price_amount, buyer_mode, buyer_races, buyer_specs, stock, sold, side)
       SELECT ${sqlStr(newId())}, ${sqlStr(mapId)}, ${item.q}, ${item.r},
              COALESCE((SELECT MAX(pos) + 1 FROM yuplink.raid_market_item WHERE ${cell}), 0),
              'art', ${sqlStr(templateId)}, 1, ${sqlStr(meta?.name ?? item.name)},
              ${meta?.image ? sqlStr(meta.image) : "NULL"}, ${sqlStr(item.priceResource)},
              ${item.priceToken ? sqlStr(item.priceToken) : "NULL"}, ${price}, 'all', '[]'::jsonb,
              '[]'::jsonb, ${n}, 0, 'buy'
        WHERE NOT EXISTS (SELECT 1 FROM upd);`,
    );
  }
}

/** Записать наценку лавки (ядро ручки админа; его же зовёт проверка). */
export async function savePawnMarkup(
  mapId: string,
  q: number,
  r: number,
  markup: number,
): Promise<void> {
  if (!(markup > 0)) throw new Error("Наценка должна быть больше нуля");
  await mcpExec(
    `INSERT INTO yuplink.raid_market_shop(map_id, q, r, buyer_races, buyer_specs, pawn_markup, updated_at)
     VALUES (${sqlStr(mapId)}, ${q}, ${r}, '[]'::jsonb, '[]'::jsonb, ${markup}, now())
     ON CONFLICT (map_id, q, r) DO UPDATE SET pawn_markup = EXCLUDED.pawn_markup, updated_at = now();`,
  );
}

/** Наценка лавки — для редактора админа. */
export const getPawnMarkup = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d))
  .handler(async ({ data }) => ({ markup: await pawnMarkupFor(await godMapId(), data.q, data.r) }));

export const setPawnMarkup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ q: z.number().int(), r: z.number().int(), markup: z.number().positive().max(1000) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const w = getCurrentWallet();
    if (!w || !isAdminWallet(w)) throw new Error("Маркет настраивает только админ");
    await savePawnMarkup(await godMapId(), data.q, data.r, data.markup);
    return { ok: true as const, markup: data.markup };
  });
