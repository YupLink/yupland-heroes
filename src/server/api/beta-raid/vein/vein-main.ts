// Жилы игроков — только в новых мирах (владелец, 29.10.2026: «жилы … в магазинах в новых
// мирах — там только дерево и камни строят»). В главном мире («Мир Альфа», settings
// beta_raid_map) жилы расставлены картой нарочно редкими — купленную туда не кладём.
import { activeBetaMapId } from "@/server/api/beta-raid/encounter-where";

/** Главный мир — отказ «vein.main_world» (кэш главной карты сбрасывается при её смене). */
export async function refuseMainWorld(mapId: string): Promise<void> {
  if (mapId === (await activeBetaMapId())) throw new Error("vein.main_world");
}
