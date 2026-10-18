// Шаблоны ЦЕЛЫХ маркетов: снять все товары клетки-маркета (+ фильтр покупателей)
// в именованный шаблон и развернуть его на другой маркет одной кнопкой. В отличие
// от raid_custom_item (шаблон ОДНОГО товара) — это снимок всей витрины.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { getCurrentWallet, isAdminWallet } from "../../auth";
import { godMapId } from "./god-map";
import { marketRows } from "./market-admin";
import { marketShopFor } from "./market-shop";
import type { MarketItem } from "@/lib/marketItem";

function requireAdmin(): void {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("Только админ настраивает маркет");
}

const newId = () =>
  `mtpl_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

/** Снимок одного товара в шаблоне (без id/pos/sold и фильтра — они на клетке). */
type TplItem = Pick<
  MarketItem,
  | "side"
  | "kind"
  | "refId"
  | "giveAmount"
  | "name"
  | "image"
  | "priceResource"
  | "priceToken"
  | "priceAmount"
  | "price2Resource"
  | "price2Token"
  | "price2Amount"
  | "stock"
>;

type TplConfig = { items: TplItem[]; shop: { races: string[]; specs: string[] } };

/** Мини-превью одного товара шаблона для иконки в списке. */
export type TplPreview = { kind: string; image: string | null; refId: string | null };
export type MarketTemplate = {
  id: string;
  name: string;
  itemCount: number;
  /** Первые несколько товаров — маленькими иконками в списке шаблонов. */
  preview: TplPreview[];
};

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Снять товар в снимок шаблона. */
function toTplItem(it: MarketItem): TplItem {
  return {
    // Сторона едет в шаблоне: витрины покупки и скупки у клетки разные, и
    // разворот должен восстановить обе такими, какими их сняли.
    side: it.side,
    kind: it.kind,
    refId: it.refId,
    giveAmount: it.giveAmount,
    name: it.name,
    image: it.image,
    priceResource: it.priceResource,
    priceToken: it.priceToken,
    priceAmount: it.priceAmount,
    price2Resource: it.price2Resource,
    price2Token: it.price2Token,
    price2Amount: it.price2Amount,
    stock: it.stock,
  };
}

/** Сохранить текущий маркет клетки как именованный шаблон. */
export const saveMarketTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ q: z.number().int(), r: z.number().int(), name: z.string().min(1).max(80) })
      .parse(d),
  )
  .handler(async ({ data }): Promise<MarketTemplate> => {
    requireAdmin();
    const mapId = await godMapId();
    const items = (await marketRows(mapId, data.q, data.r)).map(toTplItem);
    if (items.length === 0) throw new Error("Маркет пуст — нечего сохранять");
    const shop = await marketShopFor(mapId, data.q, data.r);
    const config: TplConfig = { items, shop: { races: shop.races, specs: shop.specs } };
    const id = newId();
    // ON CONFLICT DO NOTHING: слепой повтор моста шлёт ТОТ ЖЕ id (строка та же) —
    // без него повтор после потерянного ACK падал бы duplicate key.
    await mcpExec(
      `INSERT INTO yuplink.raid_market_template(id, name, config)
       VALUES (${sqlStr(id)}, ${sqlStr(data.name)}, ${sqlStr(JSON.stringify(config))}::jsonb)
       ON CONFLICT (id) DO NOTHING;`,
    );
    return {
      id,
      name: data.name,
      itemCount: items.length,
      preview: items.slice(0, 6).map((it) => ({
        kind: it.kind,
        image: it.image ?? null,
        refId: it.refId ?? null,
      })),
    };
  });

/** Список шаблонов маркетов (для пикера). */
export const listMarketTemplates = createServerFn({ method: "GET" }).handler(
  async (): Promise<MarketTemplate[]> => {
    requireAdmin();
    const rows = (await mcpExec(
      `SELECT id, name, config->'items' AS items,
              COALESCE(jsonb_array_length(config->'items'), 0) AS item_count
         FROM yuplink.raid_market_template ORDER BY created_at DESC;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{
      id: string;
      name: string;
      items: TplItem[] | string | null;
      item_count: number | string;
    }>;
    return (rows ?? []).map((r) => {
      const items: TplItem[] = Array.isArray(r.items)
        ? r.items
        : typeof r.items === "string"
          ? (JSON.parse(r.items) as TplItem[])
          : [];
      return {
        id: String(r.id),
        name: String(r.name ?? ""),
        itemCount: num(r.item_count),
        preview: items.slice(0, 6).map((it) => ({
          kind: it.kind,
          image: it.image ?? null,
          refId: it.refId ?? null,
        })),
      };
    });
  },
);

