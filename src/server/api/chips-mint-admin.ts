// Названия NFT-фишек, которые засчитываются дропу «за фишку» (держатели NFT).
// Админская настройка вывода фишки в NFT (карта, цена, склад) удалена словом
// владельца 17.10.2026 — осталась только эта выборка для дропов.
import { pg } from "../db/pg";
import { buildChipNftTitle, STORE_NFT_CONTRACT, ALL_CHIP_LEVELS } from "./chips-mint-helpers";

export async function listChipDropEligibleTitles(
  collectionId: string,
  minLevel: number
): Promise<Array<{ contractId: string; title: string }>> {
  const col = await pg.chipCollections.findOne({ id: collectionId });
  if (!col) return [];
  const { data: tplRows } = await pg.chipTemplates
    .raw()
    .select("template_no")
    .eq("collection_id", collectionId)
    .order("template_no", { ascending: true });
  const templates = (tplRows ?? []) as Array<{ template_no: number }>;
  const eligibleLevels = ALL_CHIP_LEVELS.filter((lvl) => lvl >= minLevel);
  const out: Array<{ contractId: string; title: string }> = [];
  for (const tpl of templates) {
    for (const lvl of eligibleLevels) {
      out.push({
        contractId: STORE_NFT_CONTRACT,
        title: buildChipNftTitle(tpl.template_no, col.name, lvl),
      });
    }
  }
  return out;
}
