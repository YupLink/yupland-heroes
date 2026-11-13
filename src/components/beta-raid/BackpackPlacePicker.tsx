// «Поставить» из рюкзака: окно выбора клетки по виду стопки (backpackPlace.ts) —
// магический сундук с охраной или обычный сундук; заготовка шахты — режим
// стройки на карте (mine-build); забранная DARAI-шахта — сетка «куда» (dmine);
// купленное дерево — сетка с подсветкой клеток (tree); динамит — «Бросить» в
// радиусе 3 (dynamite); земля и жила — «Положить» в радиусе 3 (land, vein).
import type { BackpackStack } from "@/server/api/beta-raid/market-backpack";
import { guardStacks } from "@/components/beta-raid/chest/useChestActions";
import { ChestPlacePicker } from "@/components/beta-raid/chest/ChestPlacePicker";
import { PlainChestPlacePicker } from "@/components/beta-raid/plain-chest/PlainChestPlacePicker";
import { MineBuildRequest } from "@/components/beta-raid/mine-build/MineBuildRequest";
import { DaraiMinePlacePicker } from "@/components/beta-raid/dmine/DaraiMinePlacePicker";
import { placeKindOf } from "@/components/beta-raid/backpackPlace";
import { placeableBlueprintOf } from "@/lib/minePlacement";
import { isDaraiMineKey } from "@/lib/daraiMine";
import { isTreeStackKey, plantOfStack } from "@/lib/treePlant";
import { TreeMapRequest } from "./tree-map/TreeMapRequest";
import { TreePlantPicker } from "@/components/beta-raid/tree/TreePlantPicker";
import { isDynamiteKey } from "@/lib/dynamite";
import { DynamiteThrowPicker } from "@/components/beta-raid/dynamite/DynamiteThrowPicker";
import { isLandStackKey } from "@/lib/landPlace";
import { LandPlacePicker } from "@/components/beta-raid/land/LandPlacePicker";
import { isVeinStackKey } from "@/lib/veinPlace";
import { VeinPlacePicker } from "@/components/beta-raid/vein/VeinPlacePicker";
import { isBuildingStackKey } from "@/lib/buildingSale";
import { BuildingPlacePicker } from "@/components/beta-raid/building-sale/BuildingPlacePicker";

export function BackpackPlacePicker({
  stackKey,
  stacks,
  onClose,
}: {
  stackKey: string;
  stacks: readonly BackpackStack[];
  onClose: () => void;
}) {
  const stack = stacks.find((s) => s.stackKey === stackKey);
  const kind = stack ? placeKindOf(stack) : null;
  if (kind === "plain") return <PlainChestPlacePicker stackKey={stackKey} onClose={onClose} />;
  if (stack && plantOfStack(stackKey)?.kind === "tree")
    return <TreeMapRequest item={stack} onClose={onClose} />;
  // Дерево — по ключу стопки: последнее посажено, стопки нет — окно закроется само.
  if (kind === "tree" || isTreeStackKey(stackKey))
    return <TreePlantPicker stackKey={stackKey} stack={stack ?? null} onClose={onClose} />;
  // Гриб — по ключу стопки: последний посажен, стопки нет, а окно ещё
  // предлагает «Защиту на час» (DaraiMinePlacePicker).
  // Динамит — по ключу стопки: последний брошен, стопки нет — окно закроется само.
  if (kind === "dynamite" || isDynamiteKey(stackKey))
    return <DynamiteThrowPicker stackKey={stackKey} stack={stack ?? null} onClose={onClose} />;
  // Земля — по ключу стопки: последняя клетка положена, стопки нет — окно закроется само.
  if (kind === "land" || isLandStackKey(stackKey))
    return <LandPlacePicker stackKey={stackKey} stack={stack ?? null} onClose={onClose} />;
  // Жила — так же: последняя положена, стопки нет — окно закроется само.
  if (kind === "vein" || isVeinStackKey(stackKey))
    return <VeinPlacePicker stackKey={stackKey} stack={stack ?? null} onClose={onClose} />;
  // Постройка — так же: последняя поставлена, стопки нет — окно закроется само.
  if (kind === "building" || isBuildingStackKey(stackKey))
    return <BuildingPlacePicker stackKey={stackKey} stack={stack ?? null} onClose={onClose} />;
  if (kind === "darai" || isDaraiMineKey(stackKey))
    return <DaraiMinePlacePicker stackKey={stackKey} onClose={onClose} />;
  if (kind === "chest")
    return <ChestPlacePicker chestKey={stackKey} bosses={guardStacks(stacks)} onClose={onClose} />;
  const mine = placeableBlueprintOf(stackKey);
  if (kind === "mine" && mine)
    return <MineBuildRequest stackKey={stackKey} kind={mine} onClose={onClose} />;
  return null;
}

