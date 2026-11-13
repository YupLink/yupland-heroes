// Остров новичка: боссы не встают на дорогу (владелец, 22.10.2026: «мобов на
// жилах и дорогах не спавнить!!»). Жил на островах нет (raid_map_vein — только
// «Мир Альфа»); возрождение на острове проверяет дорогу и жилу само (mob-spawn).
// Боссы берутся из клеток без дороги (places.pickPlaces), а правка клетки задания
// дорогу снимает (features.clean) — здесь это и держим.
import { describe, expect, it } from "vitest";
import { SEEDS, make } from "@/lib/raid/island/island.fixture";

describe("остров: босс не на дороге", () => {
  it("ни одна клетка с боссом не лежит на дороге", () => {
    for (const seed of SEEDS) {
      const isl = make(seed);
      const bosses = isl.cells.filter((c) => c.objectId?.startsWith("boss:"));
      expect(bosses.length, `${seed}: боссы на острове`).toBeGreaterThan(0);
      const onRoad = bosses.filter((c) => c.roadId !== null);
      expect(
        onRoad.map((c) => `${c.q},${c.r}`),
        `${seed}: боссы на дороге`,
      ).toEqual([]);
    }
  });
});
