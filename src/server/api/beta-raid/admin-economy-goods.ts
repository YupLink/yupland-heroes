// Товарная сводка админской «Экономики».
//
// «Товар» — не запись в БД, а канонический ключ вида (см. admin-economy-keys):
// у ресурса это символ (gold/token:DARAI/…), у шаблонных — kind:refId, у
// custom — custom:name:<slug>. Один «Помидор» из двух клеток-маркетов должен
// схлопнуться в строку — иначе таблица распухнет клонами, а «Есть сейчас»
// сложить нечего.
//
// Пять источников: маркеты (места + цены), города (норма/производство/запас),
// склады, рюкзаки героев, поля (yield/24 = за сутки) + продажи из ledger.
import { safeParseTownConfig } from "@/lib/townConfig";
import { parseFieldConfig } from "@/lib/fieldConfig";
import type { EconomyPeriod, GoodRow } from "./admin-economy-types";
import { keyFromStackKey, keyFromFieldReward, PERIOD_SQL } from "./admin-economy-keys";
import { marketKeysCanon } from "@/server/api/beta-raid/econ/canon-key";
import {
  townGoodKeyWith,
  townGoodName,
  townGoodNames,
} from "@/server/api/beta-raid/econ/town-good-key";
import {
  fetchMarkets,
  fetchTowns,
  fetchTownStock,
  fetchWarehouse,
  fetchBackpacks,
  fetchFields,
} from "./admin-economy-goods-fetch";

/** Собрать таблицу товаров. Правит места (places) и суммы. */
export async function buildGoods(mapId: string, period: EconomyPeriod): Promise<GoodRow[]> {
  const [markets, towns, townStock, wh, bp, fields, sales] = await Promise.all([
    fetchMarkets(mapId),
    fetchTowns(mapId),
    fetchTownStock(mapId),
    fetchWarehouse(mapId),
    fetchBackpacks(),
    fetchFields(mapId),
    fetchSales(period),
  ]);

  const map = new Map<string, GoodRow>();
  const ensure = (row: {
    key: string;
    kind: string;
    name: string;
    image: string | null;
    token?: string | null;
  }): GoodRow => {
    const found = map.get(row.key);
    if (found) {
      // Первое встреченное имя/картинка обычно лучше пустого — но не
      // перетираем непустое пустым.
      if (!found.image && row.image) found.image = row.image;
      if (!found.name && row.name) found.name = row.name;
      return found;
    }
    const created: GoodRow = {
      key: row.key,
      kind: row.kind,
      name: row.name,
      image: row.image,
      token: row.token ?? null,
      onHand: 0,
      producePerDay: 0,
      salesUnits: 0,
      townBuysUnits: 0,
      places: [],
    };
    map.set(row.key, created);
    return created;
  };

  // Маркеты — задают ключ и места. giveToken для kind=resource+token несёт
  // символ токена: без него «Токен DARAI» и «Токен HOPE» слились бы в один ключ.
  // Свой товар — по имени канона, как в журнале (canon-key): «Бананы» с витрины
  // и «Банан» в рюкзаке — одна строка.
  const marketKeys = await marketKeysCanon(
    markets.map((m) => ({
      id: m.id,
      kind: m.kind,
      refId: m.ref_id,
      name: m.name,
      giveToken: m.give_token,
    })),
  );
  for (const [i, m] of markets.entries()) {
    const key = marketKeys[i];
    if (!key) continue;
    const row = ensure({ key, kind: m.kind, name: m.name, image: m.image, token: m.give_token });
    const remaining = m.stock == null ? null : Math.max(0, Number(m.stock) - Number(m.sold));
    row.places.push({
      q: Number(m.q),
      r: Number(m.r),
      source: "market",
      side: m.side,
      price: Number(m.price_amount),
      priceResource: m.price_resource,
      priceToken: m.price_token,
      remaining,
    });
  }

  // Города: config.goods → ключ + производство. stock идёт отдельным
  // индексом, чтобы можно было спокойно сложить с warehouse/backpack.
  const stockIdx = new Map<string, number>();
  for (const s of townStock) {
    stockIdx.set(`${s.q},${s.r}:${s.good_id}`, Number(s.amount) || 0);
  }
  // Ключ — тот же, что у журнала сделок (town-good-key): у товара с шаблоном
  // имя шаблона, иначе строка города и строка маркета разъедутся.
  const townCfgs = towns.map((t) => ({ t, cfg: safeParseTownConfig(t.config) }));
  const tplNames = await townGoodNames(townCfgs.flatMap((x) => x.cfg.goods));
  for (const { t, cfg } of townCfgs) {
    for (const g of cfg.goods) {
      const key = townGoodKeyWith(g, tplNames);
      if (!key) continue;
      const row = ensure({
        key,
        kind: g.kind,
        name: townGoodName(g, tplNames),
        image: null,
        token: g.token,
      });
      row.producePerDay += Number(g.producePerDay) || 0;
      const stk = stockIdx.get(`${t.q},${t.r}:${g.id}`) ?? 0;
      row.onHand += stk;
      row.places.push({
        q: Number(t.q),
        r: Number(t.r),
        source: "town",
        price: Number(g.marketPrice) || 0,
        remaining: stk,
      });
    }
  }

  // Склады и рюкзаки — только «есть сейчас».
  for (const s of wh) {
    const key = keyFromStackKey(s.stack_key, s.kind, s.ref_id, s.name);
    if (!key) continue;
    const row = ensure({ key, kind: s.kind, name: s.name, image: s.image });
    row.onHand += Number(s.total) || 0;
  }
  for (const s of bp) {
    const key = keyFromStackKey(s.stack_key, s.kind, s.ref_id, s.name);
    if (!key) continue;
    const row = ensure({ key, kind: s.kind, name: s.name, image: s.image });
    row.onHand += Number(s.total) || 0;
  }

  // Поля: yield за час × 24 = дневное производство. Награда — ресурс или item.
  for (const f of fields) {
    const cfg = parseFieldConfig(f.building_config);
    if (!cfg) continue;
    const info = keyFromFieldReward(cfg.reward);
    if (!info) continue;
    const row = ensure({ key: info.key, kind: info.kind, name: info.name, image: info.image });
    row.producePerDay += Number(cfg.yield) * 24;
    row.places.push({
      q: Number(f.q),
      r: Number(f.r),
      source: "field",
      label: f.name ?? "Поле",
    });
  }

  // Продажи разложены по ключу продаваемого товара; хвосты уже отрезаны в
  // admin-economy-sales.
  for (const s of sales) {
    const row = map.get(s.key);
    if (!row) continue;
    if (s.kind === "player_buys") row.salesUnits += s.units;
    else row.townBuysUnits += s.units;
  }

  // Стабильный порядок: по «есть сейчас» — сверху то, чего больше всего.
  return [...map.values()].sort((a, b) => b.onHand - a.onHand);
}

async function fetchSales(period: EconomyPeriod) {
  const window = PERIOD_SQL[period];
  const { collectSales } = await import("./admin-economy-sales");
  return collectSales(window);
}