/** Развернуть шаблон на клетку-маркет: ЗАМЕНЯЕТ товары клетки товарами шаблона. */
export const applyMarketTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ q: z.number().int(), r: z.number().int(), templateId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; count: number }> => {
    requireAdmin();
    const mapId = await godMapId();
    const rows = (await mcpExec(
      `SELECT config FROM yuplink.raid_market_template WHERE id=${sqlStr(data.templateId)} LIMIT 1;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ config: TplConfig | string }>;
    const raw = rows?.[0]?.config;
    if (raw == null) throw new Error("Шаблон не найден");
    const cfg: TplConfig = typeof raw === "string" ? JSON.parse(raw) : raw;
    const items = Array.isArray(cfg.items) ? cfg.items : [];

    // Разворот = «такой же маркет»: старые товары клетки убираем, кладём из
    // шаблона. Все товары — ОДНОЙ вставкой (атомарно): при сбое не остаётся
    // полу-заполненного маркета из отдельных INSERT-ов.
    await mcpExec(
      `DELETE FROM yuplink.raid_market_item
        WHERE map_id=${sqlStr(mapId)} AND q=${data.q} AND r=${data.r};`,
    );
    if (items.length > 0) {
      const values = items
        .map((it, i) => {
          const id = `mkt_${Math.random().toString(36).slice(2, 12)}${i}`;
          // Снимки старых шаблонов стороны не знают — это покупка.
          const side = it.side === "sell" ? "sell" : "buy";
          return `(${sqlStr(id)}, ${sqlStr(mapId)}, ${data.q}, ${data.r}, ${i}, ${sqlStr(side)}, ${sqlStr(it.kind)}, ${it.refId ? sqlStr(it.refId) : "NULL"}, ${num(it.giveAmount)}, ${sqlStr(it.name)}, ${it.image ? sqlStr(it.image) : "NULL"}, ${sqlStr(it.priceResource)}, ${it.priceToken ? sqlStr(it.priceToken) : "NULL"}, ${num(it.priceAmount)}, 'all', '[]'::jsonb, '[]'::jsonb, ${it.stock != null ? num(it.stock) : "NULL"}, ${it.price2Resource ? sqlStr(it.price2Resource) : "NULL"}, ${it.price2Token ? sqlStr(it.price2Token) : "NULL"}, ${it.price2Amount != null ? num(it.price2Amount) : "NULL"})`;
        })
        .join(", ");
      // ON CONFLICT DO NOTHING: id детерминированы строкой запроса, и слепой
      // повтор моста (потерянный ACK после коммита) становится no-op, а не
      // duplicate key. Вставка всех товаров одним стейтментом — атомарна.
      await mcpExec(
        `INSERT INTO yuplink.raid_market_item
            (id, map_id, q, r, pos, side, kind, ref_id, give_amount, name, image,
             price_resource, price_token, price_amount, buyer_mode, buyer_races, buyer_specs,
             stock, price2_resource, price2_token, price2_amount)
         VALUES ${values}
         ON CONFLICT (id) DO NOTHING;`,
      );
    }
    // Фильтр покупателей — на весь магазин клетки (raid_market_shop).
    const races = JSON.stringify(cfg.shop?.races ?? []);
    const specs = JSON.stringify(cfg.shop?.specs ?? []);
    await mcpExec(
      `INSERT INTO yuplink.raid_market_shop(map_id, q, r, buyer_races, buyer_specs, updated_at)
       VALUES (${sqlStr(mapId)}, ${data.q}, ${data.r}, ${sqlStr(races)}::jsonb, ${sqlStr(specs)}::jsonb, now())
       ON CONFLICT (map_id, q, r) DO UPDATE
         SET buyer_races=EXCLUDED.buyer_races, buyer_specs=EXCLUDED.buyer_specs, updated_at=now();`,
    );
    return { ok: true as const, count: items.length };
  });

/** Удалить шаблон маркета. */
export const deleteMarketTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await mcpExec(`DELETE FROM yuplink.raid_market_template WHERE id=${sqlStr(data.id)};`);
    return { ok: true as const };
  });
