// Витрина маркета: чтение товаров + админский CRUD. Товары живут в
// yuplink.raid_market_item по клетке-маркету. Выставляет/правит ТОЛЬКО админ.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { getCurrentWallet, isAdminWallet } from "../../auth";
import { activeBetaMapId, myMapId } from "./encounter-where";
import { godMapId } from "./god-map";
import { publishRaid } from "../../raidLive";
import { upsertMarketInput, assertUpsertSane } from "./market-admin-input";
import type { MarketItem, MarketKind, MarketPriceResource, MarketSide } from "@/lib/marketItem";

type Row = Record<string, unknown>;

function toItem(row: Row): MarketItem {
  const races = row.buyer_races;
  const specs = row.buyer_specs;
  return {
    id: String(row.id),
    q: Number(row.q),
    r: Number(row.r),
    pos: Number(row.pos) || 0,
    // Сторона витрины: buy — продаём игроку, sell — скупаем у игрока. Старые
    // строки (до колонки side) читаются как покупка.
    side: row.side === "sell" ? "sell" : ("buy" as MarketSide),
    kind: String(row.kind) as MarketKind,
    refId: row.ref_id != null ? String(row.ref_id) : null,
    giveAmount: Number(row.give_amount) || 0,
    giveToken: row.give_token != null ? String(row.give_token) : null,
    name: String(row.name ?? ""),
    image: row.image != null ? String(row.image) : null,
    priceResource: String(row.price_resource) as MarketPriceResource,
    priceToken: row.price_token != null ? String(row.price_token) : null,
    priceAmount: Number(row.price_amount) || 0,
    price2Resource:
      row.price2_resource != null ? (String(row.price2_resource) as MarketPriceResource) : null,
    price2Token: row.price2_token != null ? String(row.price2_token) : null,
    price2Amount: row.price2_amount != null ? Number(row.price2_amount) : null,
    stock: row.stock != null ? Number(row.stock) : null,
    sold: Number(row.sold) || 0,
    perAccountLimit: row.per_account_limit != null ? Number(row.per_account_limit) : null,
    buyerMode: row.buyer_mode === "filter" ? "filter" : "all",
    buyerRaces: Array.isArray(races) ? races.map(String) : [],
    buyerSpecs: Array.isArray(specs) ? specs.map(String) : [],
  };
}

/** Товары клетки-маркета по порядку витрины. Читают и админ, и покупатель. */
export async function marketRows(mapId: string, q: number, r: number): Promise<MarketItem[]> {
  const rows = (await mcpExec(
    `SELECT * FROM yuplink.raid_market_item
      WHERE map_id=${sqlStr(mapId)} AND q=${q} AND r=${r}
      ORDER BY pos, created_at;`,
    { wrapJson: true },
  ).catch(() => [])) as Row[];
  return (rows ?? []).map(toItem);
}

/**
 * Один товар по id — для покупки/проверки. Обязательно в пределах активной
 * карты: строки старых карт не чистятся, и товар неактуальной карты нельзя
 * было бы купить по «запомненному» клиентом id.
 */
