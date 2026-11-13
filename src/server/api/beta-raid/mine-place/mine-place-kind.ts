// Вид шахты по стопке рюкзака: заготовка шахты, и её можно ставить сейчас.
// Общий вход режима стройки (mine-plan) и постановки (mine-place).
import { mineBlueprintOf } from "@/lib/mineBlueprint";
import { isPlaceableBlueprint, type PlaceableBlueprint } from "@/lib/minePlacement";
import { canonRef, refFromStackKey } from "@/server/api/beta-raid/item-alias";

export async function blueprintKind(stackKey: string): Promise<PlaceableBlueprint> {
  if (!stackKey.startsWith("custom:")) throw new Error("mineplace.not_blueprint");
  const kind = mineBlueprintOf(await canonRef("custom", refFromStackKey(stackKey)));
  if (!kind) throw new Error("mineplace.not_blueprint");
  if (!isPlaceableBlueprint(kind)) throw new Error("mineplace.not_yet");
  return kind;
}
