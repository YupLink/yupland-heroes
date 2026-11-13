// Ломбард (владелец, 13.10.2026; герои — 22.10.2026): артефакт или герой, сданный
// в скупку «Любой … артефакт» / «Любой … герой», сразу встаёт на витрину ПОКУПКИ
// той же лавки — тот самый шаблон, по цене выплаты × наценка лавки (по умолчанию
// ×5). Продал за 100 золота — в лавке он же за 500. Повторная сдача того же
// шаблона по той же цене прибавляет запас к уже выставленной позиции, а не
// плодит дубли.
//
// Наценки — на лавку, у артефактов и героев свои (raid_market_shop.pawn_markup,
// migrations/pawn-01; pawn_hero_markup, migrations/pawn-heroes-01), правит админ
// в редакторе маркета. Касается ТОЛЬКО скупок «Любой …».
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireGodAdmin } from "./island/island-editor-auth";
import { isArtAny } from "./art-rarity";
import { isHeroAny } from "./hero-any";
import { payoutMeta } from "./market-payout-meta";
import type { SpendReceipt } from "./market-money";
import type { MarketItem } from "@/lib/marketItem";
import type { PawnDrop } from "@/lib/pawnDrop";

export const PAWN_MARKUP_DEFAULT = 5;
/** Наценка не ниже ×1: иначе лавка продавала бы сданное дешевле, чем платит за него. */
export const PAWN_MARKUP_MIN = 1;

/** Что перепродаёт ломбард: артефакты или героев — у каждого своя наценка. */
export type PawnKind = "art" | "hero";

const COLUMN: Record<PawnKind, string> = { art: "pawn_markup", hero: "pawn_hero_markup" };

