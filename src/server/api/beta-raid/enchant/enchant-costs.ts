// Имя, картинка и запас для позиций цены лавки зачарования, и полный список
// того, чем админ может назначить цену.
//
// Откуда что — как у маркета: ресурсы — счёт игрока (иконки /resources), токены
// — справочник reward_tokens, товары — каталог своих товаров лавок
// (raid_custom_item; имя и картинку цены маркет берёт оттуда же —
// market-payout-meta). Имена ресурсов — русские подписи админки маркета: сервер
// языка не знает, клиент переводит ресурс по коду (market.res.<код>).
import { mcpExec } from "@/server/db/mcpClient";
import { RESOURCE_LABELS_RU, type MarketPriceResource } from "@/lib/marketItem";
import type {
  EnchantCost,
  EnchantCostOption,
  EnchantCostView,
  EnchantSpell,
  EnchantSpellView,
} from "@/lib/enchant/enchant";
import { ENCHANT_RESOURCES } from "./enchant-pay";

const RES_IMAGE: Record<string, string> = {
  gold: "/resources/gold.webp",
  stone: "/resources/stone.webp",
  wood: "/resources/wood.webp",
  diamonds: "/resources/crystal.webp",
  likes: "/resources/likes.webp",
  energy: "/resources/energy.webp",
};

const DARAI = "Darai";
const tokenName = (s: string): string => (s === DARAI ? "DARAI" : s);
const tokenImage = (s: string): string | null => (s === DARAI ? "/resources/darai.png" : null);
const keyOf = (c: Pick<EnchantCost, "kind" | "code">): string => `${c.kind}:${c.code}`;

type Meta = { name: string; image: string | null };

/** Все ресурсы, токены и товары — для выбора цены в админке. */
export async function enchantCostOptions(): Promise<EnchantCostOption[]> {
  const [tokens, goods] = await Promise.all([
    mcpExec(`SELECT symbol FROM yuplink.reward_tokens ORDER BY sort_order, symbol`, {
      wrapJson: true,
    }) as Promise<Array<{ symbol: string }>>,
    mcpExec(`SELECT id, name, image FROM yuplink.raid_custom_item ORDER BY name, id`, {
      wrapJson: true,
    }) as Promise<Array<{ id: string; name: string | null; image: string | null }>>,
  ]);
  const out: EnchantCostOption[] = ENCHANT_RESOURCES.map((code) => ({
    kind: "resource" as const,
    code,
    name: RESOURCE_LABELS_RU[code as MarketPriceResource] ?? code,
    image: RES_IMAGE[code] ?? null,
  }));
  for (const t of tokens ?? [])
    if (t?.symbol)
      out.push({
        kind: "token",
        code: t.symbol,
        name: tokenName(t.symbol),
        image: tokenImage(t.symbol),
      });
  for (const g of goods ?? [])
    if (g?.id)
      out.push({
        kind: "custom",
        code: g.id,
        name: g.name?.trim() || g.id,
        image: g.image || null,
      });
  return out;
}

/** Подписи позиций: ресурсы и токены — сразу, товары — одним запросом (кэш маркета). */
async function metaOf(costs: EnchantCost[]): Promise<Map<string, Meta>> {
  const out = new Map<string, Meta>();
  const custom: string[] = [];
  for (const c of costs) {
    if (c.kind === "resource")
      out.set(keyOf(c), {
        name: RESOURCE_LABELS_RU[c.code as MarketPriceResource] ?? c.code,
        image: RES_IMAGE[c.code] ?? null,
      });
    else if (c.kind === "token")
      out.set(keyOf(c), { name: tokenName(c.code), image: tokenImage(c.code) });
    else custom.push(c.code);
  }
  if (custom.length) {
    const { priceMetaBatch, priceMetaOf } =
      await import("@/server/api/beta-raid/market-payout-meta");
    const metas = await priceMetaBatch(custom.map((token) => ({ res: "custom" as const, token })));
    for (const code of custom) {
      const m = priceMetaOf(metas, "custom", code);
      out.set(`custom:${code}`, { name: m?.name ?? code, image: m?.image ?? null });
    }
  }
  return out;
}

/** Сколько чего у игрока — подсветка нехватки; последнее слово за оплатой. */
export type HaveFn = (c: EnchantCost) => number;

/** Позиции цены → вид окна (имя, картинка, запас); подписи — одним проходом на все. */
export async function costViewer(
  costs: EnchantCost[],
  have: HaveFn,
): Promise<(c: EnchantCost) => EnchantCostView> {
  const meta = await metaOf(costs);
  return (c) => {
    const m = meta.get(keyOf(c));
    return { ...c, name: m?.name ?? c.code, image: m?.image ?? null, have: have(c) };
  };
}

/** Заклинания клетки в вид окна: имя, картинка и запас у каждой позиции. */
export async function spellViews(
  spells: EnchantSpell[],
  have: HaveFn,
): Promise<EnchantSpellView[]> {
  const view = await costViewer(
    spells.flatMap((s) => [...s.cost, s.fx.cost]),
    have,
  );
  return spells.map((s) => ({
    ...s,
    cost: s.cost.map(view),
    fx: { ...s.fx, cost: view(s.fx.cost) },
  }));
}

/** Позиции, которых нет в справочниках (опечатка, удалённый товар) — их не сохранить. */
export function unknownCosts(spells: EnchantSpell[], options: EnchantCostOption[]): EnchantCost[] {
  const known = new Set(options.map(keyOf));
  return spells
    .flatMap((s) => (s.fx.on ? [...s.cost, s.fx.cost] : s.cost))
    .filter((c) => !known.has(keyOf(c)));
}
