// Бонусы фишек за тираж коллекции и премиум — те же, что в обычном рейде
// (raid-combat.ts → computeRaidTirageMults). Без них урон в бете был занижен:
// редкая фишка из малотиражной/премиум-коллекции била как обычная.
import { pg } from "../../db/pg";
import { isPremiumCollection, tirageBonus } from "@/lib/tirageBonus";
import { getHallwayConfig } from "../hallwayConfig";

export type ChipMults = Map<number, { hpMult: number; atkMult: number }>;

/**
 * Множители HP/атаки по индексу фишки в отряде. Триал-фишки бонуса не имеют.
 * Считается и для ручного отряда, и для авто-подбора — вход один и тот же.
 */
export async function computeChipMults(
  lineup: Array<{ templateId: string; level: number; training?: boolean }>,
): Promise<ChipMults> {
  const out: ChipMults = new Map();

  const cfg = await getHallwayConfig();
  if (!cfg.boss?.tirageBonusEnabled) return out;

  const templateIds = [...new Set(lineup.filter((c) => !c.training).map((c) => c.templateId))];
  if (templateIds.length === 0) return out;

  const { data: tpls } = await pg.chipTemplates
    .raw()
    .select("id,collection_id")
    .in("id", templateIds);
  const tplToCol = new Map(
    ((tpls ?? []) as Array<{ id: string; collection_id: string }>).map((t) => [
      t.id,
      t.collection_id,
    ]),
  );
  const colIds = [...new Set([...tplToCol.values()].filter(Boolean))];
  if (colIds.length === 0) return out;

  const { data: cols } = await pg.chipCollections
    .raw()
    .select("id,name,initial_supply,is_premium")
    .in("id", colIds);
  const colInfo = new Map(
    (
      (cols ?? []) as Array<{
        id: string;
        name: string;
        initial_supply: number;
        is_premium: boolean;
      }>
    ).map((c) => [
      c.id,
      {
        supply: Number(c.initial_supply),
        premium: isPremiumCollection(c.name, c.is_premium),
      },
    ]),
  );

  lineup.forEach((c, i) => {
    if (c.training) return;
    const colId = tplToCol.get(c.templateId);
    const info = colId ? colInfo.get(colId) : undefined;
    if (!info) return;
    const b = tirageBonus(info.supply, info.premium);
    if (b.hpMult !== 1 || b.atkMult !== 1) {
      out.set(i, { hpMult: b.hpMult, atkMult: b.atkMult });
    }
  });
  return out;
}
