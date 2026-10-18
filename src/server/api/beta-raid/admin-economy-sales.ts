// Разбор продаж за период по ledger-ссылкам (ref).
//
// Не смотрим денежные единицы (сумма зависит от токена/ресурса), а считаем
// СОБЫТИЯ покупок: одна уникальная пара (ref-корень, направление) = одна
// сделка. Кол-во купленного в акту неизвестно — money-only ledger не хранит
// qty, — поэтому «Продаж» показывает количество сделок за период. Этого
// достаточно, чтобы понять, где идёт торговля и что не двигается.
//
// Идентичность сделки: базовый ref без хвостов `:undo`, `:p2`, `:undoPart*`
// — они пишутся тем же покупателем в том же акте.
import { mcpExec } from "../../db/mcpClient";
import { safeParseTownConfig } from "@/lib/townConfig";
import { parseRef } from "./admin-economy-keys";
import { townGoodKeyWith, townGoodNames } from "@/server/api/beta-raid/econ/town-good-key";
import { marketKeysCanon } from "@/server/api/beta-raid/econ/canon-key";

type LedgerRow = { ref: string };

/**
 * Свернуть продажи периода в пары (goodKey, направление, число сделок).
 * window — SQL-фрагмент вида `created_at >= now() - interval '7 days'`.
 */
export async function collectSales(
  window: string,
): Promise<Array<{ key: string; kind: "player_buys" | "town_buys"; units: number }>> {
  const refs = await fetchRefs(window);

  // Уникальные базовые ref: только один раз считаем каждую сделку.
  const seen = new Set<string>();
  const buckets = new Map<string, { player: number; townBuy: number }>();

  // Тяжёлые справочники подтянем при первом обращении: часто продаж нет
  // вовсе — тогда лишний запрос не нужен.
  let marketIdx: KeyIdx | null = null;
  let townIdx: KeyIdx | null = null;

  const loadMarket = async () => {
    if (marketIdx) return marketIdx;
    marketIdx = await marketItemIndex();
    return marketIdx;
  };
  const loadTowns = async () => {
    if (townIdx) return townIdx;
    townIdx = await townGoodsIndex();
    return townIdx;
  };

  for (const r of refs) {
    const parsed = parseRef(baseRef(r.ref));
    if (!parsed) continue;
    const dedupKey = `${parsed.source}:${JSON.stringify(parsed)}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    if (parsed.source === "market") {
      const key = (await loadMarket()).get(parsed.itemId);
      if (!key) continue;
      // side='buy' у market — игрок ПОКУПАЕТ (продажа магазина).
      // side='sell' — игрок ПРОДАЁТ товар магазину. По просьбе «продаж
      // игрокам» считаем buy-сделки; sell-скупка магазином — отдельная
      // ветка, в отчёте по нашим меркам не «продажа», а «выкуп»; здесь
      // считаем в player_buys только реальные покупки игроками.
      if (parsed.side === "buy") {
        const b = buckets.get(key) ?? { player: 0, townBuy: 0 };
        b.player += 1;
        buckets.set(key, b);
      }
    } else if (parsed.source === "town-buy") {
      const key = (await loadTowns()).get(parsed.goodId);
      if (!key) continue;
      // town-buy — игрок ПОКУПАЕТ у города, город ПРОДАЁТ. С точки зрения
      // отчёта «продажи игрокам» — это тоже player_buys.
      const b = buckets.get(key) ?? { player: 0, townBuy: 0 };
      b.player += 1;
      buckets.set(key, b);
    } else if (parsed.source === "town-sell") {
      const key = (await loadTowns()).get(parsed.goodId);
      if (!key) continue;
      // town-sell — город ПОКУПАЕТ у игрока → townBuys.
      const b = buckets.get(key) ?? { player: 0, townBuy: 0 };
      b.townBuy += 1;
      buckets.set(key, b);
    }
  }

  const out: Array<{ key: string; kind: "player_buys" | "town_buys"; units: number }> = [];
  for (const [key, b] of buckets.entries()) {
    if (b.player > 0) out.push({ key, kind: "player_buys", units: b.player });
    if (b.townBuy > 0) out.push({ key, kind: "town_buys", units: b.townBuy });
  }
  return out;
}

/**
 * Отрезать хвост маркетных операций: одна сделка пишет несколько строк с
 * общим корнем и суффиксами `:undo`, `:undoPart`, `:undoPart2`, `:p2`, `:p2:undo`, …
 * Для дедупа берём корень до последнего значимого сегмента.
 */
function baseRef(ref: string): string {
  // Хвосты, которые точно не корень.
  const drop = [":undoPart2", ":undoPart", ":undo2", ":undo", ":p2:undo2", ":p2:undo", ":p2"];
  let r = ref;
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of drop) {
      if (r.endsWith(d)) {
        r = r.slice(0, -d.length);
        changed = true;
      }
    }
  }
  return r;
}

async function fetchRefs(window: string): Promise<LedgerRow[]> {
  // Один и тот же ref может лежать в обоих ledger'ах (двойная оплата
  // ресурс+токен). Дедупим на этапе разбора — здесь просто UNION ALL,
  // LIMIT снаружи (иначе он повесится только на второй SELECT).
  const rows = (await mcpExec(
    `SELECT ref FROM (
       SELECT ref FROM yuplink.acc_ledger
         WHERE ${window}
           AND (ref LIKE 'mkt:%' OR ref LIKE 'mkt-sell:%'
                OR ref LIKE 'town-buy:%' OR ref LIKE 'town-sell:%')
      UNION ALL
       SELECT ref FROM yuplink.res_ledger
         WHERE ${window}
           AND (ref LIKE 'mkt:%' OR ref LIKE 'mkt-sell:%'
                OR ref LIKE 'town-buy:%' OR ref LIKE 'town-sell:%')
     ) _u LIMIT 20000;`,
    { wrapJson: true },
  ).catch(() => [])) as LedgerRow[];
  return rows ?? [];
}

/** id товара → ключ товара (как в журнале сделок). */
type KeyIdx = Map<string, string | null>;

/** Позиции маркета: item_id → ключ. Свой товар — по имени канона (canon-key). */
async function marketItemIndex(): Promise<KeyIdx> {
  const rows = (await mcpExec(
    `SELECT id, kind, ref_id, name, give_token FROM yuplink.raid_market_item;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{
    id: string;
    kind: string;
    ref_id: string | null;
    name: string;
    give_token: string | null;
  }>;
  const items = (rows ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    refId: r.ref_id,
    name: r.name,
    giveToken: r.give_token,
  }));
  const keys = await marketKeysCanon(items);
  return new Map(items.map((m, i) => [m.id, keys[i]]));
}

/**
 * Товары городов: good_id → ключ, как у журнала сделок (town-good-key), имена
 * шаблонов — одним заходом на всё. Ищем по id, а не по клетке: в ref лавки
 * клетка ЛАВКИ, а товар живёт в конфиге ратуши. tg_-id уникальны (один id в
 * двух ратушах — копия карты с тем же шаблоном, ключ тот же).
 */
async function townGoodsIndex(): Promise<KeyIdx> {
  const rows = (await mcpExec(`SELECT config FROM yuplink.raid_town;`, {
    wrapJson: true,
  }).catch(() => [])) as Array<{ config: unknown }>;
  const goods = (rows ?? []).flatMap((t) => safeParseTownConfig(t.config).goods);
  const names = await townGoodNames(goods);
  const idx: KeyIdx = new Map();
  for (const g of goods) if (!idx.get(g.id)) idx.set(g.id, townGoodKeyWith(g, names));
  return idx;
}
