// Ключ своего товара в журнале — по имени КАНОНА шаблона, одно на все входы.
//
// Рюкзак подписывает стек именем канона (market-backpack-write: позиция
// «Бананы» без шаблона кладёт в рюкзак «Банан» из справочника), и под этим
// именем товар потом едет на склад, в сундук, на скупку и в ратушу. Маркет же
// писал в журнал имя ПОЗИЦИИ: покупка — «custom:name:бананы», продажа скупке —
// «custom:name:банан», и турнир «Золото» засчитывал всю выручку прибылью (та же
// дыра, что у ратуши, 06.10.2026). Теперь имя для ключа маркет и ратуша
// (town-good-key) берут здесь — той же ступенчатой логикой, что у ключа стека.
import { goodKey } from "@/server/api/beta-raid/admin-economy-keys";
import { canonRef } from "@/server/api/beta-raid/item-alias";
import { priceMetaBatch, priceMetaOf } from "@/server/api/beta-raid/market-payout-meta";

/** Что спросить: ref товара (шаблон, id позиции или пусто) и его подпись. */
export type CanonAsk = { ref: string | null | undefined; name?: string | null };

/** Позиция витрины — сколько нужно ключу: и MarketItem, и строка raid_market_item. */
export type MarketKeyItem = {
  id: string;
  kind: string;
  refId: string | null;
  name: string;
  giveToken: string | null;
};

const isTemplate = (ref: string | null): ref is string => !!ref?.startsWith("cst_");

/**
 * Имя канона шаблона на каждый вопрос: связка item_alias, у позиции без
 * шаблона (mkt_…) — шаблон по основе имени (как stackKeyFor). null — канон не
 * шаблон справочника или справочник не ответил: вызывающий берёт своё имя, как
 * и рюкзак. Оба справочника с минутным кэшем, имена — одним запросом на пачку.
 * Не бросает: зовут и best-effort хуки журнала.
 */
export async function canonCustomNames(asks: readonly CanonAsk[]): Promise<Array<string | null>> {
  const out = asks.map((): string | null => null);
  try {
    const canons: Array<string | null> = [];
    // По очереди: первый вызов прогревает кэш связок, остальные идут из него.
    for (const a of asks) canons.push(await canonRef("custom", a.ref, a.name));
    const tpls = [...new Set(canons.filter(isTemplate))];
    if (tpls.length === 0) return out;
    const metas = await priceMetaBatch(tpls.map((token) => ({ res: "custom" as const, token })));
    canons.forEach((c, i) => {
      out[i] = isTemplate(c) ? (priceMetaOf(metas, "custom", c)?.name ?? null) : null;
    });
  } catch (e) {
    console.warn("canon-key", e instanceof Error ? e.message : String(e));
  }
  return out;
}

/**
 * Ключи позиций витрины пачкой. Свой товар — по имени канона (ключ стека в
 * рюкзаке), остальное — прежний goodKey. Шаблон не нашёлся — имя позиции.
 */
export async function marketKeysCanon(
  items: readonly MarketKeyItem[],
): Promise<Array<string | null>> {
  const out = items.map((m) => goodKey(m.kind, m.refId, m.name, m.giveToken));
  const custom = items.map((m, i) => ({ m, i })).filter(({ m }) => m.kind === "custom");
  if (custom.length === 0) return out;
  const names = await canonCustomNames(
    custom.map(({ m }) => ({ ref: m.refId ?? m.id, name: m.name })),
  );
  custom.forEach(({ i }, k) => {
    const name = names[k];
    if (name) out[i] = goodKey("custom", null, name) ?? out[i];
  });
  return out;
}

/** Ключ одной позиции витрины для журнала (покупка и скупка). */
export async function marketTradeKey(item: MarketKeyItem): Promise<string> {
  const [key] = await marketKeysCanon([item]);
  return key ?? `${item.kind}:${item.refId ?? item.id}`;
}