export async function marketItemById(id: string, mapId: string): Promise<MarketItem | null> {
  // Позиция привязанной лавки — товар ратуши: в таблице её нет, строим заново
  // по той же ратуше, что и витрина (town-shop-items).
  const { parseTownItemId, cityItems } = await import("./town-shop-items");
  const town = parseTownItemId(id);
  if (town) {
    const { cityShopAt } = await import("./town-shop");
    const city = await cityShopAt(mapId, town.q, town.r);
    if (!city) return null;
    return (await cityItems(town.q, town.r, city)).find((it) => it.id === id) ?? null;
  }
  const rows = (await mcpExec(
    `SELECT * FROM yuplink.raid_market_item WHERE id=${sqlStr(id)} AND map_id=${sqlStr(mapId)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Row[];
  const row = rows?.[0];
  return row ? toItem(row) : null;
}

export const getMarketItems = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d))
  .handler(async ({ data }): Promise<MarketItem[]> => {
    // Карта того, кто смотрит: админ на другом этаже видит лавку этого этажа.
    const w = getCurrentWallet();
    const mapId = w ? await myMapId(w) : await activeBetaMapId();
    return marketRows(mapId, data.q, data.r);
  });

function requireAdmin(): string {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("Маркет настраивает только админ");
  return w;
}

const newId = () =>
  `mkt_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

export const upsertMarketItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => upsertMarketInput.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    // Отказы формы — до похода в базу: неисполнимая позиция ломается не здесь,
    // а на выдаче игроку, когда деньги уже списаны.
    assertUpsertSane(data);
    const mapId = await godMapId();
    const id = data.id || newId();
    // Символ цены нужен и токену, и «предметным» типам: у pack/hero/art/boss/
    // custom priceToken несёт id шаблона — без него сервер не знает, ЧТО именно
    // просить у игрока в оплату. Раньше сохранялся только для kind='token', и
    // «Свой товар / Артефакт / Пак» после сохранения возвращались с пустым
    // пикером — админу казалось, что выбор сбросился.
    const isItemPrice = (r: string) =>
      r === "pack" || r === "hero" || r === "art" || r === "boss" || r === "custom";
    const needsToken = (r: string) => r === "token" || isItemPrice(r);
    const token = needsToken(data.priceResource) ? data.priceToken : null;
    const token2 = data.price2Resource && needsToken(data.price2Resource) ? data.price2Token : null;
    const races = JSON.stringify(data.buyerRaces ?? []);
    const specs = JSON.stringify(data.buyerSpecs ?? []);
    const stockVal = data.stock == null ? "NULL" : data.stock;
    const limitVal = data.perAccountLimit == null ? "NULL" : data.perAccountLimit;
    const p2res = data.price2Resource ? sqlStr(data.price2Resource) : "NULL";
    const p2amt = data.price2Amount == null ? "NULL" : data.price2Amount;
    // sold в INSERT не пишем: DEFAULT 0 на создании, EXCLUDED не трогает при
    // правке — иначе редактирование товара обнулило бы продажи.
    await mcpExec(
      `INSERT INTO yuplink.raid_market_item
         (id, map_id, q, r, pos, side, kind, ref_id, give_amount, give_token, name, image,
          price_resource, price_token, price_amount,
          price2_resource, price2_token, price2_amount, stock, per_account_limit,
          buyer_mode, buyer_races, buyer_specs)
       VALUES (${sqlStr(id)}, ${sqlStr(mapId)}, ${data.q}, ${data.r}, ${data.pos}, ${sqlStr(data.side)},
          ${sqlStr(data.kind)}, ${data.refId ? sqlStr(data.refId) : "NULL"}, ${data.giveAmount},
          ${data.giveToken ? sqlStr(data.giveToken) : "NULL"},
          ${sqlStr(data.name)}, ${data.image ? sqlStr(data.image) : "NULL"},
          ${sqlStr(data.priceResource)}, ${token ? sqlStr(token) : "NULL"}, ${data.priceAmount},
          ${p2res}, ${token2 ? sqlStr(token2) : "NULL"}, ${p2amt}, ${stockVal}, ${limitVal},
          ${sqlStr(data.buyerMode)}, ${sqlStr(races)}::jsonb, ${sqlStr(specs)}::jsonb)
       ON CONFLICT (id) DO UPDATE SET
          pos=EXCLUDED.pos, side=EXCLUDED.side, kind=EXCLUDED.kind, ref_id=EXCLUDED.ref_id,
          give_amount=EXCLUDED.give_amount, give_token=EXCLUDED.give_token,
          name=EXCLUDED.name, image=EXCLUDED.image,
          price_resource=EXCLUDED.price_resource, price_token=EXCLUDED.price_token,
          price_amount=EXCLUDED.price_amount,
          price2_resource=EXCLUDED.price2_resource, price2_token=EXCLUDED.price2_token,
          price2_amount=EXCLUDED.price2_amount, stock=EXCLUDED.stock,
          per_account_limit=EXCLUDED.per_account_limit,
          buyer_mode=EXCLUDED.buyer_mode,
          buyer_races=EXCLUDED.buyer_races, buyer_specs=EXCLUDED.buyer_specs;`,
    );
    // Уведомляем игроков: витрина клетки поменялась — приёмник событий
    // (useRaidLiveStream) на type='built' инвалидирует beta-raid-building.
    // Иначе новые товары виднелись бы только после перезагрузки.
    publishRaid({ mapId, type: "built", cells: [`${data.q},${data.r}`] });
    return { ok: true as const, id };
  });

/**
 * Пополнить/поправить запас товара (кнопка админа). add>0 — добавить единиц,
 * add<0 — убавить. Остаток никогда не опускаем ниже уже проданного (GREATEST с
 * sold): «пополнение» правит потолок, а не историю продаж.
 *
 * БЕЗЛИМИТНУЮ позицию (stock IS NULL) не трогаем ВООБЩЕ. Раньше COALESCE
 * подставлял ноль, и «+10» у позиции с полусотней продаж давало stock=50 —
 * безлимит превращался в лимит, исчерпанный в тот же миг: товар уходил в
 * «Распродано» одним нажатием. Лимит ставят осознанно, полем «Запас» формы, а
 * здесь отвечаем «пополнять нечего» (unlimited=true).
 */
export const refillMarketStock = createServerFn({ method: "POST" })
  // add со знаком: плюс — добавить единиц, минус — убавить. Дробное не
  // запрещаем: у позиций, торговавших десятыми до перехода на целые
  // количества, запас так и остался дробным (7,2) — подровнять его можно
  // только дробным шагом.
  .inputValidator((d: unknown) => z.object({ id: z.string(), add: z.number() }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const mapId = await godMapId();
    const rows = (await mcpExec(
      `UPDATE yuplink.raid_market_item
          SET stock = CASE WHEN stock IS NULL THEN NULL
                           ELSE GREATEST(sold, stock + ${data.add}) END
        WHERE id=${sqlStr(data.id)} AND map_id=${sqlStr(mapId)}
        RETURNING stock, sold;`,
      { wrapJsonCte: true },
    ).catch(() => [])) as Array<{ stock: number | null; sold: number }>;
    const row = rows?.[0];
    if (!row) throw new Error("market.not_found");
    // null остался null — позиция безлимитная, и добавлять к бесконечности
    // нечего. Не ошибка: админ жмёт кнопку, а не совершает проступок.
    if (row.stock == null) {
      return { ok: true as const, unlimited: true as const, stock: null, remaining: null };
    }
    const stock = Number(row.stock);
    // Пополнение видит и клиент-игрок — рефилл иначе висел бы «Распродано»
    // до следующего открытия клетки.
    const cellRows = (await mcpExec(
      `SELECT q, r FROM yuplink.raid_market_item
         WHERE id=${sqlStr(data.id)} AND map_id=${sqlStr(mapId)} LIMIT 1;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ q: number; r: number }>;
    const cell = cellRows?.[0];
    if (cell) publishRaid({ mapId, type: "built", cells: [`${cell.q},${cell.r}`] });
    return {
      ok: true as const,
      unlimited: false as const,
      stock,
      remaining: Math.max(0, stock - Number(row.sold)),
    };
  });

export const deleteMarketItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    // Забираем q,r у RETURNING, чтобы уведомить именно ту клетку — иначе
    // событие пришлось бы гнать всей карте.
    const rows = (await mcpExec(
      `DELETE FROM yuplink.raid_market_item WHERE id=${sqlStr(data.id)} RETURNING q, r, map_id;`,
      { wrapJsonCte: true },
    ).catch(() => [])) as Array<{ q: number; r: number; map_id: string }>;
    const row = rows?.[0];
    if (row) publishRaid({ mapId: row.map_id, type: "built", cells: [`${row.q},${row.r}`] });
    return { ok: true as const };
  });