/** Наценка лавки по виду. Колонки/строки нет или мусор ниже ×1 — ×5 по умолчанию. */
export async function pawnMarkupFor(
  mapId: string,
  q: number,
  r: number,
  kind: PawnKind = "art",
): Promise<number> {
  const rows = (await mcpExec(
    `SELECT ${COLUMN[kind]} AS markup FROM yuplink.raid_market_shop
      WHERE map_id=${sqlStr(mapId)} AND q=${q} AND r=${r} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ markup: number | null }>;
  const v = Number(rows?.[0]?.markup);
  return Number.isFinite(v) && v >= PAWN_MARKUP_MIN ? v : PAWN_MARKUP_DEFAULT;
}

/** Вид ломбарда у позиции скупки «Любой …»; другие позиции — null (их сдачи не перепродаются). */
export function pawnKindOf(item: Pick<MarketItem, "side" | "kind" | "refId">): PawnKind | null {
  if (item.side !== "sell") return null;
  if (item.kind === "art" && isArtAny(item.refId)) return "art";
  if (item.kind === "hero" && isHeroAny(item.refId)) return "hero";
  return null;
}

/** Позиция скупки «любой артефакт/герой редкости»: только её сдачи перепродаются. */
export function isPawnBuyout(item: Pick<MarketItem, "side" | "kind" | "refId">): boolean {
  return pawnKindOf(item) != null;
}

const newId = () =>
  `pawn_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Выставить сданное на витрину покупки. Шаблоны — из квитанции списания (какие
 * именно экземпляры забрали у игрока). Сбой здесь сделку игрока не трогает: он
 * уже получил золото.
 *
 * Выставляется ШАБЛОН, а не сданный экземпляр: покупатель получает новый
 * предмет (market-deliver → grantArtifacts, износ 0). Так ломбард и «чинит»
 * сданные изношенные и сломанные артефакты (владелец, 23.10.2026: «он же
 * выставляется на продажу полностью починенным»).
 */
export async function relistPawned(opts: {
  mapId: string;
  item: MarketItem;
  templateIds: string[];
}): Promise<void> {
  const { mapId, item, templateIds } = opts;
  const kind = pawnKindOf(item);
  if (!kind || templateIds.length === 0) return;
  const markup = await pawnMarkupFor(mapId, item.q, item.r, kind);
  const price = Math.round(item.priceAmount * markup * 10000) / 10000;
  if (!(price > 0)) return;
  const counts = new Map<string, number>();
  for (const id of templateIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [templateId, n] of counts) {
    const meta = await payoutMeta(kind, templateId).catch(() => null);
    const cell = `map_id=${sqlStr(mapId)} AND q=${item.q} AND r=${item.r}`;
    const same = `${cell} AND side='buy' AND kind='${kind}' AND ref_id=${sqlStr(templateId)}
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
              '${kind}', ${sqlStr(templateId)}, 1, ${sqlStr(meta?.name ?? item.name)},
              ${meta?.image ? sqlStr(meta.image) : "NULL"}, ${sqlStr(item.priceResource)},
              ${item.priceToken ? sqlStr(item.priceToken) : "NULL"}, ${price}, 'all', '[]'::jsonb,
              '[]'::jsonb, ${n}, 0, 'buy'
        WHERE NOT EXISTS (SELECT 1 FROM upd);`,
    );
  }
}

/**
 * Ломбард после выплаты скупки (market-sell): снимки сданных героев закрыты
 * (paid_at — откат их больше не вернёт) и их рюкзаки высыпаны мешочком на клетку
 * основного героя (hero-pawn-drop, §8.73 п. 4), а сданное за ЦЕЛИКОМ принятую
 * сделку встаёт на витрину покупки. Не бросает: золото уже у игрока, сделка
 * состоялась. Ответ — что выпало (для окна уведомления), нечего — null.
 */
export async function settlePawn(o: {
  wallet: string;
  account: string;
  mapId: string;
  item: MarketItem;
  receipt: SpendReceipt;
  /** Доля доставленной выплаты; перепродаём только при 1. */
  minRatio: number;
}): Promise<PawnDrop | null> {
  const heroes = o.receipt.paidHeroes ?? [];
  let drop: PawnDrop | null = null;
  if (heroes.length) {
    const { payPawnHeroes } = await import("./hero-pawn-drop");
    drop = await payPawnHeroes({
      wallet: o.wallet,
      account: o.account,
      mapId: o.mapId,
      shop: { q: o.item.q, r: o.item.r },
      heroes,
    }).catch((e) => {
      console.error("[pawn] paid mark / backpack drop failed", e);
      return null;
    });
  }
  const pawned = [...(o.receipt.paidArts ?? []), ...heroes];
  if (o.minRatio !== 1 || !pawned.length) return drop;
  await relistPawned({
    mapId: o.mapId,
    item: o.item,
    templateIds: pawned.map((a) => a.templateId),
  }).catch((e) => console.error("[pawn] relist failed", e));
  return drop;
}

/** Записать наценку лавки (ядро ручки админа; его же зовёт проверка). */
export async function savePawnMarkup(
  mapId: string,
  q: number,
  r: number,
  markup: number,
  kind: PawnKind = "art",
): Promise<void> {
  if (!(markup >= PAWN_MARKUP_MIN)) throw new Error("Наценка — не меньше ×1");
  const col = COLUMN[kind];
  await mcpExec(
    `INSERT INTO yuplink.raid_market_shop(map_id, q, r, buyer_races, buyer_specs, ${col}, updated_at)
     VALUES (${sqlStr(mapId)}, ${q}, ${r}, '[]'::jsonb, '[]'::jsonb, ${markup}, now())
     ON CONFLICT (map_id, q, r) DO UPDATE SET ${col} = EXCLUDED.${col}, updated_at = now();`,
  );
}

const KIND = z.enum(["art", "hero"]).default("art");

/** Наценка лавки — для редактора админа (вид не задан — артефакты, как раньше). */
export const getPawnMarkup = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ q: z.number().int(), r: z.number().int(), kind: KIND }).parse(d),
  )
  .handler(async ({ data }) => ({
    markup: await pawnMarkupFor((await requireGodAdmin()).mapId, data.q, data.r, data.kind),
  }));

export const setPawnMarkup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        markup: z.number().min(PAWN_MARKUP_MIN).max(1000),
        kind: KIND,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { mapId } = await requireGodAdmin();
    await savePawnMarkup(mapId, data.q, data.r, data.markup, data.kind);
    return { ok: true as const, markup: data.markup, kind: data.kind };
  });
