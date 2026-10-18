// Окно ратуши для игрока: жители и что они едят за сутки (владелец, 03.10.2026:
// «пользователю не нужно это всё показывать — только основную инфо о городе:
// к-во жителей и потребление каких продуктов у них идёт в день и сколько»).
// Настройки ратуши — только админу (TownAdminPanel), сюда они не попадают.
import { readTown } from "./town-state";
import { readTownStock } from "./town-stock";
import { dailyNeed, goodAsPriceResource, isUpkeep } from "@/lib/townConfig";
import type { TownHallExtra } from "@/lib/townHallView";

export async function townHallExtra(mapId: string, q: number, r: number): Promise<TownHallExtra> {
  const town = { mapId, q, r };
  // Справка — не сделка: сбой базы показывает пустой город, а не ломает окно.
  const t = await readTown(town).catch(() => null);
  if (!t) return { kind: "town_hall", name: null, residents: 0, eats: [], starving: false };
  const goods = t.cfg.goods.filter(isUpkeep);
  const [stock, { priceMetaBatch, priceMetaOf }] = await Promise.all([
    readTownStock(town).catch((): Record<string, number> => ({})),
    import("./market-payout-meta"),
  ]);
  // Имена и картинки шаблонов — одним запросом на всё окно.
  const refs = goods.map(goodAsPriceResource).map((p) => ({ res: p.res, token: p.token }));
  const metas = await priceMetaBatch(refs).catch(() => new Map());
  const eats = goods.map((g) => {
    const perDay = dailyNeed(g, t.cfg.residents);
    const p = goodAsPriceResource(g);
    const meta = g.kind === "resource" ? null : priceMetaOf(metas, p.res, p.token);
    return {
      kind: g.kind,
      refId: g.refId,
      token: g.token,
      name: meta?.name ?? null,
      image: meta?.image ?? null,
      perDay,
      short: (stock[g.id] ?? 0) + 1e-9 < perDay,
    };
  });
  return {
    kind: "town_hall",
    name: t.cfg.name || null,
    residents: t.cfg.residents,
    eats,
    starving: !!t.starvingSince,
  };
}
