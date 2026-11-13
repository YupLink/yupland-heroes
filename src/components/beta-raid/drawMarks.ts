// Метки поверх плёнки тумана: мешочки, газеты и (режим бога) точки спавна.
// Вынесено из drawFrame (лимит строк) — один вызов на кадр.
import { drawNewspapers } from "../newspaper/drawNewspapers";
import { drawLootBags } from "./loot-bag/drawLootBags";
import { drawSpawnPoints } from "./spawn-point/drawSpawnPoints";
import type { DrawScene } from "./betaCanvasScene";
import type { MapStore } from "./mapStore";

export function drawMarks(
  scene: DrawScene,
  store: MapStore,
  marks: {
    mapId: string | null;
    lootBags: Parameters<typeof drawLootBags>[2];
    newspapers: Parameters<typeof drawNewspapers>[2];
  },
): void {
  // Мешочки — тем же слоем, поверх плёнки: их видно во всей активной зоне.
  drawLootBags(scene, store, marks.lootBags);
  drawNewspapers(scene, store, marks.newspapers);
  drawSpawnPoints(scene, store, marks.mapId);
}
